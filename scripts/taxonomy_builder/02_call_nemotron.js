const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { OpenAI } = require('openai');
const { runWithConcurrencyLimit, callWithRetry } = require('../../lib/api_utils');

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const MODEL_NAME = 'nvidia/nemotron-3-ultra-550b-a55b';
const RESULTS_DIR = path.join(__dirname, 'results');
const PARTIALS_DIR = path.join(RESULTS_DIR, 'partials');

if (!fs.existsSync(PARTIALS_DIR)) fs.mkdirSync(PARTIALS_DIR);

const openai = new OpenAI({
  apiKey: NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
  timeout: 10 * 60 * 1000, 
  maxRetries: 0
});

// Quebra as bulas baseado em estimativa de tokens (caracteres) em vez de número fixo
// 18.000 caracteres ≈ 4.500 tokens (bem abaixo da margem de perigo para o modo Thinking)
function chunkByTokenEstimate(text, maxChars = 18000) {
  const bulas = text.split('--- BULA:').filter(t => t.trim().length > 0);
  const chunks = [];
  let currentChunk = '';
  
  for (let i = 0; i < bulas.length; i++) {
    const bulaText = '--- BULA:' + bulas[i];
    if (currentChunk.length + bulaText.length > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = bulaText;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + bulaText;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  
  return chunks;
}

function extractJsonArray(text) {
  const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (match) return JSON.parse(match[0]);
  throw new Error("JSON array não encontrado na resposta");
}

function registrarFalha(fileName, chunkIndex, errorMsg) {
  const falhasPath = path.join(RESULTS_DIR, 'falhas.json');
  let falhas = [];
  if (fs.existsSync(falhasPath)) {
    try { falhas = JSON.parse(fs.readFileSync(falhasPath, 'utf-8')); } catch(e) {}
  }
  falhas.push({ fileName, chunkIndex, error: errorMsg, timestamp: new Date().toISOString() });
  fs.writeFileSync(falhasPath, JSON.stringify(falhas, null, 2));
}

async function processChunk(promptHeader, chunkText, chunkIndex, fileName) {
  const partialPath = path.join(PARTIALS_DIR, `${fileName}_chunk_${chunkIndex}.json`);
  
  // Skip if already processed successfully (Resume capability)
  if (fs.existsSync(partialPath)) {
    try {
      const tags = extractJsonArray(fs.readFileSync(partialPath, 'utf-8'));
      console.log(`⏩ Chunk ${chunkIndex} de ${fileName} já processado, pulando.`);
      return tags;
    } catch (e) {
      console.warn(`⚠️ Arquivo parcial corrompido para Chunk ${chunkIndex} de ${fileName}. Reprocessando...`);
    }
  }

  const prompt = `${promptHeader}\n${chunkText}`;
  
  const apiCall = async () => {
    const completion = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      top_p: 0.95,
      max_tokens: 16384,
      reasoning_budget: 16384,
      chat_template_kwargs: { "enable_thinking": true }
    });
    return completion;
  };

  try {
    const completion = await callWithRetry(apiCall, 3, 15000);
    const tags = extractJsonArray(completion.choices[0].message.content);
    fs.writeFileSync(partialPath, JSON.stringify(tags, null, 2));
    console.log(`✅ Chunk ${chunkIndex} salvo com sucesso: ${tags.length} tags extraídas.`);
    return tags;
  } catch (err) {
    console.error(`❌ Falha no Chunk ${chunkIndex} de ${fileName} após retentativas:`, err.message);
    registrarFalha(fileName, chunkIndex, err.message);
    return []; // Retorna array vazio em caso de falha irreversível para não quebrar os outros chunks
  }
}

async function processFile(fileName) {
  try {
    const filePath = path.join(RESULTS_DIR, fileName);
    if (!fs.existsSync(filePath)) return false;

    const content = fs.readFileSync(filePath, 'utf-8');
    const splitMarker = 'Aqui estão os textos brutos das bulas para a sua análise:';
    
    let header = content;
    let rawText = '';
    if (content.includes(splitMarker)) {
      const parts = content.split(splitMarker);
      header = parts[0] + '\n' + splitMarker;
      rawText = parts[1];
    } else {
      rawText = content; // Fallback se não achar o marcador
    }

    const chunks = chunkByTokenEstimate(rawText, 18000);
    console.log(`\n📦 ${fileName}: Dividido em ${chunks.length} lotes por tamanho (aprox. 18k caracteres cada)`);

    const allTags = [];
    
    for (let i = 0; i < chunks.length; i++) {
      console.log(`⏳ [${fileName}] Processando lote ${i+1}/${chunks.length}...`);
      const tags = await processChunk(header, chunks[i], i+1, fileName);
      allTags.push(...tags);
    }

    // Deduplicação Programática (via JS em vez de via LLM gigante)
    const dedupedTags = [];
    const seenNames = new Set();
    
    for (const tag of allTags) {
      if (!tag || !tag.nome_tag) continue;
      
      const slug = tag.nome_tag.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seenNames.has(slug)) {
        seenNames.add(slug);
        dedupedTags.push(tag);
      }
    }

    const outPath = path.join(RESULTS_DIR, `tags_${fileName.replace('.txt', '.json')}`);
    fs.writeFileSync(outPath, JSON.stringify(dedupedTags, null, 2));
    console.log(`\n🎉 Consolidação final: ${fileName} salvo com ${dedupedTags.length} tags únicas!`);
    return true;
  } catch (err) {
    console.error(`❌ ERRO FATAL ao processar o arquivo ${fileName}:`, err.message);
    registrarFalha(fileName, "FATAL", err.message);
    return false; // Retorna false para evitar que o Promise.all() quebre todo o pipeline
  }
}

async function main() {
  if (!NVIDIA_API_KEY || NVIDIA_API_KEY === 'cole_sua_chave_nvapi_aqui') {
    console.error("❌ ERRO: Chave NVIDIA inválida");
    return;
  }

  const sections = [
    'prompt_api_indicacoes.txt',
    'prompt_api_advertencias.txt',
    'prompt_api_posologia.txt',
    'prompt_api_reacoes_adversas.txt'
  ];

  const tasks = sections.map(file => () => processFile(file));
  const results = await runWithConcurrencyLimit(tasks, 1);
  
  const falhasPath = path.join(RESULTS_DIR, 'falhas.json');
  if (fs.existsSync(falhasPath)) {
    console.log(`\n⚠️ O pipeline terminou, mas houve falhas parciais. Verifique ${falhasPath}`);
  } else {
    console.log("\n🚀 Todas as seções processadas e taxonomias salvas em results/ com SUCESSO ABSOLUTO!");
  }
}

main();


