const fs = require('fs');
const path = require('path');

const resultsDir = path.join(__dirname, '../data/benchmark_results');
const datasetPath = path.join(__dirname, '../data/blind_test_generation/dataset_blind_test.jsonl');

// 1. Load dataset to get ground truth section for each question
const datasetLines = fs.readFileSync(datasetPath, 'utf8').split('\n').filter(l => l.trim() !== '');
const groundTruth = {}; // questionId (e.g. q001) -> trueSection
datasetLines.forEach((line, index) => {
    const qId = `q${String(index + 1).padStart(3, '0')}`;
    const row = JSON.parse(line);
    groundTruth[qId] = row.metadata.secao.toLowerCase();
});

// 2. Iterate over results and analyze
const directories = fs.readdirSync(resultsDir, { withFileTypes: true })
                      .filter(dirent => dirent.isDirectory())
                      .map(dirent => dirent.name);

let totalEvaluated = 0;
let totalFarmaIaErrors = 0;
let routingErrors = 0;       // Architectural (Predicted != True)
let comprehensionErrors = 0; // Capability (Predicted == True)

console.log("=== Auditoria de Falhas Clínicas (FarmaIA) ===");

for (const dir of directories) {
    const qIdMatch = dir.match(/^(q\d+)/);
    if (!qIdMatch) continue;
    const qId = qIdMatch[1];
    
    const judgeFile = path.join(resultsDir, dir, 'meta_judge', '03_nemotron_parsed.json');
    const plannerFile = path.join(resultsDir, dir, 'farmaia', '01_planner_response.json');
    
    if (!fs.existsSync(judgeFile) || !fs.existsSync(plannerFile)) continue;
    
    totalEvaluated++;
    
    const judgeData = JSON.parse(fs.readFileSync(judgeFile, 'utf8'));
    const plannerData = JSON.parse(fs.readFileSync(plannerFile, 'utf8'));
    
    // Check if FarmaIA failed (Rejeitado or Revisao)
    const vereditoA = judgeData.resposta_A?.veredito;
    if (vereditoA === 'REJEITADO' || vereditoA === 'REVISAO') {
        totalFarmaIaErrors++;
        
        const trueSection = groundTruth[qId] || "unknown";
        const predictedSections = plannerData.plan?.sections || [];
        const predictedSection = predictedSections.length > 0 ? predictedSections[0].toLowerCase() : "none";
        
        const failureTags = judgeData.resposta_A?.tipo_falha?.join(', ') || "N/A";
        
        console.log(`\nFalha em ${dir} [${vereditoA}]`);
        console.log(`- Tags de Erro: ${failureTags}`);
        console.log(`- Seção Ground Truth (ANVISA): ${trueSection}`);
        console.log(`- Seção Prevista (Planner): ${predictedSection}`);
        
        if (predictedSection !== trueSection) {
            routingErrors++;
            console.log(`=> DIAGNÓSTICO: Falha Arquitetural (Erro de Roteamento)`);
        } else {
            comprehensionErrors++;
            console.log(`=> DIAGNÓSTICO: Falha de Capacidade do Modelo (Erro de Síntese)`);
        }
    }
}

console.log("\n=== RESUMO FINAL ===");
console.log(`Total de perguntas avaliadas: ${totalEvaluated}`);
console.log(`Total de erros do FarmaIA (Rejeitado/Revisão): ${totalFarmaIaErrors}`);
if (totalFarmaIaErrors > 0) {
    console.log(`- Falhas Arquiteturais (Seção Errada): ${routingErrors} (${((routingErrors/totalFarmaIaErrors)*100).toFixed(1)}%)`);
    console.log(`- Falhas de Capacidade (Seção Certa, LLM Errou): ${comprehensionErrors} (${((comprehensionErrors/totalFarmaIaErrors)*100).toFixed(1)}%)`);
}
