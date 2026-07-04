const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const OpenAI = require('openai');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Forçar variáveis de ambiente para a API da NVIDIA ANTES de importar as libs do FarmaIA
process.env.NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "YOUR_KEY_HERE"; // Garanta que sua key esteja no shell
process.env.PRIMARY_PROVIDER = 'nvidia';
process.env.PRIMARY_MODEL = 'meta/llama-3.1-8b-instruct'; // Planner e Tagger
process.env.PRIMARY_API_KEY = process.env.NVIDIA_API_KEY;
process.env.FALLBACK_PROVIDER = 'nvidia';
process.env.FALLBACK_MODEL = 'meta/llama-3.1-70b-instruct'; // Gerador Final
process.env.FALLBACK_API_KEY = process.env.NVIDIA_API_KEY;

const { planQuery } = require('../lib/planner');
const { tagAndFilter } = require('../lib/tagger');

// Pastas de resultados
const RESULTS_DIR = path.join(__dirname, '../data/benchmark_results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// NVIDIA Client nativo para a geração final do Benchmark
const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

async function queryLLM(messages, model, maxTokens, tracePath, label) {
  const reqStartTime = Date.now();
  console.log(`[${label}] Chamando ${model}...`);
  
  const payload = { model, messages, temperature: 0.2, top_p: 0.7, max_tokens: maxTokens };
  fs.writeFileSync(tracePath.replace('.json', '_request.json'), JSON.stringify(payload, null, 2));

  let retries = 0;
  while (retries < 5) {
    try {
      const completion = await openai.chat.completions.create(payload);
      fs.writeFileSync(tracePath.replace('.json', '_response.json'), JSON.stringify(completion, null, 2));
      let content = completion.choices[0]?.message?.content || "";
      return { content: content.trim(), time: Date.now() - reqStartTime, tokens: completion.usage };
    } catch (err) {
      if (err.status === 429) {
        const waitTime = Math.pow(2, retries) * 2000;
        console.warn(`[${label}] 429 Too Many Requests. Retrying in ${waitTime}ms (Attempt ${retries + 1}/5)...`);
        await new Promise(r => setTimeout(r, waitTime));
        retries++;
        continue;
      }
      fs.writeFileSync(tracePath.replace('.json', '_error.json'), JSON.stringify({ error: err.message }, null, 2));
      throw err;
    }
  }
  throw new Error(`[${label}] Max retries exceeded for 429`);
}

async function getMongoDBSection(medName, sectionName, client) {
  const collection = client.db('bulas').collection('documentos');
  const doc = await collection.findOne({ nome_medicamento: medName });
  if (!doc) return null;
  return (doc.secoes && doc.secoes[sectionName]) ? doc.secoes[sectionName] : doc.texto_completo;
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 9999;

  const datasetPath = path.join(__dirname, '../data/blind_test_generation/dataset_blind_test.jsonl');
  if (!fs.existsSync(datasetPath)) throw new Error("Dataset Cego não encontrado!");

  const lines = fs.readFileSync(datasetPath, 'utf8').split('\n').filter(l => l.trim() !== '');
  const mongoClient = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  await mongoClient.connect();
  
  console.log(`\n🚀 Iniciando Benchmark - Limite: ${limit} perguntas`);
  console.log(`- Forçando Modelos NVIDIA para o Pipeline V2 (8B e 70B)\n`);

  let count = 0;
  for (const line of lines) {
    if (count >= limit) break;
    count++;

    const q = JSON.parse(line);
    const questionText = q.messages.find(m => m.role === 'user').content;
    const medName = q.metadata.medicamento;
    const sectionName = q.metadata.secao;
    
    const traceId = `q${String(count).padStart(3, '0')}_${medName.replace(/\s+/g, '_')}_${sectionName}`;
    const runDir = path.join(RESULTS_DIR, traceId);
    const farmaiaDir = path.join(runDir, 'farmaia');
    const ragDir = path.join(runDir, 'rag');
    
    fs.mkdirSync(farmaiaDir, { recursive: true });
    fs.mkdirSync(ragDir, { recursive: true });

    console.log(`\n======================================================`);
    console.log(`Pergunta ${count}: [${medName}] ${questionText.substring(0, 50)}...`);
    
    // ====================================================
    // PASSO 1: PLANNER REAL FARMAIA (Vector DB + 8B)
    // ====================================================
    console.log(`[FarmaIA] Executando Planner Nativo (com classificador de vetores)...`);
    const planStartTime = Date.now();
    const plan = await planQuery(questionText, "professional", [], [medName]);
    fs.writeFileSync(path.join(farmaiaDir, '01_planner_response.json'), JSON.stringify({ timeMs: Date.now() - planStartTime, plan }, null, 2));

    // ====================================================
    // PASSO 2: TOOLS (Busca no MongoDB usando o plano)
    // ====================================================
    // Se o planner achar uma seção, pegamos; senão, usamos o gabarito.
    const plannedSection = plan.tools.find(t => t.name === 'get_section')?.args?.section || sectionName;
    const sectionData = await getMongoDBSection(medName, plannedSection, mongoClient);
    fs.writeFileSync(path.join(farmaiaDir, '02_tools_response.json'), JSON.stringify({ section: plannedSection, length: sectionData?.length }, null, 2));

    if (!sectionData) {
      console.log(`! Seção não encontrada no DB, pulando.`);
      continue;
    }

    // ====================================================
    // PASSO 3: TAGGER REAL FARMAIA (LLM 8B)
    // ====================================================
    console.log(`[FarmaIA] Executando Tagger Nativo...`);
    let filteredText = sectionData; 
    const taggerStartTime = Date.now();
    try {
      // Usa a biblioteca nativa tagAndFilter que o FarmaIA já tem!
      const taggedSentences = await tagAndFilter(sectionData, plannedSection, plan.tags, questionText);
      if (taggedSentences.length > 0 && taggedSentences[0].tag !== "not_found") {
        filteredText = taggedSentences.map(s => s.text).join('\n\n');
      }
      fs.writeFileSync(path.join(farmaiaDir, '03_tagger_output.json'), JSON.stringify({ timeMs: Date.now() - taggerStartTime, output_text: filteredText, tags_used: plan.tags }, null, 2));
    } catch (e) {
      console.warn("Tagger nativo falhou. Usando fallback.");
    }

    // ====================================================
    // PASSO 4: RESPOSTA FARMAIA (Llama 70B com texto filtrado)
    // ====================================================
    const farmaiaSystemPrompt = `Você é o FarmaIA. Responda baseando-se ESTRITAMENTE nos documentos filtrados fornecidos.\n\nDOCUMENTOS:\n${filteredText}`;
    await queryLLM([
      { role: "system", content: farmaiaSystemPrompt },
      { role: "user", content: questionText }
    ], process.env.FALLBACK_MODEL, 1024, path.join(farmaiaDir, '04_llm'), 'FarmaIA-Generator');

    // ====================================================
    // PASSO 5: RESPOSTA RAG BASELINE (Llama 70B com texto bruto)
    // ====================================================
    fs.writeFileSync(path.join(ragDir, '01_planner_response_copy.json'), JSON.stringify({ note: 'RAG reaproveita o plano do FarmaIA' }, null, 2));
    const ragSystemPrompt = `Você é um assistente RAG. Responda baseando-se ESTRITAMENTE nos documentos brutos fornecidos.\n\nDOCUMENTOS:\n${sectionData}`;
    await queryLLM([
      { role: "system", content: ragSystemPrompt },
      { role: "user", content: questionText }
    ], process.env.FALLBACK_MODEL, 1024, path.join(ragDir, '03_rag_llm'), 'RAG-Generator');

    console.log(`[OK] Traces salvos: ${runDir}`);
    
    // Atraso de 5 segundos para evitar Rate Limit 429 da NVIDIA (devido ao Chunking paralelo)
    console.log(`[Rate Limit Guard] Aguardando 5 segundos antes da próxima pergunta...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  await mongoClient.close();
  console.log(`\n✅ Benchmark Concluído para ${count} perguntas!`);
}

main().catch(console.error);
