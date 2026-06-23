/**
 * BulaIA Tools Utilities
 *
 * Provides utility functions for drug name processing.
 * Note: Drug extraction and intent detection are now handled by lib/planner.js
 *
 * Exported functions:
 *   - localFallbackExtract() → MongoDB-based drug extraction
 */

const { searchMedication } = require("./mongodb_tools");

// ============================================================
// Drug Extraction from MongoDB
// ============================================================

/**
 * Extract drug names by searching MongoDB.
 * Uses keyword matching against MongoDB drug names.
 * @param {string} message - User's question
 * @returns {Promise<string[]>} Array of found drug names
 */
async function localFallbackExtract(message) {
  const msgLower = message.toLowerCase();
  console.log('[Tools] Extracting drugs from:', message);

  // Common drug-related keywords to identify potential drug names
  const drugKeywords = [
    'paracetamol', 'dipirona', 'ibuprofeno', 'aspirina', 'omeprazol',
    'amoxicilina', 'azitromicina', 'diclofenaco', 'cetoprofeno', 'naproxeno',
    'inflmax', 'dorflex', 'buscofem', 'neosalgin', 'novalgina',
    'tylenol', 'benegril', 'resfenol', 'cimegripe', 'dramin',
    'acetilcisteina', 'acetilcisteína', 'aciclovir', 'anlodipino',
    'escopolamina', 'cefalexina', 'cefepima', 'terbinafina',
    'betametasona', 'prednisolona', 'furosemida', 'dexametasona',
    'sulfato de bário', 'difenidramina'
  ];

  const found = [];

  // Check if any keyword is in the message
  for (const keyword of drugKeywords) {
    if (msgLower.includes(keyword.toLowerCase())) {
      console.log('[Tools] Keyword match:', keyword);
      // Clean up accents for standardizing
      const cleanKeyword = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (!found.includes(cleanKeyword)) found.push(cleanKeyword);
    }
  }

  const aliases = {
    "acetaminofeno": "paracetamol",
    "metamizol": "dipirona",
    "ácido acetilsalicílico": "aspirina",
    "acido acetilsalicilico": "aspirina",
  };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (msgLower.includes(alias) && !found.includes(canonical)) {
      found.push(canonical);
    }
  }

  if (found.length > 0) {
    return found;
  }

  // No keyword matches - try MongoDB search for capitalized words
  try {
    const words = message.split(/[\s,]+/);
    console.log('[Tools] Words to search:', words);
    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^\w]/g, '');
      if (word.length > 3 && /^[A-Z]/.test(word)) {
        console.log('[Tools] Searching MongoDB for:', word);
        const searchResult = await searchMedication(word);
        console.log('[Tools] MongoDB result:', searchResult.length, 'matches');
        if (searchResult.length > 0 && !found.includes(searchResult[0].name)) {
          found.push(searchResult[0].name);
        }
      }
    }
  } catch (err) {
    console.warn('[Tools] MongoDB search failed:', err.message);
  }

  console.log('[Tools] Found drugs:', found);
  return found;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  localFallbackExtract,
};
