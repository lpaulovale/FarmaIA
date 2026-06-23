/**
 * BulaIA Question Classifier (Tag-Based)
 *
 * Classifies user questions into semantic tags using LLM.
 * The LLM only picks a tag from a fixed list — it does NOT choose sections.
 * Section routing is handled deterministically by lib/section_router.js
 *
 * Tags (60 total):
 *   Identification:     drug_identity, drug_form, drug_concentration, generic_vs_reference, registration
 *   Composition:        active_ingredient, excipients, chemical_formula, allergen_components, drug_composition
 *   Indication:         therapeutic_indication, disease_treatment, symptom_relief, approved_use
 *   Dosage:             dosage_adult, dosage_pediatric, dosage_elderly, dosage_by_weight, dosage_renal,
 *                       dosage_hepatic, administration_route, administration_timing, treatment_duration,
 *                       medication_intake, missed_dose, max_daily_dose
 *   Contraindication:   contraindication_pregnancy, contraindication_lactation, contraindication_disease,
 *                       contraindication_allergy, contraindication_age, who_cannot_use
 *   Warnings:           driving_warning, alcohol_interaction, special_population, pregnancy_category,
 *                       doping_alert, precaution_disease, long_term_use, dependency_risk,
 *                       pediatric_warning, elderly_warning
 *   Interactions:       drug_drug_interaction, drug_food_interaction, drug_lab_interaction,
 *                       potentiating_effect, inhibiting_effect, dangerous_combination
 *   Adverse Reactions:  adverse_reaction, side_effect_frequency, serious_adverse_event,
 *                       organ_toxicity, allergic_reaction, common_side_effects
 *   Overdose:           overdose, overdose_symptoms, overdose_treatment, accidental_ingestion, toxic_dose
 *   Pharmacodynamics:   mechanism_of_action, pharmacodynamics, drug_class, receptor_target, therapeutic_effect
 *   Pharmacokinetics:   onset_of_action, drug_absorption, drug_distribution, drug_metabolism,
 *                       drug_elimination, half_life, bioavailability
 *   Storage:            storage_conditions, temperature_storage, light_sensitivity, shelf_life, after_opening
 */

const { chat } = require("./llm_client");

// ============================================================
// Keyword-based pre-detection for multi-intent questions
// ============================================================
const INTENT_KEYWORDS = {
  dosage_adult: ['dose adulto', 'dose para adulto', 'quantos mg adulto', 'posologia adulto'],
  dosage_pediatric: ['dose criança', 'dose pediatrica', 'dose infantil', 'crianças', 'crianca'],
  dosage_by_weight: ['dose por peso', 'mg por kg', 'gotas por kg'],
  who_cannot_use: ['contraindic', 'não pode', 'nao pode', 'quem não pode', 'quem nao pode', 'tem contraindicações'],
  common_side_effects: ['efeito colateral', 'efeitos colaterais', 'reação adversa', 'reações adversas'],
  alcohol_interaction: ['álcool', 'bebida alcoolica', 'pode beber', 'tomar com álcool'],
  pregnancy: ['grávida', 'gravidez', 'gestante'],
  lactation: ['amamentando', 'amamentação', 'leite materno'],
  storage_conditions: ['guardar', 'armazenar', 'conservar', 'validade'],
  drug_interaction: ['interação', 'interacoes', 'pode tomar junto', 'combinação'],
};

/**
 * Detect intents from keywords before calling LLM.
 * This helps small models catch multi-intent questions.
 * @param {string} question - User's question (lowercase)
 * @returns {string[]} Array of detected tags
 */
function detectIntentsFromKeywords(question) {
  const lower = question.toLowerCase();
  const detected = [];
  
  for (const [tag, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        if (!detected.includes(tag)) {
          detected.push(tag);
        }
        break;
      }
    }
  }
  
  return detected;
}

