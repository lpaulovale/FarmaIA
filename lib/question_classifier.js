/**
 * BulaIA Question Classifier (FarmaIA v2 - Vector Auto-Correction)
 *
 * Architecture:
 * 1. Q2Q Voting: Embeds user query, finds top 10 similar questions in dataset, extracts Section.
 * 2. LLM Tag Generation: Asks LLM to predict snake_case intent tag based on Section and Question.
 * 3. Vector Auto-Correction: Embeds predicted tag, snaps to closest official tag in the Section's taxonomy.
 */

const { chat } = require("./llm_client");
const { pipeline, env } = require('@xenova/transformers');
env.cacheDir = '/tmp/.cache';
const fs = require('fs');
const path = require('path');

// Global cache variables
let extractor = null;
let embeddingsCache = null;

/**
 * Initialize E5 extractor and load cached embeddings on startup
 */
async function initEmbeddings() {
  if (extractor && embeddingsCache) return;
  
  try {
    console.log("[Classifier v2] Loading Xenova/multilingual-e5-small...");
    extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
    
    const cachePath = path.join(__dirname, '../data/embeddings_cache.json');
    if (fs.existsSync(cachePath)) {
      console.log("[Classifier v2] Loading embeddings cache...");
      embeddingsCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log(`[Classifier v2] Loaded ${embeddingsCache.train_embeddings?.length || 0} training vectors.`);
    } else {
      console.warn("[Classifier v2] Embeddings cache not found! Please run 'node scripts/build_embeddings_cache.js' first.");
    }
  } catch (err) {
    console.error("[Classifier v2] Failed to initialize embeddings:", err);
  }
}

/**
 * Calculate cosine similarity between two numeric arrays
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Ensure initialization happens eagerly in background
initEmbeddings().catch(console.error);

const CLASSIFICATION_PROMPT_V2 = `You are a medical classifier. The user's question belongs to the section: {secao}.
Generate A SINGLE tag in snake_case describing the clinical intent. Do not write anything else besides the tag.`;

/**
 * Classify a question into a semantic tag using Q2Q Voting + LLM + Vector Auto-Correction.
 * @param {string} question - User's question
 * @param {Array} history - Previous conversation messages (optional)
 * @returns {Promise<{ tags: string[], confidence: number, method: string, section_hint?: string }>}
 */
async function classifyQuestion(question, history = [], extractedDrugs = []) {
  const startTime = Date.now();
  await initEmbeddings(); // Ensure loaded
  
  if (!extractor || !embeddingsCache || !embeddingsCache.train_embeddings) {
    console.warn("[Classifier v2] Fallback to hardcoded tag due to missing cache.");
    return { tags: ["dosage_adult"], confidence: 0.1, method: "fallback_missing_cache" };
  }

  try {
    // 1. Q2Q Voting (Find Section)
    const qOut = await extractor("query: " + question, { pooling: 'mean', normalize: true });
    const qVec = Array.from(qOut.data);
    
    // Calculate similarities against all training questions
    const scores = embeddingsCache.train_embeddings.map(item => ({
      secao: item.secao,
      score: cosineSimilarity(qVec, item.embedding)
    }));
    
    // Sort descending by score and get top 10
    scores.sort((a, b) => b.score - a.score);
    const top10 = scores.slice(0, 10);
    
    // Voting: most common section in top 10
    const counts = {};
    for (const item of top10) {
      counts[item.secao] = (counts[item.secao] || 0) + 1;
    }
    const secaoPredita = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    
    console.log(`[Classifier v2] Q2Q Voting predicted section: ${secaoPredita} (in ${Date.now() - startTime}ms)`);

    // 2. LLM Tag Generation (using trained model prompt)
    const llmStartTime = Date.now();
    const systemPrompt = CLASSIFICATION_PROMPT_V2.replace('{secao}', secaoPredita);
    
    // We send a direct prompt asking for the raw tag
    const result = await chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Question: "${question}"\nTag:` }
    ], { maxTokens: 20, temperature: 0.1 });
    
    let tagGerada = result.text.trim().split('\n')[0].trim();
    // Clean up typical LLM noise
    tagGerada = tagGerada.replace(/['"]/g, '').replace(/^{/, '').replace(/}$/, '');
    
    console.log(`[Classifier v2] LLM generated raw tag: ${tagGerada} (in ${Date.now() - llmStartTime}ms)`);

    // 3. Vector Auto-Correction
    let tagFinal = tagGerada;
    let tagScores = [];
    
    if (embeddingsCache.tags_embeddings && embeddingsCache.tags_embeddings[secaoPredita]) {
      const sectionTags = embeddingsCache.tags_embeddings[secaoPredita];
      if (sectionTags.length > 0) {
        const tagOut = await extractor(tagGerada, { pooling: 'mean', normalize: true });
        const tagVec = Array.from(tagOut.data);
        
        tagScores = sectionTags.map(item => ({
          tag: item.tag,
          score: cosineSimilarity(tagVec, item.embedding)
        }));
        
        tagScores.sort((a, b) => b.score - a.score);
        tagFinal = tagScores[0].tag; // Snap to highest cosine similarity
        
        console.log(`[Classifier v2] Auto-Corrected: ${tagGerada} -> ${tagFinal} (Similarity: ${tagScores[0].score.toFixed(3)})`);
      }
    } else {
      console.warn(`[Classifier v2] No official tags found for section ${secaoPredita} in cache.`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Classifier v2] Complete pipeline took ${elapsed}ms. Final Tag: ${tagFinal}`);

    return {
      tags: [tagFinal],
      confidence: 0.9,
      method: 'q2q_llm_autocorrect',
      section_hint: secaoPredita, // Pass this to planner so it knows which section to fetch without asking LLM again!
      raw_tag: tagGerada,
      autocorrect_similarity: tagScores && tagScores.length > 0 ? tagScores[0].score : 1.0
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
