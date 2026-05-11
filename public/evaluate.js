// FarmaIA Evaluation Frontend v2
const API_BASE = '/api';
let sessionData = null;
let evaluatorId = sessionStorage.getItem('farmaia_evaluator');
if (!evaluatorId) { evaluatorId = 'eval_' + crypto.randomUUID(); sessionStorage.setItem('farmaia_evaluator', evaluatorId); }
let evaluatorMeta = {};
let messageEvals = {}; // { msgIndex: { judgeName: { concordance, reason } } }
let generalEval = {};
let activeMessageIndex = null;

function getSessionId() { const p = new URLSearchParams(window.location.search); return p.get('session') || p.get('sessionId'); }
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons(); initTheme();
  const sid = getSessionId();
  if (!sid) { showError('Nenhuma sessão especificada. Use <b>?session=sess_xxx</b> na URL.'); return; }
  showMetaForm(() => loadSession(sid));
});

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  if (saved === 'light') { document.documentElement.setAttribute('data-theme','light'); const i=document.getElementById('theme-icon'); if(i) i.setAttribute('data-lucide','moon'); lucide.createIcons(); }
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const ico = document.getElementById('theme-icon');
    if (cur === 'light') { document.documentElement.removeAttribute('data-theme'); ico.setAttribute('data-lucide','sun'); localStorage.setItem('theme','dark'); }
    else { document.documentElement.setAttribute('data-theme','light'); ico.setAttribute('data-lucide','moon'); localStorage.setItem('theme','light'); }
    lucide.createIcons();
  });
}

// ── Mobile tab switching ──
function isMobile() { return window.innerWidth <= 768; }

function switchMobileTab(tab) {
  const left = document.querySelector('.left-panel');
  const right = document.getElementById('right-panel');
  const tabChat = document.getElementById('tab-chat');
  const tabEval = document.getElementById('tab-eval');
  if (!left || !right) return;
  if (tab === 'chat') {
    left.classList.add('mobile-visible');
    right.classList.remove('mobile-visible');
    tabChat?.classList.add('active');
    tabEval?.classList.remove('active');
  } else {
    left.classList.remove('mobile-visible');
    right.classList.add('mobile-visible');
    tabChat?.classList.remove('active');
    tabEval?.classList.add('active');
  }
  lucide.createIcons();
}


function showMetaForm(cb) {
  const ov = document.getElementById('meta-overlay'); ov.classList.add('active');
  document.getElementById('meta-start').addEventListener('click', () => {
    evaluatorMeta = { semester: document.getElementById('meta-semester').value.trim() || 'N/A', hasPharmacology: document.getElementById('meta-pharmacology').value === 'sim' };
    ov.classList.remove('active'); cb();
  });
}

function showError(msg) {
  document.getElementById('main-content').innerHTML = `<div class="error-page"><i data-lucide="alert-circle"></i><h2>Erro</h2><p>${msg}</p></div>`;
  lucide.createIcons();
}

