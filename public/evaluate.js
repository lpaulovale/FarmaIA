// FarmaIA Evaluation Frontend - 2-Panel Layout
const API_BASE = '/api';
let sessionData = null;
let evaluatorId = sessionStorage.getItem('farmaia_evaluator');
if (!evaluatorId) { evaluatorId = 'eval_' + crypto.randomUUID(); sessionStorage.setItem('farmaia_evaluator', evaluatorId); }
let evaluatorMeta = {};
let messageEvals = {};
let generalEval = {};
let activeMessageIndex = null;

function getSessionId() {
  const p = new URLSearchParams(window.location.search);
  return p.get('session') || p.get('sessionId');
}

document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  initTheme();
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

function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// ── Load session ──
async function loadSession(sessionId) {
  const cs = document.getElementById('conv-scroll');
  cs.innerHTML = '<div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>';
  try {
    const res = await fetch(`${API_BASE}/evaluate-session?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Erro'); }
    sessionData = (await res.json()).session;
    renderConversation();
    updateProgress();
  } catch (err) { cs.innerHTML = `<div style="color:var(--eval-red);padding:16px;font-size:13px;">Erro: ${err.message}</div>`; }
}

// ── Render conversation (left panel) ──
function renderConversation() {
  const cs = document.getElementById('conv-scroll');
  if (!sessionData?.messages?.length) { cs.innerHTML = '<p style="color:var(--text3);padding:16px;">Nenhuma mensagem encontrada.</p>'; return; }
  let html = '';
  for (let i = 0; i < sessionData.messages.length; i++) {
    const m = sessionData.messages[i];
    if (m.role === 'user') {
      html += `<div class="conv-msg conv-msg-user" data-index="${i}">
        <div class="conv-avatar-u">P</div>
        <div class="conv-bubble-user">${esc(m.text)}</div>
      </div>`;
    } else if (m.role === 'model') {
      const hasJudges = m.evaluation?.judges && Object.keys(m.evaluation.judges).length > 0;
      const evCount = messageEvals[i] ? Object.keys(messageEvals[i]).filter(k => messageEvals[i][k]?.concordance).length : 0;
      const isDone = evCount >= 4;
      const isActive = activeMessageIndex === i;
      const agg = m.evaluation?.aggregate_score;
      const aggCls = agg >= 80 ? 'high' : agg >= 60 ? 'mid' : 'low';

      html += `<div class="conv-msg conv-msg-model ${isActive ? 'active-eval' : ''}" data-index="${i}" id="conv-msg-${i}">
        <div class="conv-avatar"><i data-lucide="scroll-text"></i></div>
        <div class="conv-model-body">
          <div class="conv-model-name">FarmaIA</div>
          <div class="conv-model-text">${marked.parse(m.text)}</div>
          ${hasJudges ? `<div class="judge-mini">
            <span>Avaliação MCP:</span>
            <span class="judge-mini-score ${aggCls}">${agg !== null && agg !== undefined ? agg + '/100' : '—'}</span>
          </div>` : ''}
          <div class="eval-actions">
            ${hasJudges ? `<button class="eval-start-btn ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}" onclick="selectMessage(${i})" id="eval-btn-${i}">
              <i data-lucide="${isDone ? 'check-circle' : 'clipboard-check'}"></i>
              ${isDone ? 'Avaliado ✓' : evCount > 0 ? `Avaliando (${evCount}/4)` : 'Iniciar Avaliação'}
            </button>` : ''}
            ${m.documents_context ? `<button class="fonte-toggle-btn" onclick="toggleFonte(${i})"><i data-lucide="file-text"></i> Fonte Bula</button>` : ''}
          </div>
          ${m.documents_context ? `<div class="fonte-inline" id="fonte-inline-${i}">
            <div class="fonte-inline-header"><i data-lucide="book-open"></i> Trecho da Bula</div>
            <div class="fonte-inline-body">${esc(m.documents_context)}</div>
          </div>` : ''}
        </div>
      </div>`;
    }
  }
  cs.innerHTML = html;
  lucide.createIcons();
}

function toggleFonte(index) {
  const el = document.getElementById(`fonte-inline-${index}`);
  if (el) el.classList.toggle('open');
}

// ── Select message → populate right panel ──
function selectMessage(index) {
  activeMessageIndex = index;
  renderConversation(); // re-render to update highlights
  renderRightPanel(index);
  // Scroll the message into view
  const el = document.getElementById(`conv-msg-${index}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Right panel: judge cards + fonte + general eval ──
function renderRightPanel(index) {
  const scroll = document.getElementById('right-scroll');
  const msg = sessionData.messages[index];
  if (!msg?.evaluation?.judges) {
    scroll.innerHTML = '<div class="eval-empty"><i data-lucide="shield-question"></i><p>Sem dados de avaliação.</p></div>';
    lucide.createIcons(); return;
  }
  const ev = msg.evaluation;
  const judgeNames = { safety_judge: '🛡️ Segurança', quality_judge: '⭐ Qualidade', source_judge: '📎 Fundamentação', format_judge: '📐 Formato' };
  const prevMsg = index > 0 ? sessionData.messages[index - 1] : null;
  const question = prevMsg?.role === 'user' ? prevMsg.text : '';

  let html = '';

  // Question context
  html += `<div style="margin-bottom:14px;padding:10px 14px;background:var(--surface);border-radius:var(--r);border:1px solid var(--border2);">
    <div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:2px;">PERGUNTA</div>
    <div style="font-size:13.5px;color:var(--text);">${esc(question)}</div>
  </div>`;

  // Aggregate
  const agg = ev.aggregate_score;
  if (agg !== null && agg !== undefined) {
    const cls = agg >= 80 ? 'high' : agg >= 60 ? 'mid' : 'low';
    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding:10px 14px;background:var(--surface);border-radius:var(--r-sm);border:1px solid var(--border);">
      <span style="font-size:13px;font-weight:600;color:var(--text2);">Pontuação Geral</span>
      <span class="judge-card-score ${cls}">${agg}/100</span>
    </div>`;
  }

  // Fonte bula in right panel
  if (msg.documents_context) {
    const docs = msg.documents_context;
    const sections = docs.split(/^## /m).filter(Boolean);
    let fonteHtml = '';
    for (const sec of sections) {
      const lines = sec.split('\n'); const title = lines[0].trim(); const content = lines.slice(1).join('\n').trim();
      if (title && content) {
        fonteHtml += `<div class="fonte-card-section"><div class="fonte-card-label">${esc(title)}</div><div class="fonte-card-content">${esc(content)}</div></div>`;
      }
    }
    if (!fonteHtml) fonteHtml = `<div class="fonte-card-content">${esc(docs)}</div>`;
    html += `<div class="fonte-card"><div class="fonte-card-title"><i data-lucide="file-text"></i> Fonte (Bula)</div>${fonteHtml}</div>`;
  }

  // Judge cards
  for (const [key, label] of Object.entries(judgeNames)) {
    const j = ev.judges[key];
    if (!j || j.error) {
      html += `<div class="judge-card"><div class="judge-card-header"><span class="judge-card-name">${label}</span><span class="judge-card-score low">erro</span></div></div>`;
      continue;
    }
    const sc = j.score || 0; const cls = sc >= 80 ? 'high' : sc >= 60 ? 'mid' : 'low';
    const saved = messageEvals[index]?.[key];

    let justText = '';
    if (j.justificativas) justText = Object.entries(j.justificativas).map(([k,v]) => `${k}: ${v}`).join('\n');
    else if (j.justification) justText = j.justification;

    let criteriaHtml = '';
    if (key === 'source_judge' && j.claims?.length) {
      criteriaHtml = j.claims.map(c => `<div class="judge-crit-row"><span class="judge-crit-name">"${esc(c.text||'')}"</span><span class="judge-crit-score" style="background:var(--bg3);color:var(--text2);">${c.classification||''}</span></div>`).join('');
    } else if (j.criteria_scores) {
      criteriaHtml = Object.entries(j.criteria_scores).map(([crit,cs]) => {
        const cc = cs>=8?'high':cs>=6?'mid':'low'; const just = j.justificativas?.[crit]||'';
        return `<div class="judge-crit-row"><span class="judge-crit-name">${crit}</span><span class="judge-crit-score ${cc}">${cs}/10</span></div>${just?`<div class="judge-crit-just">${esc(just)}</div>`:''}`;
      }).join('');
    }

    html += `<div class="judge-card">
      <div class="judge-card-header"><span class="judge-card-name">${label}</span><span class="judge-card-score ${cls}">${sc}/100</span></div>
      ${justText ? `<div class="judge-card-just">${esc(justText)}</div>` : ''}
      ${criteriaHtml ? `<div class="judge-criteria-toggle" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('open')"><i data-lucide="chevron-right"></i> Detalhes dos critérios</div><div class="judge-criteria-detail">${criteriaHtml}</div>` : ''}
      <div class="concordance-group">
        <button class="concordance-btn ${saved?.concordance==='concordo'?'selected-concordo':''}" onclick="setConcordance(${index},'${key}','concordo',this)">✓ Concordo</button>
        <button class="concordance-btn ${saved?.concordance==='parcial'?'selected-parcial':''}" onclick="setConcordance(${index},'${key}','parcial',this)">◐ Parcial</button>
        <button class="concordance-btn ${saved?.concordance==='discordo'?'selected-discordo':''}" onclick="setConcordance(${index},'${key}','discordo',this)">✗ Discordo</button>
      </div>
      <div class="reason-input ${saved?.concordance==='discordo'||saved?.concordance==='parcial'?'visible':''}" id="reason-${index}-${key}">
        <label>Se discorda ou concorda parcialmente, por quê?</label>
        <textarea placeholder="Descreva brevemente…" oninput="setReason(${index},'${key}',this.value)">${saved?.reason||''}</textarea>
      </div>
    </div>`;
  }

  // Topic judges
  if (ev.topic_judges && ev.topics_detected?.length) {
    const tn = { posologia:'💊 Posologia', contraindicacoes:'⚠️ Contraindicações', reacoes_adversas:'🔬 Reações Adversas' };
    for (const topic of ev.topics_detected) {
      const tj = ev.topic_judges[topic]; if (!tj||tj.error) continue;
      const sc = tj.coverage_score||0; const cls = sc>=80?'high':sc>=60?'mid':'low';
      html += `<div class="judge-card" style="border-left:3px solid var(--accent-pro);">
        <div class="judge-card-header"><span class="judge-card-name">${tn[topic]||topic} (Tópico)</span><span class="judge-card-score ${cls}">${sc}/100</span></div>
        ${tj.questions_answered?.length?`<div style="font-size:12px;color:var(--text2);margin-bottom:4px;">✅ ${tj.questions_answered.join(', ')}</div>`:''}
        ${tj.questions_missing?.length?`<div style="font-size:12px;color:var(--eval-red);margin-bottom:4px;">❌ ${tj.questions_missing.join(', ')}</div>`:''}
      </div>`;
    }
  }

  // General evaluation section
  html += `<div class="general-eval">
    <div class="general-eval-title"><i data-lucide="clipboard-list"></i> Avaliação Geral do Sistema</div>
    <div class="ge-question"><label>1. Os juízes avaliaram as respostas de forma justa?</label>
      <div class="ge-options">
        <button class="ge-option ${generalEval.overallFairness==='sim'?'selected':''}" data-ge-field="overallFairness" onclick="setGE('overallFairness','sim',this)">Sim, na maioria</button>
        <button class="ge-option ${generalEval.overallFairness==='parcialmente'?'selected':''}" data-ge-field="overallFairness" onclick="setGE('overallFairness','parcialmente',this)">Parcialmente</button>
        <button class="ge-option ${generalEval.overallFairness==='nao'?'selected':''}" data-ge-field="overallFairness" onclick="setGE('overallFairness','nao',this)">Não</button>
      </div></div>
    <div class="ge-question"><label>2. Qual juiz mais distante do seu julgamento?</label>
      <div class="ge-options">
        <button class="ge-option ${generalEval.worstJudge==='safety_judge'?'selected':''}" data-ge-field="worstJudge" onclick="setGE('worstJudge','safety_judge',this)">🛡️ Segurança</button>
        <button class="ge-option ${generalEval.worstJudge==='quality_judge'?'selected':''}" data-ge-field="worstJudge" onclick="setGE('worstJudge','quality_judge',this)">⭐ Qualidade</button>
        <button class="ge-option ${generalEval.worstJudge==='source_judge'?'selected':''}" data-ge-field="worstJudge" onclick="setGE('worstJudge','source_judge',this)">📎 Fundamentação</button>
        <button class="ge-option ${generalEval.worstJudge==='format_judge'?'selected':''}" data-ge-field="worstJudge" onclick="setGE('worstJudge','format_judge',this)">📐 Formato</button>
      </div></div>
    <div class="ge-question"><label>3. Tendência de notas dos juízes?</label>
      <div class="ge-options">
        <button class="ge-option ${generalEval.tendencyBias==='lenientes'?'selected':''}" data-ge-field="tendencyBias" onclick="setGE('tendencyBias','lenientes',this)">Muito altas (lenientes)</button>
        <button class="ge-option ${generalEval.tendencyBias==='adequadas'?'selected':''}" data-ge-field="tendencyBias" onclick="setGE('tendencyBias','adequadas',this)">Adequadas</button>
        <button class="ge-option ${generalEval.tendencyBias==='rigorosos'?'selected':''}" data-ge-field="tendencyBias" onclick="setGE('tendencyBias','rigorosos',this)">Muito baixas (rigorosos)</button>
      </div></div>
    <div class="ge-question"><label>4. Comentários ou sugestões:</label>
      <textarea class="ge-textarea" id="ge-comments" placeholder="Escreva aqui…">${generalEval.comments||''}</textarea>
    </div>
    <button class="submit-btn" id="submit-btn" onclick="submitAll()" disabled>
      <i data-lucide="send"></i> Enviar Avaliação Completa
    </button>
  </div>`;

  scroll.innerHTML = html;
  lucide.createIcons();
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
  updateProgress();
  updateEvalBtn(idx);
}

function setReason(idx, judge, val) {
  if (!messageEvals[idx]) messageEvals[idx] = {};
  if (!messageEvals[idx][judge]) messageEvals[idx][judge] = {};
  messageEvals[idx][judge].reason = val;
}

function updateEvalBtn(idx) {
  const btn = document.getElementById(`eval-btn-${idx}`); if (!btn) return;
  const e = messageEvals[idx] || {};
  const c = Object.keys(e).filter(k => e[k]?.concordance).length;
  if (c >= 4) { btn.className = 'eval-start-btn done'; btn.innerHTML = '<i data-lucide="check-circle"></i> Avaliado ✓'; }
  else { btn.className = 'eval-start-btn active'; btn.innerHTML = `<i data-lucide="clipboard-check"></i> Avaliando (${c}/4)`; }
  lucide.createIcons();
}

function updateProgress() {
  const mm = sessionData?.messages?.filter(m => m.role === 'model' && m.evaluation?.judges && Object.keys(m.evaluation.judges).length > 0) || [];
  const total = mm.length;
  const done = mm.filter(m => { const e = messageEvals[m.index]; return e && Object.keys(e).filter(k => e[k]?.concordance).length >= 4; }).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const bar = document.getElementById('progress-bar'); if (bar) bar.style.width = pct + '%';
  const txt = document.getElementById('progress-text'); if (txt) txt.textContent = `${done}/${total} respostas avaliadas`;
  const sb = document.getElementById('submit-btn'); if (sb) sb.disabled = done === 0;
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
  sessionData.messages.push({ role: 'user', text: msg, timestamp: new Date().toISOString(), index: sessionData.messages.length });
  renderConversation();
  const cs = document.getElementById('conv-scroll');
  cs.innerHTML += '<div id="chat-loading" class="conv-msg conv-msg-model"><div class="conv-avatar"><i data-lucide="scroll-text"></i></div><div class="conv-model-body"><div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div></div></div>';
  lucide.createIcons(); cs.scrollTop = cs.scrollHeight;
  try {
    const res = await fetch(`${API_BASE}/chat`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:msg, mode:sessionData.mode||'patient', sessionId:sid}) });
    document.getElementById('chat-loading')?.remove();
    if (!res.ok) throw new Error('Erro na resposta');
    const data = await res.json();
    const mm = { role:'model', text:data.response, timestamp:new Date().toISOString(), documents_context:data.metadata?.documents||null, index:sessionData.messages.length, evaluation:null };
    sessionData.messages.push(mm);
    renderConversation(); cs.scrollTop = cs.scrollHeight;
    // Trigger judge eval
    const er = await fetch(`${API_BASE}/evaluate`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question:msg, response:data.response, documents:data.metadata?.documents||'', mode:sessionData.mode||'patient', sessionId:sid}) });
    if (er.ok) { const ed = await er.json(); mm.evaluation = { judges:ed.judges||ed.general_judges||{}, aggregate_score:ed.aggregate_score||ed.general_score||null, topic_judges:ed.topic_judges||{}, topics_detected:ed.topics_detected||[] }; renderConversation(); }
  } catch (err) { document.getElementById('chat-loading')?.remove(); sessionData.messages.push({role:'model',text:`Erro: ${err.message}`,index:sessionData.messages.length}); renderConversation(); }
}

// ── Submit ──
async function submitAll() {
  const sb = document.getElementById('submit-btn'); sb.disabled = true;
  sb.innerHTML = '<div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div> Enviando...';
  const comments = document.getElementById('ge-comments')?.value || '';
  const payload = { sessionId: getSessionId(), evaluatorId, evaluatorMeta, messageEvaluations: Object.entries(messageEvals).map(([idx,judges]) => { const i=parseInt(idx); const pm=i>0?sessionData.messages[i-1]:null; return {messageIndex:i, question:pm?.text||'', judges}; }), generalEvaluation: {...generalEval, comments} };
  try {
    const res = await fetch(`${API_BASE}/submit-evaluation`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if (!res.ok) throw new Error('Erro ao salvar');
    document.getElementById('success-overlay').classList.add('active');
  } catch (err) { alert('Erro: '+err.message); sb.disabled=false; sb.innerHTML='<i data-lucide="send"></i> Enviar Avaliação Completa'; lucide.createIcons(); }
}
