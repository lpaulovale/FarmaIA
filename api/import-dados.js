/**
 * Import Dados API — Imports bula JSON files into MongoDB
 *
 * Handles TWO distinct JSON formats produced by the PDF extraction pipeline:
 *
 * FORMAT A — Profissional bulas:
 *   segments[]: { section_id, section_title, content, clinical_priority, drug_name, source_file }
 *   Each segment is a self-contained section with full content.
 *
 * FORMAT B — Paciente bulas:
 *   segments[]: { section_id, subsection_raw, full_text, tags, clinical_priority, phrases[] }
 *   Segments are granular fragments. Non-"outros" segments are section markers;
 *   following "outros" segments belong to the preceding labeled section.
 *
 * Both are transformed into the MongoDB schema used by mongodb_tools.js:
 *   {
 *     nome_medicamento, tipo: "bula", composicao, secoes, has_section,
 *     texto_completo, fonte_arquivo, bula_type ("profissional"|"paciente"), ...
 *   }
 *
 * Endpoints:
 *   GET  /api/import-dados?dir=profissional/profissional  → list JSON files
 *   POST /api/import-dados { action, dir?, filename? }    → import to MongoDB
 */

const fs = require("fs");
const path = require("path");
const { getCollection } = require("../lib/mongodb_tools");

const DADOS_BASE = path.join(__dirname, "..", "dados");

// ============================================================
// Helpers
// ============================================================

/** Recursively find all JSON files in a directory */
function findJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findJsonFiles(fullPath));
    else if (entry.name.endsWith(".json")) results.push(fullPath);
  }
  return results;
}

