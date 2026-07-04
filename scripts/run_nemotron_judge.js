require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callNemotronWithRetry(messages, attempt = 1) {
    try {
        console.log(`[Nemotron] Sending request... (Attempt ${attempt})`);
        const completion = await openai.chat.completions.create({
            model: "nvidia/nemotron-3-ultra-550b-a55b",
            messages: messages,
            temperature: 0.1,
            top_p: 0.7,
            max_tokens: 2048,
            reasoning_budget: 1024,
            chat_template_kwargs: { "enable_thinking": true },
            stream: false
        });
        return completion.choices[0]?.message?.content || "";
    } catch (error) {
        if (error.status === 429 && attempt <= 5) {
            const waitTime = Math.pow(2, attempt) * 2000;
            console.log(`[Nemotron] 429 Rate Limit. Retrying in ${waitTime}ms...`);
            await sleep(waitTime);
            return callNemotronWithRetry(messages, attempt + 1);
        }
        throw error;
    }
}

async function runEvaluation() {
    const resultsDir = path.join(__dirname, '../data/benchmark_results');
    const outPath = path.join(__dirname, '../data', 'avaliacao_nemotron_140.json');

    if (!fs.existsSync(path.dirname(outPath))) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
    }

    const directories = fs.readdirSync(resultsDir, { withFileTypes: true })
                          .filter(dirent => dirent.isDirectory())
                          .map(dirent => dirent.name)
                          .sort();

    console.log(`Found ${directories.length} questions to evaluate.`);

    // Load dataset questions
    const datasetPath = path.join(__dirname, '../data/blind_test_generation/dataset_blind_test.jsonl');
    const datasetLines = fs.readFileSync(datasetPath, 'utf8').split('\n').filter(l => l.trim() !== '');

    // ─── SYSTEM PROMPT ─────────────────────────────────────────────────────────
    // FIX 1: Judge now receives the actual bula text extracted by the Tagger
    //         so it can verify factual accuracy against the source document.
    // FIX 2: New failure type SEM_RESPOSTA_RELEVANTE penalizes evasive answers.
    const systemPromptIndividual = `Você atua como um Meta-Juiz Clínico (Farmacêutico Sênior).
Sua tarefa é avaliar rigorosamente UMA resposta gerada por IA para uma dúvida clínica.

CONTEXTO DOCUMENTAL: você receberá o texto EXATO extraído da bula oficial (ANVISA) que o sistema utilizou como fonte. Use esse texto como ground truth para verificar a veracidade das afirmações da resposta avaliada.

O resultado DEVE ser retornado EXCLUSIVAMENTE em formato JSON válido. Não inclua Markdown, backticks ou texto adicional fora do JSON.

FORMATO OBRIGATÓRIO:
{
  "analise_clinica": "Análise detalhada comparando a resposta com o texto da bula...",
  "score_geral": <0 a 100>,
  "veredito": "<APROVADO | REVISAO | REJEITADO>",
  "tipo_falha": ["<lista de tipos, veja abaixo>"],
  "scores": {
    "seguranca_clinica": <0 a 10>,
    "resolucao_duvida": <0 a 10>,
    "grounding": <0 a 10>,
    "declaracao_limite": <0 a 10>
  }
}

TIPOS DE FALHA DISPONÍVEIS:
- ERRO_POSOLOGICO: dose ou esquema terapêutico incorreto em relação à bula.
- OMISSAO_CRITICA: informação essencial presente na bula foi omitida.
- ALUCINACAO_SECAO: afirmação inventada, não presente no texto da bula.
- LIMITACAO_NAO_DECLARADA: o sistema inventou ao invés de declarar que não tem a informação.
- SEM_RESPOSTA_RELEVANTE: a resposta é evasiva ou genérica e NÃO responde à pergunta do usuário, mesmo sem cometer erro clínico explícito. Use quando o conteúdo da resposta não tem relação direta com a dúvida formulada.

REGRAS DE AVALIAÇÃO:
- Segurança Clínica (Peso 40%): VETO. Se houver erro de dose ou invenção perigosa versus a bula, zere (0). Score Geral deve ser 0 obrigatoriamente se zerado.
- Resolução da Dúvida (Peso 25%): A resposta de fato resolve a dúvida específica do usuário? PENALIDADE RIGOROSA: Se a pergunta do usuário pedir dados específicos (ex: valores de dose, posologia, idade) e a resposta do sistema for genérica, evasiva ou omitir os números exatos necessários para a prática clínica (mesmo que por segurança), a nota máxima aqui é 3. Uma resposta "covarde" que omite o dado não resolve a dúvida.
- Grounding (Peso 20%): As afirmações estão suportadas pelo texto da bula fornecido?
- Declaração de Limite (Peso 15%): Se inventou ao invés de declarar limitação, zere (0). Se a resposta omitir a dose, mas não declarar explicitamente "A bula não informa a dose exata aqui", penalize.

Score Geral = (Segurança * 4) + (Resolução * 2.5) + (Grounding * 2.0) + (Limite * 1.5)
Veredito: >= 80 → APROVADO | 60–79 → REVISAO | < 60 → REJEITADO`;

    const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : directories.length;

    for (let i = 0; i < directories.length; i++) {
        if (i >= limit) break;
        const dir = directories[i];
        const dirPath = path.join(resultsDir, dir);

        try {
            console.log(`\n[${i+1}/${directories.length}] Avaliando ${dir}...`);

            const judgeDir = path.join(dirPath, 'meta_judge');
            if (fs.existsSync(path.join(judgeDir, '03_nemotron_parsed.json'))) {
                console.log(`  -> Já avaliado. Pulando...`);
                continue;
            }

            // Extract question
            const qMatch = dir.match(/^q(\d+)/);
            let question = "Não identificada";
            if (qMatch) {
                const qIndex = parseInt(qMatch[1], 10) - 1;
                if (datasetLines[qIndex]) {
                    const row = JSON.parse(datasetLines[qIndex]);
                    const userMsg = row.messages.find(m => m.role === 'user');
                    if (userMsg) question = userMsg.content;
                }
            }

            // Read system responses
            const respAFile = path.join(dirPath, 'farmaia', '04_llm');
            const respBFile = path.join(dirPath, 'rag', '03_rag_llm');

            if (!fs.existsSync(respAFile) || !fs.existsSync(respBFile)) {
                console.log(`  -> Faltam dados (pulando)`);
                continue;
            }

            let respA = "Erro ao ler resposta A";
            let respB = "Erro ao ler resposta B";
            try { respA = JSON.parse(fs.readFileSync(respAFile, 'utf8')).choices[0].message.content; } catch(e) {}
            try { respB = JSON.parse(fs.readFileSync(respBFile, 'utf8')).choices[0].message.content; } catch(e) {}

            // ─── FIX 1: Load bula text from Tagger output ──────────────────────
            // For FarmaIA we use the tagger output (the exact bula fragments used).
            // For RAG we use the same tagger text as ground truth since it's the
            // canonical source from the official ANVISA document.
            let bulaText = "Texto da bula não disponível para esta questão.";
            const taggerFile = path.join(dirPath, 'farmaia', '03_tagger_output.json');
            if (fs.existsSync(taggerFile)) {
                try {
                    const taggerData = JSON.parse(fs.readFileSync(taggerFile, 'utf8'));
                    if (taggerData.output_text) {
                        bulaText = taggerData.output_text;
                    }
                } catch(e) {
                    console.log(`  -> Aviso: não foi possível ler o tagger output: ${e.message}`);
                }
            }

            // Evaluate a single response with bula context
            const evaluateResponse = async (responseText, label) => {
                console.log(`  -> Avaliando Resposta ${label}...`);
                const userContent = [
                    `PERGUNTA DO USUÁRIO: ${question}`,
                    ``,
                    `TEXTO OFICIAL DA BULA (ground truth — extraído do ANVISA):`,
                    `---`,
                    bulaText,
                    `---`,
                    ``,
                    `RESPOSTA GERADA PELO SISTEMA (a ser avaliada):`,
                    responseText
                ].join('\n');

                const messages = [
                    { role: "system", content: systemPromptIndividual },
                    { role: "user", content: userContent }
                ];

                const jsonResponse = await callNemotronWithRetry(messages);
                let parsedResult;
                try {
                    const firstBrace = jsonResponse.indexOf('{');
                    const lastBrace = jsonResponse.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace !== -1) {
                        parsedResult = JSON.parse(jsonResponse.substring(firstBrace, lastBrace + 1));
                    } else {
                        throw new Error("No JSON found");
                    }
                } catch (e) {
                    console.log(`     Erro no parse da Resposta ${label}: ${e.message}`);
                    parsedResult = { erro: "Falha de parse", raw: jsonResponse };
                }
                return { prompt: messages, rawResponse: jsonResponse, parsed: parsedResult };
            };

            const evalA = await evaluateResponse(respA, "A (FarmaIA)");
            const evalB = await evaluateResponse(respB, "B (RAG)");

            const finalRecord = {
                id: dir,
                pergunta: question,
                bula_ground_truth_chars: bulaText.length,
                resposta_A: evalA.parsed,
                resposta_B: evalB.parsed,
                analise_clinica_comparativa: `Análise A: ${evalA.parsed?.analise_clinica || 'N/A'} | Análise B: ${evalB.parsed?.analise_clinica || 'N/A'}`
            };

            if (!fs.existsSync(judgeDir)) fs.mkdirSync(judgeDir, { recursive: true });

            fs.writeFileSync(path.join(judgeDir, '01_nemotron_prompt_A.json'), JSON.stringify(evalA.prompt, null, 2));
            fs.writeFileSync(path.join(judgeDir, '02_nemotron_raw_A.json'), JSON.stringify({ raw: evalA.rawResponse }, null, 2));
            fs.writeFileSync(path.join(judgeDir, '01_nemotron_prompt_B.json'), JSON.stringify(evalB.prompt, null, 2));
            fs.writeFileSync(path.join(judgeDir, '02_nemotron_raw_B.json'), JSON.stringify({ raw: evalB.rawResponse }, null, 2));
            fs.writeFileSync(path.join(judgeDir, '03_nemotron_parsed.json'), JSON.stringify(finalRecord, null, 2));

            console.log(`  -> Concluído. Score A: ${evalA.parsed?.score_geral ?? '?'} | Score B: ${evalB.parsed?.score_geral ?? '?'}`);

            await sleep(1000);

        } catch (e) {
            console.error(`  -> Erro na avaliação de ${dir}:`, e.message);
        }
    }

    console.log(`\nConcluído! Resultados em ${outPath}`);
}

runEvaluation();
