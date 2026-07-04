/**
 * scripts/dataset_builder/build_sentence_dataset.js
 *
 * Pipeline Sentence-Level End-to-End:
 * 1. Extrai seções das bulas do MongoDB
 * 2. Quebra cada seção em sentenças lógicas
 * 3. Envia cada sentença para o Llama 3.3 70B (NVIDIA NIM API)
 * 4. O LLM gera simultaneamente: Tag + Pergunta + Resposta
 * 5. Salva em dataset.jsonl E reconstrói taxonomy.json
 *
 * Uso:
 *   node scripts/dataset_builder/build_sentence_dataset.js           → processa tudo
 *   node scripts/dataset_builder/build_sentence_dataset.js --limit=5 → piloto com 5 sentenças
 */

const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ─── Configuração ─────────────────────────────────────────────────────────────
const LIMIT = (() => {
  const arg = process.argv.find(a => a.startsWith('--limit='));
  return arg ? parseInt(arg.split('=')[1], 10) : Infinity;
})();

const CONFIG = {
  nvidiaKey: process.env.NVIDIA_API_KEY,
  mongoUri: process.env.MONGODB_URI,
  mongoDb: 'bulas',
  bulasCollection: 'documentos',
  model: 'nvidia/nemotron-3-ultra-550b-a55b',
  concurrency: 8,
  maxTokens: 700,
  outDataset: path.join(__dirname, '../../data/dataset_v2.jsonl'),
  outTaxonomy: path.join(__dirname, '../../data/taxonomy_v2.json'),
};

// Seções que vamos processar e seus nomes amigáveis
const SECOES = {
  indicacao: 'Indicações Terapêuticas',
  contraindicacao: 'Contraindicações',
  advertencias: 'Advertências e Precauções',
  posologia: 'Posologia',
  reacoes: 'Reações Adversas',
  interacoes: 'Interações Medicamentosas',
  farmacodinamica: 'Farmacodinâmica',
  farmacocinetica: 'Farmacocinética',
};

// ─── Sistema FarmaIA ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o FarmaIA, um assistente especializado em informações sobre medicamentos baseadas exclusivamente em bulas oficiais aprovadas pela ANVISA. Seu objetivo é fornecer informações claras, seguras e fundamentadas sobre medicamentos.

Diretrizes:
- Responda sempre com base nas informações da bula oficial
- Use linguagem adequada ao perfil do usuário (leigo ou técnico)
- Para situações de risco ou urgência, sempre oriente a buscar atendimento médico
- Nunca substitua a consulta médica ou farmacêutica profissional
- Se a informação não estiver na bula fornecida, informe isso claramente`;

// ─── Prompt de Extração por Sentença ─────────────────────────────────────────
function buildExtractionPrompt(medicamento, secao, nomesecao, sentenca) {
  return `Você é um Farmacêutico Clínico especialista em NLP Médico gerando dados de treinamento.

CONTEXTO:
- Medicamento: ${medicamento}
- Seção da Bula: ${nomesecao}

SENTENÇA DA BULA (use APENAS esta sentença como fonte):
"${sentenca}"

TAREFA:
Uma única sentença pode conter múltiplas intenções médicas distintas. Com base EXCLUSIVAMENTE na sentença acima, gere um ARRAY JSON contendo objetos para cada intenção clínica independente que você encontrar. 

Se a sentença tiver apenas um assunto, retorne um array com 1 objeto. Se tiver vários, retorne vários objetos.

Formato OBRIGATÓRIO:
[
  {
    "nome_tag": "<intenção médica em snake_case, ex: posologia_adultos, contraindicacao_gravidez>",
    "descricao_intencao": "<descrição curta: que tipo de pergunta ativa essa tag?>",
    "fragmento_exato": "<o pedaço exato da sentença (substring literal) que gerou essa tag. Não mude NENHUMA palavra.>",
    "pergunta": "<pergunta técnica e realista de um médico ou farmacêutico sobre ${medicamento} que só pode ser respondida com essa sentença>",
    "resposta": "<resposta direta e técnica baseada EXCLUSIVAMENTE na sentença acima>"
  }
]

