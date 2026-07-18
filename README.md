# FarmaIA 🧪💊

**FarmaIA** - Assistente inteligente de medicamentos baseado na arquitetura **Model Context Protocol (MCP)** e **Filtragem Estruturada (Tag-and-Filter)**, com foco em segurança regulatória e deploy Serverless no Vercel.

![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=flat&logo=node.js)
![Vercel](https://img.shields.io/badge/Vercel-Serverless-black?style=flat&logo=vercel)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green?style=flat&logo=mongodb)
![Groq](https://img.shields.io/badge/Groq-Llama%203.3-orange?style=flat)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat)

---

## 📋 Visão Geral

O FarmaIA é um agente inteligente projetado para ler e responder dúvidas clínicas com base em bulas oficiais da ANVISA. Diferente de pipelines Agentic RAG tradicionais que dependem de similaridade vetorial (ruidosa), o FarmaIA introduz o **Roteamento Categórico via Dicionário Semântico de Intenções** e a **Filtragem Determinística de Sentenças**.

O projeto provou reduzir alucinações severas transformando-as em omissões seguras, e consome 60% menos tokens na injeção de contexto.

### Principais Funcionalidades

- 🤖 **Filtragem Estruturada (Tag-and-Filter)** - O sistema mapeia dúvidas para tags regulatórias exatas (ex: `posologia_pediatrica`), bloqueando a injeção de contexto irrelevante.
- ⚡ **Vercel Serverless Functions** - Totalmente refatorado para rodar na nuvem do Vercel (`/api`), usufruindo de inferência ultrarrápida via **Groq (Llama 70B)** para evitar Timeouts.
- 💾 **MongoDB Atlas** - Todo o acervo regulatório da ANVISA particionado estruturalmente por seções macro.
- 👥 **Dual Mode** - Perfis de respostas distintos para Pacientes (linguagem acessível) e Profissionais (linguagem técnica farmacocinética).
- 🧩 **Arquitetura MCP (Model Context Protocol)** - Ferramentas isoladas e chamáveis deterministicamente.

## 📸 Arquitetura Visual e Diagramas

Abaixo estão os diagramas oficiais que ilustram o funcionamento do **FarmaIA** e o seu Roteamento Categórico:

### 1. Arquitetura Geral do Sistema (MCP + LLM)
![Arquitetura Geral do FarmaIA](./docs/tcc/images/fig_mcp_arquitetura_geral.png)
*Figura 1: Visão macro do fluxo de execução, desde a entrada da dúvida até a geração da resposta mitigada.*

### 2. Pipeline de Classificação (Tag-and-Filter)
![Pipeline de Classificação](./docs/tcc/images/pipeline_classificacao.png)
*Figura 2: O mecanismo de Roteamento Categórico (k-NN) que substitui a busca vetorial tradicional.*

### 3. Diagrama do Prompt Farmacêutico
![Prompt Farmacêutico](./docs/tcc/images/prompt_farmaceutico.png)
*Figura 3: Estrutura do Prompt injetado no modelo Llama 3.3 70B via Groq.*

---

## 🏗️ Arquitetura (Tag-and-Filter)

```text
┌─────────────────┐
│   Dúvida Clínica│
└────────┬────────┘
         │
         ▼
┌───────────────────────┐
│  Extrator / Tagger    │ ← Roteia a intenção para a Seção Macro Correta (k-NN lexical)
└────────┬──────────────┘
         │
         ▼
┌───────────────────────┐
│  Filtro de Sentenças  │ ← Barra parágrafos irrelevantes usando as Tags do Banco
└────────┬──────────────┘
         │
         ▼
┌───────────────────────┐
│  Prompt Manager       │ ← Constrói o contexto hiper-focado
└────────┬──────────────┘
         │
         ▼
┌───────────────────────┐
│  Groq Llama 3.3 70B   │ ← Gera resposta final (livre de ruído estocástico)
└───────────────────────┘
```

---

## 🛠️ Stack Tecnológico

| Categoria | Tecnologia |
|----------|------------|
| **Runtime** | Node.js 18+ |
| **Deploy** | Vercel (Serverless Functions) / Fly.io (Docker fallback) |
| **Banco de Dados** | MongoDB Atlas |
| **LLM Provider** | Groq (Llama-3.3-70b-versatile) |
| **Frontend** | Vanilla HTML/CSS/JS (Interface com painel estilo Artifacts) |

---

## 🚀 Como Rodar e Fazer Deploy

### Pré-requisitos
- Node.js 18+
- String de Conexão do MongoDB Atlas
- Chave de API do Groq (`GROQ_API_KEY`)

### Instalação Local

```bash
git clone https://github.com/lpaulovale/BulaIA.git
cd farmaia-vercel
npm install
cp .env.example .env
```

### Configuração do `.env`

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/farmaia
PRIMARY_PROVIDER=groq
PRIMARY_MODEL=llama-3.3-70b-versatile
PRIMARY_API_KEY=gsk_sua_chave_groq_aqui
```

### Deploy no Vercel (Recomendado)

O projeto já contém a pasta `/api` configurada como **Vercel Serverless Functions**. Para publicar:

1. Conecte este repositório ao seu painel no **Vercel**.
2. Adicione as Variáveis de Ambiente (`MONGODB_URI`, `PRIMARY_PROVIDER`, etc.) nas configurações do Vercel.
3. O deploy será feito automaticamente em todo `git push`. O limite de execução de 10s no plano grátis não é um problema devido à velocidade dos LPUs do Groq.

---

## 📡 API Reference

### POST `/api/chat`

Endpoint principal para perguntas clínicas.

**Request Body:**
```json
{
  "message": "Quais são os efeitos colaterais do Paracetamol?",
  "mode": "patient",
  "sessionId": "unique-user-session-id"
}
```

**Response:**
```json
{
  "response": "Os efeitos colaterais do Paracetamol incluem...",
  "sources": [{ "name": "Paracetamol", "displayName": "Bula Paracetamol" }],
  "metadata": {
    "mode": "patient",
    "drugsDetected": ["Paracetamol"],
    "plan": { "topics": ["reacoes_adversas"] }
  }
}
```

---

## 🚧 Limitações Atuais (O Paradoxo do Roteamento)

Em nossos testes oficiais, o sistema atingiu um acerto final de **76,9%**. O grande achado da pesquisa foi o "Paradoxo do Roteamento": devido à forte redundância semântica nas bulas da ANVISA, muitas vezes o sistema roteava a dúvida para uma seção teoricamente errada, mas a resposta correta também constava lá.

Ainda assim, a principal defesa desta arquitetura é sua postura conservadora: quando a filtragem barra um texto irrelevante, o LLM se recusa a responder, convertendo alucinações severas em uma **Omissão Segura**.

---

## 📈 Trabalhos Futuros

1. **Roteamento Dinâmico Paralelo:** Criação de agentes que leem Múltiplas Seções (K > 1) simultaneamente para responder perguntas clínicas transversais.
2. **Ensemble de BERTs:** Treinar e testar pequenos classificadores especialistas e independentes para cada seção macro, substituindo o classificador geral único.
3. **Integração Ministerial (PCDT):** Conectar o FarmaIA aos Protocolos Clínicos e Diretrizes Terapêuticas do Ministério da Saúde para cruzar dados da bula com tratamentos oficiais do SUS.

---

## 👨‍💻 Autor

**Paulo Vale**  
Universidade Federal do Piauí (UFPI)  
[GitHub](https://github.com/lpaulovale)
