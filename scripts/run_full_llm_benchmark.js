require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');

// Delay helper to respect API rate limits (e.g. Groq 12k TPM)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper para fazer requisições HTTP sem o limite de 5 minutos do fetch (undici)
function httpRequest(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 1200000 // 20 minutes
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(responseData));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request Timeout (20 minutes)'));
    });

    req.write(data);
    req.end();
  });
}

// ============================================================
// Config
// ============================================================
const OUTPUT_PATH_RAW = path.join(__dirname, 'benchmark_raw_evaluation.json');
const BASE_URL = process.env.BENCHMARK_URL || 'http://localhost:8080';

const { runAllJudges } = require('../lib/judges');
const countTokens = (text) => Math.ceil((text || '').length / 4);

// ============================================================
// Resume support
// ============================================================
function loadExistingResults(outputPath) {
  try {
    if (fs.existsSync(outputPath)) {
      const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn(`⚠️  Arquivo corrompido, começando do zero.`);
  }
  return [];
}

function buildDoneSet(results, target) {
  const done = new Set();
  for (const r of results) {
    if (target === 'farmaia' && r.farmaia?.evaluation) done.add(`${r.drugName}|||${r.question}`);
    else if (target === 'agentic_rag' && r.rag?.evaluation) done.add(`${r.drugName}|||${r.question}`);
    else if (target === 'both' && r.farmaia?.evaluation && r.rag?.evaluation) done.add(`${r.drugName}|||${r.question}`);
  }
  return done;
}

// ============================================================
// API callers
// ============================================================
async function callFarmaIA(question, mode = 'profissional') {
  return httpRequest(`${BASE_URL}/api/chat`, { message: question, mode });
}

async function callRAG(question, mode = 'profissional') {
  return httpRequest(`${BASE_URL}/api/rag`, { message: question, mode });
}

// ============================================================
// Main
// ============================================================
async function runBenchmark() {
  console.log("=== FarmaIA (Tags) vs Agentic RAG BENCHMARK (via API) ===\n");
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 20;

  const targetArg = process.argv.find(arg => arg.startsWith('--target='));
  const target = targetArg ? targetArg.split('=')[1] : 'both'; // 'farmaia', 'agentic_rag', 'both'

  const suffixArg = process.argv.find(arg => arg.startsWith('--suffix='));
  const suffix = suffixArg ? `_${suffixArg.split('=')[1]}` : '';

  let OUTPUT_PATH;
  if (target === 'farmaia') OUTPUT_PATH = path.join(__dirname, `benchmark_farmaia_evaluation${suffix}.json`);
  else if (target === 'agentic_rag') OUTPUT_PATH = path.join(__dirname, `benchmark_agentic_rag_evaluation${suffix}.json`);
  else OUTPUT_PATH = path.join(__dirname, `benchmark_raw_evaluation${suffix}.json`);

  // Load questions
  const questionsPath = path.join(__dirname, '../data/perguntas_profissionais.json');
  const rawData = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

  const allQuestions = [];
  rawData.questions.forEach(group => {
    group.questions.forEach(q => allQuestions.push({ drugName: group.medication, question: q }));
  });

  // Resume
  const existingResults = loadExistingResults(OUTPUT_PATH);
  const doneSet = buildDoneSet(existingResults, target);
  const results = [...existingResults];

  console.log(`📊 Total de perguntas: ${allQuestions.length}`);
  console.log(`🎯 Target: ${target.toUpperCase()}`);
  console.log(`✅ Já processadas para ${target}: ${doneSet.size}`);
  console.log(`🚀 Limite: ${limit} novas\n`);

  let processed = 0;

  for (let i = 0; i < allQuestions.length && processed < limit; i++) {
    const { drugName, question } = allQuestions[i];
    const key = `${drugName}|||${question}`;

    if (doneSet.has(key)) continue;

    console.log(`\n[${processed + 1}/${limit}] ${drugName}: ${question.substring(0, 80)}...`);

    try {
      let resultEntry = results.find(r => r.drugName === drugName && r.question === question);
      if (!resultEntry) {
        resultEntry = {
          question,
          drugName,
          timestamp: new Date().toISOString(),
          farmaia: null,
          rag: null
        };
        results.push(resultEntry);
      }

      let planForJudges = {};
      if (target === 'rag') {
        try {
          const fData = loadExistingResults(path.join(__dirname, 'benchmark_farmaia_evaluation.json'));
          const fEntry = fData.find(r => r.drugName === drugName && r.question === question);
          if (fEntry && fEntry.farmaia?.plan) {
            planForJudges = fEntry.farmaia.plan;
          }
        } catch(e) {}
      } else {
        planForJudges = resultEntry.farmaia?.plan || {};
      }
      
      let topicsForJudges = planForJudges?.sections || [];
      let implicitQuestionsForJudges = planForJudges?.implicit_questions || [];

      // ==========================================
      // PIPELINE 1: FarmaIA (via /api/chat)
      // ==========================================
      if (target === 'farmaia' || target === 'both') {
        console.log(`  🏷️  Chamando /api/chat ...`);
        const farmaiaResult = await callFarmaIA(question);
        const farmaiaAnswer = farmaiaResult.response;
        const farmaiaDocuments = farmaiaResult.metadata?.documents || '';
        console.log(`  ✔ FarmaIA respondeu (${farmaiaAnswer.length} chars)`);

        planForJudges = farmaiaResult.metadata?.plan || {};
        topicsForJudges = planForJudges.sections || [];
        implicitQuestionsForJudges = planForJudges.implicit_questions || [];

        const notFoundFarmaia = farmaiaResult.metadata?.mongoError || 
                                farmaiaAnswer.includes("não encontrado") || 
                                farmaiaDocuments.includes("NÃO ENCONTRADO") ||
                                farmaiaAnswer.includes("Não entendi sua pergunta") ||
                                (farmaiaDocuments || "").trim() === "";
        let farmaiaEval = null;
        
        if (notFoundFarmaia) {
          console.log(`  ⏩ Pulo: Medicamento não encontrado no FarmaIA. Pulando juízes.`);
          farmaiaEval = { skipped: true, reason: "Medicamento não encontrado" };
        } else {
          console.log(`  ⏩ Pulo: Juízes desativados (avaliação offline).`);
          farmaiaEval = null; /* await runAllJudges({
            question,
            response: farmaiaAnswer,
            documents: farmaiaDocuments,
            mode: 'profissional',
            topics: topicsForJudges,
            implicit_questions: implicitQuestionsForJudges,
          }); */
        }

        resultEntry.farmaia = {
          answer: farmaiaAnswer,
          documents_context: farmaiaDocuments,
          timing: farmaiaResult.metadata?.timing || null,
          plan: planForJudges,
          tokens: farmaiaResult.metadata?.tokens || {
            context_in: countTokens(farmaiaDocuments),
            response_out: countTokens(farmaiaAnswer),
          },
          evaluation: farmaiaEval,
        };
      }

      // ==========================================
      // PIPELINE 2: Agentic RAG Baseline (via /api/rag)
      // ==========================================
      if (target === 'agentic_rag' || target === 'both') {
        if (target === 'agentic_rag' && (!planForJudges || Object.keys(planForJudges).length === 0)) {
          console.warn(`  ⚠️ Aviso: Rodando Agentic RAG sem FarmaIA prévio. Tópicos não estarão disponíveis.`);
        }

        console.log(`  ⏳ Aguardando 65s antes de chamar RAG para resetar a janela de 1 minuto da API...`);
        await sleep(65000);
        console.log(`  📦 Chamando Agentic RAG /api/rag ...`);
        const ragResult = await callRAG(question);
        const ragAnswer = ragResult.response;
        const ragDocuments = ragResult.metadata?.documents || '';
        console.log(`  ✔ Agentic RAG respondeu (${ragAnswer.length} chars)`);

        const notFoundRag = ragResult.metadata?.mongoError || 
                            ragAnswer.includes("não encontrado") || 
                            ragDocuments.includes("NÃO ENCONTRADO") ||
                            ragAnswer.includes("Não entendi sua pergunta") ||
                            (ragDocuments || "").trim() === "";
        let ragEval = null;

        if (notFoundRag) {
          console.log(`  ⏩ Pulo: Medicamento não encontrado no Agentic RAG. Pulando juízes.`);
          ragEval = { skipped: true, reason: "Medicamento não encontrado" };
        } else {
          console.log(`  ⏩ Pulo: Juízes desativados (avaliação offline).`);
          ragEval = null; /* await runAllJudges({
            question,
            response: ragAnswer,
            documents: ragDocuments,
            mode: 'profissional',
            topics: topicsForJudges,
            implicit_questions: implicitQuestionsForJudges,
          }); */
        }

        resultEntry.rag = {
          answer: ragAnswer,
          documents_context: ragDocuments,
          timing: ragResult.metadata?.timing || null,
          tokens: ragResult.metadata?.tokens || {
            context_in: countTokens(ragDocuments),
            response_out: countTokens(ragAnswer),
          },
          evaluation: ragEval,
        };
      }

      // ==========================================
      // SAVE
      // ==========================================
      resultEntry.timestamp = new Date().toISOString();
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
      processed++;

      const fScore = resultEntry.farmaia?.evaluation?.general_score || 'N/A';
      const rScore = resultEntry.rag?.evaluation?.general_score || 'N/A';
      console.log(`  ✅ Salvo! FarmaIA(Tags): ${fScore}/100 | Agentic RAG: ${rScore}/100`);

      // Rate Limiting: Sleep to avoid hitting Groq's 12k TPM limit
      // 65 seconds delay to guarantee the TPM window resets completely
      if (processed < limit) {
        console.log(`  ⏳ Aguardando 65s para o próximo loop (Reset de 1 minuto)...`);
        await sleep(65000);
      }
    } catch (err) {
      console.error(`  ❌ Erro: ${err.message}`);
      if (err.message.includes('402') || err.message.includes('depleted')) {
        console.error(`\n🛑 Cota esgotada! ${processed} perguntas salvas.`);
        break;
      }
      if (err.message.includes('ECONNREFUSED')) {
        console.error(`\n🛑 Servidor não está rodando! Inicie com: npm run dev`);
        break;
      }
      continue;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 RESUMO`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  Processadas agora:  ${processed}`);
  console.log(`  Total no arquivo:   ${results.length}`);
  console.log(`  Arquivo: ${OUTPUT_PATH}`);
  console.log(`${'='.repeat(50)}\n`);
}

runBenchmark().catch(console.error);
