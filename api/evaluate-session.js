/**
 * FarmaIA - Evaluate Session API
 *
 * GET /api/evaluate-session?sessionId=sess_xxx
 *
 * Returns the full conversation with judge evaluations merged in,
 * so evaluators can see each message pair + judge results.
 */

const { getSessionsCollection, getEvaluationsCollection } = require("../lib/db");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ detail: "Método não permitido." });
  }

  const sessionId = req.query.sessionId;
  if (!sessionId) {
    return res.status(400).json({ detail: "Parâmetro 'sessionId' é obrigatório." });
  }

  try {
    // Fetch session
    const sessions = await getSessionsCollection();
    if (!sessions) {
      return res.status(503).json({ detail: "Banco de dados indisponível." });
    }

    const session = await sessions.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ detail: "Sessão não encontrada." });
    }

    // Fetch all evaluations for this session
    const evaluations = await getEvaluationsCollection();
    let evalResults = [];
    if (evaluations) {
      evalResults = await evaluations
        .find({ sessionId })
        .sort({ timestamp: 1 })
        .toArray();
    }

    // Merge evaluations into message pairs
    // Each model message should get its evaluation data attached
    const messages = session.messages || [];
    const mergedMessages = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = { ...messages[i], index: i };

      if (msg.role === "model") {
        // Find matching evaluation by looking at the preceding user question
        const prevUserMsg = i > 0 ? messages[i - 1] : null;
        const question = prevUserMsg?.text || "";

        // Match evaluation by question text (best effort)
        const matchingEval = evalResults.find(
          (e) => e.question === question && e.response === msg.text
        );

        if (matchingEval) {
          msg.evaluation = {
            judges: matchingEval.general_judges || {},
            aggregate_score: matchingEval.general_score || null,
            topic_judges: matchingEval.topic_judges || {},
            topics_detected: matchingEval.topics_detected || [],
            safety_gate_passed: matchingEval.safety_gate_passed,
            topic_gates_passed: matchingEval.topic_gates_passed,
            rejected: matchingEval.rejected || false,
          };
        } else {
          msg.evaluation = null;
        }
      }

      mergedMessages.push(msg);
    }

    return res.status(200).json({
      session: {
        sessionId: session.sessionId,
        mode: session.mode || "patient",
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages: mergedMessages,
      },
    });
  } catch (err) {
    console.error("[EVALUATE-SESSION] Error:", err);
    return res
      .status(500)
      .json({ detail: "Erro ao carregar sessão.", error: err.message });
  }
};
