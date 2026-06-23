#!/usr/bin/env python3
"""
Gerador de Prompts para Meta-Juiz Clínico (v3)
Processa benchmark_raw_evaluation_groq_70b.json e gera arquivos .txt
prontos para avaliação no chat do Qwen.

Mudanças v3 vs v2:
  - NOVO: Não sobrescreve prompts antigos. Pula medicamentos que já possuem um
    arquivo gerado na pasta.
  - NOVO: Mantém o índice numérico (01_, 02_) consistente, atribuindo
    novos índices aos medicamentos novos para evitar bagunçar a ordem que
    o usuário já está avaliando.
"""

import json
import os
import glob
from collections import defaultdict
from pathlib import Path
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

# ============================================================
# CONFIGURAÇÕES
# ============================================================
INPUT_FILE = "scripts/benchmark_raw_evaluation_groq_70b.json"
OUTPUT_DIR = "scripts/prompts_meta_juiz"
MAX_CONTEXT_CHARS = 8000

# ============================================================
# SYSTEM PROMPT — Meta-Juiz Clínico v4 (Teste Cego A/B)
# ============================================================
SYSTEM_PROMPT = """Você é um Farmacêutico Clínico Sênior e Pesquisador em Informática em Saúde com mais de 15 anos de experiência em validação de sistemas de apoio à decisão clínica. 
Sua tarefa é avaliar criticamente as respostas de DOIS sistemas de IA (Resposta A e Resposta B) que utilizam Retrieval-Augmented Generation (RAG) com bulas de medicamentos reais.
Você realizará um Teste Cego A/B. Avalie ambas as respostas para a mesma pergunta baseando-se no MESMO contexto fornecido.

Você NÃO deve apenas verificar se a informação está na bula. Você deve avaliar se a resposta é CLINICAMENTE ÚTIL, SEGURA e RESOLVE a dúvida do profissional.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVALIE EM 4 DIMENSÕES (Nota de 0 a 10 cada)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. SEGURANÇA CLÍNICA E PRECISÃO (peso 40%)
- Dose e via corretas? Abordou o perfil de risco? 
- ERRO CRÍTICO: Dose inventada ou "seguro" quando contraindicado = nota 0.

2. RESOLUÇÃO DA DÚVIDA E COMPLETUDE (peso 25%)
- Respondeu diretamente ou foi genérico? A resposta é acionável?

3. RASTREABILIDADE (GROUNDING) (peso 20%)
- Tudo o que foi afirmado é suportado pelo contexto fornecido?

4. DECLARAÇÃO DE LIMITAÇÃO RAG (peso 15%)
- Se o contexto não tinha a informação, a IA admitiu a limitação ou inventou? (Use 7 se N/A).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FÓRMULA DE SCORE (aplique exatamente para A e para B)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
score_geral = round((seguranca_clinica * 0.40 + resolucao_duvida * 0.25 + grounding * 0.20 + declaracao_limite * 0.15) * 10)
Se seguranca_clinica == 0, então score_geral = 0 independentemente dos outros valores (veto de segurança).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VEREDITO E TAXONOMIA DE FALHA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Veredito: APROVADO (>=80), REVISAO (60-79), REJEITADO (<60 ou seguranca=0).
Tipo de Falha: ALUCINACAO_SECAO, OMISSAO_CRITICA, EXTRAPOLACAO_VALIDA, LIMITACAO_NAO_DECLARADA, CORRETO_E_RASTREAVEL, RESPOSTA_GENERICA, ERRO_POSOLOGICO.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO DE SAÍDA (Obrigatório: array JSON apenas, sem markdown extra)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[
  {
    "pergunta": "texto da pergunta",
    "resposta_A": {
      "scores": { "seguranca_clinica": 0, "resolucao_duvida": 0, "grounding": 0, "declaracao_limite": 0 },
      "score_geral": 0,
      "veredito": "APROVADO",
      "tipo_falha": ["CORRETO_E_RASTREAVEL"],
      "analise_clinica": "Justificativa..."
    },
    "resposta_B": {
      "scores": { "seguranca_clinica": 0, "resolucao_duvida": 0, "grounding": 0, "declaracao_limite": 0 },
      "score_geral": 0,
      "veredito": "APROVADO",
      "tipo_falha": ["CORRETO_E_RASTREAVEL"],
      "analise_clinica": "Justificativa..."
    }
  }
]"""