// ── Load session ──
async function loadSession(sessionId) {
  const cs = document.getElementById('left-scroll');
  cs.innerHTML = '<div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>';
  try {
    const res = await fetch(`${API_BASE}/evaluate-session?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Erro'); }
    sessionData = (await res.json()).session;
    renderLeftPanel();
    updateProgress();
  } catch (err) { cs.innerHTML = `<div style="color:var(--eval-red);padding:16px;font-size:13px;">Erro: ${err.message}</div>`; }
}

// ── Format justification text ──
function formatJustification(justObj) {
  if (!justObj) return '';
  if (typeof justObj === 'string') return esc(justObj);
  // Object with criteria keys
  let html = '';
  for (const [key, text] of Object.entries(justObj)) {
    const label = key.replace(/^\d+\.\d+_/, '').replace(/_/g, ' ');
    const capLabel = label.charAt(0).toUpperCase() + label.slice(1);
    html += `<div class="just-item"><span class="just-label">${esc(capLabel)}:</span> <span class="just-text">${esc(text)}</span></div>`;
  }
  return html;
}

// ── LEFT panel: conversation + judge details ──
function renderLeftPanel() {
  const cs = document.getElementById('left-scroll');
  if (!sessionData?.messages?.length) { cs.innerHTML = '<p style="color:var(--text3);padding:16px;">Nenhuma mensagem encontrada.</p>'; return; }
  let html = '';
  for (let i = 0; i < sessionData.messages.length; i++) {
    const m = sessionData.messages[i];
    if (m.role === 'user') {
      html += `<div class="conv-msg conv-msg-user" data-index="${i}"><div class="conv-avatar-u">P</div><div class="conv-bubble-user">${esc(m.text)}</div></div>`;
    } else if (m.role === 'model') {
      const hasJudges = m.evaluation?.judges && Object.keys(m.evaluation.judges).length > 0;
      const evCount = messageEvals[i] ? Object.keys(messageEvals[i]).filter(k => messageEvals[i][k]?.concordance).length : 0;
      const totalJudges = countJudges(m);
      const isDone = evCount >= totalJudges && totalJudges > 0;
      const isActive = activeMessageIndex === i;

      html += `<div class="conv-msg conv-msg-model ${isActive ? 'active-eval' : ''}" data-index="${i}" id="conv-msg-${i}">
        <div class="conv-avatar"><i data-lucide="scroll-text"></i></div>
        <div class="conv-model-body">
          <div class="conv-model-name">FarmaIA</div>
          <div class="conv-model-text">${marked.parse(m.text)}</div>`;

      // Judge details inline (read-only context)
      if (hasJudges) {
        const ev = m.evaluation;
        const agg = ev.aggregate_score;
        const aggCls = agg >= 80 ? 'high' : agg >= 60 ? 'mid' : 'low';
        html += `<div class="judge-inline-panel">
          <div class="judge-inline-header" onclick="this.parentElement.classList.toggle('expanded')">
            <span class="judge-inline-title"><i data-lucide="scale"></i> Avaliação MCP</span>
            <span class="judge-mini-score ${aggCls}">${agg !== null && agg !== undefined ? agg + '/100' : '—'}</span>
            <i data-lucide="chevron-down" class="judge-inline-chevron"></i>
          </div>
          <div class="judge-inline-body">`;

        // General judges
        const judgeNames = { safety_judge:'🛡️ Segurança', quality_judge:'⭐ Qualidade', source_judge:'📎 Fundamentação', format_judge:'📐 Formato' };
        for (const [key, label] of Object.entries(judgeNames)) {
          const j = ev.judges[key];
          if (!j || j.error) { html += `<div class="ji-card"><div class="ji-header"><span>${label}</span><span class="ji-badge low">erro</span></div></div>`; continue; }
          const sc = j.score || 0; const cls = sc >= 80 ? 'high' : sc >= 60 ? 'mid' : 'low';
          html += `<div class="ji-card">
            <div class="ji-header"><span>${label}</span><span class="ji-badge ${cls}">${sc}/100</span></div>`;
          // Formatted justifications
          if (j.justificativas && typeof j.justificativas === 'object') {
            html += `<div class="ji-justifications">${formatJustification(j.justificativas)}</div>`;
          } else if (j.justification) {
            html += `<div class="ji-justifications"><div class="just-item"><span class="just-text">${esc(j.justification)}</span></div></div>`;
          }
          // Claims for source judge
          if (key === 'source_judge' && j.claims?.length) {
            html += '<div class="ji-claims">';
            for (const c of j.claims) { html += `<div class="ji-claim"><span class="ji-claim-text">"${esc(c.text || '')}"</span> <span class="ji-claim-badge ${(c.classification||'').toLowerCase()}">${c.classification || ''}</span></div>`; }
            html += '</div>';
          }
          html += '</div>';
        }
        // Topic judges
        if (ev.topic_judges && ev.topics_detected?.length) {
          const tn = { posologia:'💊 Posologia', contraindicacoes:'⚠️ Contraindicações', reacoes_adversas:'🔬 Reações Adversas' };
          for (const topic of ev.topics_detected) {
            const tj = ev.topic_judges[topic]; if (!tj || tj.error) continue;
            const sc = tj.coverage_score || 0; const cls = sc >= 80 ? 'high' : sc >= 60 ? 'mid' : 'low';
            html += `<div class="ji-card ji-topic"><div class="ji-header"><span>${tn[topic]||topic} (Tópico)</span><span class="ji-badge ${cls}">${sc}/100</span></div>`;
            if (tj.questions_answered?.length) html += `<div class="ji-detail ok">✅ ${tj.questions_answered.join(', ')}</div>`;
            if (tj.questions_missing?.length) html += `<div class="ji-detail miss">❌ ${tj.questions_missing.join(', ')}</div>`;
            html += '</div>';
          }
        }
        html += '</div></div>';
      }

      // Fonte Bula button (if documents_context available)
      const docs = m.documents_context;
      if (docs && docs.length > 50) {
        // Extract drug names from context or use detected drugs
        const drugNames = extractDrugNames(docs, m);
        html += `<div class="fonte-btn-wrap">`;
        html += `<div class="fonte-label"><i data-lucide="file-text"></i> Bula Oficial</div>`;
        html += `<div class="fonte-pills">`;
        const contextEncoded = encodeURIComponent(docs);
        if (drugNames.length > 0) {
          for (const name of drugNames) {
            html += `<button class="fonte-pill" onclick="openFonteModal('${esc(name).replace(/'/g, "\\'")}', '${contextEncoded}')" title="Ver dados extraídos da bula">
              <i data-lucide="file-text"></i> ${esc(name)}
            </button>`;
          }
        } else {
          html += `<button class="fonte-pill" onclick="openFonteModal('Dados Extraídos', '${contextEncoded}')" title="Ver dados extraídos da bula">
            <i data-lucide="file-text"></i> Ver Fonte
          </button>`;
        }
        html += `</div></div>`;
      }

      // Evaluate button
      html += `<div class="eval-actions">`;
      if (hasJudges) {
        html += `<button class="eval-start-btn ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}" onclick="selectMessage(${i})" id="eval-btn-${i}">
          <i data-lucide="${isDone ? 'check-circle' : 'clipboard-check'}"></i>
          ${isDone ? 'Avaliado ✓' : evCount > 0 ? `Avaliando (${evCount}/${totalJudges})` : 'Iniciar Avaliação'}
        </button>`;
      }
      html += '</div></div></div>';
    }
  }
  cs.innerHTML = html;
  lucide.createIcons();
}

function countJudges(msg) {
  if (!msg.evaluation) return 0;
  let count = Object.keys(msg.evaluation.judges || {}).filter(k => { const j = msg.evaluation.judges[k]; return j && !j.error; }).length;
  if (msg.evaluation.topics_detected?.length) {
    for (const t of msg.evaluation.topics_detected) { if (msg.evaluation.topic_judges?.[t] && !msg.evaluation.topic_judges[t].error) count++; }
  }
  return count;
}

// ── Select message → show RIGHT panel ──
function selectMessage(index) {
  activeMessageIndex = index;
  renderLeftPanel();
  renderRightPanel(index);
  // On mobile, auto-switch to the evaluation tab
  if (isMobile()) { switchMobileTab('eval'); }
  else {
    const el = document.getElementById(`conv-msg-${index}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ── RIGHT panel: concordance form ──
function renderRightPanel(index) {
  const scroll = document.getElementById('right-scroll');
  const msg = sessionData.messages[index];
  if (!msg?.evaluation?.judges) {
    scroll.innerHTML = '<div class="eval-empty"><i data-lucide="shield-question"></i><p>Sem dados de avaliação.</p></div>';
    lucide.createIcons(); return;
  }
  const ev = msg.evaluation;
  const judgeNames = { safety_judge:'🛡️ Segurança', quality_judge:'⭐ Qualidade', source_judge:'📎 Fundamentação', format_judge:'📐 Formato' };
  const topicNames = { posologia:'💊 Posologia', contraindicacoes:'⚠️ Contraindicações', reacoes_adversas:'🔬 Reações Adversas' };

  let html = `<div class="eval-msg-label"><i data-lucide="message-square"></i> Avaliando resposta #${Math.ceil(index/2)}</div>`;

  // General judges concordance
  for (const [key, label] of Object.entries(judgeNames)) {
    const j = ev.judges[key]; if (!j || j.error) continue;
    const sc = j.score || 0; const cls = sc >= 80 ? 'high' : sc >= 60 ? 'mid' : 'low';
    const saved = messageEvals[index]?.[key];
    html += buildConcordanceCard(index, key, label, sc, cls, saved);
  }

  // Topic judges concordance
  if (ev.topic_judges && ev.topics_detected?.length) {
    for (const topic of ev.topics_detected) {
      const tj = ev.topic_judges[topic]; if (!tj || tj.error) continue;
      const sc = tj.coverage_score || 0; const cls = sc >= 80 ? 'high' : sc >= 60 ? 'mid' : 'low';
      const key = `topic_${topic}`;
      const label = topicNames[topic] || topic;
      const saved = messageEvals[index]?.[key];
      html += buildConcordanceCard(index, key, `${label} (Tópico)`, sc, cls, saved);
    }
  }

  // General evaluation
  html += `<div class="general-eval">
    <div class="general-eval-title"><i data-lucide="clipboard-list"></i> Avaliação Geral</div>
    <div class="ge-question"><label>1. Os juízes avaliaram de forma justa?</label><div class="ge-options">
      <button class="ge-option ${generalEval.overallFairness==='sim'?'selected':''}" data-ge-field="overallFairness" onclick="setGE('overallFairness','sim',this)">Sim</button>
      <button class="ge-option ${generalEval.overallFairness==='parcialmente'?'selected':''}" data-ge-field="overallFairness" onclick="setGE('overallFairness','parcialmente',this)">Parcialmente</button>
      <button class="ge-option ${generalEval.overallFairness==='nao'?'selected':''}" data-ge-field="overallFairness" onclick="setGE('overallFairness','nao',this)">Não</button>
    </div></div>
    <div class="ge-question"><label>2. Qual juiz mais distante do seu julgamento?</label><div class="ge-options">
      <button class="ge-option ${generalEval.worstJudge==='safety_judge'?'selected':''}" data-ge-field="worstJudge" onclick="setGE('worstJudge','safety_judge',this)">🛡️ Segurança</button>
      <button class="ge-option ${generalEval.worstJudge==='quality_judge'?'selected':''}" data-ge-field="worstJudge" onclick="setGE('worstJudge','quality_judge',this)">⭐ Qualidade</button>
      <button class="ge-option ${generalEval.worstJudge==='source_judge'?'selected':''}" data-ge-field="worstJudge" onclick="setGE('worstJudge','source_judge',this)">📎 Fundamentação</button>
      <button class="ge-option ${generalEval.worstJudge==='format_judge'?'selected':''}" data-ge-field="worstJudge" onclick="setGE('worstJudge','format_judge',this)">📐 Formato</button>
    </div></div>
    <div class="ge-question"><label>3. Tendência de notas dos juízes?</label><div class="ge-options">
      <button class="ge-option ${generalEval.tendencyBias==='lenientes'?'selected':''}" data-ge-field="tendencyBias" onclick="setGE('tendencyBias','lenientes',this)">Muito altas</button>
      <button class="ge-option ${generalEval.tendencyBias==='adequadas'?'selected':''}" data-ge-field="tendencyBias" onclick="setGE('tendencyBias','adequadas',this)">Adequadas</button>
      <button class="ge-option ${generalEval.tendencyBias==='rigorosos'?'selected':''}" data-ge-field="tendencyBias" onclick="setGE('tendencyBias','rigorosos',this)">Muito baixas</button>
    </div></div>
    <div class="ge-question"><label>4. Comentários:</label>
      <textarea class="ge-textarea" id="ge-comments" placeholder="Escreva aqui…">${generalEval.comments||''}</textarea>
    </div>
    <button class="submit-btn" id="submit-btn" onclick="submitAll()">
      <i data-lucide="send"></i> Enviar Avaliação Completa
    </button>
  </div>`;

  scroll.innerHTML = html;
  lucide.createIcons();
}

function buildConcordanceCard(idx, key, label, sc, cls, saved) {
  return `<div class="conc-card">
    <div class="conc-header"><span class="conc-name">${label}</span><span class="ji-badge ${cls}">${sc}/100</span></div>
    <div class="conc-question">Você concorda com esta avaliação?</div>
    <div class="concordance-group">
      <button class="concordance-btn ${saved?.concordance==='concordo'?'selected-concordo':''}" onclick="setConcordance(${idx},'${key}','concordo',this)">✓ Concordo</button>
      <button class="concordance-btn ${saved?.concordance==='parcial'?'selected-parcial':''}" onclick="setConcordance(${idx},'${key}','parcial',this)">◐ Parcial</button>
      <button class="concordance-btn ${saved?.concordance==='discordo'?'selected-discordo':''}" onclick="setConcordance(${idx},'${key}','discordo',this)">✗ Discordo</button>
    </div>
    <div class="reason-input ${saved?.concordance==='discordo'||saved?.concordance==='parcial'?'visible':''}" id="reason-${idx}-${key}">
      <label>Por quê?</label>
      <textarea placeholder="Descreva brevemente…" oninput="setReason(${idx},'${key}',this.value)">${saved?.reason||''}</textarea>
    </div>
  </div>`;
}

// ── Concordance logic ──
function setConcordance(idx, judge, val, btn) {
  if (!messageEvals[idx]) messageEvals[idx] = {};
  if (!messageEvals[idx][judge]) messageEvals[idx][judge] = {};
  messageEvals[idx][judge].concordance = val;
  btn.parentElement.querySelectorAll('.concordance-btn').forEach(b => b.className = 'concordance-btn');
  btn.classList.add(`selected-${val}`);
  const r = document.getElementById(`reason-${idx}-${judge}`);
  if (r) r.classList.toggle('visible', val === 'discordo' || val === 'parcial');
  updateProgress(); updateEvalBtn(idx);
}
function setReason(idx, judge, val) {
  if (!messageEvals[idx]) messageEvals[idx] = {};
  if (!messageEvals[idx][judge]) messageEvals[idx][judge] = {};
  messageEvals[idx][judge].reason = val;
}
function updateEvalBtn(idx) {
  const btn = document.getElementById(`eval-btn-${idx}`); if (!btn) return;
  const msg = sessionData.messages[idx];
  const total = countJudges(msg);
  const e = messageEvals[idx] || {};
  const c = Object.keys(e).filter(k => e[k]?.concordance).length;
  if (c >= total) { btn.className = 'eval-start-btn done active'; btn.innerHTML = '<i data-lucide="check-circle"></i> Avaliado ✓'; }
  else { btn.className = 'eval-start-btn active'; btn.innerHTML = `<i data-lucide="clipboard-check"></i> Avaliando (${c}/${total})`; }
  lucide.createIcons();
}
function updateProgress() {
  const mm = sessionData?.messages?.filter(m => m.role === 'model' && m.evaluation?.judges && Object.keys(m.evaluation.judges).length > 0) || [];
  const total = mm.length;
  const done = mm.filter(m => { const t = countJudges(m); const e = messageEvals[m.index]; return e && Object.keys(e).filter(k => e[k]?.concordance).length >= t; }).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const bar = document.getElementById('progress-bar'); if (bar) bar.style.width = pct + '%';
  const txt = document.getElementById('progress-text'); if (txt) txt.textContent = `${done}/${total} respostas avaliadas`;
}
function setGE(field, val, btn) {
  generalEval[field] = val;
  document.querySelectorAll(`[data-ge-field="${field}"]`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

// ── Free chat ──
async function sendChat() {
  const input = document.getElementById('chat-input'); const msg = input.value.trim(); if (!msg) return;
  const sid = getSessionId(); input.value = '';
  sessionData.messages.push({ role:'user', text:msg, timestamp:new Date().toISOString(), index:sessionData.messages.length });
  renderLeftPanel();
  const cs = document.getElementById('left-scroll');
  cs.innerHTML += '<div id="chat-loading" class="conv-msg conv-msg-model"><div class="conv-avatar"><i data-lucide="scroll-text"></i></div><div class="conv-model-body"><div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div></div></div>';
  lucide.createIcons(); cs.scrollTop = cs.scrollHeight;
  try {
    const res = await fetch(`${API_BASE}/chat`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:msg, mode:sessionData.mode||'patient', sessionId:sid}) });
    document.getElementById('chat-loading')?.remove();
    if (!res.ok) throw new Error('Erro na resposta');
    const data = await res.json();
    const mm = { role:'model', text:data.response, timestamp:new Date().toISOString(), documents_context:data.metadata?.documents||null, index:sessionData.messages.length, evaluation:null };
    sessionData.messages.push(mm); renderLeftPanel(); cs.scrollTop = cs.scrollHeight;
    const er = await fetch(`${API_BASE}/evaluate`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question:msg, response:data.response, documents:data.metadata?.documents||'', mode:sessionData.mode||'patient', sessionId:sid}) });
    if (er.ok) { const ed = await er.json(); mm.evaluation = { judges:ed.judges||ed.general_judges||{}, aggregate_score:ed.aggregate_score||ed.general_score||null, topic_judges:ed.topic_judges||{}, topics_detected:ed.topics_detected||[] }; renderLeftPanel(); }
  } catch (err) { document.getElementById('chat-loading')?.remove(); sessionData.messages.push({role:'model',text:`Erro: ${err.message}`,index:sessionData.messages.length}); renderLeftPanel(); }
}

