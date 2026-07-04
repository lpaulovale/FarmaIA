const fs = require('fs');
const path = require('path');

console.log(`=== Relatório Meta-Juiz Nemotron ===`);

const resultsDir = path.join(__dirname, '../data/benchmark_results');
const directories = fs.readdirSync(resultsDir, { withFileTypes: true })
                      .filter(dirent => dirent.isDirectory())
                      .map(dirent => dirent.name);

const data = [];
for (const dir of directories) {
    const parsedFile = path.join(resultsDir, dir, 'meta_judge', '03_nemotron_parsed.json');
    if (fs.existsSync(parsedFile)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(parsedFile, 'utf8'));
            data.push({ id: dir, resposta_A: parsed.resposta_A, resposta_B: parsed.resposta_B });
        } catch(e) {}
    }
}

console.log(`Total de perguntas avaliadas: ${data.length}\n`);

let scoresA = [], scoresB = [];
let vereditoA = { APROVADO: 0, REVISAO: 0, REJEITADO: 0 };
let vereditoB = { APROVADO: 0, REVISAO: 0, REJEITADO: 0 };

let falhasA = {}, falhasB = {};

let dimensoes = {
    "seguranca_clinica": { A: [], B: [] },
    "resolucao_duvida": { A: [], B: [] },
    "grounding": { A: [], B: [] },
    "declaracao_limite": { A: [], B: [] }
};

for (const item of data) {
    const a = item.resposta_A;
    const b = item.resposta_B;
    
    if(!a || !b) continue;

    scoresA.push(a.score_geral || 0);
    scoresB.push(b.score_geral || 0);
    
    vereditoA[a.veredito] = (vereditoA[a.veredito] || 0) + 1;
    vereditoB[b.veredito] = (vereditoB[b.veredito] || 0) + 1;
    
    (a.tipo_falha || []).forEach(f => falhasA[f] = (falhasA[f] || 0) + 1);
    (b.tipo_falha || []).forEach(f => falhasB[f] = (falhasB[f] || 0) + 1);
    
    if (a.scores) {
        Object.keys(dimensoes).forEach(d => { if(a.scores[d] !== undefined) dimensoes[d].A.push(a.scores[d]); });
    }
    if (b.scores) {
        Object.keys(dimensoes).forEach(d => { if(b.scores[d] !== undefined) dimensoes[d].B.push(b.scores[d]); });
    }
}

const avg = (arr) => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length).toFixed(2) : '0.00';

console.log(`--- SCORES ---`);
console.log(`Score Médio A (FarmaIA): ${avg(scoresA)}`);
console.log(`Score Médio B (RAG)    : ${avg(scoresB)}`);

console.log(`\n--- VEREDITOS A (FarmaIA) ---`);
console.log(`Aprovados : ${vereditoA.APROVADO}`);
console.log(`Em Revisão: ${vereditoA.REVISAO}`);
console.log(`Rejeitados: ${vereditoA.REJEITADO}`);

console.log(`\n--- VEREDITOS B (RAG) ---`);
console.log(`Aprovados : ${vereditoB.APROVADO}`);
console.log(`Em Revisão: ${vereditoB.REVISAO}`);
console.log(`Rejeitados: ${vereditoB.REJEITADO}`);

console.log(`\n--- DIMENSÕES ---`);
Object.keys(dimensoes).forEach(d => {
    console.log(`${d}: FarmaIA = ${avg(dimensoes[d].A)}, RAG = ${avg(dimensoes[d].B)}`);
});

console.log(`\n--- TIPOS DE FALHA A (FarmaIA) ---`);
console.log(falhasA);

console.log(`\n--- TIPOS DE FALHA B (RAG) ---`);
console.log(falhasB);
