/**
 * BulaIA Sentence Tagger
 * 
 * Tags each sentence/phrase in bula text with semantic labels.
 * Only sentences with relevant tags are passed to final response generation.
 * 
 * Flow:
 *   1. Input: Raw bula text + user question tags
 *   2. LLM tags each sentence with relevant/irrelevant labels
 *   3. Filter to keep only relevant sentences
 *   4. Output: Filtered, organized text for response generation
 */

const { chat } = require("./llm_client");

const TAGGER_PROMPT = `You are an intelligent pharmaceutical text filtering assistant.

Your task: Filter the bula sentences that are relevant to answering the user's question.

## INPUT
- Question: The user's original question.
- User Intent Tags: Topics identified in the question.
- Bula text: Numbered sentences from a bula section.

## YOUR JOB
1. Read the Question and the User Intent Tags to understand what the user wants.
2. Read each numbered sentence carefully.
3. Identify which specific sentences contain information needed to answer the question.
4. Return a JSON object with a list of relevant sentences. For each, provide its ID, and map it to a short 1-to-3 word intent tag that justifies why it was selected.

## OUTPUT FORMAT
Return ONLY valid JSON in this format:
{
  "relevant_sentences": [
    { "id": 3, "intent_tag": "adult_dosage" },
    { "id": 5, "intent_tag": "paracetamol_intoxication" }
  ]
}

## RULES
1. If NO sentences are relevant, return {"relevant_sentences": []}.
2. Be highly surgical: ONLY select the exact sentences that answer the question. Do not include surrounding sentences if they are irrelevant.
3. Keep the intent_tag short (max 3 words) to preserve speed.
4. Return ONLY JSON. No markdown.`;

/**
 * Tag sentences and filter to keep only what's relevant to user's question.
 * @param {string} text - Raw bula section text
 * @param {string} section - Section name (posologia, reacoes, advertencias, contraindicacao)
 * @param {string[]} questionTags - Tags from user's question
 * @param {string} question - The user's original question
 * @returns {Promise<Array>} Array of { tag, text } - only relevant sentences
 */