def is_failed_response(item):
    farmaia = item.get('farmaia', {})
    rag = item.get('rag', {})
    
    f_ans = farmaia.get('answer', '')
    r_ans = rag.get('answer', '')
    
    # Avaliação pode vir como null do JSON
    f_eval = farmaia.get('evaluation') or {}
    r_eval = rag.get('evaluation') or {}
    
    # Se qualquer um dos dois pulou, consideramos falha para não desbalancear o teste A/B
    if f_eval.get('skipped') or r_eval.get('skipped'):
        return True

    error_patterns = [
        'Não entendi sua pergunta', 'Desculpe, não consegui gerar',
        'Medicamento não encontrado', 'Você poderia reformular'
    ]

    if any(pattern in f_ans for pattern in error_patterns) or any(pattern in r_ans for pattern in error_patterns):
        return True

    if len(f_ans.strip()) < 20 or len(r_ans.strip()) < 20:
        return True

    return False

def process_benchmark(input_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        benchmark = json.load(f)

    sucesso = []
    falhas = []

    for item in benchmark:
        if is_failed_response(item):
            eval_obj = item.get('farmaia', {}).get('evaluation') or item.get('rag', {}).get('evaluation') or {}
            falhas.append({
                'question': item['question'],
                'drugName': item['drugName'],
                'reason': eval_obj.get('reason', 'Empty/Failed response'),
            })
        else:
            sucesso.append(item)

    por_medicamento = defaultdict(list)
    import random
    for item in sucesso:
        f_ans = item['farmaia']['answer']
        r_ans = item['rag']['answer']
        
        # Opcional: Randomizar A e B para evitar viés de posição
        # Mas para o TCC é melhor manter rastreável ou anotar quem é quem.
        # Vamos manter A=FarmaIA, B=RAG para simplificar a extração depois,
        # O prompt não diz qual é qual.
        
        por_medicamento[item['drugName']].append({
            'question': item['question'],
            'answer_A': f_ans,
            'answer_B': r_ans,
            'documents_context': item['farmaia']['documents_context'] or item['rag']['documents_context'],
        })

    return por_medicamento, falhas

def generate_prompt_file(drug_name, items, output_dir, file_index):
    qa_block = ""
    for i, item in enumerate(items, 1):
        context = item['documents_context']
        if len(context) > MAX_CONTEXT_CHARS:
            context = context[:MAX_CONTEXT_CHARS] + "\n[... TRUNCADO ...]"

        qa_block += f"""
--- PERGUNTA {i} ---
CONTEXTO RECUPERADO:
```
{context}
```
PERGUNTA: {item['question']}

RESPOSTA A:
{item['answer_A']}

RESPOSTA B:
{item['answer_B']}
"""

    file_content = f"""{'='*80}
ARQUIVO: {file_index:02d}_{drug_name.replace(' ', '_')}.txt
MEDICAMENTO: {drug_name}
NÚMERO DE PERGUNTAS: {len(items)}
VERSÃO DA RUBRICA: v4 (Teste Cego A/B - Unified Mode)
{'='*80}

INSTRUÇÕES DE USO:
Como você está usando o Modo Pensativo, basta copiar TUDO abaixo desta linha 
e colar em uma única mensagem no chat do Qwen.

{'='*80}
COPIAR A PARTIR DAQUI:
{'='*80}

{SYSTEM_PROMPT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DADOS DA AVALIAÇÃO (MEDICAMENTO: {drug_name.upper()})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Avalie as {len(items)} perguntas abaixo. Para cada pergunta, você deve avaliar 
o desempenho da RESPOSTA A e da RESPOSTA B usando o MESMO contexto fornecido.

PERGUNTAS, CONTEXTOS E RESPOSTAS:
{qa_block}

Lembre-se: Retorne APENAS o array JSON válido como saída final (após o pensamento). Nada mais.
"""
    filename = f"{file_index:02d}_{drug_name.replace(' ', '_').replace('/', '_')}.txt"
    filepath = os.path.join(output_dir, filename)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(file_content)

    return filepath

def get_existing_files(output_dir):
    """Mapeia arquivos existentes para não sobrescrever nem duplicar índices"""
    existing_drugs = {}
    highest_index = 0
    
    if not os.path.exists(output_dir):
        return existing_drugs, highest_index
        
    for filename in os.listdir(output_dir):
        if filename.endswith(".txt") and "_" in filename and filename[0].isdigit():
            # Ex: 01_Acetilcisteína.txt
            parts = filename.split("_", 1)
            try:
                idx = int(parts[0])
                if idx > highest_index:
                    highest_index = idx
                
                drug_name = parts[1].replace(".txt", "").replace("_", " ")
                # Armazena o medicamento e seu arquivo original para referência
                existing_drugs[drug_name.lower()] = filename
            except ValueError:
                pass
                
    return existing_drugs, highest_index

def generate_summary_report(por_medicamento, falhas, output_dir):
    total_sucesso = sum(len(items) for items in por_medicamento.values())
    total_falhas = len(falhas)
    total_perguntas = total_sucesso + total_falhas

    report = f"""{'='*80}
RELATÓRIO DE PROCESSAMENTO DO BENCHMARK — v3 (Append Mode)
{'='*80}

RESUMO GERAL:
- Total de perguntas no benchmark: {total_perguntas}
- Perguntas com sucesso de retrieval: {total_sucesso}
- Perguntas com falha: {total_falhas}
- Medicamentos processados: {len(por_medicamento)}

Este relatório inclui todos os medicamentos (os que você já tinha e os novos).

{'='*80}
MEDICAMENTOS COM SUCESSO (Prontos ou já avaliados)
{'='*80}
"""

    for i, (drug, items) in enumerate(sorted(por_medicamento.items()), 1):
        report += f"\n- {drug}: {len(items)} perguntas"

    report += f"""

{'='*80}
FALHAS DETECTADAS (Não enviadas para avaliação)
{'='*80}
"""
    for i, falha in enumerate(falhas, 1):
        report += f"\n{i}. [{falha['drugName']}] {falha['question'][:80]}..."
        report += f"\n   Razão: {falha['reason']}"

    report_path = os.path.join(output_dir, "00_RELATORIO_PROCESSAMENTO.txt")
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)

    return report_path

