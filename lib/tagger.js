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

Your task: Filter the bula paragraphs that are relevant to answering the user's question.

## INPUT
- Question: The user's original question.
- User Intent Tags: Topics identified in the question.
- Bula text: Numbered paragraphs from a bula section.

## YOUR JOB
1. Read the Question and the User Intent Tags to understand what the user wants.
2. Read each numbered paragraph carefully.
3. Identify which paragraphs contain information needed to answer the question.
4. Return a JSON object with a list of relevant paragraphs. For each, provide its ID, and map it to a short 1-to-3 word intent tag that justifies why it was selected (e.g., "adult_dosage", "paracetamol_intoxication").

## OUTPUT FORMAT
Return ONLY valid JSON in this format:
{
  "relevant_paragraphs": [
    { "id": 3, "intent_tag": "adult_dosage" },
    { "id": 5, "intent_tag": "paracetamol_intoxication" }
  ]
}

## RULES
1. If NO paragraphs are relevant, return {"relevant_paragraphs": []}.
2. Be conservative: if a paragraph MIGHT be useful for the answer, include it.
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

  // Split text into numbered paragraphs
  const rawParagraphs = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
  const numberedText = rawParagraphs.map((p, i) => `[${i}] ${p}`).join('\n\n');

  try {
    const result = await chat([
      { role: "system", content: TAGGER_PROMPT },
      { 
        role: "user", 
        content: `Question: ${question}\nUser Intent Tags: ${JSON.stringify(expectedTags)}\n\nText to filter:\n${numberedText.substring(0, 4000)}` 
      }
    ], { maxTokens: 1000, temperature: 0.1 });

    const elapsed = Date.now() - startTime;
    const jsonText = result.text.trim();
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.warn(`[Tagger] ${section} (${elapsed}ms): No JSON returned`);
      return [{ tag: `${section}_general`, text }];
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.warn(`[Tagger] ${section} (${elapsed}ms): JSON parse failed`);
      return [{ tag: `${section}_general`, text }];
    }

    const relevantParagraphs = parsed.relevant_paragraphs || [];
    const sentences = [];

    // Reconstruct paragraphs from IDs
    for (const item of relevantParagraphs) {
      if (typeof item.id === 'number' && item.id >= 0 && item.id < rawParagraphs.length) {
        // Tag is mapped from intent_tag or inferred from section
        const tag = item.intent_tag || item.tag || `${section}_general`;
        sentences.push({ tag, text: rawParagraphs[item.id].trim() });
      }
    }

    if (sentences.length === 0) {
      console.warn(`[Tagger] ${section} (${elapsed}ms): No relevant sentences found. Returning explicit not_found to preserve determinism.`);
      return [{ tag: "not_found", text: "A bula não contém informações específicas relacionadas à sua pergunta nesta seção." }];
    }

    // GROUP similar tags to reduce fragmentation
    const grouped = groupSimilarTags(sentences, section);
    
    console.log(`[Tagger] ${section} (${elapsed}ms): ${grouped.length} groups (from ${sentences.length} sentences)`);
    grouped.tokens = result.tokens || { input: 0, output: 0 };
    return grouped;

  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[Tagger] ${section} (${elapsed}ms):`, err.message);
    const fallback = [{ tag: `${section}_general`, text }];
    fallback.tokens = { input: 0, output: 0 };
    return fallback;
  }
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