REGRAS ABSOLUTAS:
1. O profissional que pergunta é sempre um médico, farmacêutico ou enfermeiro. NUNCA um paciente leigo.
2. A resposta deve usar APENAS o conteúdo da sentença fornecida. Zero invenção.
3. O fragmento_exato DEVE ser um "copiar e colar" literal de uma parte da sentença. Nunca reescreva o fragmento.
4. Se a sentença for muito curta ou genérica para gerar uma boa pergunta, retorne um array vazio [].
5. Retorne APENAS o array JSON válido. Sem explicações, sem markdown.`;
}

// ─── Quebra texto em sentenças lógicas ────────────────────────────────────────
function splitIntoSentences(texto) {
  if (!texto || typeof texto !== 'string') return [];

  // Divide por ponto final, ponto e vírgula, ou newline duplo
  const raw = texto
    .split(/(?<=[.;])\s+|\n{2,}/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 40); // descarta fragmentos muito curtos

  return [...new Set(raw)]; // remove duplicatas exatas
}

// ─── Controle de concorrência ─────────────────────────────────────────────────
async function runWithConcurrencyLimit(tasks, limit) {
  const results = [];
  const executing = [];
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    const e = p.then(() => executing.splice(executing.indexOf(e), 1));
    executing.push(e);
    if (executing.length >= limit) await Promise.race(executing);
  }
  return Promise.allSettled(results);
}

// ─── Retry com backoff exponencial ───────────────────────────────────────────
async function callWithRetry(fn, retries = 3, baseDelay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err?.status === 429 || err?.status === 503 || err?.message?.includes('timed out');
      if (i < retries - 1 && isRetryable) {
        const delay = baseDelay * Math.pow(2, i);
        console.log(`  [RETRY] Tentativa ${i + 1}/${retries - 1}. Aguardando ${(delay / 1000).toFixed(0)}s...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

