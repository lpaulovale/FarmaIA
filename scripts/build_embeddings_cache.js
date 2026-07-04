const fs = require('fs');
const path = require('path');
const { pipeline } = require('@xenova/transformers');

async function buildCache() {
  console.log("Loading datasets...");
  const datasetPath = path.join(__dirname, '../data/dataset_v2.jsonl');
  const taxonomyPath = path.join(__dirname, '../data/taxonomy_v2.json');
  const cachePath = path.join(__dirname, '../data/embeddings_cache.json');

  const qaPairs = [];
  const lines = fs.readFileSync(datasetPath, 'utf8').split('\n');
  for (const line of lines) {
    if (line.trim()) {
      const obj = JSON.parse(line);
      qaPairs.push({
        question: obj.messages[1].content,
        secao: obj.metadata.secao
      });
    }
  }

  const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));
  const tagsBySection = {};
  for (const item of taxonomy) {
    if (!tagsBySection[item.secao_origem]) tagsBySection[item.secao_origem] = [];
    tagsBySection[item.secao_origem].push(item.nome_tag);
  }

  console.log(`Loaded ${qaPairs.length} questions and ${taxonomy.length} tags. Loading model...`);
  const extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');

  const cache = {
    train_embeddings: [],
    tags_embeddings: {}
  };

  // Embed questions
  console.log("Embedding questions...");
  for (let i = 0; i < qaPairs.length; i++) {
    const output = await extractor("query: " + qaPairs[i].question, { pooling: 'mean', normalize: true });
    cache.train_embeddings.push({
      secao: qaPairs[i].secao,
      embedding: Array.from(output.data)
    });
    if (i % 500 === 0) console.log(`  Embedded ${i}/${qaPairs.length}`);
  }

  // Embed tags
  console.log("Embedding tags...");
  for (const [sec, tags] of Object.entries(tagsBySection)) {
    cache.tags_embeddings[sec] = [];
    for (const tag of tags) {
      const output = await extractor(tag, { pooling: 'mean', normalize: true });
      cache.tags_embeddings[sec].push({
        tag: tag,
        embedding: Array.from(output.data)
      });
    }
  }

  fs.writeFileSync(cachePath, JSON.stringify(cache));
  console.log(`Cache saved to ${cachePath}!`);
}

buildCache().catch(console.error);
