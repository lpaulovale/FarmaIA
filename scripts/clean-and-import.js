#!/usr/bin/env node
/**
 * Clean and Import Script
 *
 * Drops the entire bulas.documentos collection and re-imports
 * all JSON files from the dados/ directory.
 *
 * Usage:
 *   node scripts/clean-and-import.js                   # import all from dados/
 *   node scripts/clean-and-import.js profissional/profissional  # specific subdirectory
 */

require("dotenv").config();

const path = require("path");
const { importFile, dropCollection, findJsonFiles, DADOS_BASE } = require("../api/import-dados");

async function main() {
  const subdir = process.argv[2] || "";
  const targetDir = path.join(DADOS_BASE, subdir);

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  FarmaIA — Clean & Import Dados                     ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Directory: ${targetDir}`);
  console.log();

  // Find files
  const files = findJsonFiles(targetDir);
  console.log(`  Found ${files.length} JSON files`);

  if (files.length === 0) {
    console.log("  No files to import. Exiting.");
    process.exit(0);
  }

  const profFiles = files.filter(f => path.basename(f).includes("_profissional_"));
  const pacFiles = files.filter(f => path.basename(f).includes("_paciente_"));
  const otherFiles = files.filter(f => !path.basename(f).includes("_profissional_") && !path.basename(f).includes("_paciente_"));

  console.log(`    Profissional: ${profFiles.length}`);
  console.log(`    Paciente:     ${pacFiles.length}`);
  if (otherFiles.length) console.log(`    Other:        ${otherFiles.length}`);
  console.log();

  // Drop collection
  console.log("  🗑️  Dropping collection...");
  await dropCollection();
  console.log("  ✅ Collection cleared\n");

  // Import
  console.log("  📥 Importing...\n");
  const results = [];
  const errors = [];
  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const filename = path.basename(filePath);
    try {
      const result = await importFile(filePath);
      results.push(result);
      const sections = result.sections.filter(s => s !== "outros").join(", ");
      console.log(`  [${i + 1}/${files.length}] ✅ ${result.drugName} [${result.bulaType}] — ${result.sections.length} sections (${sections})`);
    } catch (err) {
      errors.push({ file: filename, error: err.message });
      console.log(`  [${i + 1}/${files.length}] ❌ ${filename}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  console.log();
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Import Summary                                     ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  Total files:    ${String(files.length).padEnd(36)}║`);
  console.log(`║  Imported:       ${String(results.length).padEnd(36)}║`);
  console.log(`║  Errors:         ${String(errors.length).padEnd(36)}║`);
  console.log(`║  Profissional:   ${String(results.filter(r => r.bulaType === "profissional").length).padEnd(36)}║`);
  console.log(`║  Paciente:       ${String(results.filter(r => r.bulaType === "paciente").length).padEnd(36)}║`);
  console.log(`║  Time:           ${(elapsed + "s").padEnd(36)}║`);
  console.log("╚══════════════════════════════════════════════════════╝");

  if (errors.length > 0) {
    console.log("\n  Errors:");
    errors.forEach(e => console.log(`    ❌ ${e.file}: ${e.error}`));
  }

  // Section coverage
  const allSections = new Set();
  results.forEach(r => r.sections.forEach(s => allSections.add(s)));
  console.log(`\n  Sections found across all bulas: ${[...allSections].sort().join(", ")}`);

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
