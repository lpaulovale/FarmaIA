/**
 * BulaIA Agentic RAG Baseline API
 *
 * Agentic RAG endpoint for benchmark comparison.
 * Uses the SAME planner and SAME tool calling (get_section) as FarmaIA,
 * but sends the FULL section text to the LLM without Tag filtering.
 *
 * Flow:
 *   1. Planner (LLM) → identifies drug, tags, sections
 *   2. Tool execution (get_section) → fetches specific section from MongoDB
 *   3. Sends FULL section text directly to Response LLM (NO Tagger filtering)
 *   4. Returns response
 *
 * Comparison:
 *   - Agentic RAG: Planner → get_section → seção inteira → LLM
 *   - FarmaIA:      Planner → get_section → Tagger (filtra por tags) → LLM
 */

const { getSessionsCollection } = require("../lib/db");
const { executeTool } = require("../lib/tool_registry");
const { getResponsePrompt, getNoDataPrompt, buildContextPrompt } = require("../lib/prompt_manager");
const { planQuery } = require("../lib/planner");
const { chat } = require("../lib/llm_client");
const { fuzzyExtractDrugs, detectMode } = require("../lib/drug_extractor");

module.exports = async function handler(req, res) {
  const totalStartTime = Date.now();

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ detail: "Método não permitido." });

  let { message, mode } = req.body || {};
  if (!message || message.length < 2) {
    return res.status(400).json({ detail: "A mensagem deve ter pelo menos 2 caracteres." });
  }

  // Apply JS hybrid extraction before planner
  const extractedDrugs = fuzzyExtractDrugs(message);
  if (!mode) {
    mode = detectMode(message);
  }

  try {
    // =========================================
    // Step 1: Plan query (SAME planner as FarmaIA)
    // =========================================
    const planStartTime = Date.now();
    const plan = await planQuery(message, mode, [], extractedDrugs);
    const planTime = Date.now() - planStartTime;

    if (plan.needs_clarification) {
      return res.status(200).json({
        response: plan.needs_clarification,
        pipeline: "rag_baseline",
        metadata: { plan, planTime },
      });
    }

    // =========================================
    // Step 2: Execute tools (SAME as FarmaIA)
    // =========================================
    const toolStartTime = Date.now();
    const toolResults = [];

    for (const toolCall of plan.tools) {
      try {
        let result = await executeTool(toolCall.name, toolCall.args);

        if (result.found === false && toolCall.name === 'get_section') {
          const fallbackInfo = plan.fallbacks?.find(f => f.section === toolCall.args?.section);
          if (fallbackInfo) {
            result = await executeTool(fallbackInfo.fallback, {
              drug_name: toolCall.args.drug_name,
              mode: toolCall.args.mode,
            });
          }
        }

        toolResults.push(result);
      } catch (err) {
        toolResults.push({ tool: toolCall.name, error: err.message });
      }
    }
    const toolTime = Date.now() - toolStartTime;

    // =========================================
    // Step 3: Build context — NO TAGGER, full section text
    // =========================================
    const context = buildContextPrompt(toolResults);

    const systemPrompt = getResponsePrompt(mode, {
      date: new Date().toISOString().split("T")[0],
      question: message,
      documents: context || getNoDataPrompt(),
      topics: plan.topics || [],
      tags: plan.tags || [],
    });

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    // =========================================
    // Step 4: Call LLM for response
    // =========================================
    const llmStartTime = Date.now();
    const llmResult = await chat(messages, { temperature: 0.3, maxTokens: 1024 });
    const llmTime = Date.now() - llmStartTime;

    if (!llmResult) {
      return res.status(502).json({ detail: "LLM falhou." });
    }

    const totalTime = Date.now() - totalStartTime;

    return res.status(200).json({
      response: llmResult.text,
      pipeline: "agentic_rag",
      metadata: {
        mode,
        drugsDetected: plan.drugs || [],
        plan,
        documents: context,
        timing: { planTime, toolTime, llmTime, totalTime },
        tokens: {
          input: (plan.tokens?.input || 0) + (llmResult.tokens?.input || 0),
          output: (plan.tokens?.output || 0) + (llmResult.tokens?.output || 0)
        }
      },
    });
  } catch (err) {
    console.error("RAG handler error:", err);
    return res.status(500).json({ detail: "Erro interno.", error: err.message });
  }
};
