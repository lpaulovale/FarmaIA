const pptxgen = require("pptxgenjs");
const fs = require("fs");

let pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333" x 7.5"
pres.author = "Paulo Eduardo Borges do Vale";
pres.title = "FarmaIA - Defesa de TCC";

// ---------- SVG Icon Helper ----------
function getIconData(name) {
  const svgs = {
    context: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`,
    doctor_white: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 14h-2v2h-2v-2H9v-2h2v-2h2v2h2v2z"/></svg>`,
    network_white: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.8 1.1 2.8 2.5V11h-5.6V9.5C9.2 8.1 10.6 7 12 7zm3 9H9v-4h6v4z"/></svg>`,
    database_white: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 3c-4.97 0-9 1.57-9 3.5S7.03 10 12 10s9-1.57 9-3.5S16.97 3 12 3zm0 5.5c-3.86 0-7-1.12-7-2.5s3.14-2.5 7-2.5 7 1.12 7 2.5-3.14 2.5-7 2.5zM3 10.5v3c0 1.93 4.03 3.5 9 3.5s9-1.57 9-3.5v-3c0 1.93-4.03 3.5-9 3.5s-9-1.57-9-3.5zm0 5v3c0 1.93 4.03 3.5 9 3.5s9-1.57 9-3.5v-3c0 1.93-4.03 3.5-9 3.5s-9-1.57-9-3.5z"/></svg>`,
    problem: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
    justify: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`,
    objectives: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`,
    theory: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72l5 2.73 5-2.73v3.72z"/></svg>`,
    balance_white: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
    search_white: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
    route_white: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14H9v-2h3V9h3v8z"/></svg>`,
    methodology: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h2v5zm0 4h-2v-2h2v2z"/></svg>`,
    filter_white: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>`,
    idea_white: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>`,
    shield_white: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`,
    results: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>`,
    conclusion: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
    envelope: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
    github: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.47 2 2 6.47 2 12c0 4.42 2.86 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.69c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.58 9.58 0 015 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .26.18.58.69.48A10.01 10.01 0 0022 12c0-5.53-4.47-10-10-10z"/></svg>`,
    alert: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`
  };
  const svg = svgs[name] || svgs.context;
  return "image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

// ---------- Palette ----------
const NAVY_DARK   = "0B2942";
const NAVY        = "0B4F6C";
const TEAL         = "12778F";
const TEAL_LIGHT   = "E7F1F3";
const CORAL         = "C4574A";
const CORAL_LIGHT   = "F7E8E5";
const OFFWHITE       = "FAFBFB";
const WHITE         = "FFFFFF";
const INK           = "1B2B33";
const MUTED         = "5C7079";

const FONT_HEAD = "Cambria";
const FONT_BODY = "Calibri";

// ---------- Helpers ----------
function freshShadow(opts = {}) {
  return { type: "outer", color: "0B2942", blur: 8, offset: 3, angle: 45, opacity: 0.14, ...opts };
}

function pageNumber(slide, n, dark = false) {
  slide.addText(String(n).padStart(2, "0"), {
    x: 12.55, y: 7.08, w: 0.6, h: 0.32,
    fontFace: FONT_BODY, fontSize: 10, color: dark ? "9FB8C4" : MUTED,
    align: "right", margin: 0,
  });
}

function kicker(slide, text, color = TEAL) {
  slide.addText(text.toUpperCase(), {
    x: 0.6, y: 0.5, w: 8, h: 0.35,
    fontFace: FONT_BODY, fontSize: 12, bold: true, color,
    charSpacing: 2, margin: 0,
  });
}

function footerBrand(slide, dark = false) {
  slide.addText("FarmaIA  ·  TCC — Ciência da Computação — UFPI", {
    x: 0.6, y: 7.08, w: 6, h: 0.32,
    fontFace: FONT_BODY, fontSize: 10, color: dark ? "9FB8C4" : MUTED, margin: 0,
  });
}

function iconBadge(slide, iconName, x, y, d = 0.62, bg = NAVY, iconScale = 0.52) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: bg } });
  const iw = d * iconScale, ih = d * iconScale;
  slide.addImage({ data: getIconData(iconName), x: x + (d - iw) / 2, y: y + (d - ih) / 2, w: iw, h: ih });
}

function bulletBlock(slide, items, opts) {
  const arr = items.map((t, i) => ({
    text: t,
    options: { bullet: { code: "2022", indent: 18 }, breakLine: i < items.length - 1, color: opts.color || INK,
      fontSize: opts.fontSize || 14.5, paraSpaceAfter: opts.spaceAfter || 12 },
  }));
  slide.addText(arr, {
    x: opts.x, y: opts.y, w: opts.w, h: opts.h,
    fontFace: FONT_BODY, valign: "top", margin: 0, lineSpacingMultiple: 1.12,
  });
}

// ============================================================
// SLIDE 1 — CAPA
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: NAVY_DARK };
  s.addShape(pres.shapes.OVAL, { x: 9.6, y: -1.6, w: 6.2, h: 6.2, fill: { color: "123A57" } });
  s.addShape(pres.shapes.OVAL, { x: 11.2, y: 4.2, w: 3.6, h: 3.6, fill: { color: "0F3348" } });
  s.addText("TRABALHO DE CONCLUSÃO DE CURSO", {
    x: 0.9, y: 1.55, w: 8, h: 0.4, fontFace: FONT_BODY, fontSize: 13, bold: true, color: "5FB8CE", charSpacing: 3, margin: 0,
  });
  s.addText("FarmaIA", {
    x: 0.85, y: 2.0, w: 9.5, h: 1.15, fontFace: FONT_HEAD, fontSize: 60, bold: true, color: WHITE, margin: 0,
  });
  s.addText("Filtragem Estruturada de Sentenças como Alternativa ao RAG para Consulta de\nBulas Regulatórias via Model Context Protocol", {
      x: 0.9, y: 3.15, w: 9.7, h: 1.0, fontFace: FONT_BODY, fontSize: 17, color: "CFE3EA", margin: 0, lineSpacingMultiple: 1.25,
  });
  s.addText([
      { text: "Paulo Eduardo Borges do Vale", options: { breakLine: true, bold: true, color: WHITE, fontSize: 15 } },
      { text: "Orientador: Prof. Dr. Pedro Santos Neto", options: { breakLine: true, color: "AFC9D3", fontSize: 13 } },
      { text: "Bacharelado em Ciência da Computação  ·  Universidade Federal do Piauí (UFPI)", options: { breakLine: true, color: "AFC9D3", fontSize: 13 } },
      { text: "[Inserir Data da Defesa]", options: { color: "7E9AA6", fontSize: 12 } },
    ], { x: 0.9, y: 5.35, w: 9, h: 1.6, fontFace: FONT_BODY, margin: 0, lineSpacingMultiple: 1.35 }
  );
  s.addText("UFPI  ·  CIÊNCIA DA COMPUTAÇÃO", {
    x: 9.9, y: 6.95, w: 3.0, h: 0.35, fontFace: FONT_BODY, fontSize: 10, color: "6A8996", align: "right", charSpacing: 1.5, margin: 0,
  });
}

// ============================================================
// SLIDE 2 — INTRODUÇÃO
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "context", 0.6, 0.5, 0.62, NAVY);
  kicker(s, "Introdução", TEAL);
  s.addText("O Desafio da IA na Saúde", { x: 0.6, y: 0.98, w: 8, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  bulletBlock(s, [
      "O potencial: LLMs são incríveis para sintetizar informações clínicas.",
      "O perigo: Alucinações factuais (inventar posologias, ignorar contraindicações).",
      "A lacuna do RAG Clássico: Injeta seções inteiras de bulas, criando ruído cognitivo.",
      "O objetivo: Criar uma arquitetura agêntica que filtra sentenças antes da IA ler."
    ], { x: 0.6, y: 2.0, w: 6.9, h: 4.4, fontSize: 15.5, spaceAfter: 18 }
  );

  const cardY = 2.15, cardW = 3.55, cardH = 1.15, cardX = 8.05;
  function flowCard(y, icon, label, sub) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cardX, y, w: cardW, h: cardH, rectRadius: 0.09, fill: { color: WHITE }, shadow: freshShadow() });
    iconBadge(s, icon, cardX + 0.22, y + (cardH - 0.5) / 2, 0.5, NAVY, 0.5);
    s.addText(label, { x: cardX + 0.9, y: y + 0.18, w: cardW - 1.05, h: 0.4, fontFace: FONT_BODY, fontSize: 13.5, bold: true, color: INK, margin: 0 });
    s.addText(sub, { x: cardX + 0.9, y: y + 0.56, w: cardW - 1.05, h: 0.5, fontFace: FONT_BODY, fontSize: 10.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.1 });
  }
  flowCard(cardY, "doctor_white", "Profissional de Saúde", "Necessita de consulta rápida e segura");
  flowCard(cardY + 1.55, "network_white", "Sistema de IA (FarmaIA)", "Interface de extração factual estruturada");
  flowCard(cardY + 3.1, "database_white", "Base Regulatória", "Bulas eletrônicas (RDC 47/ANVISA)");

  for (const y of [cardY + cardH + 0.03, cardY + 1.55 + cardH + 0.03]) {
    s.addText("▾", { x: cardX + cardW / 2 - 0.15, y, w: 0.3, h: 0.32, fontSize: 16, color: TEAL, align: "center", margin: 0 });
  }
  footerBrand(s); pageNumber(s, 2);
}

// ============================================================
// SLIDE 3 — O PROBLEMA
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "problem", 0.6, 0.5, 0.62, CORAL);
  kicker(s, "O Problema", CORAL);
  s.addText("Problemas e Lacunas Tecnológicas", { x: 0.6, y: 0.98, w: 10, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  const problems = [
    { t: "Alucinações factuais", d: "LLMs são intrinsecamente suscetíveis a inventar dados em domínios críticos." },
    { t: "Ruído de contexto no RAG", d: "Injetar textos gigantes (bulas inteiras) causa o fenômeno de 'lost in the middle'." },
    { t: "Colisão léxica vetorial", d: "A busca vetorial clássica confunde frases idênticas que estão em seções diferentes." },
    { t: "Falta de Auditabilidade", d: "Precisamos de ferramentas locais padronizadas que deixem claro de onde a IA tirou o dado." },
  ];
  const cols = 2, gapX = 0.35, gapY = 0.35, cardW = (12.1 - gapX) / cols, cardH = 1.95;
  const startX = 0.6, startY = 2.05;
  problems.forEach((p, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = startX + col * (cardW + gapX), y = startY + row * (cardH + gapY);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cardW, h: cardH, rectRadius: 0.08, fill: { color: WHITE }, shadow: freshShadow() });
    s.addShape(pres.shapes.OVAL, { x: x + 0.28, y: y + 0.28, w: 0.46, h: 0.46, fill: { color: CORAL_LIGHT } });
    s.addText(String(i + 1), { x: x + 0.28, y: y + 0.28, w: 0.46, h: 0.46, fontFace: FONT_HEAD, fontSize: 16, bold: true, color: CORAL, align: "center", valign: "middle", margin: 0 });
    s.addText(p.t, { x: x + 0.9, y: y + 0.24, w: cardW - 1.15, h: 0.5, fontFace: FONT_BODY, fontSize: 14.5, bold: true, color: INK, margin: 0 });
    s.addText(p.d, { x: x + 0.9, y: y + 0.68, w: cardW - 1.15, h: 1.15, fontFace: FONT_BODY, fontSize: 11.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.22 });
  });
  footerBrand(s); pageNumber(s, 3);
}

// ============================================================
// SLIDE 4 — A JORNADA DO DATASET
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "database_white", 0.6, 0.5, 0.62, NAVY);
  kicker(s, "A Jornada dos Dados", TEAL);
  s.addText("O Obstáculo: Ausência de Dados Mapeados", { x: 0.6, y: 0.98, w: 10, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  bulletBlock(s, [
      "Problema: Não existia um dataset público estruturado de bulas brasileiras.",
      "Ação: Coleta e processamento de 60 bulas em PDF da ANVISA.",
      "Granularidade Extrema: O Nemotron analisou todas as seções macro, dissecou cada parágrafo e separou o texto sentença por sentença (por pontos).",
      "Resultado: Apenas 60 bulas foram suficientes para gerar mais de 14.000 TAGS exclusivas (rótulos de intenção) não repetidas.",
      "Isolamento (Llama 3.1): Utilizado estritamente para o processamento final das respostas, evitando contaminação."
    ], { x: 0.6, y: 2.0, w: 11, h: 4.4, fontSize: 15.5, spaceAfter: 18 }
  );
  footerBrand(s); pageNumber(s, 4);
}

// ============================================================
// SLIDE 5 — CONSTRUINDO O BENCHMARK
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "methodology", 0.6, 0.5, 0.62, TEAL);
  kicker(s, "Benchmark", TEAL);
  s.addText("Construindo o Dataset Ouro", { x: 0.6, y: 0.98, w: 10, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  bulletBlock(s, [
      "Para validar a segurança, precisávamos de perguntas que quebrassem os roteadores convencionais.",
      "Criação do Dataset Ouro: 140 cenários clínicos curados (Ajuste de dose, Contraindicações, Interações).",
      "Perguntas \"complexificadas\": Em vez de consultas literais (\"Qual a posologia?\"), testamos intersecções críticas.",
      "Exemplo: \"Paciente com insuficiência renal crônica pode tomar a dose adulta?\"",
      "Objetivo: Forçar o sistema a cruzar intenções restritivas e revelar suas fraquezas de segurança."
    ], { x: 0.6, y: 2.0, w: 11, h: 4.4, fontSize: 15.5, spaceAfter: 18 }
  );
  footerBrand(s); pageNumber(s, 5);
}

// ============================================================
// SLIDE 6 — JUSTIFICATIVA (RISK)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "justify", 0.6, 0.5, 0.62, NAVY);
  kicker(s, "Justificativa", TEAL);
  s.addText("Por que Filtrar em vez de Gerar?", { x: 0.6, y: 0.98, w: 8, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  bulletBlock(s, [
      "A segurança médica não tolera informações estocásticas ou inventadas por IA.",
      "Omissões seguras são imensamente preferíveis a falhas clínicas severas.",
      "O protocolo MCP padroniza as ferramentas para auditoria externa.",
    ], { x: 0.6, y: 2.0, w: 6.5, h: 4.3, fontSize: 15, spaceAfter: 18 }
  );

  const rx = 7.55, ry = 2.05, rw = 5.15;
  s.addText("Perfil de Risco Comparado", { x: rx, y: ry, w: rw, h: 0.4, fontFace: FONT_BODY, fontSize: 12, bold: true, color: MUTED, charSpacing: 1, margin: 0 });

  function riskRow(y, label, tag, tagColor, tagBg, desc) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: rx, y, w: rw, h: 1.35, rectRadius: 0.08, fill: { color: WHITE }, shadow: freshShadow() });
    s.addText(label, { x: rx + 0.3, y: y + 0.18, w: rw - 0.6, h: 0.4, fontFace: FONT_BODY, fontSize: 14, bold: true, color: INK, margin: 0 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: rx + rw - 1.85, y: y + 0.17, w: 1.55, h: 0.4, rectRadius: 0.2, fill: { color: tagBg } });
    s.addText(tag, { x: rx + rw - 1.85, y: y + 0.17, w: 1.55, h: 0.4, fontFace: FONT_BODY, fontSize: 10.5, bold: true, color: tagColor, align: "center", valign: "middle", margin: 0 });
    s.addText(desc, { x: rx + 0.3, y: y + 0.62, w: rw - 0.6, h: 0.65, fontFace: FONT_BODY, fontSize: 11, color: MUTED, margin: 0, lineSpacingMultiple: 1.2 });
  }
  riskRow(ry + 0.55, "RAG Tradicional", "RISCO ALTO", CORAL, CORAL_LIGHT, "Pode gerar respostas incorretas com alta confiança (alucinação ativa).");
  riskRow(ry + 2.15, "Filtragem Estruturada (FarmaIA)", "RISCO MITIGADO", TEAL, TEAL_LIGHT, "Prefere omitir a responder incorretamente — falha de forma segura.");

  footerBrand(s); pageNumber(s, 6);
}

// ============================================================
// SLIDE 7 — OBJETIVOS
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "objectives", 0.6, 0.5, 0.62, NAVY);
  kicker(s, "Objetivos", TEAL);
  s.addText("Objetivos do Trabalho", { x: 0.6, y: 0.98, w: 8, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.95, w: 12.1, h: 1.0, rectRadius: 0.09, fill: { color: NAVY } });
  s.addText("OBJETIVO GERAL", { x: 0.95, y: 2.08, w: 3, h: 0.3, fontFace: FONT_BODY, fontSize: 10.5, bold: true, color: "8FC7DA", charSpacing: 1.5, margin: 0 });
  s.addText("Propor a arquitetura FarmaIA, baseada no Model Context Protocol (MCP), para consultas estáveis e seguras de bulas regulatórias.",
    { x: 0.95, y: 2.38, w: 11.4, h: 0.55, fontFace: FONT_BODY, fontSize: 14.5, color: WHITE, margin: 0, lineSpacingMultiple: 1.15 }
  );

  s.addText("OBJETIVOS ESPECÍFICOS", { x: 0.6, y: 3.25, w: 5, h: 0.35, fontFace: FONT_BODY, fontSize: 11.5, bold: true, color: MUTED, charSpacing: 1.5, margin: 0 });

  const specifics = [
    { verb: "Substituir", rest: "a similaridade vetorial por roteamento categórico via taxonomia." },
    { verb: "Filtrar", rest: "o contexto no nível da sentença, em vez de injetar seções completas." },
    { verb: "Construir", rest: "um Dicionário Semântico de Intenções regulatórias da ANVISA." },
    { verb: "Avaliar", rest: "a segurança do modelo via pipeline de juízes automáticos assíncronos." },
  ];
  const gw = (12.1 - 3 * 0.3) / 4;
  specifics.forEach((sp, i) => {
    const x = 0.6 + i * (gw + 0.3), y = 3.68;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: gw, h: 2.55, rectRadius: 0.08, fill: { color: WHITE }, shadow: freshShadow() });
    s.addShape(pres.shapes.OVAL, { x: x + (gw - 0.42) / 2, y: y + 0.25, w: 0.42, h: 0.42, fill: { color: TEAL_LIGHT } });
    s.addText(String(i + 1), { x: x + (gw - 0.42) / 2, y: y + 0.25, w: 0.42, h: 0.42, fontFace: FONT_HEAD, fontSize: 15, bold: true, color: TEAL, align: "center", valign: "middle", margin: 0 });
    s.addText(sp.verb, { x: x + 0.15, y: y + 0.85, w: gw - 0.3, h: 0.35, fontFace: FONT_BODY, fontSize: 13.5, bold: true, color: NAVY, align: "center", margin: 0 });
    s.addText(sp.rest, { x: x + 0.2, y: y + 1.2, w: gw - 0.4, h: 1.2, fontFace: FONT_BODY, fontSize: 10.8, color: MUTED, align: "center", margin: 0, lineSpacingMultiple: 1.22 });
  });
  footerBrand(s); pageNumber(s, 7);
}

// ============================================================
// SLIDE 8 — A EVOLUÇÃO DO ROTEAMENTO E INTEGRAÇÃO (NEW)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "route_white", 0.6, 0.5, 0.62, NAVY);
  kicker(s, "Desenvolvimento", TEAL);
  s.addText("A Evolução do Roteador (Planner)", { x: 0.6, y: 0.98, w: 11, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  bulletBlock(s, [
      "O Desafio do BERT Único: Como o processamento gerou 14.000 TAGS não repetidas (14.000 classes de saída!), um classificador clássico único teria altíssima taxa de erro preditivo.",
      "A Tentativa Generativa: Modelos pequenos (<2B) quebravam o JSON. Modelos maiores (Llama 8B) formavam o JSON, mas alucinavam as chaves da taxonomia.",
      "A Virada Arquitetural (O Pivot): A tentativa inicial de usar o dataset apenas para treinar a IA falhou.",
      "O Reaproveitamento de Ouro: O esforço não foi perdido. O dataset massivo (todas as sentenças perfeitamente classificadas por tag) tornou-se a nossa própria solução.",
      "Integração Banco-Aplicação: Convertemos o dataset em vetores no MongoDB. Agora, a aplicação cruza a query do usuário com essas sentenças classificadas para encontrar e extrair exatamente o parágrafo que contém a resposta, eliminando o LLM do roteamento."
    ], { x: 0.6, y: 2.0, w: 11.5, h: 4.8, fontSize: 14.2, spaceAfter: 14 }
  );
  footerBrand(s); pageNumber(s, 8);
}


// ============================================================
// SLIDE 9 — ARQUITETURA
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: NAVY_DARK };
  s.addShape(pres.shapes.OVAL, { x: 10.6, y: -1.8, w: 5.5, h: 5.5, fill: { color: "123A57" } });
  kicker(s, "Desenvolvimento", "5FB8CE");
  s.addText("Arquitetura Tag-and-Filter (FarmaIA)", { x: 0.6, y: 0.98, w: 10.5, h: 0.7, fontFace: FONT_HEAD, fontSize: 28, bold: true, color: WHITE, margin: 0 });

  const stages = [
    { icon: "route_white", t: "Planner", d: "Classificação da intenção médica via busca vetorial no MongoDB + Extração Fuzzy em JS." },
    { icon: "filter_white", t: "Tagger", d: "Segmenta e filtra o texto no nível da sentença, rejeitando ruído semântico." },
    { icon: "idea_white", t: "Generator", d: "Unified Prompt Mode atuando como \"farmacêutico clínico\" só sobre sentenças validadas." },
  ];
  const cw = (12.1 - 2 * 0.4) / 3, y0 = 2.05, startX = 0.6;
  stages.forEach((st, i) => {
    const x = startX + i * (cw + 0.4);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: y0, w: cw, h: 2.85, rectRadius: 0.09, fill: { color: "123551" } });
    iconBadge(s, st.icon, x + (cw - 0.68) / 2, y0 + 0.3, 0.68, TEAL, 0.5);
    s.addText(st.t, { x: x + 0.2, y: y0 + 1.2, w: cw - 0.4, h: 0.4, fontFace: FONT_HEAD, fontSize: 16, bold: true, color: WHITE, align: "center", margin: 0 });
    s.addText(st.d, { x: x + 0.25, y: y0 + 1.65, w: cw - 0.5, h: 1.1, fontFace: FONT_BODY, fontSize: 11, color: "C4D8E0", align: "center", margin: 0, lineSpacingMultiple: 1.25 });
    if (i < stages.length - 1) {
      s.addText("→", { x: x + cw + 0.02, y: y0 + 1.15, w: 0.36, h: 0.5, fontFace: FONT_BODY, fontSize: 22, bold: true, color: "5FB8CE", align: "center", margin: 0 });
    }
  });

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 5.2, w: 12.1, h: 1.15, rectRadius: 0.08, fill: { color: "0F3348" } });
  iconBadge(s, "shield_white", 0.85, 5.2 + (1.15 - 0.55) / 2, 0.55, CORAL, 0.5);
  s.addText("Transparência (MCP)", { x: 1.65, y: 5.34, w: 3, h: 0.4, fontFace: FONT_BODY, fontSize: 13, bold: true, color: WHITE, margin: 0 });
  s.addText("A integração via MCP expõe, no front-end da aplicação, os parágrafos exatos do banco consumidos pela IA para gerar a resposta.",
    { x: 1.65, y: 5.7, w: 10.6, h: 0.55, fontFace: FONT_BODY, fontSize: 11.5, color: "C4D8E0", margin: 0, lineSpacingMultiple: 1.2 }
  );
  pageNumber(s, 9, true); footerBrand(s, true);
}

// ============================================================
// SLIDE 10 — METODOLOGIA JUIZ
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "balance_white", 0.6, 0.5, 0.62, NAVY);
  kicker(s, "Metodologia", TEAL);
  s.addText("Avaliação Assíncrona (LLM-como-Juiz)", { x: 0.6, y: 0.98, w: 10, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  bulletBlock(s, [
      "Como avaliar 140 respostas com rigor médico sem viés humano limitante?",
      "Solução: Um juiz autônomo baseado em um gabarito implacável (Acerto, Omissão, Alucinação/VETO).",
      "Defesa Metodológica contra o Viés de Circularidade (Auto-preferência):",
      "Geração: Llama 3.1 70B (gerou o texto base das respostas).",
      "Julgamento: Nemotron-3 Ultra 550B (atuou estritamente corrigindo).",
      "Ao cruzar famílias de modelos distintas, o desenho metodológico anula o favoritismo estatístico."
    ], { x: 0.6, y: 2.0, w: 11, h: 4.4, fontSize: 15.5, spaceAfter: 15 }
  );
  footerBrand(s); pageNumber(s, 10);
}

// ============================================================
// SLIDE 11 — RESULTADOS
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "results", 0.6, 0.5, 0.62, NAVY);
  kicker(s, "Resultados", TEAL);
  s.addText("Desempenho Geral", { x: 0.6, y: 0.98, w: 9.5, h: 0.7, fontFace: FONT_HEAD, fontSize: 28, bold: true, color: NAVY_DARK, margin: 0 });

  function statCard(x, y, w, h, big, label, sub) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: WHITE }, shadow: freshShadow() });
    s.addText(big, { x: x + 0.2, y: y + 0.14, w: w - 0.4, h: 0.75, fontFace: FONT_HEAD, fontSize: 34, bold: true, color: TEAL, margin: 0 });
    s.addText(label, { x: x + 0.2, y: y + 0.85, w: w - 0.4, h: 0.35, fontFace: FONT_BODY, fontSize: 12, bold: true, color: INK, margin: 0 });
    s.addText(sub, { x: x + 0.2, y: y + 1.18, w: w - 0.4, h: 0.55, fontFace: FONT_BODY, fontSize: 9.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.15 });
  }
  const sw = (5.85 - 0.25) / 2;
  statCard(0.6, 2.05, sw, 1.85, "-61,1%", "Consumo de tokens", "Redução de ruído via injeção pontual.");
  statCard(0.6 + sw + 0.25, 2.05, sw, 1.85, "84,42", "Fidelidade Clínica", "Score absoluto mantido empatado.");

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 4.05, w: 5.85, h: 2.35, rectRadius: 0.08, fill: { color: TEAL_LIGHT } });
  iconBadge(s, "shield_white", 0.85, 4.28, 0.55, TEAL, 0.5);
  s.addText("O Empate Técnico", { x: 1.65, y: 4.32, w: 4, h: 0.35, fontFace: FONT_BODY, fontSize: 13, bold: true, color: NAVY, margin: 0 });
  s.addText("A métrica agregada prova que as duas arquiteturas empatam tecnicamente em fidelidade geral — mas o segredo da segurança repousa no perfil de falha, não na média bruta.",
    { x: 0.85, y: 4.75, w: 5.35, h: 1.5, fontFace: FONT_BODY, fontSize: 11.5, color: INK, margin: 0, lineSpacingMultiple: 1.28 }
  );

  s.addText("Consumo Médio de Tokens de Contexto", { x: 6.75, y: 2.05, w: 5.95, h: 0.35, fontFace: FONT_BODY, fontSize: 12, bold: true, color: MUTED, margin: 0 });
  s.addChart(
    pres.charts.BAR,
    [{ name: "Tokens", labels: ["RAG Tradicional", "FarmaIA"], values: [2501, 971] }],
    {
      x: 6.75, y: 2.4, w: 5.95, h: 4.0, barDir: "col", chartColors: [CORAL, TEAL], chartArea: { fill: { color: WHITE } },
      catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10,
      valGridLine: { color: "E2E8EC", size: 0.5 }, catGridLine: { style: "none" }, showValue: true, dataLabelPosition: "outEnd", dataLabelColor: INK, dataLabelFontSize: 12, dataLabelFontBold: true, showLegend: false, showTitle: false, barGapWidthPct: 60,
    }
  );
  footerBrand(s); pageNumber(s, 11);
}

// ============================================================
// SLIDE 12 — O ACHADO FUNDAMENTAL
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "search_white", 0.6, 0.5, 0.62, CORAL);
  kicker(s, "Resultados", CORAL);
  s.addText("O Achado Fundamental: Perfil de Erro", { x: 0.6, y: 0.98, w: 10, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  bulletBlock(s, [
      "O ganho do FarmaIA NÃO está no volume total de acertos, e sim em como ele falha.",
      "Cenário Ideal (Roteamento Perfeito): RAG acerta um pouco mais, pois a filtragem do FarmaIA pode quebrar o contexto de frases complexas.",
      "Cenário Adverso (Roteamento Errado): É aqui que a mágica acontece.",
      "Quando o sistema é enganado pela ambiguidade, o RAG falha lendo coisas que não deveria e gera respostas perigosas.",
      "Diante da ambiguidade, a filtragem do FarmaIA atua como barreira de contenção. Ele assume a ausência de informação em vez de arriscar um palpite médico."
    ], { x: 0.6, y: 2.0, w: 11, h: 4.4, fontSize: 15.5, spaceAfter: 18 }
  );
  footerBrand(s); pageNumber(s, 12);
}

// ============================================================
// SLIDE 13 — O EXEMPLO PRÁTICO
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: NAVY_DARK };
  iconBadge(s, "shield_white", 0.6, 0.5, 0.62, CORAL);
  kicker(s, "Resultados", CORAL_LIGHT);
  s.addText("O Exemplo Clínico Prático", { x: 0.6, y: 0.98, w: 10, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: WHITE, margin: 0 });

  s.addText("Pergunta Real do Benchmark: \"Pacientes com insuficiência hepática podem usar [Fármaco]?\"", { x: 0.6, y: 2.0, w: 11, h: 0.5, fontFace: FONT_BODY, fontSize: 17, bold: true, color: "5FB8CE", margin: 0 });
  
  bulletBlock(s, [
      "O problema: O roteador enviou o LLM para ler \"Posologia\" em vez de \"Contraindicações\".",
      "Reação do RAG: Leu a posologia, achou as gramas genéricas e alucinou: \"Sim, pode usar, a dose é X\". Resultado: Risco Fatal (Nota Zero).",
      "Reação do FarmaIA: O filtro entrou em ação. A seção era Posologia, mas a intenção era restritiva. Ele barrou o texto e respondeu: \"A bula não informa restrições\".",
      "Conclusão de Segurança: O FarmaIA sofreu penalidade na nota por omitir o dado real, mas salvou a integridade da ferramenta."
    ], { x: 0.6, y: 2.8, w: 11, h: 4.0, fontSize: 16.5, spaceAfter: 20, color: WHITE }
  );
  footerBrand(s, true); pageNumber(s, 13, true);
}

// ============================================================
// SLIDE 14 — LIMITAÇÕES E ALUCINAÇÕES
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "alert", 0.6, 0.5, 0.62, CORAL);
  kicker(s, "Análise Crítica", CORAL);
  s.addText("Limitações e Alucinações Residuais", { x: 0.6, y: 0.98, w: 10, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  bulletBlock(s, [
      "O FarmaIA não é infalível. Nossa arquitetura atual possui limitações que geram alucinações residuais:",
      "1. Cegueira de Roteamento Único",
      "Atualmente, o classificador mapeia a pergunta para apenas uma seção da bula.",
      "Perguntas transversais (ex: \"Qual a dose para gestantes?\") exigem ler 'Posologia' e 'Gravidez'.",
      "Ao olhar só para uma seção, o sistema omite dados vitais e, raramente, tenta extrapolar.",
      "2. Alucinações Residuais de Síntese",
      "O LLM (Generator) às vezes tenta preencher lacunas quando o filtro entrega poucas sentenças.",
      "Se o Tagger deixa passar uma frase parcialmente ambígua, o Llama pode tentar deduzir a dose máxima."
    ], { x: 0.6, y: 2.0, w: 11, h: 4.4, fontSize: 15.5, spaceAfter: 12 }
  );
  footerBrand(s); pageNumber(s, 14);
}

// ============================================================
// SLIDE 15 — CONCLUSÃO
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "conclusion", 0.6, 0.5, 0.62, NAVY);
  kicker(s, "Conclusão", TEAL);
  s.addText("Conclusões e Trabalhos Futuros", { x: 0.6, y: 0.98, w: 9.5, h: 0.7, fontFace: FONT_HEAD, fontSize: 28, bold: true, color: NAVY_DARK, margin: 0 });

  const lx = 0.6, colW = 5.85;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: lx, y: 2.05, w: colW, h: 4.35, rectRadius: 0.09, fill: { color: WHITE }, shadow: freshShadow() });
  iconBadge(s, "conclusion", lx + 0.3, 2.32, 0.55, TEAL, 0.5);
  s.addText("Contribuição", { x: lx + 1.05, y: 2.36, w: 4, h: 0.45, fontFace: FONT_HEAD, fontSize: 16, bold: true, color: NAVY_DARK, margin: 0 });
  bulletBlock(s, [
      "A filtragem estruturada converte efetivamente alucinações severas em omissões seguras.",
      "Reduz custo computacional em mais de 60% mantendo fidelidade equivalente.",
      "A integração de banco de dados via vetores garante previsibilidade sobre a geração textual.",
    ], { x: lx + 0.3, y: 3.05, w: colW - 0.6, h: 3.2, fontSize: 13, spaceAfter: 14 }
  );

  const rx = lx + colW + 0.35;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: rx, y: 2.05, w: colW, h: 4.35, rectRadius: 0.09, fill: { color: NAVY } });
  iconBadge(s, "idea_white", rx + 0.3, 2.32, 0.55, "5FB8CE", 0.5);
  s.addText("Próximos Passos", { x: rx + 1.05, y: 2.32, w: colW - 1.3, h: 0.55, fontFace: FONT_HEAD, fontSize: 15.5, bold: true, color: WHITE, margin: 0, lineSpacingMultiple: 1.05 });
  bulletBlock(s, [
      "Implementação de roteamento dinâmico paralelo (agentes que leem mais de uma seção simultaneamente).",
      "Testar uma arquitetura 'Ensemble de BERTs' (treinar um classificador dedicado por seção em vez de um único modelo).",
      "Testes controlados in-loco com farmacêuticos clínicos reais.",
    ], { x: rx + 0.3, y: 3.05, w: colW - 0.6, h: 3.2, fontSize: 13, spaceAfter: 14, color: "DCE8EC" }
  );
  footerBrand(s); pageNumber(s, 15);
}

// ============================================================
// SLIDE 16 — ENCERRAMENTO
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: NAVY_DARK };
  s.addShape(pres.shapes.OVAL, { x: -2.2, y: 3.8, w: 6.5, h: 6.5, fill: { color: "123A57" } });
  s.addShape(pres.shapes.OVAL, { x: 10.8, y: -2.2, w: 5.5, h: 5.5, fill: { color: "0F3348" } });

  s.addText("Obrigado pela atenção!", { x: 0.9, y: 2.05, w: 10, h: 1.0, fontFace: FONT_HEAD, fontSize: 42, bold: true, color: WHITE, margin: 0 });
  s.addText("FarmaIA — Perguntas e sugestões são bem-vindas.", { x: 0.95, y: 2.9, w: 9, h: 0.5, fontFace: FONT_BODY, fontSize: 15, color: "AFC9D3", margin: 0 });

  function contactRow(y, icon, text) {
    iconBadge(s, icon, 0.95, y, 0.5, "123A57", 0.5);
    s.addText(text, { x: 1.65, y: y + 0.02, w: 8.5, h: 0.46, fontFace: FONT_BODY, fontSize: 13.5, color: "DCE8EC", valign: "middle", margin: 0 });
  }
  contactRow(4.05, "envelope", "paulo@ufpi.edu.br");
  contactRow(4.7, "github", "github.com/lpaulovale/FarmaIA  ·  código aberto e dados disponíveis para pesquisa");

  pageNumber(s, 16, true);
}

pres.writeFile({ fileName: "/Users/Paulo/Downloads/FarmaIA_TCC_Defesa_Final.pptx" }).then(() => {
  console.log("PPTX generation complete!");
});