/** Normalize drug name — strip symbols, extra whitespace, uppercase */
function normalizeDrugName(name) {
  return name.replace(/[®™]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

/** Detect the bula type from filename */
function detectBulaType(filename) {
  if (filename.includes("_profissional_") || filename.includes("_profissional.")) return "profissional";
  if (filename.includes("_paciente_") || filename.includes("_paciente.")) return "paciente";
  return "desconhecido";
}

/** Extract drug name from filename when metadata lacks it */
function drugNameFromFilename(filename) {
  // Pattern: DRUG_NAME_bula_tipo_segments_timestamp.json
  const match = filename.match(/^(.+?)_bula_/i);
  if (match) return match[1].replace(/_/g, " ").trim();
  return filename.replace(/_segments.*\.json$/, "").replace(/_/g, " ").trim();
}

/**
 * Map paciente-style section headings in "outros" segments to proper section IDs.
 * The paciente PDFs have numbered sections like "1. PARA QUE ESTE MEDICAMENTO É INDICADO?"
 */
const PACIENTE_HEADING_MAP = [
  { pattern: /para que (este|esse) medicamento/i, section: "indicacao" },
  { pattern: /como (este|esse) medicamento funciona/i, section: "farmacodinamica" },
  { pattern: /quando n[aã]o devo usar/i, section: "contraindicacao" },
  { pattern: /o que devo saber antes/i, section: "advertencias" },
  { pattern: /onde.*como.*por quanto tempo.*guardar/i, section: "armazenamento" },
  { pattern: /como devo usar/i, section: "posologia" },
  { pattern: /males.*que.*pode.*causar/i, section: "reacoes" },
  { pattern: /o que fazer.*dose.*maior/i, section: "superdose" },
  { pattern: /esqueci de usar/i, section: "posologia" },
  { pattern: /apresenta[çc][aã]o/i, section: "apresentacao" },
  { pattern: /composi[çc][aã]o/i, section: "composicao" },
  { pattern: /dizeres legais/i, section: "legal" },
  { pattern: /intera[çc][oõ]es medicamentosas/i, section: "interacoes" },
  { pattern: /gravidez e lacta[çc][aã]o/i, section: "advertencias" },
  { pattern: /posologia/i, section: "posologia" },
];

/** Try to detect a section from a heading text */
function detectSectionFromHeading(text) {
  const clean = text.replace(/[#*]/g, "").trim();
  for (const { pattern, section } of PACIENTE_HEADING_MAP) {
    if (pattern.test(clean)) return section;
  }
  return null;
}

// ============================================================
// Transform: Profissional format → MongoDB doc
// ============================================================
function transformProfissional(jsonData, sourceFilePath) {
  const meta = jsonData.document_metadata || {};
  const segments = jsonData.segments || [];
  const filename = path.basename(sourceFilePath);
  const drugName = normalizeDrugName(meta.drug_name || drugNameFromFilename(filename));

  const secoes = {};
  const hasSection = {};
  const clinicalPriorities = {};
  const sectionTitles = {};
  const textParts = [`MEDICAMENTO: ${drugName}\n`];
  let composicao = "";

  for (const seg of segments) {
    const sectionId = seg.section_id || "outros";
    const content = (seg.content || "").trim();
    if (!content) continue;

    if (secoes[sectionId]) {
      secoes[sectionId] += "\n\n" + content;
    } else {
      secoes[sectionId] = content;
    }

    hasSection[sectionId] = true;
    clinicalPriorities[sectionId] = seg.clinical_priority || 3;
    sectionTitles[sectionId] = seg.section_title || sectionId;
    textParts.push(`${seg.section_title || sectionId.toUpperCase()}:\n${content}\n`);

    if (sectionId === "composicao") composicao = content;
  }

  return {
    nome_medicamento: drugName,
    tipo: "bula",
    bula_type: "profissional",
    composicao,
    secoes,
    has_section: hasSection,
    texto_completo: textParts.join("\n"),
    fonte_arquivo: meta.original_file || filename,
    metodo_conversao: meta.conversion_method || "unknown",
    data_conversao: meta.conversion_timestamp || null,
    clinical_priorities: clinicalPriorities,
    section_titles: sectionTitles,
    segments_count: segments.length,
    importedAt: new Date(),
    updatedAt: new Date(),
  };
}

// ============================================================
// Transform: Paciente format → MongoDB doc
// ============================================================
function transformPaciente(jsonData, sourceFilePath) {
  const meta = jsonData.document_metadata || {};
  const segments = jsonData.segments || [];
  const filename = path.basename(sourceFilePath);
  const drugName = normalizeDrugName(meta.drug_name || drugNameFromFilename(filename));

  // The paciente format works differently:
  // - Non-"outros" segments are section markers (headers)
  // - Following "outros" segments contain the actual content for that section
  // - We also detect sections from headings inside "outros" segments

  const secoes = {};
  const hasSection = {};
  const clinicalPriorities = {};
  const sectionTitles = {};
  const textParts = [`MEDICAMENTO: ${drugName}\n`];
  let composicao = "";

  let currentSection = "outros";
  let currentTitle = "Outros";

  for (const seg of segments) {
    const text = (seg.full_text || "").trim();
    if (!text) continue;

    // Skip image-only segments
    if (/^!\[.*\]\(.*\)$/.test(text)) continue;

    const sectionId = seg.section_id || "outros";

    if (sectionId !== "outros") {
      // This is a section marker — switch context
      currentSection = sectionId;
      currentTitle = (seg.subsection_raw || "").replace(/[#*]/g, "").trim() || sectionId;
      continue; // The marker itself is just a heading, content follows
    }

    // "outros" segment — check if it's actually a recognizable heading
    const detectedSection = detectSectionFromHeading(text);
    if (detectedSection) {
      currentSection = detectedSection;
      currentTitle = text.replace(/[#*]/g, "").replace(/^\d+\.\s*/, "").trim();
      continue; // This was a heading, content follows
    }

    // This is actual content — add to current section
    // Clean markdown formatting artifacts
    const cleanText = text
      .replace(/^#{1,6}\s*\*{0,2}/, "")   // Remove heading markers
      .replace(/\*{2}/g, "")               // Remove bold markers
      .trim();

    if (!cleanText || cleanText.length < 3) continue;

    if (secoes[currentSection]) {
      secoes[currentSection] += "\n\n" + cleanText;
    } else {
      secoes[currentSection] = cleanText;
    }

    hasSection[currentSection] = true;
    clinicalPriorities[currentSection] = seg.clinical_priority || 3;
    sectionTitles[currentSection] = currentTitle;
    textParts.push(cleanText);

    if (currentSection === "composicao") composicao = cleanText;
  }

  return {
    nome_medicamento: drugName,
    tipo: "bula",
    bula_type: "paciente",
    composicao,
    secoes,
    has_section: hasSection,
    texto_completo: textParts.join("\n"),
    fonte_arquivo: meta.original_file || filename,
    metodo_conversao: meta.conversion_method || "unknown",
    data_conversao: meta.conversion_timestamp || null,
    clinical_priorities: clinicalPriorities,
    section_titles: sectionTitles,
    segments_count: segments.length,
    importedAt: new Date(),
    updatedAt: new Date(),
  };
}

// ============================================================
// Import logic
// ============================================================

/** Transform a JSON file based on auto-detected format */
function transformToMongoDoc(jsonData, sourceFilePath) {
  const filename = path.basename(sourceFilePath);
  const bulaType = detectBulaType(filename);
  const segments = jsonData.segments || [];

  // Detect format: profissional has "content" field, paciente has "full_text" + "phrases"
  const hasContentField = segments.some(s => s.content !== undefined);
  const hasFullTextField = segments.some(s => s.full_text !== undefined);

  if (hasContentField && !hasFullTextField) {
    return transformProfissional(jsonData, sourceFilePath);
  } else if (hasFullTextField) {
    return transformPaciente(jsonData, sourceFilePath);
  } else {
    // Fallback: try profissional format
    console.warn(`[Import] Unknown format for ${filename}, trying profissional parser`);
    return transformProfissional(jsonData, sourceFilePath);
  }
}

/** Import a single file (upsert by drug name + source file) */
async function importFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const jsonData = JSON.parse(raw);
  const doc = transformToMongoDoc(jsonData, filePath);
  const coll = await getCollection();

  const result = await coll.updateOne(
    { nome_medicamento: doc.nome_medicamento, fonte_arquivo: doc.fonte_arquivo },
    { $set: { ...doc, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );

  return {
    drugName: doc.nome_medicamento,
    bulaType: doc.bula_type,
    sourceFile: doc.fonte_arquivo,
    sections: Object.keys(doc.secoes),
    textLength: doc.texto_completo.length,
    upserted: !!result.upsertedId,
    modified: result.modifiedCount > 0,
  };
}

/** Drop entire collection */
async function dropCollection() {
  const coll = await getCollection();
  await coll.deleteMany({});
  console.log("[Import] Collection cleared.");
}

// ============================================================
// HTTP Handler
// ============================================================
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // ---- GET: list files ----
    if (req.method === "GET") {
      const subdir = req.query?.dir || "";
      const targetDir = path.join(DADOS_BASE, subdir);
      if (!targetDir.startsWith(DADOS_BASE)) return res.status(400).json({ error: "Caminho inválido." });

      const files = findJsonFiles(targetDir);
      const fileInfos = files.map(f => {
        const stats = fs.statSync(f);
        return {
          filename: path.basename(f),
          relativePath: path.relative(DADOS_BASE, f).replace(/\\/g, "/"),
          bulaType: detectBulaType(path.basename(f)),
          sizeBytes: stats.size,
        };
      });

      return res.status(200).json({
        directory: subdir || "(root)",
        filesCount: fileInfos.length,
        profissional: fileInfos.filter(f => f.bulaType === "profissional").length,
        paciente: fileInfos.filter(f => f.bulaType === "paciente").length,
        files: fileInfos,
      });
    }

    // ---- POST: import / clean ----
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

    const { action, filename, dir } = req.body || {};

    if (!action) {
      return res.status(400).json({
        error: "Ação requerida.",
        actions: {
          clean_and_import: 'POST { action: "clean_and_import", dir: "profissional/profissional" }',
          import_all: 'POST { action: "import_all", dir: "profissional/profissional" }',
          import_one: 'POST { action: "import_one", filename: "...", dir: "profissional/profissional" }',
          drop: 'POST { action: "drop" }',
        },
      });
    }

    // --- Drop collection ---
    if (action === "drop") {
      await dropCollection();
      return res.status(200).json({ success: true, action: "drop", message: "Coleção limpa." });
    }

    // --- Clean and import (drop + import all) ---
    if (action === "clean_and_import") {
      await dropCollection();
      // Fall through to import_all logic
    }

    // --- Import all / clean_and_import ---
    if (action === "import_all" || action === "clean_and_import") {
      const subdir = dir || "";
      const targetDir = path.join(DADOS_BASE, subdir);
      if (!targetDir.startsWith(DADOS_BASE)) return res.status(400).json({ error: "Caminho inválido." });

      const files = findJsonFiles(targetDir);
      if (files.length === 0) {
        return res.status(200).json({ success: true, action, message: "Nenhum arquivo JSON encontrado.", imported: 0 });
      }

      console.log(`[Import] Starting batch import of ${files.length} files from ${subdir || "dados/"}`);
      const results = [];
      const errors = [];

      for (const filePath of files) {
        try {
          const result = await importFile(filePath);
          results.push(result);
          console.log(`[Import] ✅ ${result.drugName} [${result.bulaType}] (${result.sections.length} sections, ${result.textLength} chars)`);
        } catch (err) {
          const fn = path.basename(filePath);
          errors.push({ file: fn, error: err.message });
          console.error(`[Import] ❌ ${fn}: ${err.message}`);
        }
      }

      // Summary stats
      const profCount = results.filter(r => r.bulaType === "profissional").length;
      const pacCount = results.filter(r => r.bulaType === "paciente").length;

      return res.status(200).json({
        success: true,
        action,
        directory: subdir || "(root)",
        totalFiles: files.length,
        imported: results.length,
        profissional: profCount,
        paciente: pacCount,
        errors: errors.length,
        results,
        ...(errors.length > 0 && { errorDetails: errors }),
      });
    }

    // --- Import one ---
    if (action === "import_one") {
      if (!filename) return res.status(400).json({ error: "filename é obrigatório." });
      const subdir = dir || "";
      const filePath = path.join(DADOS_BASE, subdir, filename);
      if (!filePath.startsWith(DADOS_BASE)) return res.status(400).json({ error: "Caminho inválido." });
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: `Arquivo não encontrado: ${filename}` });

      const result = await importFile(filePath);
      return res.status(200).json({ success: true, action: "import_one", result });
    }

    return res.status(400).json({ error: `Ação desconhecida: ${action}` });
  } catch (err) {
    console.error("[Import] Error:", err);
    return res.status(500).json({ error: "Erro interno.", details: err.message });
  }
};

// Export for script usage
module.exports.importFile = importFile;
module.exports.dropCollection = dropCollection;
module.exports.findJsonFiles = findJsonFiles;
module.exports.DADOS_BASE = DADOS_BASE;
