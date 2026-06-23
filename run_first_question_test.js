require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BENCHMARK_URL || 'http://localhost:8080';
const OUTPUT_PATH = path.join(__dirname, 'scripts', 'first_question_3b_result.json');

async function callFarmaIA(question, mode = 'profissional') {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: question, mode }),
    signal: AbortSignal.timeout(600000)
  });
  if (!res.ok) throw new Error(`FarmaIA API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function run() {
  const drugName = "Acetilcisteína";
  const question = "Qual a dose de acetilcisteína como mucolítico e qual a dose para intoxicação por paracetamol? São protocolos diferentes?";

  console.log(`🚀 Executando pergunta para ${drugName}...`);
  console.log(`❓ Pergunta: "${question}"`);

  try {
    const start = Date.now();
    const result = await callFarmaIA(question);
    const elapsed = Date.now() - start;

    const output = {
      drugName,
      question,
      timestamp: new Date().toISOString(),
      elapsedMs: elapsed,
      response: result.response,
      metadata: result.metadata
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`\n✅ Sucesso! Resposta obtida em ${elapsed}ms e salva em: ${OUTPUT_PATH}`);
    console.log(`\n💬 Resposta do LLM:\n${result.response}`);
  } catch (err) {
    console.error(`❌ Erro ao chamar API: ${err.message}`);
  }
}

run();
