require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chatWithModel } = require('../lib/llm_client');
const { planQuery } = require('../lib/planner');
const { executeTool } = require('../lib/tool_registry');
const { tagAndFilter } = require('../lib/tagger');
const { getResponsePrompt } = require('../lib/prompt_manager');

const OUTPUT_PATH = path.join(__dirname, 'results', 'deep_analysis_v2_dataset.json');
const QUESTIONS_PATH = path.join(__dirname, 'question_by_type.json');

async function runDeepAnalysisForQuestion(question, drugName) {
  console.log(`\n--- Analisando: ${drugName} | "${question}" ---`);
  
  const stepByStepData = {
    medicamento: drugName,
    pergunta_usuario: question,
    etapa1_roteamento: null,
    etapa2_banco_dados: null,
    etapa3_tagger_vetorial: null,
    etapa4_geracao_final: null,
    erro: null
  };

  try {
    // 1. Planner & Classifier
    const planStartTime = Date.now();
    const plan = await planQuery(question, 'profissional', [], [drugName]);
    stepByStepData.etapa1_roteamento = {
      tempo_ms: Date.now() - planStartTime,
      metodo_classificacao: plan.classification_method || 'desconhecido',
      secao_predita: plan.tools[0]?.args?.section || 'nenhuma',
      tags_geradas: plan.tags || []
    };

    if (!plan.tools || plan.tools.length === 0) {
      stepByStepData.erro = "Nenhuma ferramenta planejada.";
      return stepByStepData;
    }
    
    // 2. Fetch section
    const dbStartTime = Date.now();
    const toolArgs = plan.tools[0].args;
    const doc = await executeTool(plan.tools[0].name, toolArgs);
    
    if (!doc.found || !doc.data) {
      stepByStepData.erro = "Documento não encontrado no banco.";
      return stepByStepData;
    }
    
    const sectionContent = doc.data.content || doc.data.textContent;
    stepByStepData.etapa2_banco_dados = {
      tempo_ms: Date.now() - dbStartTime,
      tamanho_texto_recuperado: sectionContent.length,
      amostra_texto_cru: sectionContent.substring(0, 300) + '...'
    };
    
    // 3. Tagger
    const taggerStartTime = Date.now();
    const tagged = await tagAndFilter(sectionContent, toolArgs.section, plan.tags, question);
    const filteredContext = tagged.map(s => s.text).join('\n\n');
    
    stepByStepData.etapa3_tagger_vetorial = {
      tempo_ms: Date.now() - taggerStartTime,
      frases_extraidas_qtd: tagged.length,
      texto_filtrado_exato: filteredContext
    };
    
    // 4. Final Generation using 70B Model
    const genStartTime = Date.now();
    const systemPrompt = getResponsePrompt('profissional', {
      date: new Date().toISOString().split("T")[0],
      question: question,
      documents: filteredContext,
      topics: plan.topics || [],
      implicitQuestions: plan.implicit_questions || [],
      tags: plan.tags || [],
    });

    const result = await chatWithModel(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      { provider: 'groq', model: 'llama-3.3-70b-versatile', temperature: 0.3 }
    );
    
    stepByStepData.etapa4_geracao_final = {
      tempo_ms: Date.now() - genStartTime,
      resposta_gerada: result.text
    };

  } catch (err) {
    stepByStepData.erro = err.message;
  }
  
  return stepByStepData;
}

async function buildDataset() {
  console.log("==========================================");
  console.log(" 🧪 BUILDING DEEP ANALYSIS DATASET (V2)");
  console.log("==========================================\n");

  const qByTypeData = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));
  const rootQuestions = qByTypeData["questions "] || qByTypeData.questions || [];
  
  const questionsToRun = [];
  
  // Pegar 1 pergunta de cada tipo para garantir diversidade (até 15 perguntas max)
  for (const group of rootQuestions) {
    const drugName = (group["medication "] || group.medication).trim();
    const groupQuestions = group["questions "] || group.questions || [];
    
    if (groupQuestions.length > 0) {
      questionsToRun.push({ 
        drugName, 
        question: groupQuestions[0].text.trim()
      });
    }
    if (questionsToRun.length >= 15) break; // 15 questions is plenty for deep analysis chapter
  }

  const results = [];

  for (let i = 0; i < questionsToRun.length; i++) {
    console.log(`\n[${i+1}/${questionsToRun.length}] Processando...`);
    const data = await runDeepAnalysisForQuestion(questionsToRun[i].question, questionsToRun[i].drugName);
    results.push(data);
    
    // Salvar incrementalmente
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
    
    // Respeitar Rate Limit do Groq 70B
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\n✅ Dataset de Análise Profunda gerado em: ${OUTPUT_PATH}`);
  process.exit(0);
}

buildDataset();
