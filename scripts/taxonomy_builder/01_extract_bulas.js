const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');
const fs = require('fs');

const MONGODB_URI = process.env.MONGODB_URI;
const OUTPUT_JSON = path.join(__dirname, 'amostra_bulas_secoes.json');
const RESULTS_DIR = path.join(__dirname, 'results');

// O Prompt base que o LLM vai usar para clusterizar cada seção
const BASE_PROMPT = `Você é um Farmacêutico Clínico Especialista em Ontologias Médicas e NLP.

Abaixo, fornecerei vários parágrafos extraídos da seção "{{NOME_SECAO}}" de bulas reais.
Sua tarefa é analisar o texto bruto, encontrar padrões de instruções clínicas e criar uma lista exaustiva de "Tags de Intenção" (Intention Tags) que cubram todas as informações contidas neles.

REGRAS RÍGIDAS:
1. BOTTOM-UP: Nenhuma tag pode ser inventada se não houver um trecho explícito que a justifique.
2. GRANULARIDADE: Específica o suficiente para roteamento, mas genérica para servir a várias bulas (ex: "contraindicacao_doenca_cardiaca").
3. FORMATO: Apenas snake_case (letras minúsculas e sublinhado).

O QUE VOCÊ DEVE RETORNAR PARA CADA TAG IDENTIFICADA (em formato JSON estrito):
[
  {
    "nome_tag": "tag_em_snake_case",
    "descricao_intencao": "Que tipo de pergunta ativaria essa tag?",
    "evidencia_extraida": "Frase exata da bula que originou a tag"
  }
]

Aqui estão os textos brutos das bulas para a sua análise:
{{TEXTO_BULAS}}`;

async function extractBulas() {
  console.log('📦 Conectando ao MongoDB...');
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db('bulas');
    const collection = db.collection('documentos');

    const amostras = [];
    // Agrupadores por seção para gerar os prompts
    const textosPorSecao = {
      indicacoes: [],
      contraindicacoes: [],
      advertencias: [],
      posologia: [],
      reacoes_adversas: []
    };

    // Busca 30 bulas aleatórias/primeiras que encontrar no banco
    console.log('🔍 Buscando 30 bulas aleatórias...');
    const docs = await collection.aggregate([
      { $match: { tipo: 'bula', nome_medicamento: { $exists: true, $ne: "" } } },
      { $sample: { size: 30 } }
    ]).toArray();

    for (const doc of docs) {
      if (doc && doc.secoes) {
        amostras.push(doc.nome_medicamento);
        
        const indicacoes = doc.secoes.indicacao || "";
        const contra = doc.secoes.contraindicacao || "";
        const advertencias = doc.secoes.advertencias || "";
        const posologia = doc.secoes.posologia || "";
        const reacoes = doc.secoes.reacoes || "";

        if (indicacoes.length > 50) textosPorSecao.indicacoes.push(`--- BULA: ${doc.nome_medicamento} ---\n${indicacoes}`);
        if (contra.length > 50) textosPorSecao.contraindicacoes.push(`--- BULA: ${doc.nome_medicamento} ---\n${contra}`);
        if (advertencias.length > 50) textosPorSecao.advertencias.push(`--- BULA: ${doc.nome_medicamento} ---\n${advertencias}`);
        if (posologia.length > 50) textosPorSecao.posologia.push(`--- BULA: ${doc.nome_medicamento} ---\n${posologia}`);
        if (reacoes.length > 50) textosPorSecao.reacoes_adversas.push(`--- BULA: ${doc.nome_medicamento} ---\n${reacoes}`);
        
        console.log(`✅ Extraído: ${doc.nome_medicamento}`);
      }
    }

    fs.writeFileSync(OUTPUT_JSON, JSON.stringify({ medicamentos_extraidos: amostras }, null, 2));
    
    // Gerar os arquivos de prompt para a API dentro da pasta results/
    for (const [secao, textos] of Object.entries(textosPorSecao)) {
      if (textos.length === 0) continue;
      
      const textoFinal = textos.join('\n\n');
      const promptPronto = BASE_PROMPT
        .replace('{{NOME_SECAO}}', secao.toUpperCase())
        .replace('{{TEXTO_BULAS}}', textoFinal);
      
      const fileName = path.join(RESULTS_DIR, `prompt_api_${secao}.txt`);
      fs.writeFileSync(fileName, promptPronto);
      console.log(`📝 Arquivo de prompt gerado para API: results/prompt_api_${secao}.txt`);
    }

    console.log(`\n🎉 Extração concluída! Tudo preparado em: ${RESULTS_DIR}`);

  } finally {
    await client.close();
  }
}

extractBulas().catch(console.error);