// ============================================================
// LLM System Prompt for Classification
// ============================================================
const CLASSIFICATION_PROMPT = `You are a pharmaceutical question classifier for Brazilian drug labels (bulas ANVISA).

Your job:
1. Identify ALL intents/predefined tags in the question.
2. Generate 1 or 2 SHORT custom tags (max 3 words) that capture the specific intent of the user (e.g., "intoxicação", "insuficiência renal", "asma").
3. Return ONLY valid JSON with the tags:
{ "tags": ["<tag1>"], "custom_tags": ["<custom1>"], "confidence": <0.0-1.0> }

IMPORTANT:
- The drug name has ALREADY been extracted by another system. Do not try to extract it.
- If the question uses pronouns like "ele", "este medicamento", "isso", look at the CONVERSATION CONTEXT.
- If the question has multiple parts (e.g., "Qual a dose e tem contraindicações?"), you MUST return ALL relevant tags.

TAGS (pick ALL that apply):
  Identification:     drug_identity, drug_form, drug_concentration, generic_vs_reference, registration
  Composition:        active_ingredient, excipients, chemical_formula, allergen_components, drug_composition
  Indication:         therapeutic_indication, disease_treatment, symptom_relief, approved_use
  Dosage:             dosage_adult, dosage_pediatric, dosage_elderly, dosage_by_weight, dosage_renal,
                      dosage_hepatic, administration_route, administration_timing, treatment_duration,
                      medication_intake, missed_dose, max_daily_dose
  Contraindication:   contraindication_pregnancy, contraindication_lactation, contraindication_disease,
                      contraindication_allergy, contraindication_age, who_cannot_use
  Warnings:           driving_warning, alcohol_interaction, special_population, pregnancy_category,
                      doping_alert, precaution_disease, long_term_use, dependency_risk,
                      pediatric_warning, elderly_warning
  Interactions:       drug_drug_interaction, drug_food_interaction, drug_lab_interaction,
                      potentiating_effect, inhibiting_effect, dangerous_combination
  Adverse Reactions:  adverse_reaction, side_effect_frequency, serious_adverse_event,
                      organ_toxicity, allergic_reaction, common_side_effects
  Overdose:           overdose, overdose_symptoms, overdose_treatment, accidental_ingestion, toxic_dose
  Pharmacodynamics:   mechanism_of_action, pharmacodynamics, drug_class, receptor_target, therapeutic_effect
  Pharmacokinetics:   onset_of_action, drug_absorption, drug_distribution, drug_metabolism,
                      drug_elimination, half_life, bioavailability
  Storage:            storage_conditions, temperature_storage, light_sensitivity, shelf_life, after_opening

Examples:
  "Qual o princípio ativo do Paracetamol?" → { "tags": ["active_ingredient"], "custom_tags": ["princípio ativo"], "confidence": 0.97 }
  "Posso dar para meu filho de 10kg?" → { "tags": ["dosage_by_weight"], "custom_tags": ["criança 10kg"], "confidence": 0.91 }
  "Qual a dose de acetilcisteína para intoxicação por paracetamol?" → { "tags": ["dosage_adult"], "custom_tags": ["intoxicação paracetamol"], "confidence": 0.95 }
  "Como o ibuprofeno age no corpo?" → { "tags": ["mechanism_of_action"], "custom_tags": ["ação no corpo"], "confidence": 0.88 }
  "Como guardar este medicamento?" → { "tags": ["storage_conditions"], "custom_tags": ["armazenamento"], "confidence": 0.96 }

Examples with CONVERSATION CONTEXT (drug from previous messages):
  Context: "Usuário: Qual a dose de Dipirona? / Assistente: A dose é..."
  → "E para crianças?" → { "tags": ["dosage_pediatric"], "confidence": 0.94 }
  Context: "Usuário: Rivotril causa sonolência? / Assistente: Não geralmente..."
  → "Quais os efeitos colaterais então?" → { "tags": ["common_side_effects"], "confidence": 0.91 }
  Context: "Usuário: Ibuprofeno está indicado para dor de cabeça / Assistente: Sim..."
  → "Quem não pode tomar?" → { "tags": ["who_cannot_use"], "confidence": 0.93 }

Return ONLY the JSON object. No explanation. No markdown. No code blocks.`;

