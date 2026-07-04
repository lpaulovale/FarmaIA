const pptxgen = require("pptxgenjs");
const path = require("path");
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
      { text: "Julho de 2026", options: { color: "7E9AA6", fontSize: 12 } },
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
  footerBrand(s); pageNumber(s, 2); }

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
  footerBrand(s); pageNumber(s, 3); s.addNotes("Na abordagem tradicional, se o RAG injeta texto demais, a IA se perde no meio (o fenômeno de 'lost in the middle') e começa a inventar dados, como posologias que não existem. Além disso, a busca vetorial comum sofre de colisões léxicas e falta de auditabilidade. O médico não sabe de qual linha da bula a IA tirou a resposta."); s.addNotes("Na abordagem tradicional, se o RAG injeta texto demais, a IA se perde no meio (o fenômeno de 'lost in the middle') e começa a inventar dados, como posologias que não existem. Além disso, a busca vetorial comum sofre de colisões léxicas e falta de auditabilidade. O médico não sabe de qual linha da bula a IA tirou a resposta."); s.addNotes("Na abordagem tradicional, se o RAG injeta texto demais, a IA se perde no meio (o fenômeno de 'lost in the middle') e começa a inventar dados, como posologias que não existem. Além disso, a busca vetorial comum sofre de colisões léxicas e falta de auditabilidade. O médico não sabe de qual linha da bula a IA tirou a resposta."); s.addNotes("Na abordagem tradicional, se o RAG injeta texto demais, a IA se perde no meio (o fenômeno de 'lost in the middle') e começa a inventar dados, como posologias que não existem. Além disso, a busca vetorial comum sofre de colisões léxicas e falta de auditabilidade. O médico não sabe de qual linha da bula a IA tirou a resposta."); s.addNotes("Na abordagem tradicional, se o RAG injeta texto demais, a IA se perde no meio (o fenômeno de 'lost in the middle') e começa a inventar dados, como posologias que não existem. Além disso, a busca vetorial comum sofre de colisões léxicas e falta de auditabilidade. O médico não sabe de qual linha da bula a IA tirou a resposta.");
}

