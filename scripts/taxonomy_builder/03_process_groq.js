const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const GROQ_API_KEY = process.env.PRIMARY_API_KEY;
const RESULTS_DIR = path.join(__dirname, 'results');
const DELAY_MS = 25000; // 25s de espera pesada para não estourar os míseros 12.000 TPM da Groq

// Função para pausar a execução
const sleep = ms => new Promise(res => setTimeout(res, ms));

async function callGroq(promptText, maxTokens = 1500) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: promptText }],
      temperature: 0.1,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API Error: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Quebra um texto gigante em pedaços menores
function chunkBulasText(text, bulasPerChunk = 3) {
  const bulas = text.split('--- BULA:').filter(t => t.trim().length > 0);
  const chunks = [];
  let currentChunk = [];
  
  for (let i = 0; i < bulas.length; i++) {
    currentChunk.push('--- BULA:' + bulas[i]);
    if (currentChunk.length >= bulasPerChunk || i === bulas.length - 1) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [];
    }
  }
  return chunks;
}

function extrairArrayJson(texto) {
  // Procura por blocos [ ... ]
  const match = texto.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (match) {
    return JSON.parse(match[0]);
  }
  throw new Error("Nenhum JSON array encontrado na string.");
}

async function processFile(fileName) {
  console.log(`\n========================================`);
  console.log(`🚀 Iniciando processamento de: ${fileName}`);
  console.log(`========================================`);
  
  const filePath = path.join(RESULTS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const splitMarker = 'Aqui estão os textos brutos das bulas para a sua análise:';
  const parts = content.split(splitMarker);
  const rules = parts[0];
  const rawText = parts[1];

  const chunks = chunkBulasText(rawText, 3); // Apenas 3 bulas por chunk!
  console.log(`📦 Dividido em ${chunks.length} lotes para processamento...`);

  let todasTagsExtraidas = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`\n⏳ Processando Lote ${i + 1}/${chunks.length}... (${chunks[i].length} caracteres)`);
    const prompt = `${rules}\n${splitMarker}\n${chunks[i]}`;
    
    try {
      const responseText = await callGroq(prompt, 1500);
      
      try {
        const tags = extrairArrayJson(responseText);
        todasTagsExtraidas = todasTagsExtraidas.concat(tags);
        console.log(`✅ Lote ${i + 1} extraiu ${tags.length} tags.`);
      } catch(e) {
        console.error(`⚠️ Erro no parser JSON do Lote ${i+1}. Resposta bruta:`, responseText.substring(0, 100) + '...');
      }
      
      console.log(`⏸️ Aguardando ${DELAY_MS/1000}s para evitar Rate Limit TPM da Groq...`);
      await sleep(DELAY_MS);
    } catch(err) {
      console.error(`❌ Erro no lote ${i+1}:`, err.message);
      console.log(`⏸️ Aguardando 30s por causa do erro...`);
      await sleep(30000);
    }
  }

  // PASSO FINAL: CONSOLIDAR AS TAGS DUPLICADAS
  const tempPath = path.join(RESULTS_DIR, `temp_${fileName.replace('.txt', '.json')}`);
  fs.writeFileSync(tempPath, JSON.stringify(todasTagsExtraidas, null, 2));
  console.log(`\n💾 ${todasTagsExtraidas.length} tags extraídas e salvas temporariamente em: ${tempPath}`);

  console.log(`\n🔄 Consolidando as primeiras 50 tags parciais...`);
  // Corta a lista se ficou muito grande para o TPM do Groq
  const listaLimpa = todasTagsExtraidas.slice(0, 50); 
  
  const consolidacaoPrompt = `Você é um Analista de Dados NLP.
Abaixo está uma lista JSON bruta de Intention Tags.
TAREFA: Mesclar, padronizar e agrupar essa lista para formar uma Taxonomia Final Única e coesa.
1. Remova tags duplicadas mantendo apenas a melhor escrita em snake_case.
2. Preserve a estrutura JSON original.

EXEMPLO DE SAÍDA ESPERADA:
[
  {
    "nome_tag": "contraindicacao_gravidez",
    "descricao_intencao": "Perguntas sobre uso na gravidez",
    "evidencia_extraida": "Este medicamento não deve ser utilizado por mulheres grávidas"
  }
]

Lista Bruta:
${JSON.stringify(listaLimpa, null, 2)}
Retorne APENAS o JSON consolidado. Sem texto antes ou depois.`;

  try {
    const finalResponse = await callGroq(consolidacaoPrompt, 2000);
    const finalTags = extrairArrayJson(finalResponse);
    
    const finalOutPath = path.join(RESULTS_DIR, `FINAL_${fileName.replace('.txt', '.json')}`);
    fs.writeFileSync(finalOutPath, JSON.stringify(finalTags, null, 2));
    console.log(`\n🎉 TAXONOMIA FINAL SALVA COM SUCESSO: ${finalOutPath}`);
  } catch(err) {
    console.error(`❌ Erro na consolidação final:`, err.message);
  }
}

async function main() {
  if (!GROQ_API_KEY) {
    console.error("❌ ERRO: GROQ_API_KEY não encontrada");
    return;
  }
  await processFile('prompt_api_contraindicacoes.txt');
}

main();
