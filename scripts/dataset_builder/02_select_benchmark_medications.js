const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

if (!MONGODB_URI || !NVIDIA_API_KEY) {
  console.error("ERRO: MONGODB_URI ou NVIDIA_API_KEY não encontrados no .env");
  process.exit(1);
}

const SYSTEM_PROMPT = `Você é um farmacologista sênior e pesquisador clínico. 
Seu objetivo é desenhar a metodologia de um benchmark para avaliar uma IA médica (FarmaIA).
Para garantir rigor acadêmico, o benchmark deve testar a IA em 5 eixos críticos de segurança e impacto clínico.

Os 5 eixos metodológicos são:
1. "ajuste_dose": Medicamentos que exigem cálculos ou ajustes críticos por insuficiência renal/hepática (ex: Metformina, Aciclovir).
2. "contraindicacao": Medicamentos com contraindicações absolutas graves, risco teratogênico ou restrição severa em populações especiais (ex: gravidez).
3. "posologia_pediatrica": Medicamentos comuns em pediatria que exigem conversão de dose por peso (mg/kg).
4. "interacao_medicamentosa": Fármacos com janela terapêutica estreita ou inibidores/indutores do CYP450 que causam interações graves (ex: Varfarina).
5. "uso_comum": Medicamentos de venda livre (OTC) ou de uso crônico massivo onde reações adversas e modo de administração geram muitas dúvidas leigas.

Sua tarefa:
Analise a lista de medicamentos fornecida (extraída do banco de dados real do projeto) e selecione os 10 medicamentos mais representativos e clinicamente relevantes para CADA um dos 5 eixos descritos acima. UM MESMO MEDICAMENTO NÃO DEVE APARECER EM MAIS DE UM EIXO (para garantir diversidade no dataset final).

Responda ÚNICA E EXCLUSIVAMENTE em formato JSON válido, com a seguinte estrutura:
{
  "eixos": [
    {
      "id": "ajuste_dose",
      "descricao": "Ajuste de Dose (Renal/Hepático)",
      "medicamentos": [
        { "nome": "NOME DO MEDICAMENTO", "justificativa_clinica": "Breve justificativa do porquê foi escolhido" }
      ]
    }
  ]
}`;

async function main() {
  console.log("1. Conectando ao MongoDB...");
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db('bulas');
    
    console.log("2. Extraindo lista única de medicamentos...");
    const medicamentos = await db.collection('documentos').distinct('nome_medicamento');
    console.log(`   - Encontrados ${medicamentos.length} medicamentos únicos no banco.`);
    
    // Embaralha e pega uma amostra se for gigantesco, mas o Llama 70B com 128k context aguenta os ~1500 de boa.
    const medicamentosText = medicamentos.join(', ');
    
    const logsDir = path.join(__dirname, '../../data/benchmark_selection_logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    console.log("3. Solicitando seleção metodológica à API da NVIDIA (Nemotron 550B)...");
    
    const openai = new OpenAI({
      apiKey: NVIDIA_API_KEY,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });

    const payload = {
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Aqui está a lista de medicamentos disponíveis no banco de dados:\n\n${medicamentosText}\n\nSelecione 10 medicamentos únicos para cada um dos 5 eixos conforme as instruções, retornando estritamente em JSON.` }
      ],
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 8192,
      reasoning_budget: 2048,
      chat_template_kwargs: { "enable_thinking": true }
    };

    // Salvar o prompt
    fs.writeFileSync(path.join(logsDir, 'req_benchmark_medications_prompt.json'), JSON.stringify(payload, null, 2));

    const completion = await openai.chat.completions.create(payload);
    
    // Salvar a resposta bruta (incluindo os tokens e reasoning trace)
    fs.writeFileSync(path.join(logsDir, 'req_benchmark_medications_response_raw.json'), JSON.stringify(completion, null, 2));

    let resultJsonStr = completion.choices[0]?.message?.content;
    
    // Robust JSON extraction
    let start = resultJsonStr.indexOf('{');
    let end = resultJsonStr.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      resultJsonStr = resultJsonStr.substring(start, end + 1);
    } else {
      throw new Error("Não foi possível encontrar um objeto JSON válido na resposta da API.");
    }
    
    console.log("4. Salvando resultados metodológicos finais...");
    const outPath = path.join(__dirname, '../../data/benchmark_medications_by_axis.json');
    fs.writeFileSync(outPath, resultJsonStr, 'utf-8');
    
    console.log(`✅ Sucesso! Medicamentos por eixo metodológico salvos em: ${outPath}`);
    
    // Mostra um resumo do que o LLM devolveu
    const parsed = JSON.parse(resultJsonStr);
    parsed.eixos.forEach(eixo => {
      console.log(`\n▶ Eixo: ${eixo.descricao}`);
      eixo.medicamentos.slice(0, 3).forEach(med => {
        console.log(`  - ${med.nome}: ${med.justificativa_clinica}`);
      });
      console.log(`  ... (e mais ${eixo.medicamentos.length - 3})`);
    });
    
  } catch (error) {
    console.error("Erro durante a execução:", error);
  } finally {
    await client.close();
  }
}

main();
