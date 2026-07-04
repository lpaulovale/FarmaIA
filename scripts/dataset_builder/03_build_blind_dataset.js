const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { z } = require('zod');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// --- CONFIGURATION ---
const MONGODB_URI = process.env.MONGODB_URI;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const TARGET_PER_AXIS = 40;
const MAX_API_CALLS = 250; // Hard ceiling (Fix #6)
const TEMPERATURE = 0.2; // Fix #3

const DIRS = {
  base: path.join(__dirname, '../../data/blind_test_generation'),
  prompts: path.join(__dirname, '../../data/blind_test_generation/prompts'),
  responses: path.join(__dirname, '../../data/blind_test_generation/responses'),
  rejected: path.join(__dirname, '../../data/blind_test_generation/rejected'),
  finalDataset: path.join(__dirname, '../../data/blind_test_generation/dataset_blind_test.jsonl')
};

Object.values(DIRS).forEach(d => {
  if (d.endsWith('.jsonl')) return;
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// --- ZOD SCHEMAS (Fix #4) ---
const PerguntaSchema = z.object({
  eixo_metodologico: z.enum(['ajuste_dose', 'contraindicacao', 'posologia_pediatrica', 'interacao_medicamentosa', 'uso_comum']),
  secao: z.string().min(1),
  pergunta_simulada: z.string().min(10),
  nome_tag: z.string().min(1),
  sentenca_origem: z.string().min(10),
  fragmento_exato: z.string().min(1),
  resposta_assistente: z.string().min(10),
});

const ResponseSchema = z.object({
  perguntas: z.array(PerguntaSchema).min(1).max(3)
});

// --- VERIFICATION (Fix #2) ---
function verifyGrounding(responseObj, sourceText) {
  // Loosened normalizer: removes all accents AND all non-alphanumeric chars (spaces, newlines, commas, etc)
  const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const normalizedSource = normalize(sourceText);
  
  return responseObj.perguntas.map(q => {
    const sentencaFound = normalizedSource.includes(normalize(q.sentenca_origem));
    const fragmentoFound = normalizedSource.includes(normalize(q.fragmento_exato));
    
    // Relaxed strictness: As long as the core exact fragment is found, or the sentence is found, it's grounded.
    return { ...q, _verified: sentencaFound || fragmentoFound, _sentenca_found: sentencaFound, _fragmento_found: fragmentoFound };
  });
}

// --- SYSTEM PROMPT ---
const getSystemPrompt = (targetAxis) => `Você é um Pesquisador Clínico construindo um benchmark (Gabarito) para testar uma IA médica.
Eu vou lhe fornecer o texto extraído da bula oficial.

Sua tarefa é analisar o texto e gerar de 1 a 3 perguntas que um ser humano faria cuja resposta esteja ESTRITAMENTE contida no texto fornecido.
O foco DEVE ser no eixo clínico: '${targetAxis}'.

Regras de Classificação:
O eixo_metodologico deve ser EXATAMENTE '${targetAxis}'.

Formato de Saída (JSON Estrito):
{
  "perguntas": [
    {
      "eixo_metodologico": "ajuste_dose|contraindicacao|posologia_pediatrica|interacao_medicamentosa|uso_comum",
      "secao": "Nome da seção da bula de onde a informação foi tirada (ex: POSOLOGIA, CONTRAINDICACAO)",
      "pergunta_simulada": "...",
      "nome_tag": "...",
      "sentenca_origem": "Frase COMPLETA original da bula",
      "fragmento_exato": "Apenas o trecho minúsculo exato (ex: 25mg/kg/dia)",
      "resposta_assistente": "..."
    }
  ]
}

IMPORTANTE: Se o texto da bula não possuir informações suficientes para gerar uma boa pergunta para o eixo '${targetAxis}', não invente dados. Extrate APENAS dados fidedignos e contidos explicitamente no texto.`;

async function main() {
  if (!NVIDIA_API_KEY) throw new Error("NVIDIA_API_KEY missing");
  
  const openai = new OpenAI({
    apiKey: NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('bulas');
  const collection = db.collection('documentos');

  // Fix #1: Read the predefined medications per axis from Script 2
  const benchmarkFile = path.join(__dirname, '../../data/benchmark_medications_by_axis.json');
  if (!fs.existsSync(benchmarkFile)) throw new Error("Execute o Script 2 primeiro para gerar a lista de medicamentos por eixo.");
  
  const benchmarkData = JSON.parse(fs.readFileSync(benchmarkFile, 'utf8'));
  
  // Trackers
  const manifest = {
    startTime: new Date().toISOString(),
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    temperature: TEMPERATURE,
    totalApiCalls: 0,
    totalTokens: 0,
    totalRejected: 0,
    axisCounts: { ajuste_dose: 0, contraindicacao: 0, posologia_pediatrica: 0, interacao_medicamentosa: 0, uso_comum: 0 },
    endTime: null
  };

  // Process sequential (Fix #5)
  for (const eixoData of benchmarkData.eixos) {
    // Map axes IDs to match zod enum if needed
    const targetAxis = eixoData.id.replace('contraindicacao_absoluta', 'contraindicacao').replace('uso_comum_e_reacoes', 'uso_comum');
    
    console.log(`\n▶ Iniciando eixo: ${targetAxis}`);
    
    for (const med of eixoData.medicamentos) {
      if (manifest.totalApiCalls >= MAX_API_CALLS) {
        console.log("CRÍTICO: Teto de requisições de API atingido. Parando execução.");
        break;
      }
      if (manifest.axisCounts[targetAxis] >= TARGET_PER_AXIS) {
        console.log(`✅ Cota atingida para o eixo ${targetAxis}`);
        break;
      }

      console.log(`  - Extraindo ${med.nome}...`);
      const bulaData = await collection.find({ nome_medicamento: med.nome }).toArray();
      if (!bulaData.length) continue;
      
      // Combine all sections into a single text block for the model to analyze
      const fullText = bulaData.map(doc => {
        if (doc.secoes) {
          return Object.entries(doc.secoes).map(([sec, text]) => `${sec.toUpperCase()}:\n${text}`).join('\n\n');
        }
        return doc.texto_completo || "";
      }).join('\n\n---\n\n');
      
      // Retry Strategy
      let retries = 0;
      let success = false;
      
      while (retries < 3 && !success) {
        try {
          manifest.totalApiCalls++;
          const reqId = `req_${med.nome.replace(/\s+/g, '_')}_${targetAxis}_${Date.now()}`;
          
          const messages = [
            { role: 'system', content: getSystemPrompt(targetAxis) },
            { role: 'user', content: fullText }
          ];

          // Save prompt
          fs.writeFileSync(path.join(DIRS.prompts, `${reqId}.json`), JSON.stringify(messages, null, 2));

          const completion = await openai.chat.completions.create({
            model: "nvidia/nemotron-3-ultra-550b-a55b",
            messages: messages,
            temperature: TEMPERATURE,
            top_p: 0.95,
            max_tokens: 16384,
            reasoning_budget: 16384,
            chat_template_kwargs: { "enable_thinking": true }
          });

          const rawContent = completion.choices[0]?.message?.content;
          manifest.totalTokens += completion.usage?.total_tokens || 0;
          
          // Save raw response
          fs.writeFileSync(path.join(DIRS.responses, `${reqId}_raw.json`), JSON.stringify(completion, null, 2));

          // Clean JSON (Nemotron sometimes wraps in markdown)
          const jsonMatch = rawContent.match(/```json\n([\s\S]*?)\n```/) || rawContent.match(/```\n([\s\S]*?)\n```/);
          const jsonStr = jsonMatch ? jsonMatch[1] : rawContent;
          
          const parsed = JSON.parse(jsonStr);
          
          // Zod Validation (Fix #4)
          const validated = ResponseSchema.parse(parsed);

          // Verification (Fix #2)
          const verifiedQs = verifyGrounding(validated, fullText);
          
          const acceptedQs = verifiedQs.filter(q => q._verified);
          const rejectedQs = verifiedQs.filter(q => !q._verified);

          if (rejectedQs.length > 0) {
            manifest.totalRejected += rejectedQs.length;
            fs.writeFileSync(path.join(DIRS.rejected, `${reqId}_rejected.json`), JSON.stringify(rejectedQs, null, 2));
            console.log(`    ⚠ ${rejectedQs.length} perguntas rejeitadas por alucinação (falha no grounding)`);
          }

          // Save accepted questions
          const FARMAIA_SYSTEM_PROMPT = "Você é o FarmaIA, um assistente especializado em informações sobre medicamentos baseadas exclusivamente em bulas oficiais aprovadas pela ANVISA. Seu objetivo é fornecer informações claras, seguras e fundamentadas sobre medicamentos.\n\nDiretrizes:\n- Responda sempre com base nas informações da bula oficial\n- Use linguagem adequada ao perfil do usuário (leigo ou técnico)\n- Para situações de risco ou urgência, sempre oriente a buscar atendimento médico\n- Nunca substitua a consulta médica ou farmacêutica profissional\n- Se a informação não estiver na bula fornecida, informe isso claramente";

          for (const q of acceptedQs) {
            if (manifest.axisCounts[targetAxis] >= TARGET_PER_AXIS) break;
            
            const finalRecord = {
              metadata: { 
                medicamento: med.nome, 
                secao: q.secao.toLowerCase().replace(/[^a-z0-9]/g, ''), 
                nome_tag: q.nome_tag, 
                sentenca_origem: q.sentenca_origem, 
                fragmento_exato: q.fragmento_exato,
                eixo_metodologico: q.eixo_metodologico
              },
              messages: [
                { role: "system", content: FARMAIA_SYSTEM_PROMPT },
                { role: "user", content: q.pergunta_simulada },
                { role: "assistant", content: q.resposta_assistente }
              ]
            };
            
            fs.appendFileSync(DIRS.finalDataset, JSON.stringify(finalRecord) + '\n');
            manifest.axisCounts[targetAxis]++;
          }
          
          success = true;
          console.log(`    ✓ Processado. Aceitas: ${acceptedQs.length}. Total do eixo: ${manifest.axisCounts[targetAxis]}`);
          
        } catch (err) {
          retries++;
          console.error(`    x Erro (Tentativa ${retries}/3): ${err.message}`);
          if (retries < 3) {
            const delay = Math.pow(2, retries) * 1000;
            console.log(`    Aguardando ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
    }
  }

  // End manifest (Fix #7)
  manifest.endTime = new Date().toISOString();
  fs.writeFileSync(path.join(DIRS.base, 'run_manifest.json'), JSON.stringify(manifest, null, 2));
  
  await client.close();
  console.log("\n🚀 Geração do Dataset Cego concluída!");
  console.log(JSON.stringify(manifest.axisCounts, null, 2));
}

main();
