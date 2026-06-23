/**
 * BulaIA Planner — Simplified Tag-Based Version
 *
 * Analyzes user questions and returns a JSON execution plan.
 * Uses a two-stage approach:
 *   1. LLM classifies question into a semantic tag (question_classifier.js)
 *   2. Deterministic router maps tag → section (section_router.js)
 *
 * The LLM NEVER chooses section names — it only picks a tag.
 * Section routing is 100% deterministic JavaScript.
 *
 * Flow:
 *   1. classifyQuestion() → { tag, drug, confidence }
 *   2. routeTag(tag) → { tool, section, fallback }
 *   3. Returns plan: { drug, tag, steps: [{ tool, section, fallback }] }
 */


const { classifyQuestion } = require("./question_classifier");
const { routeTag } = require("./section_router");

// ============================================================
// Planner API
// ============================================================

/**
 * Analyze user question and return execution plan.
 * @param {string} question - User's question
 * @param {string} mode - "patient" or "professional"
 * @param {Array} history - Previous conversation messages
 * @param {string[]} extractedDrugs - Drugs already extracted by pure JS
 * @returns {Promise<Object>} JSON plan
 */
async function planQuery(question, mode = "patient", history = [], extractedDrugs = []) {
  // Step 1: LLM classifies the question into semantic tag(s) WITH HISTORY CONTEXT
  const classification = await classifyQuestion(question, history, extractedDrugs);
  const { tags, confidence } = classification;
  
  // Use the JS-extracted drug. If missing, maybe check classification history.
  let drugName = extractedDrugs.length > 0 ? extractedDrugs[0] : classification.drug;

  // Step 2: Deterministic routing — tags → sections → tools
  // Handle multiple tags by creating multiple tool calls
  const toolCalls = [];
  const sections = [];
  
  for (const tag of tags) {
    const routing = routeTag(tag);
    const { tool, section, fallback } = routing;
    
    console.log(`[Planner] Routing tag "${tag}": tool=${tool}, section=${section}, fallback=${fallback}`);
    
    if (tool === 'get_bula_data') {
      toolCalls.push({ name: "get_bula_data", args: { drug_name: drugName, mode } });
    } else if (section) {
      toolCalls.push({ name: "get_section", args: { drug_name: drugName, section, mode } });
      sections.push({ section, fallback });
    }
  }

  // Debug: log classification and routing
  console.log(`[Planner] Classification: tags=[${tags.join(', ')}], drug=${drugName}, confidence=${confidence}`);

  // Step 4: Build plan
  let plan;

  if (!drugName || tags.length === 0) {
    // No drug detected or no tags — ask for clarification
    plan = {
      drugs: drugName ? [drugName] : [],
      raw_mention: drugName || null,
      normalized_generic: drugName || null,
      tools: [],
      needs_clarification: !drugName 
        ? "Não entendi sua pergunta. Você poderia reformular mencionando o nome do medicamento?"
        : "Não entendi sua pergunta. Você poderia reformular?",
      mode,
      tags: tags.length > 0 ? tags : null,
      implicit_questions: [],
      needs_history: false,
      classification_confidence: confidence,
      classification_method: classification.method,
    };
  } else {
    // Drug detected — create tool plan (may have multiple steps)
    // Deduplicate tool calls by section
    const uniqueToolCalls = [];
    const seenSections = new Set();
    const fallbacks = [];
    
    for (const tc of toolCalls) {
      const key = tc.name === 'get_section' ? `section:${tc.args.section}` : 'bula_completa';
      if (!seenSections.has(key)) {
        seenSections.add(key);
        uniqueToolCalls.push(tc);
        // Track fallback for get_section tools
        const sectionInfo = sections.find(s => s.section === tc.args?.section);
        if (sectionInfo?.fallback) {
          fallbacks.push({ section: tc.args.section, fallback: sectionInfo.fallback });
        }
      }
    }

    // Bloqueia 'get_bula_data' se o agente já pediu uma seção específica
    const hasSectionTool = uniqueToolCalls.some(tc => tc.name === 'get_section');
    const finalTools = hasSectionTool 
      ? uniqueToolCalls.filter(tc => tc.name !== 'get_bula_data') 
      : uniqueToolCalls;

    plan = {
      drugs: [drugName],
      raw_mention: drugName,
      normalized_generic: drugName,
      tools: finalTools,
      fallbacks, // Per-section fallbacks
      needs_clarification: null,
      mode,
      tags,
      sections: sections.map(s => s.section),
      implicit_questions: classification.implicit_questions || [],
      needs_history: tags.length === 0,
      classification_confidence: confidence,
      classification_method: classification.method,
      tokens: classification.tokens || { input: 0, output: 0 },
    };
  }

  console.log("[Planner] Plan:", JSON.stringify(plan, null, 2));
  return plan;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  planQuery,
};
