/**
 * FarmaIA - Submit Human Evaluation API
 *
 * POST /api/submit-evaluation
 *
 * Saves human evaluator concordance data to MongoDB.
 * Each evaluator submits their concordance ratings for each judge
 * on each message, plus overall impressions.
 */

const { getHumanEvaluationsCollection } = require("../lib/db");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Método não permitido." });
  }

  const {
    sessionId,
    evaluatorId,
    evaluatorMeta,
    messageEvaluations,
    generalEvaluation,
  } = req.body || {};

  // Validate required fields
  if (!sessionId) {
    return res.status(400).json({ detail: "Campo 'sessionId' é obrigatório." });
  }
  if (!evaluatorId) {
    return res.status(400).json({ detail: "Campo 'evaluatorId' é obrigatório." });
  }
  if (
    !messageEvaluations ||
    !Array.isArray(messageEvaluations) ||
    messageEvaluations.length === 0
  ) {
    return res.status(400).json({
      detail: "Campo 'messageEvaluations' deve ser um array não vazio.",
    });
  }

  try {
    const collection = await getHumanEvaluationsCollection();
    if (!collection) {
      return res.status(503).json({ detail: "Banco de dados indisponível." });
    }

    const document = {
      sessionId,
      evaluatorId,
      evaluatorMeta: evaluatorMeta || {},
      messageEvaluations: messageEvaluations.map((me) => ({
        messageIndex: me.messageIndex,
        question: me.question || "",
        judges: me.judges || {},
      })),
      generalEvaluation: generalEvaluation || {},
      submittedAt: new Date(),
      version: 1,
    };

    const result = await collection.insertOne(document);

    console.log(
      `[SUBMIT-EVAL] Saved evaluation from ${evaluatorId} for session ${sessionId} (${messageEvaluations.length} messages evaluated)`
    );

    return res.status(201).json({
      success: true,
      id: result.insertedId,
      message: "Avaliação salva com sucesso!",
      summary: {
        evaluatorId,
        sessionId,
        messagesEvaluated: messageEvaluations.length,
        hasGeneralEvaluation: !!generalEvaluation,
      },
    });
  } catch (err) {
    console.error("[SUBMIT-EVAL] Error:", err);
    return res
      .status(500)
      .json({ detail: "Erro ao salvar avaliação.", error: err.message });
  }
};