// ============================================================
// SLIDE 4 — A JORNADA DO DATASET
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "database_white", 0.6, 0.5, 0.62, NAVY);
  kicker(s, "A Jornada dos Dados", TEAL);
  s.addText("O Achado Fundamental", { x: 0.6, y: 0.98, w: 10, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  bulletBlock(s, [
      "Problema: Não existia um dataset público estruturado de bulas brasileiras.",
      "Ação: Coleta e processamento de 60 bulas em PDF da ANVISA.",
      "Granularidade Extrema: O Nemotron analisou todas as seções macro, dissecou cada parágrafo e separou o texto sentença por sentença (por pontos).",
      "Resultado: Apenas 60 bulas foram suficientes para gerar mais de 14.000 TAGS exclusivas (rótulos de intenção) não repetidas.",
      "Isolamento (Llama 3.1): Utilizado estritamente para o processamento final das respostas, evitando contaminação."
    ], { x: 0.6, y: 2.0, w: 11, h: 4.4, fontSize: 15.5, spaceAfter: 18 }
  );
  footerBrand(s); pageNumber(s, 4); }

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
      "Para validar a segurança, precisávamos de perguntas que testassem o limite dos roteadores convencionais.",
      "Criação do Dataset (Padrão Ouro): 140 cenários clínicos curados (Ajuste de dose, Contraindicações, Interações).",
      "Perguntas de intersecção: Em vez de consultas literais (\"Qual a posologia?\"), testamos cenários críticos transversais.",
      "Exemplo: \"Paciente com insuficiência renal crônica pode tomar a dose adulta?\"",
      "Objetivo: Forçar o sistema a cruzar intenções restritivas e revelar suas fraquezas de segurança."
    ], { x: 0.6, y: 2.0, w: 11, h: 4.4, fontSize: 15.5, spaceAfter: 18 }
  );
  footerBrand(s); pageNumber(s, 5); }

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

  footerBrand(s); pageNumber(s, 6); s.addNotes("Por que optamos por filtrar e não por deixar a IA livre? Porque na medicina, é preferível o sistema falar 'Não encontrei a resposta' (omissão segura) do que inventar uma dose mortal (alucinação ativa). Nosso objetivo é mitigar o risco estruturalmente."); s.addNotes("Por que optamos por filtrar e não por deixar a IA livre? Porque na medicina, é preferível o sistema falar 'Não encontrei a resposta' (omissão segura) do que inventar uma dose mortal (alucinação ativa). Nosso objetivo é mitigar o risco estruturalmente."); s.addNotes("Por que optamos por filtrar e não por deixar a IA livre? Porque na medicina, é preferível o sistema falar 'Não encontrei a resposta' (omissão segura) do que inventar uma dose mortal (alucinação ativa). Nosso objetivo é mitigar o risco estruturalmente."); s.addNotes("Por que optamos por filtrar e não por deixar a IA livre? Porque na medicina, é preferível o sistema falar 'Não encontrei a resposta' (omissão segura) do que inventar uma dose mortal (alucinação ativa). Nosso objetivo é mitigar o risco estruturalmente."); s.addNotes("Por que optamos por filtrar e não por deixar a IA livre? Porque na medicina, é preferível o sistema falar 'Não encontrei a resposta' (omissão segura) do que inventar uma dose mortal (alucinação ativa). Nosso objetivo é mitigar o risco estruturalmente.");
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
  footerBrand(s); pageNumber(s, 7); }

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
      "O Desafio do BERT Único: Com 14.000 TAGS não repetidas geradas de apenas 60 bulas, classificar a intenção usando um único modelo tradicional seria inviável.",
      "A Limitação do Fine-Tuning: Tentamos treinar modelos locais (Llama 8B) para prever a tag. A rede não alcançou a capacidade de memorizar 14.000 classes exatas. O modelo treinado foi substituído.",
      "A Mudança Arquitetural: O dataset curado não serviu para o treinamento generativo, mas foi convertido em um Banco de Vetores (Embeddings locais com modelo Xenova).",
      "Votação Q2Q (Question-to-Question): A pergunta do usuário é vetorizada e comparada matematicamente com as milhares de sentenças do banco. O sistema encontra a seção correta via similaridade geométrica.",
      "Auto-Correção Vetorial: Após achar a seção, o sistema faz a aproximação vetorial para a TAG oficial mais próxima, garantindo 100% de estabilidade sem depender de LLM no roteamento macro."
    ], { x: 0.6, y: 2.0, w: 11.5, h: 4.8, fontSize: 13.8, spaceAfter: 13 }
  );
  footerBrand(s); pageNumber(s, 8); s.addNotes("Aqui está o grande desafio de engenharia do TCC. Como rotear a pergunta do usuário para a seção certa da bula? 1. Por que não um classificador clássico (como o BERT)? Porque nós geramos 14.000 TAGS não repetidas a partir de apenas 60 bulas. Imagine um modelo clássico de classificação tentando prever a intenção entre 14.000 classes de saída diferentes! Um modelo BERT único sofreria uma 'pane de sobrecarga'. 2. A tentativa Generativa: Tentamos usar IAs rodando localmente para gerar o JSON com a tag da seção. Falhamos duas vezes: Modelos de 2B (Gemma) alucinavam a estrutura sintática. Modelos de 8B (Llama) até formavam o JSON, mas inventavam categorias que não existiam. 3. O Pivot Arquitetural: Essa tentativa falhou. Mas foi um fracasso de ouro. Nós pegamos aquele dataset gigante de 14.000 tags e o convertemos em um Banco de Vetores no MongoDB. Em vez da IA adivinhar a tag, a aplicação agora faz um fuzzy match local para validar o remédio e cruza a pergunta direto com o banco, puxando exatamente o parágrafo da resposta. Nós tiramos o peso do roteamento das costas do LLM!"); s.addNotes("Aqui está o grande desafio de engenharia do TCC. Como rotear a pergunta do usuário para a seção certa da bula? 1. Por que não um classificador clássico (como o BERT)? Porque nós geramos 14.000 TAGS não repetidas a partir de apenas 60 bulas. Imagine um modelo clássico de classificação tentando prever a intenção entre 14.000 classes de saída diferentes! Um modelo BERT único sofreria uma 'pane de sobrecarga'. 2. A tentativa Generativa: Tentamos usar IAs rodando localmente para gerar o JSON com a tag da seção. Falhamos duas vezes: Modelos de 2B (Gemma) alucinavam a estrutura sintática. Modelos de 8B (Llama) até formavam o JSON, mas inventavam categorias que não existiam. 3. O Pivot Arquitetural: Essa tentativa falhou. Mas foi um fracasso de ouro. Nós pegamos aquele dataset gigante de 14.000 tags e o convertemos em um Banco de Vetores no MongoDB. Em vez da IA adivinhar a tag, a aplicação agora faz um fuzzy match local para validar o remédio e cruza a pergunta direto com o banco, puxando exatamente o parágrafo da resposta. Nós tiramos o peso do roteamento das costas do LLM!"); s.addNotes("Aqui está o grande desafio de engenharia do TCC. Como rotear a pergunta do usuário para a seção certa da bula? 1. Por que não um classificador clássico (como o BERT)? Porque nós geramos 14.000 TAGS não repetidas a partir de apenas 60 bulas. Imagine um modelo clássico de classificação tentando prever a intenção entre 14.000 classes de saída diferentes! Um modelo BERT único sofreria uma 'pane de sobrecarga'. 2. A tentativa Generativa: Tentamos usar IAs rodando localmente para gerar o JSON com a tag da seção. Falhamos duas vezes: Modelos de 2B (Gemma) alucinavam a estrutura sintática. Modelos de 8B (Llama) até formavam o JSON, mas inventavam categorias que não existiam. 3. O Pivot Arquitetural: Essa tentativa falhou. Mas foi um fracasso de ouro. Nós pegamos aquele dataset gigante de 14.000 tags e o convertemos em um Banco de Vetores no MongoDB. Em vez da IA adivinhar a tag, a aplicação agora faz um fuzzy match local para validar o remédio e cruza a pergunta direto com o banco, puxando exatamente o parágrafo da resposta. Nós tiramos o peso do roteamento das costas do LLM!"); s.addNotes("Aqui está o grande desafio de engenharia do TCC. Como rotear a pergunta do usuário para a seção certa da bula? 1. Por que não um classificador clássico (como o BERT)? Porque nós geramos 14.000 TAGS não repetidas a partir de apenas 60 bulas. Imagine um modelo clássico de classificação tentando prever a intenção entre 14.000 classes de saída diferentes! Um modelo BERT único sofreria uma 'pane de sobrecarga'. 2. A tentativa Generativa: Tentamos usar IAs rodando localmente para gerar o JSON com a tag da seção. Falhamos duas vezes: Modelos de 2B (Gemma) alucinavam a estrutura sintática. Modelos de 8B (Llama) até formavam o JSON, mas inventavam categorias que não existiam. 3. O Pivot Arquitetural: Essa tentativa falhou. Mas foi um fracasso de ouro. Nós pegamos aquele dataset gigante de 14.000 tags e o convertemos em um Banco de Vetores no MongoDB. Em vez da IA adivinhar a tag, a aplicação agora faz um fuzzy match local para validar o remédio e cruza a pergunta direto com o banco, puxando exatamente o parágrafo da resposta. Nós tiramos o peso do roteamento das costas do LLM!"); s.addNotes("Aqui está o grande desafio de engenharia do TCC. Como rotear a pergunta do usuário para a seção certa da bula? 1. Por que não um classificador clássico (como o BERT)? Porque nós geramos 14.000 TAGS não repetidas a partir de apenas 60 bulas. Imagine um modelo clássico de classificação tentando prever a intenção entre 14.000 classes de saída diferentes! Um modelo BERT único sofreria uma 'pane de sobrecarga'. 2. A tentativa Generativa: Tentamos usar IAs rodando localmente para gerar o JSON com a tag da seção. Falhamos duas vezes: Modelos de 2B (Gemma) alucinavam a estrutura sintática. Modelos de 8B (Llama) até formavam o JSON, mas inventavam categorias que não existiam. 3. O Pivot Arquitetural: Essa tentativa falhou. Mas foi um fracasso de ouro. Nós pegamos aquele dataset gigante de 14.000 tags e o convertemos em um Banco de Vetores no MongoDB. Em vez da IA adivinhar a tag, a aplicação agora faz um fuzzy match local para validar o remédio e cruza a pergunta direto com o banco, puxando exatamente o parágrafo da resposta. Nós tiramos o peso do roteamento das costas do LLM!");
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
  pageNumber(s, 9, true); s.addNotes("É assim que a arquitetura ficou. O Planner acha a intenção no banco vetorial. O Tagger filtra as sentenças que não importam. E o Generator (o Llama) recebe apenas a verdade nua e crua para redigir a resposta como um farmacêutico clínico. Tudo isso ligado ao front-end pelo protocolo MCP, garantindo transparência de onde o dado saiu."); s.addNotes("É assim que a arquitetura ficou. O Planner acha a intenção no banco vetorial. O Tagger filtra as sentenças que não importam. E o Generator (o Llama) recebe apenas a verdade nua e crua para redigir a resposta como um farmacêutico clínico. Tudo isso ligado ao front-end pelo protocolo MCP, garantindo transparência de onde o dado saiu."); s.addNotes("É assim que a arquitetura ficou. O Planner acha a intenção no banco vetorial. O Tagger filtra as sentenças que não importam. E o Generator (o Llama) recebe apenas a verdade nua e crua para redigir a resposta como um farmacêutico clínico. Tudo isso ligado ao front-end pelo protocolo MCP, garantindo transparência de onde o dado saiu."); s.addNotes("É assim que a arquitetura ficou. O Planner acha a intenção no banco vetorial. O Tagger filtra as sentenças que não importam. E o Generator (o Llama) recebe apenas a verdade nua e crua para redigir a resposta como um farmacêutico clínico. Tudo isso ligado ao front-end pelo protocolo MCP, garantindo transparência de onde o dado saiu."); s.addNotes("É assim que a arquitetura ficou. O Planner acha a intenção no banco vetorial. O Tagger filtra as sentenças que não importam. E o Generator (o Llama) recebe apenas a verdade nua e crua para redigir a resposta como um farmacêutico clínico. Tudo isso ligado ao front-end pelo protocolo MCP, garantindo transparência de onde o dado saiu."); footerBrand(s, true);
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
      "Para evitar viés de circularidade, o cruzamento de arquiteturas foi assegurado: o gerador foi o Llama 3.1 70B, mas o Juiz foi o Nemotron 550B (Nvidia).",
      "O Juiz operou assincronamente auditando cada sentença gerada e aplicando as seguintes tags restritas:",
      "PARAPHRASED: Paráfrase clínica segura e rastreável.",
      "INFERRED: Inferência lógica correta baseada no texto.",
      "UNSUPPORTED: Ausência de rastreabilidade (falha grave/alucinação).",
      "SAFE_GENERIC: Avisos médicos padronizados (\"consulte um médico\").",
      "Ao cruzar famílias de modelos distintas, o desenho metodológico anula o favoritismo estatístico."
    ], { x: 0.6, y: 2.0, w: 11, h: 4.4, fontSize: 14, spaceAfter: 12 }
  );
  footerBrand(s); pageNumber(s, 10); }

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
  statCard(0.6 + sw + 0.25, 2.05, sw, 1.85, "84,42 vs 83,99", "Fidelidade (FarmaIA vs RAG)", "Score de Grounding comparado.");

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 4.05, w: 5.85, h: 2.35, rectRadius: 0.08, fill: { color: TEAL_LIGHT } });
  iconBadge(s, "shield_white", 0.85, 4.28, 0.55, TEAL, 0.5);
  s.addText("O Empate Técnico", { x: 1.65, y: 4.32, w: 4, h: 0.35, fontFace: FONT_BODY, fontSize: 13, bold: true, color: NAVY, margin: 0 });
  s.addText("Eficiência: Redução de 60% em tokens. Grounding: As abordagens empataram na fidelidade (RAG: ~83.99% | FarmaIA: ~84.42%). Em 84% das respostas, alegações clínicas foram rastreáveis sem alucinação.",
    { x: 0.85, y: 4.75, w: 5.35, h: 1.5, fontFace: FONT_BODY, fontSize: 11, color: INK, margin: 0, lineSpacingMultiple: 1.25 }
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
  footerBrand(s); pageNumber(s, 11); s.addNotes("Os resultados mostraram que o FarmaIA reduziu o consumo de tokens em mais de 60%. E na fidelidade clínica geral, empatamos com o RAG Tradicional (em torno de 84%). Mas o verdadeiro triunfo não está na média de acertos, e sim em como o sistema falha."); s.addNotes("Os resultados mostraram que o FarmaIA reduziu o consumo de tokens em mais de 60%. E na fidelidade clínica geral, empatamos com o RAG Tradicional (em torno de 84%). Mas o verdadeiro triunfo não está na média de acertos, e sim em como o sistema falha."); s.addNotes("Os resultados mostraram que o FarmaIA reduziu o consumo de tokens em mais de 60%. E na fidelidade clínica geral, empatamos com o RAG Tradicional (em torno de 84%). Mas o verdadeiro triunfo não está na média de acertos, e sim em como o sistema falha."); s.addNotes("Os resultados mostraram que o FarmaIA reduziu o consumo de tokens em mais de 60%. E na fidelidade clínica geral, empatamos com o RAG Tradicional (em torno de 84%). Mas o verdadeiro triunfo não está na média de acertos, e sim em como o sistema falha."); s.addNotes("Os resultados mostraram que o FarmaIA reduziu o consumo de tokens em mais de 60%. E na fidelidade clínica geral, empatamos com o RAG Tradicional (em torno de 84%). Mas o verdadeiro triunfo não está na média de acertos, e sim em como o sistema falha."); }