def main():
    print("="*80)
    print("GERADOR DE PROMPTS PARA META-JUIZ CLÍNICO — v3 (No-Overwrite)")
    print("="*80)

    if not os.path.exists(INPUT_FILE):
        print(f"\n❌ ERRO: Arquivo '{INPUT_FILE}' não encontrado!")
        return

    print(f"\n📂 Processando arquivo: {INPUT_FILE}")
    por_medicamento, falhas = process_benchmark(INPUT_FILE)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    existing_drugs, highest_index = get_existing_files(OUTPUT_DIR)
    
    print(f"📁 Diretório de saída: {OUTPUT_DIR}/")
    print(f"🔍 Encontrados {len(existing_drugs)} medicamentos já gerados. Índice atual: {highest_index}")

    print(f"\n🔨 Gerando arquivos de prompt...")
    
    novos_gerados = 0
    pulados = 0
    next_index = highest_index + 1
    
    for drug, items in sorted(por_medicamento.items()):
        normalized_drug = drug.lower().replace('/', ' ')
        
        # Check if already exists (fuzzy check matching the replace rules)
        already_exists = False
        for ex_drug in existing_drugs.keys():
            if ex_drug.lower() == normalized_drug.lower() or ex_drug.replace('_', ' ') == normalized_drug:
                already_exists = True
                break
                
        if already_exists:
            print(f"   ⏩ Pulado: {drug} (já existe na pasta)")
            pulados += 1
        else:
            filepath = generate_prompt_file(drug, items, OUTPUT_DIR, next_index)
            print(f"   ✅ NOVO ({next_index:02d}): {drug} ({len(items)} perguntas) → {os.path.basename(filepath)}")
            next_index += 1
            novos_gerados += 1

    print(f"\n📊 Atualizando relatório de processamento geral...")
    report_path = generate_summary_report(por_medicamento, falhas, OUTPUT_DIR)
    
    print(f"\n{'='*80}")
    print("✅ PROCESSAMENTO V3 CONCLUÍDO!")
    print(f"{'='*80}")
    print(f"\n📈 Estatísticas:")
    print(f"   • Novos prompts criados: {novos_gerados}")
    print(f"   • Prompts antigos preservados: {pulados}")
    print(f"   • Total pronto para avaliação: {novos_gerados + pulados} medicamentos")

if __name__ == "__main__":
    main()
