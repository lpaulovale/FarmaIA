/**
 * Pure JavaScript Extractor for Drug Names and Mode
 * 
 * Preloads all known medications from MongoDB to perform fast
 * string matching and keyword extraction, bypassing the need for
 * an LLM to guess drug names.
 */

const { getCollection } = require('./mongodb_tools');

let knownDrugs = [];

/**
 * Normalizes text to lowercase and removes accents for easier matching.
 */
function normalizeText(text) {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Initializes the drug cache by loading all names from MongoDB.
 */
async function initExtractor() {
  try {
    const coll = await getCollection();
    const docs = await coll.find({ tipo: "bula" })
      .project({ nome_medicamento: 1, composicao: 1, _id: 0 })
      .toArray();

    const uniqueDrugs = new Set();

    for (const doc of docs) {
      if (doc.nome_medicamento) {
        uniqueDrugs.add(normalizeText(doc.nome_medicamento));
      }
      // Se a bula for de um medicamento genérico, a composição ou o nome 
      // podem ajudar. Vamos manter apenas os nomes dos medicamentos por enquanto.
    }

    knownDrugs = Array.from(uniqueDrugs);
    
    // Sort by length descending to match longest possible names first
    knownDrugs.sort((a, b) => b.length - a.length);

    console.log(`[Extractor] Loaded ${knownDrugs.length} unique drug names from MongoDB.`);
  } catch (err) {
    console.error("[Extractor] Failed to initialize drug cache:", err);
  }
}

/**
 * Extracts known drug names from the given question.
 * @param {string} question - The user's question
 * @returns {string[]} Array of extracted drug names
 */
function fuzzyExtractDrugs(question) {
  const normalizedQuestion = normalizeText(question);
  const foundDrugs = [];

  // Stop words comuns em nomes farmacêuticos que não identificam a droga sozinhos
  const stopWords = ['de', 'cloridrato', 'sulfato', 'maleato', 'dipropionato', 'acido', 'sodico', 'potassico', 'bromidrato', 'fosfato', 'mesilato', 'citrato', 'tartarato', 'acetato', 'butilbrometo', 'monoidratada', 'sodio'];

  for (const drug of knownDrugs) {
    // 1. Tenta correspondência exata primeiro (ex: se o usuário digitou o nome completo)
    const escapedDrug = drug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactRegex = new RegExp(`\\b${escapedDrug}\\b`, 'i');
    if (exactRegex.test(normalizedQuestion)) {
      foundDrugs.push(drug);
      continue;
    }

    // 2. Extrai palavras significativas do nome do medicamento no banco
    const words = drug.split(/\s+/).filter(w => !stopWords.includes(w) && w.length > 4);
    
    // 3. Se ALGUMA palavra significativa estiver presente na pergunta, consideramos um match parcial!
    // (ex: "terbinafina" vai dar match em "cloridrato de terbinafina")
    for (const w of words) {
      const escapedW = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRegex = new RegExp(`\\b${escapedW}\\b`, 'i');
      if (wordRegex.test(normalizedQuestion)) {
        foundDrugs.push(drug);
        break; // Matchou uma palavra chave, já achamos a droga
      }
    }
  }

  // Remove duplicatas caso ocorram e retorna
  return [...new Set(foundDrugs)];
}

/**
 * Detects whether the query is for "paciente" or "profissional"
 * @param {string} question - The user's question
 * @returns {string} "paciente" or "profissional"
 */
function detectMode(question) {
  const normalized = normalizeText(question);
  
  const professionalKeywords = [
    'profissional', 'medico', 'medica', 'doutor', 'doutora', 'clinica', 
    'farmacocinetica', 'farmacodinamica', 'mecanismo de acao'
  ];
  
  const patientKeywords = [
    'paciente', 'leigo', 'simples', 'crianca', 'filho', 'filha'
  ];

  for (const kw of professionalKeywords) {
    if (normalized.includes(kw)) {
      return "profissional";
    }
  }

  for (const kw of patientKeywords) {
    if (normalized.includes(kw)) {
      return "paciente";
    }
  }

  // Default
  return "paciente";
}

module.exports = {
  initExtractor,
  fuzzyExtractDrugs,
  detectMode
};