// ── Submit ──
async function submitAll() {
  const sb = document.getElementById('submit-btn'); sb.disabled = true;
  sb.innerHTML = '<div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div> Enviando...';
  const comments = document.getElementById('ge-comments')?.value || '';
  const payload = { sessionId:getSessionId(), evaluatorId, evaluatorMeta, messageEvaluations:Object.entries(messageEvals).map(([idx,judges]) => { const i=parseInt(idx); const pm=i>0?sessionData.messages[i-1]:null; return {messageIndex:i, question:pm?.text||'', judges}; }), generalEvaluation:{...generalEval, comments} };
  try {
    const res = await fetch(`${API_BASE}/submit-evaluation`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if (!res.ok) throw new Error('Erro ao salvar');
    document.getElementById('success-overlay').classList.add('active');
  } catch (err) { alert('Erro: '+err.message); sb.disabled=false; sb.innerHTML='<i data-lucide="send"></i> Enviar Avaliação Completa'; lucide.createIcons(); }
}

// ── Fonte Bula Modal ──
function extractDrugNames(docsContext, msg) {
  const names = new Set();
  // Try to extract from section headers like "## Posologia para Adultos" or drug names
  const headerMatch = docsContext.match(/(?:Bula|BULA|bula)\s+(?:de\s+)?([A-ZÀ-Ú][a-záàâãéêíóôõúç]+(?:\s+[A-ZÀ-Ú][a-záàâãéêíóôõúç]+)*)/g);
  if (headerMatch) {
    headerMatch.forEach(m => {
      const name = m.replace(/(?:Bula|BULA|bula)\s+(?:de\s+)?/, '').trim();
      if (name.length > 2 && name.length < 40) names.add(name);
    });
  }
  // Try to extract drug names from title-case words at start of context
  const firstLine = docsContext.split('\n')[0] || '';
  const drugMatch = firstLine.match(/^#+\s*(.+)/); // Markdown heading
  if (drugMatch) {
    const name = drugMatch[1].trim();
    if (name.length > 2 && name.length < 40) names.add(name);
  }
  // Fallback: look for known patterns
  const knownDrugs = docsContext.match(/(?:dipirona|paracetamol|ibuprofeno|amoxicilina|omeprazol|losartana|metformina|atenolol|sinvastatina|fluoxetina)/gi);
  if (knownDrugs) {
    knownDrugs.forEach(d => names.add(d.charAt(0).toUpperCase() + d.slice(1).toLowerCase()));
  }
  return [...names].slice(0, 3);
}

function openFonteModal(title, encodedContext) {
  const overlay = document.getElementById('fonte-overlay');
  const titleEl = document.getElementById('fonte-title');
  const body = document.getElementById('fonte-body');
  titleEl.textContent = `Bula — ${title}`;
  try {
    const context = decodeURIComponent(encodedContext);
    // Split into sections by markdown headers or double newlines
    const sections = context.split(/\n(?=##\s)/).filter(s => s.trim());
    let html = '';
    if (sections.length > 1) {
      for (const sec of sections) {
        const headerMatch = sec.match(/^##\s*(.+)/);
        const sectionTitle = headerMatch ? headerMatch[1].trim() : 'Conteúdo';
        const sectionContent = headerMatch ? sec.replace(/^##\s*.+\n*/, '').trim() : sec.trim();
        if (sectionContent.length > 0) {
          html += `<div class="fonte-section">`;
          html += `<div class="fonte-section-title">${esc(sectionTitle)}</div>`;
          html += `<div class="fonte-section-content">${esc(sectionContent)}</div>`;
          html += `</div>`;
        }
      }
    } else {
      // Single block — split by double newlines for readability
      const blocks = context.split(/\n\n+/).filter(b => b.trim());
      for (let idx = 0; idx < blocks.length; idx++) {
        html += `<div class="fonte-section">`;
        html += `<div class="fonte-section-title">Trecho ${idx + 1}</div>`;
        html += `<div class="fonte-section-content">${esc(blocks[idx].trim())}</div>`;
        html += `</div>`;
      }
    }
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = `<div style="color:var(--eval-red);padding:16px;">Erro ao carregar dados: ${err.message}</div>`;
  }
  overlay.classList.add('active');
  lucide.createIcons();
}

function closeFonteModal() {
  document.getElementById('fonte-overlay').classList.remove('active');
}

// Close fonte modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeFonteModal();
});
// Close on overlay click
document.getElementById('fonte-overlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'fonte-overlay') closeFonteModal();
});