async function tagAndFilter(text, section = "unknown", questionTags = [], question = "") {
  const startTime = Date.now();
  
  if (!text || text.length < 50) {
    return [{
      tag: `${section}_general`,
      text: text
    }];
  }

  // Map question tags to expected sentence tags
  const expectedTags = mapQuestionTagsToSentenceTags(questionTags, section);

  // Split text into numbered sentences instead of paragraphs (Sentence-Level Chunking)
  const rawSentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g)?.map(s => s.trim()).filter(s => s.length > 0) || [text.trim()];
  
  // FarmaIA v2 Override: We CANNOT use the PRIMARY model (Ollama) here because it is fine-tuned 
  // strictly for classification (snake_case tags) and will fail to output JSON.
  // We MUST use the fallback generalist model (e.g., Groq Llama 3 70B).
  const { getModelConfig } = require('./llm_config');
  const fallbackConfig = getModelConfig('fallback');
  const { chatWithConfig, chat } = require('./llm_client');
  
  // NOVO: Chunking Inteligente para evitar Lost In The Middle e Truncamento
  const CHUNK_MAX_CHARS = 4000;
  const chunks = [];
  let currentChunk = [];
  let currentCharCount = 0;
  
  for (let i = 0; i < rawSentences.length; i++) {
    const s = `[${i}] ${rawSentences[i]}`;
    if (currentCharCount + s.length > CHUNK_MAX_CHARS && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [];
      currentCharCount = 0;
    }
    currentChunk.push(s);
    currentCharCount += s.length;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  let allRelevantItems = [];
  let totalTokens = { input: 0, output: 0 };
  
  try {
    if (fallbackConfig) {
      console.log(`[Tagger] Forcing generalist model (${fallbackConfig.provider}) for JSON sentence filtering over ${chunks.length} chunk(s).`);
    } else {
      console.warn(`[Tagger] WARNING: No fallback config found. Using primary model for JSON (this might fail if primary is fine-tuned).`);
    }

    // Roda os chunks sequencialmente para não estourar o limite de requisições por segundo (429) da API Gratuita da NVIDIA
    for (const chunkText of chunks) {
      let result;
      if (fallbackConfig) {
        result = await chatWithConfig([
          { role: "system", content: TAGGER_PROMPT },
          { role: "user", content: `Question: ${question}\nUser Intent Tags: ${JSON.stringify(expectedTags)}\n\nText to filter:\n${chunkText}` }
        ], fallbackConfig, { maxTokens: 1000, temperature: 0.1, format: "json" });
      } else {
        result = await chat([
          { role: "system", content: TAGGER_PROMPT },
          { role: "user", content: `Question: ${question}\nUser Intent Tags: ${JSON.stringify(expectedTags)}\n\nText to filter:\n${chunkText}` }
        ], { maxTokens: 1000, temperature: 0.1, format: "json" });
      }
      
      if (result.tokens) {
        totalTokens.input += result.tokens.input || 0;
        totalTokens.output += result.tokens.output || 0;
      }
      
      const jsonText = result.text.trim();
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const items = parsed.relevant_sentences || parsed.relevant_paragraphs || [];
          allRelevantItems.push(...items);
        } catch (e) { }
      }
      
      // Pequeno fôlego entre chunks da MESMA pergunta
      await new Promise(r => setTimeout(r, 1000));
    }
    
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[Tagger] ${section} (${elapsed}ms):`, err.message);
    const fallback = [{ tag: `${section}_general`, text }];
    fallback.tokens = { input: 0, output: 0 };
    return fallback;
  }
  
  const elapsed = Date.now() - startTime;
  
  const sentences = [];
  const seenIds = new Set();
  
  // Reconstruct sentences from IDs
  for (const item of allRelevantItems) {
    if (typeof item.id === 'number' && item.id >= 0 && item.id < rawSentences.length) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        const tag = item.intent_tag || item.tag || `${section}_general`;
        sentences.push({ tag, text: rawSentences[item.id].trim() });
      }
    }
  }

  if (sentences.length === 0) {
    console.warn(`[Tagger] ${section} (${elapsed}ms): No relevant sentences found. Returning explicit not_found to preserve determinism.`);
    return [{ tag: "not_found", text: "A bula não contém informações específicas relacionadas à sua pergunta nesta seção." }];
  }

  // GROUP similar tags to reduce fragmentation
  const grouped = groupSimilarTags(sentences, section);
  
  console.log(`[Tagger] ${section} (${elapsed}ms): ${grouped.length} groups (from ${sentences.length} sentences across ${chunks.length} chunks)`);
  grouped.tokens = totalTokens;
  return grouped;
}

/**
 * Group similar tags to reduce fragmentation.
 * @param {Array} sentences - Array of { tag, text }
 * @param {string} section - Section name
 * @returns {Array} Grouped sentences
 */
function groupSimilarTags(sentences, section) {
  // For posologia: group all dosage entries under broader categories
  if (section === 'posologia') {
    const groups = {
      'dosage_adult': { tag: 'dosage_adult', title: 'Posologia para Adultos', texts: [] },
      'dosage_pediatric': { tag: 'dosage_pediatric', title: 'Posologia para Crianças', texts: [] },
      'dosage_special': { tag: 'dosage_special', title: 'Casos Especiais', texts: [] },
      'administration': { tag: 'administration', title: 'Como Administrar', texts: [] },
    };
    
    for (const s of sentences) {
      if (s.tag.includes('weight') || s.tag.includes('pediatric')) {
        groups['dosage_pediatric'].texts.push(s.text);
      } else if (s.tag.includes('diabetic') || s.tag.includes('renal') || s.tag.includes('hepatic')) {
        groups['dosage_special'].texts.push(s.text);
      } else if (s.tag.includes('administration') || s.tag.includes('route')) {
        groups['administration'].texts.push(s.text);
      } else {
        groups['dosage_adult'].texts.push(s.text);
      }
    }
    
    // Return only non-empty groups, combining texts
    return Object.values(groups)
      .filter(g => g.texts.length > 0)
      .map(g => ({
        tag: g.tag,
        text: g.texts.join('\n')
      }));
  }
  
  // For reacoes: group by category AND split long texts into bullet points
  if (section === 'reacoes') {
    const groups = {
      'side_effects_hypersensitivity': { tag: 'side_effects_hypersensitivity', title: 'Reações de Hipersensibilidade', texts: [] },
      'side_effects_dermatologic': { tag: 'side_effects_dermatologic', title: 'Reações da Pele', texts: [] },
      'side_effects_hematologic': { tag: 'side_effects_hematologic', title: 'Reações Hematológicas', texts: [] },
      'side_effects_cardiovascular': { tag: 'side_effects_cardiovascular', title: 'Reações Cardiovasculares', texts: [] },
      'side_effects_other': { tag: 'side_effects_other', title: 'Outras Reações', texts: [] },
    };
    
    for (const s of sentences) {
      const text = s.text.toLowerCase();
      let category = 'side_effects_other';
      
      if (text.includes('anafil') || text.includes('alérg') || text.includes('hipersens')) {
        category = 'side_effects_hypersensitivity';
      } else if (text.includes('pele') || text.includes('mucosa') || text.includes('urtic') || text.includes('erupç') || text.includes('stevens') || text.includes('lyell')) {
        category = 'side_effects_dermatologic';
      } else if (text.includes('sang') || text.includes('hemat') || text.includes('leuco') || text.includes('agranulo') || text.includes('trombo') || text.includes('plaquet')) {
        category = 'side_effects_hematologic';
      } else if (text.includes('pressão') || text.includes('cardíac') || text.includes('bronco')) {
        category = 'side_effects_cardiovascular';
      }
      
      // SPLIT long texts into smaller bullet points
      const splitTexts = splitIntoBulletPoints(s.text, category);
      groups[category].texts.push(...splitTexts);
    }
    
    return Object.values(groups)
      .filter(g => g.texts.length > 0)
      .map(g => ({
        tag: g.tag,
        text: g.texts.join('\n')
      }));
  }
  
  // Default: return original sentences
  return sentences;
}

/**
 * Split long text into smaller bullet points.
 * @param {string} text - Long text to split
 * @param {string} category - Category for context
 * @returns {string[]} Array of shorter bullet points
 */
function splitIntoBulletPoints(text, category) {
  // If text is short enough, return as-is
  if (text.length < 200) {
    return [text];
  }
  
  // Split by sentence endings (. ! ? followed by space or end)
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
  
  const result = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    
    // If adding this sentence keeps chunk under limit, add it
    if ((currentChunk + ' ' + trimmed).length < 250) {
      currentChunk = (currentChunk + ' ' + trimmed).trim();
    } else {
      // Otherwise, save current chunk and start new one
      if (currentChunk) {
        result.push(currentChunk);
      }
      currentChunk = trimmed;
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk) {
    result.push(currentChunk);
  }
  
  // If we couldn't split (no sentence boundaries), force split by length
  if (result.length === 1 && result[0].length > 300) {
    const forcedSplit = [];
    let remaining = result[0];
    while (remaining.length > 250) {
      // Find a good break point (comma, semicolon, or space)
      let breakPoint = remaining.lastIndexOf(',', 250);
      if (breakPoint === -1) breakPoint = remaining.lastIndexOf(';', 250);
      if (breakPoint === -1) breakPoint = remaining.lastIndexOf(' ', 250);
      if (breakPoint === -1) breakPoint = 250;
      
      forcedSplit.push(remaining.substring(0, breakPoint + 1).trim());
      remaining = remaining.substring(breakPoint + 1).trim();
    }
    if (remaining) {
      forcedSplit.push(remaining);
    }
    return forcedSplit;
  }
  
  return result;
}

/**
 * Map question tags to expected sentence tags.
 * @param {string[]} questionTags - Tags from classifier
 * @param {string} section - Section name
 * @returns {string[]} Expected sentence tags
 */
function mapQuestionTagsToSentenceTags(questionTags, section) {
  const mapping = {
    // Dosage questions
    'dosage_adult': ['dosage_adult'],
    'dosage_pediatric': ['dosage_pediatric', 'dosage_pediatric_weight_\\d+_\\d+kg'],
    'dosage_by_weight': ['dosage_pediatric_weight_\\d+_\\d+kg'],
    'dosage_elderly': ['dosage_elderly'],
    'dosage_renal': ['dosage_renal', 'dosage_hepatic'],
    'dosage_hepatic': ['dosage_hepatic', 'dosage_renal'],
    'administration_route': ['administration'],
    'max_daily_dose': ['max_dose'],
    'contraindication_age': ['age_restriction'],
    
    // Side effects questions
    'common_side_effects': ['side_effects_.*'],
    'adverse_reaction': ['side_effects_.*'],
    'side_effect_frequency': ['side_effects_.*'],
    
    // Contraindication questions
    'who_cannot_use': ['contraindication_.*'],
    'contraindication_pregnancy': ['contraindication_pregnancy'],
    'contraindication_lactation': ['contraindication_lactation'],
    'contraindication_disease': ['contraindication_disease'],
    'contraindication_allergy': ['contraindication_allergy'],
    
    // Warning questions
    'advertencias': ['warning_.*'],
    'alcohol_interaction': ['warning_alcohol'],
    'driving_warning': ['warning_driving'],
    'pregnancy_category': ['warning_pregnancy'],
    'special_population': ['warning_children', 'warning_elderly', 'warning_pregnancy', 'warning_lactation'],
    'long_term_use': ['warning_prolonged_use'],
  };

  const expectedTags = [];
  
  for (const qTag of questionTags) {
    if (mapping[qTag]) {
      expectedTags.push(...mapping[qTag]);
    }
  }

  // If section is known, add section-specific fallback
  if (section === 'posologia' && !expectedTags.some(t => t.includes('dosage'))) {
    expectedTags.push('dosage_.*');
  }
  if (section === 'reacoes' && !expectedTags.some(t => t.includes('side_effects'))) {
    expectedTags.push('side_effects_.*');
  }
  if (section === 'advertencias' && !expectedTags.some(t => t.includes('warning'))) {
    expectedTags.push('warning_.*');
  }
  if (section === 'contraindicacao' && !expectedTags.some(t => t.includes('contraindication'))) {
    expectedTags.push('contraindication_.*');
  }

  return expectedTags;
}

/**
 * Group tagged sentences by tag for organized response generation.
 * @param {Array} sentences - Array of { tag, text }
 * @returns {Object} Sentences grouped by tag
 */
function groupByTag(sentences) {
  const grouped = {};
  
  for (const sentence of sentences) {
    const tag = sentence.tag;
    if (!grouped[tag]) {
      grouped[tag] = [];
    }
    grouped[tag].push(sentence.text);
  }
  
  return grouped;
}

module.exports = {
  tagAndFilter,
  groupByTag,
  mapQuestionTagsToSentenceTags,
};