// ─── Processa uma sentença ────────────────────────────────────────────────────
async function processSentenca(medicamento, secaoKey, nomesecao, sentenca, openai) {
  const prompt = buildExtractionPrompt(medicamento, secaoKey, nomesecao, sentenca);

  const apiCall = () => openai.chat.completions.create({
    model: CONFIG.model,
    messages: [
      { role: 'system', content: 'Você é um assistente gerador de dados de treinamento de NLP médico. Responda APENAS com um ARRAY JSON válido ou [].' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.4, 
    max_tokens: 16384,
    // Ativa o modo thinking no Nemotron via NVIDIA NIM (parâmetros na raiz)
    reasoning_budget: 16384,
    chat_template_kwargs: { "enable_thinking": true }
  });

  const response = await callWithRetry(apiCall, 3, 5000);
  const text = response.choices?.[0]?.message?.content?.trim();

  if (!text || text.toLowerCase() === '[]') return [];

  // Parse do JSON
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  
  if (!Array.isArray(parsed)) {
    if (parsed.nome_tag) parsed = [parsed];
    else return [];
  }

  const resultadosValidos = [];
  
  for (const item of parsed) {
    if (!item?.nome_tag || !item?.pergunta || !item?.resposta || !item?.fragmento_exato) continue;
    if (item.pergunta.length < 15 || item.resposta.length < 10) continue;

    resultadosValidos.push({
      nome_tag: item.nome_tag.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      descricao_intencao: item.descricao_intencao || '',
      fragmento_exato: item.fragmento_exato,
      pergunta: item.pergunta,
      resposta: item.resposta,
    });
  }

  return resultadosValidos;
}

// ─── Monta linha JSONL ────────────────────────────────────────────────────────
function toJsonlLine(medicamento, secaoKey, sentenca, resultado) {
  return JSON.stringify({
    metadata: {
      medicamento,
      secao: secaoKey,
      nome_tag: resultado.nome_tag,
      sentenca_origem: sentenca,
      fragmento_exato: resultado.fragmento_exato,
    },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: resultado.pergunta },
      { role: 'assistant', content: resultado.resposta },
    ],
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 FarmaIA Sentence-Level Dataset Builder');
  console.log(`   Modo: ${LIMIT === Infinity ? 'Completo' : `Piloto (${LIMIT} sentenças)`}`);
  console.log(`   Saída Dataset: ${CONFIG.outDataset}`);
  console.log(`   Saída Taxonomia: ${CONFIG.outTaxonomy}\n`);

  if (!CONFIG.nvidiaKey) throw new Error('❌ NVIDIA_API_KEY não definida no .env');
  if (!CONFIG.mongoUri) throw new Error('❌ MONGODB_URI não definida no .env');

  const openai = new OpenAI({
    apiKey: CONFIG.nvidiaKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
    timeout: 120 * 1000, // 2 minutos para falhar rápido e forçar o retry
    maxRetries: 0,
  });

  const mongo = new MongoClient(CONFIG.mongoUri);
  await mongo.connect();
  const db = mongo.db(CONFIG.mongoDb);
  const bulas = await db.collection(CONFIG.bulasCollection).find({}).toArray();
  await mongo.close();

  console.log(`✅ MongoDB: ${bulas.length} bulas disponíveis\n`);

  // Coleta todas as sentenças de todas as bulas e seções
  const tarefas = []; // { medicamento, secaoKey, nomesecao, sentenca }

  for (const bula of bulas) {
    const medicamento = bula.nome_medicamento || 'Desconhecido';
    const secoes = bula.secoes || {};

    for (const [secaoKey, nomesecao] of Object.entries(SECOES)) {
      const texto = secoes[secaoKey];
      if (!texto) continue;

      const sentencas = splitIntoSentences(texto);
      for (const sentenca of sentencas) {
        tarefas.push({ medicamento, secaoKey, nomesecao, sentenca });
      }
    }
  }

  // Aplica o limite do piloto
  const tarefasParaProcessar = LIMIT === Infinity ? tarefas : tarefas.slice(0, LIMIT);
  console.log(`📋 Total de sentenças a processar: ${tarefasParaProcessar.length}\n`);

  // Cria diretório de saída
  const dataDir = path.dirname(CONFIG.outDataset);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // Limpa arquivo de saída se for piloto
  if (LIMIT !== Infinity && fs.existsSync(CONFIG.outDataset)) {
    // modo não-piloto, append
  }

  const stats = { sucesso: 0, falha: 0, nulo: 0 };
  const taxonomiaMap = new Map(); // nome_tag -> { descricao_intencao, secao_origem, evidencia_extraida }

  // --- Lógica de Resume Automático ---
  const sentencasProcessadas = new Set();
  if (LIMIT === Infinity && fs.existsSync(CONFIG.outDataset)) {
    console.log(`\n🔍 Arquivo de dataset encontrado. Montando índice de recuperação (Resume)...`);
    const linhas = fs.readFileSync(CONFIG.outDataset, 'utf-8').split('\n');
    for (const linha of linhas) {
      if (!linha.trim()) continue;
      try {
        const obj = JSON.parse(linha);
        if (obj.metadata && obj.metadata.sentenca_origem) {
          sentencasProcessadas.add(obj.metadata.sentenca_origem);
          
          // Reconstrói a taxonomia que se perdeu na RAM durante o crash
          if (obj.metadata.nome_tag && !taxonomiaMap.has(obj.metadata.nome_tag)) {
            taxonomiaMap.set(obj.metadata.nome_tag, {
              nome_tag: obj.metadata.nome_tag,
              descricao_intencao: "Recuperado do crash",
              secao_origem: obj.metadata.secao || '',
              evidencia_extraida: obj.metadata.fragmento_exato || obj.metadata.sentenca_origem,
            });
          }
        }
      } catch (e) {
        // Ignora linhas corrompidas na leitura
      }
    }
    console.log(`✅ Resume: ${sentencasProcessadas.size} sentenças únicas já processadas e seguras no disco. Serão puladas.\n`);
    console.log(`✅ Taxonomia: ${taxonomiaMap.size} intenções clínicas recuperadas.\n`);
  }

  const tasks = tarefasParaProcessar.map(({ medicamento, secaoKey, nomesecao, sentenca }) => async () => {
    try {
      if (sentencasProcessadas.has(sentenca)) {
        // Já processado antes do crash/suspensão, pula
        return;
      }

      const resultados = await processSentenca(medicamento, secaoKey, nomesecao, sentenca, openai);

      if (!resultados || resultados.length === 0) {
        stats.nulo++;
        return;
      }

      for (const resultado of resultados) {
        // Salva no dataset
        const linha = toJsonlLine(medicamento, secaoKey, sentenca, resultado);
        fs.appendFileSync(CONFIG.outDataset, linha + '\n', 'utf-8');
        stats.sucesso++;

        // Acumula na taxonomia (desduplicado por nome_tag)
        if (!taxonomiaMap.has(resultado.nome_tag)) {
          taxonomiaMap.set(resultado.nome_tag, {
            nome_tag: resultado.nome_tag,
            descricao_intencao: resultado.descricao_intencao,
            secao_origem: secaoKey,
            evidencia_extraida: resultado.fragmento_exato,
          });
        }
      }

      if (LIMIT !== Infinity && stats.sucesso > 0 && stats.sucesso % 5 === 0) {
        console.log(`📝 ${stats.sucesso} pares gerados | ⚠️  ${stats.falha} falhas | ⬜ ${stats.nulo} sentenças puladas`);
      } else if (LIMIT === Infinity && stats.sucesso > 0 && stats.sucesso % 50 === 0) {
        console.log(`📝 ${stats.sucesso} pares gerados | ⚠️  ${stats.falha} falhas | ⬜ ${stats.nulo} sentenças puladas`);
      }

    } catch (err) {
      stats.falha++;
      console.error(`  ❌ Erro (${medicamento}/${secaoKey}): ${err.message}`);
    }
  });

  console.log('⚙️  Processando sentenças...\n');
  await runWithConcurrencyLimit(tasks, 10);

  // Salva a taxonomia
  const taxonomiaArray = [...taxonomiaMap.values()];
  fs.writeFileSync(CONFIG.outTaxonomy, JSON.stringify(taxonomiaArray, null, 2), 'utf-8');

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Concluído!`);
  console.log(`   Pares Q&A gerados : ${stats.sucesso}`);
  console.log(`   Falhas de API     : ${stats.falha}`);
  console.log(`   Sentenças puladas : ${stats.nulo} (muito curtas ou genéricas)`);
  console.log(`   Tags únicas na taxonomia: ${taxonomiaArray.length}`);
  console.log(`   Dataset  → ${CONFIG.outDataset}`);
  console.log(`   Taxonomia → ${CONFIG.outTaxonomy}`);
  console.log('─────────────────────────────────────────');
}

main().catch(console.error);