// ============================================================
// SLIDE 12 — MATRIZ DE DESEMPENHO (2x2)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "search_white", 0.6, 0.5, 0.62, NAVY);
  kicker(s, "Resultados", TEAL);
  s.addText("Matriz de Desempenho (N=139)", { x: 0.6, y: 0.98, w: 10, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  s.addText("Comportamento do Sistema ao cruzar Roteamento (Cenário) vs Aprovação de Fidelidade:", { x: 0.6, y: 1.85, w: 11, h: 0.35, fontFace: FONT_BODY, fontSize: 14.5, color: INK, margin: 0 });

  const rows = [
    [
      { text: "Roteamento vs Aprovação", options: { fill: "123A57", color: "FFFFFF", bold: true, fontSize: 13, align: "center", border: { pt: 1, color: "FFFFFF" } } },
      { text: "FarmaIA (Filtro)", options: { fill: "123A57", color: "FFFFFF", bold: true, fontSize: 13, align: "center", border: { pt: 1, color: "FFFFFF" } } },
      { text: "RAG Tradicional (Ruído)", options: { fill: "123A57", color: "FFFFFF", bold: true, fontSize: 13, align: "center", border: { pt: 1, color: "FFFFFF" } } }
    ],
    [
      { text: "Verdadeiro - Verdadeiro\n(Acertou Seção + Aprovou)", options: { fill: "F0F4F8", color: "123A57", bold: true, fontSize: 12, align: "center", border: { pt: 1, color: "DCE8EC" } } },
      { text: "Sucesso Pleno\n(53 casos)", options: { fill: "E0F2F1", color: "00695C", bold: true, fontSize: 13, align: "center", border: { pt: 1, color: "DCE8EC" } } },
      { text: "Sucesso Pleno\n(51 casos)", options: { fill: "E0F2F1", color: "00695C", bold: true, fontSize: 13, align: "center", border: { pt: 1, color: "DCE8EC" } } }
    ],
    [
      { text: "Verdadeiro - Falso\n(Acertou Seção + Rejeitou)", options: { fill: "FFFFFF", color: "123A57", bold: true, fontSize: 12, align: "center", border: { pt: 1, color: "DCE8EC" } } },
      { text: "Falha de Síntese\n(9 casos)", options: { fill: "FFEBEE", color: "C62828", bold: true, fontSize: 13, align: "center", border: { pt: 1, color: "DCE8EC" } } },
      { text: "Falha de Síntese\n(8 casos)", options: { fill: "FFEBEE", color: "C62828", bold: true, fontSize: 13, align: "center", border: { pt: 1, color: "DCE8EC" } } }
    ],
    [
      { text: "Falso - Verdadeiro\n(Errou Seção + Aprovou)", options: { fill: "F0F4F8", color: "123A57", bold: true, fontSize: 12, align: "center", border: { pt: 1, color: "DCE8EC" } } },
      { text: "Sobreposição Semântica (54)\n+ Omissão Segura (5)", options: { fill: "E3F2FD", color: "1565C0", bold: true, fontSize: 13, align: "center", border: { pt: 1, color: "DCE8EC" } } },
      { text: "Sobreposição Acidental\n(56 casos)", options: { fill: "FFF8E1", color: "FF8F00", bold: true, fontSize: 13, align: "center", border: { pt: 1, color: "DCE8EC" } } }
    ],
    [
      { text: "Falso - Falso\n(Errou Seção + Rejeitou)", options: { fill: "FFFFFF", color: "123A57", bold: true, fontSize: 12, align: "center", border: { pt: 1, color: "DCE8EC" } } },
      { text: "Falha Arquitetural\n(18 casos)", options: { fill: "FFEBEE", color: "C62828", bold: true, fontSize: 13, align: "center", border: { pt: 1, color: "DCE8EC" } } },
      { text: "Alucinação Severa\n(24 casos)", options: { fill: "FFEBEE", color: "C62828", bold: true, fontSize: 13, align: "center", border: { pt: 1, color: "DCE8EC" } } }
    ]
  ];

  s.addTable(rows, { x: 0.6, y: 2.3, w: 11.5, colW: [4.5, 3.5, 3.5], margin: 0.1 });

  s.addText("O Paradoxo do Roteamento: Como explicar 77% de acerto final com apenas 52% de acerto de roteador?\nA Bula da ANVISA é redundante. Em 54 casos, o FarmaIA errou a seção alvo, mas a informação procurada estava duplicada na seção que ele puxou (Sobreposição Semântica).",
    { x: 0.6, y: 5.7, w: 11.5, h: 0.8, fontFace: FONT_BODY, fontSize: 13, bold: true, color: NAVY, fill: { color: "E3F2FD" }, align: "center", margin: 0.1, rectRadius: 0.05 }
  );

  footerBrand(s); pageNumber(s, 12); }

// ============================================================
// SLIDE 13 — O ACHADO FUNDAMENTAL
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "search_white", 0.6, 0.5, 0.62, CORAL);
  kicker(s, "Resultados", CORAL);
  s.addText("O Achado: Indício Direcional de Erro", { x: 0.6, y: 0.98, w: 10, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  bulletBlock(s, [
      "Embora sem significância estatística absoluta de volume (p>0.05), a tendência direcional apoia nossa hipótese:",
      "A diferença fundamental entre as arquiteturas não reside na média agregada de acertos, mas no comportamento diante do erro preditivo."
    ], { x: 0.6, y: 1.8, w: 11, h: 1.0, fontSize: 14.5, spaceAfter: 0 }
  );

  const rx = 0.6, ry = 2.9, rw = 11.5;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: rx, y: ry, w: rw, h: 1.6, rectRadius: 0.05, fill: { color: WHITE }, shadow: freshShadow() });
  
  s.addText("Cenário Ideal (Roteamento Correto) - N = 73", { x: rx + 0.2, y: ry + 0.15, w: 5, h: 0.35, fontFace: FONT_BODY, fontSize: 13, bold: true, color: TEAL, margin: 0 });
  s.addText("FarmaIA: 12 falhas | RAG: 8 falhas", { x: rx + 0.2, y: ry + 0.55, w: 5, h: 0.3, fontFace: FONT_BODY, fontSize: 12, color: INK, margin: 0 });
  s.addText("A filtragem estrita às vezes quebra a coesão de fragmentos úteis.", { x: rx + 0.2, y: ry + 0.85, w: 5, h: 0.5, fontFace: FONT_BODY, fontSize: 10.5, color: MUTED, margin: 0 });

  s.addShape(pres.shapes.LINE, { x: rx + 5.75, y: ry + 0.2, w: 0, h: 1.2, line: { color: "E2E8EA", width: 1 } });

  s.addText("Cenário Adverso (Roteamento Incorreto) - N = 67", { x: rx + 6.0, y: ry + 0.15, w: 5, h: 0.35, fontFace: FONT_BODY, fontSize: 13, bold: true, color: CORAL, margin: 0 });
  s.addText("FarmaIA: 15 falhas | RAG: 23 falhas", { x: rx + 6.0, y: ry + 0.55, w: 5, h: 0.3, fontFace: FONT_BODY, fontSize: 12, color: INK, margin: 0 });
  s.addText("O RAG alucina tentando justificar contexto errado. O FarmaIA aciona a Omissão Segura.", { x: rx + 6.0, y: ry + 0.85, w: 5.2, h: 0.5, fontFace: FONT_BODY, fontSize: 10.5, color: MUTED, margin: 0 });

  s.addText("A filtragem restringe os erros majoritariamente a abstenções, bloqueando afirmações clínicas incorretas induzidas por contexto ruidoso.",
    { x: 0.6, y: 4.8, w: 11, h: 0.8, fontFace: FONT_BODY, fontSize: 13.5, bold: true, color: INK, margin: 0 }
  );
  footerBrand(s); pageNumber(s, 13); }

