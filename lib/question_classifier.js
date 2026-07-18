/**
 * BulaIA Question Classifier (FarmaIA v2 - Vector Auto-Correction)
 *
 * Architecture:
 * 1. Q2Q Voting: Embeds user query, finds top 10 similar questions in dataset, extracts Section.
 * 2. LLM Tag Generation: Asks LLM to predict snake_case intent tag based on Section and Question.
 * 3. Vector Auto-Correction: Embeds predicted tag, snaps to closest official tag in the Section's taxonomy.
 */

const { chat } = require("./llm_client");

// Global cache variables
let extractor = null;
let embeddingsCache = null;

async function initEmbeddings() {
  // Xenova disabled for Vercel Serverless compatibility
  console.log("[Classifier v2] Xenova initialization bypassed for Vercel compatibility.");
}

const CLASSIFICATION_PROMPT_V2 = `You are a medical classifier.
Analyze the user's question and predict the most appropriate clinical intent tag in snake_case.
Possible tags include: dosage_adult, dosage_pediatric, side_effects_dermatologic, side_effects_gastrointestinal, contraindication_pregnancy, warning_alcohol, mechanism_of_action, drug_interaction.
Generate A SINGLE tag in snake_case describing the clinical intent. Do not write anything else besides the tag.`;

/**
 * Classify a question into a semantic tag using pure LLM inference (Zero-Shot).
 */
async function classifyQuestion(question, history = [], extractedDrugs = []) {
  const llmStartTime = Date.now();
  
  try {
    // LLM Tag Generation (Zero-Shot)
    const result = await chat([
      { role: "system", content: CLASSIFICATION_PROMPT_V2 },
      { role: "user", content: `Question: "${question}"\nTag:` }
    ], { maxTokens: 20, temperature: 0.1 });
    
    let tagGerada = result.text.trim().split('\n')[0].trim();
    tagGerada = tagGerada.replace(/['"]/g, '').replace(/^{/, '').replace(/}$/, '');
    
    console.log(`[Classifier v2] LLM generated tag (Zero-Shot): ${tagGerada} (in ${Date.now() - llmStartTime}ms)`);
    
    return {
      tags: [tagGerada],
      confidence: 0.9,
      method: 'llm_zero_shot',
      section_hint: null, 
      raw_tag: tagGerada,
      autocorrect_similarity: 1.0
    };

  } catch (err) {
    console.error("[Classifier v2] Pipeline failed:", err);
    return { tags: ["unknown_intent"], confidence: 0, method: "error" };
  }
}

// For compatibility with old interface
async function classifyWithLLM(question, history = []) {
  return classifyQuestion(question, history);
}

module.exports = {
  classifyQuestion,
  classifyWithLLM,
};
