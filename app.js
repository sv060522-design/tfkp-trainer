const RAW_TASKS = window.TFKP_TASKS || [];
const OVERRIDES = window.TFKP_TASK_OVERRIDES || {};
const PROGRESS_KEY = 'tfkp-trainer-progress-v2';
const $ = (sel) => document.querySelector(sel);

function uniq(arr) { return [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ru')); }
function mergeTask(t) {
  const o = OVERRIDES[t.id] || {};
  const merged = { ...t, ...o };
  if (o.tags || t.tags) merged.tags = [...(t.tags || []), ...(o.tags || [])];
  return merged;
}

const TASKS = RAW_TASKS.map(mergeTask);
let state = { query: '', topic: 'all', year: 'all', quality: 'all', status: 'all', activeId: TASKS[0]?.id || null, ticket: [] };
let progress = loadProgress();

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch { return {}; }
}
function saveProgress() { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); }
function p(id) { return progress[id] || {}; }
function setP(id, patch) { progress[id] = { ...p(id), ...patch, updatedAt: new Date().toISOString() }; saveProgress(); render({ preserveFocus: false }); }
function escapeHtml(str='') { return String(str).replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s])); }

function isVerified(t) {
  return t.status === 'verified' || Boolean(t.statementPretty);
}
function isNeedsReview(t) {
  return t.status === 'needs-review' || (!isVerified(t) && /OCR|сверить|черновик/i.test([t.notes, t.status].join(' ')));
}
function taskStatusChip(t) {
  if (isVerified(t)) return '<span class="chip green">проверено</span>';
  if (t.status === 'answer-added') return '<span class="chip green">есть ответ</span>';
  if (t.status === 'raw-memory') return '<span class="chip gold">отзыв</span>';
  if (isNeedsReview(t)) return '<span class="chip red">сверить OCR</span>';
  return '<span class="chip">черновик</span>';
}

