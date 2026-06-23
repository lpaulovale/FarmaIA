require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { getMongoClient } = require('../lib/mongodb_tools');
const { initExtractor, fuzzyExtractDrugs } = require('../lib/drug_extractor');
const { MongoClient } = require('mongodb');

// ============================================================
// CONFIG
// ============================================================
const OUTPUT_PATH = path.join(__dirname, 'benchmark_raw_evaluation_groq_70b.json');
const QUESTIONS_BY_TYPE_PATH = path.join(__dirname, 'question_by_type.json');
const BASE_URL = process.env.BENCHMARK_URL || 'http://localhost:8080';
const TARGET_PER_TYPE = 5;

// ============================================================
// HELPERS
// ============================================================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function httpRequest(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 1200000 
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
      reject(new Error('Request Timeout'));
    });

    req.write(data);
    req.end();
  });
}

function normalizeText(text) {
  if (!text) return "";
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const countTokens = (text) => Math.ceil((text || '').length / 4);

// ============================================================
// MAIN
// ============================================================
async function runTargetedBenchmark() {
  console.log("=== TARGETED BENCHMARK EXECUTOR ===");

  let existingResults = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    existingResults = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  }

  console.log("🔌 Conectando ao MongoDB...");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db("bulas");
  
  await initExtractor();
  
  const docs = await db.collection("documentos").find({ tipo: "bula" }).project({ nome_medicamento: 1 }).toArray();
  const availableDrugs = new Set(docs.map(d => normalizeText(d.nome_medicamento)));
  
  // 3. Read questions by type mapping
  const qByTypeData = JSON.parse(fs.readFileSync(QUESTIONS_BY_TYPE_PATH, 'utf8'));
  const questionToType = {};
  const rootQuestions = qByTypeData["questions "] || qByTypeData.questions || [];
  rootQuestions.forEach(group => {
    const groupQuestions = group["questions "] || group.questions || [];
    groupQuestions.forEach(q => {
      questionToType[q.text.trim()] = q.type.trim();
    });
  });

  // 4. Calculate current distribution of SUCCESSFUL answers
  const typeCounts = {};
  const doneQuestions = new Set();
  
  // Remove skipped from existing results to force retry, or just don't add to doneQuestions
  const newExistingResults = [];
  existingResults.forEach(r => {
    const isSkipped = r.farmaia?.evaluation?.skipped || r.rag?.evaluation?.skipped;
    if (!isSkipped) {
      doneQuestions.add(`${r.drugName}|||${r.question}`);
      newExistingResults.push(r);
      const qType = questionToType[r.question.trim()];
      if (qType) {
        typeCounts[qType] = (typeCounts[qType] || 0) + 1;
      }
    } else {
       // It was skipped, we will retry it! So don't add to newExistingResults
    }
  });
  existingResults = newExistingResults; // overwrite so we don't save the skipped ones

  console.log("\n📊 DISTRIBUIÇÃO ATUAL (Sucessos):");
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`   - ${type}: ${count}/${TARGET_PER_TYPE}`);
  });

  // 5. Select questions to run
  const questionsToRun = [];
  
  for (const group of rootQuestions) {
    const drugName = (group["medication "] || group.medication).trim();
    const normalizedDrug = normalizeText(drugName);
    
    // SKIP if drug not in MongoDB
    if (!availableDrugs.has(normalizedDrug)) continue;

    const groupQuestions = group["questions "] || group.questions || [];
    for (const q of groupQuestions) {
      const qText = q.text.trim();
      const qType = q.type.trim();
      const key = `${drugName}|||${qText}`;
      
      if (doneQuestions.has(key)) continue; // Already tried and succeeded
      
      const currentCount = typeCounts[qType] || 0;
      if (currentCount < 10) {
        questionsToRun.push({ drugName, question: qText, type: qType });
        // Optimistically increment so we don't queue too many of the same type
        typeCounts[qType] = currentCount + 1;
        if (questionsToRun.length >= 27) break;
      }
    }
    if (questionsToRun.length >= 27) break;
  }

  console.log(`\n🎯 Perguntas selecionadas para atingir a meta: ${questionsToRun.length}\n`);

  // 6. Run selected questions
  let processed = 0;
  for (let i = 0; i < questionsToRun.length; i++) {
    const { drugName, question, type } = questionsToRun[i];
    console.log(`[${i + 1}/${questionsToRun.length}] [${type}] ${drugName}: ${question.substring(0, 80)}...`);

    try {
      let resultEntry = existingResults.find(r => r.drugName === drugName && r.question === question);
      if (!resultEntry) {
        resultEntry = { question, drugName, timestamp: new Date().toISOString() };
        existingResults.push(resultEntry);
      }

      // FarmaIA
      console.log(`  🏷️  Chamando /api/chat ...`);
      const farmaiaResult = await callFarmaIA(question, drugName);
      const farmaiaAnswer = farmaiaResult.response;
      console.log(`  ✔ FarmaIA respondeu (${farmaiaAnswer.length} chars)`);

      const notFoundFarmaia = farmaiaResult.metadata?.mongoError || 
                              farmaiaAnswer.includes("não encontrado") || 
                              farmaiaAnswer.includes("Não entendi sua pergunta");
      
      resultEntry.farmaia = {
        answer: farmaiaAnswer,
        documents_context: farmaiaResult.metadata?.documents || '',
        timing: farmaiaResult.metadata?.timing || null,
        plan: farmaiaResult.metadata?.plan || {},
        tokens: farmaiaResult.metadata?.tokens || { context_in: 0, response_out: countTokens(farmaiaAnswer) },
        evaluation: notFoundFarmaia ? { skipped: true, reason: "Medicamento não encontrado" } : null
      };

      if (notFoundFarmaia) {
         console.log(`  ⏩ Pulo Real: Medicamento não encontrado no FarmaIA. Pulando execução do RAG para economizar tempo.`);
         // Salva o erro e já vai direto para a próxima pergunta!
         resultEntry.timestamp = new Date().toISOString();
         fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existingResults, null, 2));
         processed++;
         continue; 
      }

      console.log(`  ⏳ Aguardando 65s antes de chamar RAG...`);
      await sleep(65000);

      // Agentic RAG
      console.log(`  📦 Chamando Agentic RAG /api/rag ...`);
      const ragResult = await callRAG(question, drugName);
      const ragAnswer = ragResult.response;
      const ragDocuments = ragResult.metadata?.documents || '';
      console.log(`  ✔ Agentic RAG respondeu (${ragAnswer.length} chars)`);

      const notFoundRag = ragResult.metadata?.mongoError || 
                          ragAnswer.includes("não encontrado") || 
                          ragAnswer.includes("Não entendi");

      resultEntry.rag = {
        answer: ragAnswer,
        documents_context: ragDocuments,
        timing: ragResult.metadata?.timing || null,
        tokens: ragResult.metadata?.tokens || { context_in: countTokens(ragDocuments), response_out: countTokens(ragAnswer) },
        evaluation: notFoundRag ? { skipped: true, reason: "Medicamento não encontrado" } : null
      };

      if (notFoundRag) {
         console.log(`  ⏩ Pulo: Medicamento não encontrado no Agentic RAG.`);
      }

      // Save
      resultEntry.timestamp = new Date().toISOString();
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existingResults, null, 2));
      processed++;
      console.log(`  ✅ Salvo!`);

      if (i < questionsToRun.length - 1) {
        console.log(`  ⏳ Aguardando 65s para o próximo loop...`);
        await sleep(65000);
      }

    } catch (err) {
      console.error(`  ❌ Erro: ${err.message}`);
      if (err.message.includes('402') || err.message.includes('depleted')) {
        console.error(`\n🛑 Cota esgotada!`);
        break;
      }
      if (err.message.includes('ECONNREFUSED')) {
        console.error(`\n🛑 Servidor não está rodando! Inicie com: npm run dev`);
        break;
      }
      continue;
    }
  }

  console.log(`\n🎉 Processamento concluído! Novas perguntas testadas: ${processed}`);
}

async function callFarmaIA(question, drugName) {
  // Prepend the drug name so that the fuzzy extractor can find it locally without cheating
  const contextQuestion = `${drugName}: ${question}`;
  return httpRequest(`${BASE_URL}/api/chat`, { message: contextQuestion, mode: 'profissional' });
}

async function callRAG(question, drugName) {
  const contextQuestion = `${drugName}: ${question}`;
  return httpRequest(`${BASE_URL}/api/rag`, { message: contextQuestion, mode: 'profissional' });
}

runTargetedBenchmark().catch(console.error);