// ============================================================
// SLIDE 14 — O EXEMPLO PRÁTICO
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
  footerBrand(s, true); pageNumber(s, 14, true); }

// ============================================================
// SLIDE 15 — LIMITAÇÕES E ALUCINAÇÕES
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: OFFWHITE };
  iconBadge(s, "alert", 0.6, 0.5, 0.62, CORAL);
  kicker(s, "Análise Crítica", CORAL);
  s.addText("Limitações e Alucinações Residuais", { x: 0.6, y: 0.98, w: 10, h: 0.7, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: NAVY_DARK, margin: 0 });

  bulletBlock(s, [
      "1. Benchmark e Perguntas Transversais",
      "O acerto de roteamento (52%) foi medido em questões de seção única. O dataset estruturalmente exclui cenários transversais que cruzam seções.",
      "2. Risco de Ponto Cego Humano Compartilhado",
      "Não houve validação clínica humana no Ground Truth (14 mil tags) nem nos juízes automáticos, permitindo potenciais pontos cegos cruzados.",
      "3. Cegueira de Roteamento Único",
      "Perguntas complexas (ex: dose para gestantes) exigem olhar várias seções. O sistema falha se ancorado a apenas uma.",
      "4. Alucinações Residuais de Síntese",
      "O Llama às vezes tenta deduzir informações quando o filtro entrega poucas sentenças."
    ], { x: 0.6, y: 1.85, w: 11, h: 4.8, fontSize: 14.5, spaceAfter: 10 }
  );
  footerBrand(s); pageNumber(s, 15); }