/**
 * Classify using LLM with keyword fallback.
 * @param {string} question - User's question
 * @param {Array} history - Previous conversation messages (optional)
 * @returns {Promise<{ tags: string[], drug: string|null, confidence: number, method: string }>}
 */
async function classifyWithLLM(question, history = []) {
  const startTime = Date.now();
  
  // First, try keyword detection for common patterns
  const keywordTags = detectIntentsFromKeywords(question);

  // Build context from conversation history
  let contextPrompt = "";
  if (history && history.length > 0) {
    const historyText = history
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(-4) // Last 4 messages for context
      .map(m => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.text}`)
      .join("\n");
    contextPrompt = `\n\nCONTEXTO DA CONVERSA ANTERIOR:\n${historyText}\n\n`;
  }

  try {
    const result = await chat([
      { role: "system", content: CLASSIFICATION_PROMPT },
      { role: "user", content: contextPrompt + question },
    ], { maxTokens: 150, temperature: 0.1 });

    const elapsed = Date.now() - startTime;
    console.log(`[Classifier] Completed in ${elapsed}ms`);

    const jsonText = result.text.trim();
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.warn("[Classifier] LLM returned no JSON:", jsonText);
      // Fall back to keyword detection
      if (keywordTags.length > 0) {
        console.log(`[Classifier] Falling back to keywords: ${keywordTags.join(', ')}`);
        return { tags: keywordTags, confidence: 0.7, method: 'keyword' };
      }
      return { tags: [], confidence: 0, method: 'keyword' };
    }

    const classification = JSON.parse(jsonMatch[0]);

    // Handle both old format (tag) and new format (tags)
    let llmTags = classification.tags || (classification.tag ? [classification.tag] : []);
    let customTags = classification.custom_tags || [];
    
    // Merge LLM tags with custom tags and keyword tags (union)
    const mergedTags = [...new Set([...llmTags, ...customTags, ...keywordTags])];
    
    if (mergedTags.length === 0 && keywordTags.length > 0) {
      // LLM failed but keywords worked
      console.log(`[Classifier] LLM missed intents, using keywords: ${keywordTags.join(', ')}`);
      return { tags: keywordTags, confidence: 0.75, method: 'keyword+llm' };
    }

    console.log(`[Classifier] LLM tags: ${llmTags.join(', ')}, Keywords: ${keywordTags.join(', ')}, Merged: ${mergedTags.join(', ')}`);

    return {
      tags: mergedTags,
      confidence: classification.confidence || 0.5,
      method: mergedTags.length !== llmTags.length ? 'keyword+llm' : 'llm',
      tokens: result.tokens || { input: 0, output: 0 },
    };
  } catch (err) {
    console.error("[Classifier] LLM classification failed:", err.message);
    // Fall back to keyword detection
    if (keywordTags.length > 0) {
      console.log(`[Classifier] LLM error, falling back to keywords: ${keywordTags.join(', ')}`);
      return { tags: keywordTags, confidence: 0.7, method: 'keyword', tokens: { input: 0, output: 0 } };
    }
    return { tags: [], confidence: 0, method: 'keyword', tokens: { input: 0, output: 0 } };
  }
}

/**
 * Classify a question into semantic tag(s).
 * @param {string} question - User's question
 * @param {Array} extractedDrugs - Optional list of drugs already extracted
 * @returns {Promise<{ tags: string[], confidence: number, method: string }>}
 */
async function classifyQuestion(question, history = [], extractedDrugs = []) {
  let finalPrompt = question;
  if (extractedDrugs && extractedDrugs.length > 0) {
    finalPrompt = `[Medicamentos já identificados: ${extractedDrugs.join(', ')}] ` + question;
  }
  const llmResult = await classifyWithLLM(finalPrompt, history);
  console.log(`[Classifier] LLM classification: ${llmResult.tags.join(', ')} (confidence: ${llmResult.confidence})`);
  return llmResult;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  classifyQuestion,
  classifyWithLLM,
};