function rich(text='') {
  const source = escapeHtml(text).trim();
  if (!source) return '';
  const blocks = source.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
  return blocks.map(block => {
    if (/^\s*\$\$[\s\S]*\$\$\s*$/.test(block)) {
      return `<div class="math-block">${block}</div>`;
    }
    const lines = block.split('\n').map(x => x.trim()).filter(Boolean);
    if (lines.length && lines.every(x => /^[-–—]\s+/.test(x))) {
      return `<ul>${lines.map(x => `<li>${x.replace(/^[-–—]\s+/, '')}</li>`).join('')}</ul>`;
    }
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

function mdish(str='') {
  return rich(String(str).replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'));
}

function cleanRawStatement(str='') {
  return String(str)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\bZ\b/g, '∫')
    .replace(/\br\b/g, '√')
    .replace(/\b3q\b/g, '∛')
    .replace(/\b4q\b/g, '∜')
    .replace(/\bz2\b/g, 'z²')
    .replace(/\bx2\b/g, 'x²')
    .replace(/\bz3\b/g, 'z³')
    .replace(/\bx3\b/g, 'x³')
    .replace(/\be2z\b/g, 'e^{2z}')
    .replace(/\bez\+1\b/g, 'e^{z+1}')
    .replace(/\bsh\b/g, 'sinh')
    .replace(/\bch\b/g, 'cosh')
    .replace(/\bctg\b/g, 'cot')
    .replace(/\btg\b/g, 'tan')
    .replace(/\s+\./g, '.')
    .replace(/\s+;/g, ';')
    .trim();
}

function renderStatement(t) {
  const text = t.statementPretty || cleanRawStatement(t.statement || '');
  const body = t.statementPretty ? rich(text) : `<pre class="statement-pre raw-pre">${escapeHtml(text)}</pre>`;
  const warn = isVerified(t) ? '' : `
    <div class="quality-note">
      Это условие перенесено из старого OCR-скана и может быть записано неидеально. Для точного решения сверяй формулу с источником: ${escapeHtml(t.sourceLabel || '')}.
    </div>`;
  return `<div class="statement-rich ${isVerified(t) ? 'verified' : 'raw'}">${body}</div>${warn}`;
}

function plainTaskText(t) {
  return (t.statementPretty || t.statement || '').replace(/\$\$/g, '').replace(/\\\(|\\\)/g, '').trim();
}

function searchHaystack(t) {
  return [t.title, t.topic, t.statement, t.statementPretty, t.answer, t.solution, t.sourceFile, t.sourceLabel, t.variant, t.year, ...(t.tags || [])]
    .join(' ')
    .toLowerCase();
}

function filteredTasks() {
  const q = state.query.trim().toLowerCase();
  return TASKS.filter(t => {
    if (state.topic !== 'all' && t.topic !== state.topic) return false;
    if (state.year !== 'all' && t.year !== state.year) return false;
    if (state.quality === 'verified' && !isVerified(t)) return false;
    if (state.quality === 'needs-review' && !isNeedsReview(t)) return false;
    if (state.status === 'solved' && !p(t.id).solved) return false;
    if (state.status === 'starred' && !p(t.id).starred) return false;
    if (q && !searchHaystack(t).includes(q)) return false;
    return true;
  });
}

function randomTask() {
  const arr = filteredTasks();
  if (!arr.length) return;
  state.activeId = arr[Math.floor(Math.random()*arr.length)].id;
  render({ preserveFocus: false });
}
function makeTicket() {
  const groups = new Map();
  for (const t of filteredTasks()) {
    if (!groups.has(t.variantId)) groups.set(t.variantId, []);
    groups.get(t.variantId).push(t);
  }
  const variants = [...groups.values()].filter(g => g.length >= 5);
  if (!variants.length) { state.ticket = []; render({ preserveFocus: false }); return; }
  const g = variants[Math.floor(Math.random()*variants.length)].sort((a,b)=>String(a.taskNo).localeCompare(String(b.taskNo),'ru'));
  state.ticket = g;
  state.activeId = g[0].id;
  render({ preserveFocus: false });
}
function exportProgress() {
  const blob = new Blob([JSON.stringify(progress,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tfkp-progress.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function importProgress() {
  const txt = $('#importBox').value.trim();
  if (!txt) return alert('Вставь JSON прогресса в поле ниже.');
  try { progress = JSON.parse(txt); saveProgress(); render({ preserveFocus: false }); alert('Прогресс импортирован.'); }
  catch(e) { alert('Не получилось прочитать JSON.'); }
}

function rememberFocus() {
  const el = document.activeElement;
  if (!el || !el.id) return null;
  return { id: el.id, start: el.selectionStart, end: el.selectionEnd };
}
function restoreFocus(f) {
  if (!f) return;
  const el = document.getElementById(f.id);
  if (!el) return;
  el.focus();
  try { el.setSelectionRange(f.start ?? el.value.length, f.end ?? el.value.length); } catch {}
}

function render(opts={}) {
  const focus = opts.preserveFocus ? rememberFocus() : null;
  const topics = uniq(TASKS.map(t=>t.topic));
  const years = uniq(TASKS.map(t=>t.year));
  const arr = filteredTasks();
  const active = TASKS.find(t=>t.id===state.activeId) || arr[0] || TASKS[0];
  if (active) state.activeId = active.id;
  const solved = TASKS.filter(t=>p(t.id).solved).length;
  const starred = TASKS.filter(t=>p(t.id).starred).length;
  const verified = TASKS.filter(isVerified).length;

  document.getElementById('app').innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <h1>Теория функций комплексного переменного — тренажёр</h1>
        <p>ФЭФМ МФТИ · семестровые и экзаменационные задачи · прогресс хранится в браузере</p>
      </div>
      <div class="nav">
        <button class="primary" onclick="randomTask()">🎲 Случайная задача</button>
        <button onclick="makeTicket()">🎟 Собрать вариант</button>
        <button onclick="window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'})">⚙ Прогресс</button>
      </div>
    </header>
    <div class="layout">
      <aside class="sidebar">
        <div class="card filters">
          <input id="q" placeholder="Поиск: Лорана, 2014, вариант 41, вычет..." value="${escapeHtml(state.query)}" autocomplete="off" />
          <div class="filter-grid">
            <select id="topic"><option value="all">Все темы</option>${topics.map(x=>`<option ${state.topic===x?'selected':''} value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')}</select>
            <select id="year"><option value="all">Все годы</option>${years.map(x=>`<option ${state.year===x?'selected':''} value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')}</select>
          </div>
          <select id="quality">
            <option value="all" ${state.quality==='all'?'selected':''}>Все условия</option>
            <option value="verified" ${state.quality==='verified'?'selected':''}>Только проверенные</option>
            <option value="needs-review" ${state.quality==='needs-review'?'selected':''}>Требуют сверки OCR</option>
          </select>
          <select id="status">
            <option value="all" ${state.status==='all'?'selected':''}>Все задачи</option>
            <option value="solved" ${state.status==='solved'?'selected':''}>Только решённые</option>
            <option value="starred" ${state.status==='starred'?'selected':''}>Только со звёздочкой</option>
          </select>
          <div class="stats">
            <div class="stat"><strong>${TASKS.length}</strong><span>в базе</span></div>
            <div class="stat"><strong>${verified}</strong><span>проверено</span></div>
            <div class="stat"><strong>${solved}</strong><span>решено</span></div>
            <div class="stat"><strong>${starred}</strong><span>повторить</span></div>
          </div>
        </div>
        <div class="task-list">
          ${arr.slice(0, 500).map(t => `
            <button class="task-row ${active && active.id===t.id?'active':''} ${isVerified(t)?'verified-row':'raw-row'}" onclick="state.activeId='${t.id}'; render({preserveFocus:false});">
              <span class="badge">${escapeHtml(t.taskNo)}</span>
              <span><span class="task-title">${escapeHtml(t.title)}</span><span class="task-meta">${escapeHtml(t.topic)}<br>${escapeHtml(t.sourceLabel)}</span></span>
              <span class="icons"><span>${isVerified(t)?'✓':''}</span><span>${p(t.id).solved?'✓':''}</span><span>${p(t.id).starred?'★':''}</span></span>
            </button>`).join('')}
          ${arr.length > 500 ? `<div class="task-meta list-note">Показаны первые 500 задач. Уточни фильтр или поиск.</div>` : ''}
          ${!arr.length ? `<div class="task-meta list-note">По такому фильтру задач нет.</div>` : ''}
        </div>
      </aside>
      <main class="main">
        <section class="hero card">
          <h2>Письменная семестровая по ТФКП</h2>
          <p>База собрана из старых вариантов, ответов и реальных отзывов. Зелёная метка «проверено» означает, что условие вручную переписано в читаемый математический вид. Красная метка «сверить OCR» означает, что формулу надо точечно перепроверить по исходному PDF.</p>
          <div class="chips"><span class="chip blue">localStorage-прогресс</span><span class="chip green">${verified} проверенных</span><span class="chip">экспорт/импорт</span><span class="chip">случайный вариант</span></div>
        </section>
        ${active ? detail(active) : '<div class="card hero"><h2>Нет задач по фильтру</h2></div>'}
        ${ticketBlock()}
        ${progressBlock()}
      </main>
    </div>
  </div>`;

  $('#q').addEventListener('input', e => { state.query=e.target.value; render({ preserveFocus: true }); });
  $('#topic').addEventListener('change', e => { state.topic=e.target.value; render({ preserveFocus: false }); });
  $('#year').addEventListener('change', e => { state.year=e.target.value; render({ preserveFocus: false }); });
  $('#quality').addEventListener('change', e => { state.quality=e.target.value; render({ preserveFocus: false }); });
  $('#status').addEventListener('change', e => { state.status=e.target.value; render({ preserveFocus: false }); });
  restoreFocus(focus);
  if (window.MathJax?.typesetPromise) MathJax.typesetPromise();
}

function detail(t) {
  const pr = p(t.id);
  return `<article class="detail card">
    <div class="detail-head">
      <div class="chips"><span class="chip blue">${escapeHtml(t.topic)}</span><span class="chip">${escapeHtml(t.year)}</span><span class="chip">вариант ${escapeHtml(t.variant)}</span>${taskStatusChip(t)}</div>
      <h2>${escapeHtml(t.title)}</h2>
      <div class="task-meta">Источник: ${escapeHtml(t.sourceLabel)} · ID: ${escapeHtml(t.id)}</div>
    </div>
    <div class="statement">${renderStatement(t)}</div>
    <div class="actions">
      <button class="${pr.solved?'primary':''}" onclick="setP('${t.id}', {solved:${!pr.solved}})">${pr.solved?'✓ Решено':'Отметить решённой'}</button>
      <button onclick="setP('${t.id}', {starred:${!pr.starred}})">${pr.starred?'★ В повторении':'☆ В повторение'}</button>
      <button onclick="navigator.clipboard?.writeText(${JSON.stringify(plainTaskText(t))})">Копировать условие</button>
    </div>
    ${t.notes ? `<section class="section"><div class="note-box">${mdish(t.notes)}</div></section>` : ''}
    <section class="section"><h3>Подсказки</h3><ol>${(t.hints||[]).map(x=>`<li>${mdish(x)}</li>`).join('')}</ol></section>
    <section class="section"><h3>Маршрут решения</h3><ol>${(t.algorithm||[]).map(x=>`<li>${mdish(x)}</li>`).join('')}</ol></section>
    ${t.solution ? `<section class="section"><h3>Полное решение</h3><div class="solution-box">${mdish(t.solution)}</div></section>` : ''}
    ${t.answer ? `<section class="section"><h3>Ответ / сверка</h3><div class="answer-box">${mdish(t.answer)}</div></section>` : `<section class="section"><h3>Ответ / сверка</h3><div class="note-box">Ответ пока не внесён. Эту задачу надо решить по методичкам и затем добавить в data/tasks.js или data/overrides.js.</div></section>`}
  </article>`;
}
function ticketBlock() {
  if (!state.ticket.length) return '';
  return `<section class="ticket card"><h3>Собранный вариант</h3><div class="task-meta">${escapeHtml(state.ticket[0].year)} · вариант ${escapeHtml(state.ticket[0].variant)}</div><div class="ticket-list">${state.ticket.map(t=>`<button class="task-row" onclick="state.activeId='${t.id}'; render({preserveFocus:false});"><span class="badge">${escapeHtml(t.taskNo)}</span><span><span class="task-title">${escapeHtml(t.title)}</span><span class="task-meta">${escapeHtml(t.topic)}</span></span><span></span></button>`).join('')}</div></section>`;
}
function progressBlock() {
  return `<section class="ticket card"><h3>Прогресс</h3><p class="task-meta">Прогресс хранится локально в браузере по ключу <b>${PROGRESS_KEY}</b>. При обновлении сайта он сохранится, если не менять ID старых задач.</p><div class="progress-tools"><button onclick="exportProgress()">Экспорт прогресса</button><button onclick="importProgress()">Импорт прогресса</button><button onclick="if(confirm('Стереть прогресс?')){progress={};saveProgress();render({preserveFocus:false});}">Сбросить</button></div><textarea id="importBox" placeholder="Сюда можно вставить JSON прогресса для импорта"></textarea></section>`;
}
render();