// ============================================================
// SLIDE 16 — CONCLUSÃO
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
      "Substitui a recuperação vetorial ruidosa por roteamento categórico, obtendo 52,14% de acerto exato de intenção.",
      "Reduz o volume de tokens consumidos em 61,1% durante a injeção de contexto no LLM.",
      "Comprova o potencial da filtragem restritiva: converte o ruído estocástico em falhas arquiteturais seguras (omissões)."
    ], { x: lx + 0.3, y: 3.05, w: colW - 0.6, h: 3.2, fontSize: 13, spaceAfter: 14 }
  );

  const rx = lx + colW + 0.35;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: rx, y: 2.05, w: colW, h: 4.35, rectRadius: 0.09, fill: { color: NAVY } });
  iconBadge(s, "idea_white", rx + 0.3, 2.32, 0.55, "5FB8CE", 0.5);
  s.addText("Próximos Passos", { x: rx + 1.05, y: 2.32, w: colW - 1.3, h: 0.55, fontFace: FONT_HEAD, fontSize: 15.5, bold: true, color: WHITE, margin: 0, lineSpacingMultiple: 1.05 });
  bulletBlock(s, [
      "Implementação de roteamento dinâmico paralelo (agentes que leem mais de uma seção simultaneamente).",
      "Testar uma arquitetura 'Ensemble de BERTs' (treinar um classificador dedicado por seção em vez de um único modelo).",
      "Integrar FarmaIA aos Protocolos Clínicos e Diretrizes Terapêuticas (PCDT) do Ministério da Saúde."
    ], { x: rx + 0.3, y: 3.05, w: colW - 0.6, h: 3.2, color: "DCE8EC", fontSize: 13, spaceAfter: 14 }
  );
  footerBrand(s); pageNumber(s, 16); }

// ============================================================
// SLIDE 17 — ENCERRAMENTO
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

  pageNumber(s, 17, true); }

pres.writeFile({ fileName: path.join(__dirname, '..', 'FarmaIA_TCC_Defesa_Final.pptx') }).then(() => {
  console.log("PPTX generation complete!");
});

