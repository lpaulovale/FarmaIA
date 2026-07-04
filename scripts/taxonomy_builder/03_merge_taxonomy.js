/**
 * scripts/taxonomy_builder/03_merge_taxonomy.js
 * 
 * Junta os resultados gerados pelo Nemotron em um único arquivo de Taxonomia Mestra
 * para ser consumido pelo gerador de Dataset.
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, 'results');
const OUT_PATH = path.join(__dirname, '../../data/taxonomy.json');

const filesToMerge = {
  'tags_prompt_api_indicacoes.json': 'indicacao',
  'tags_prompt_api_contraindicacoes.json': 'contraindicacao',
  'tags_prompt_api_advertencias.json': 'advertencias',
  'tags_prompt_api_posologia.json': 'posologia',
  'tags_prompt_api_reacoes_adversas.json': 'reacoes'
};

let masterTaxonomy = [];
let seenTags = new Set();

for (const [file, secaoOrigem] of Object.entries(filesToMerge)) {
  const filePath = path.join(RESULTS_DIR, file);
  if (fs.existsSync(filePath)) {
    try {
      const tags = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      for (const tag of tags) {
        if (!tag.nome_tag) continue;
        const slug = tag.nome_tag.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!seenTags.has(slug)) {
          seenTags.add(slug);
          tag.secao_origem = secaoOrigem;
          masterTaxonomy.push(tag);
        }
      }
      console.log(`✅ Adicionadas tags de ${file}`);
    } catch (err) {
      console.error(`❌ Erro ao ler ${file}:`, err.message);
    }
  } else {
    console.warn(`⚠️ Aviso: ${file} não encontrado ainda.`);
  }
}

const dataDir = path.dirname(OUT_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

fs.writeFileSync(OUT_PATH, JSON.stringify(masterTaxonomy, null, 2));
console.log(`\n🎉 Taxonomia Mestra salva em data/taxonomy.json com ${masterTaxonomy.length} intenções únicas!`);
