const TASKS = window.TFKP_TASKS || [];
const PROGRESS_KEY = 'tfkp-trainer-progress-v2';
const $ = (sel) => document.querySelector(sel);
let state = { query: '', topic: 'all', year: 'all', status: 'all', activeId: TASKS[0]?.id || null, ticket: [] };
let progress = loadProgress();

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch { return {}; }
}
function saveProgress() { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); }
function p(id) { return progress[id] || {}; }
function setP(id, patch) { progress[id] = { ...p(id), ...patch, updatedAt: new Date().toISOString() }; saveProgress(); render(); }
function uniq(arr) { return [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ru')); }
function escapeHtml(str='') { return String(str).replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s])); }
function mdish(str='') {
  return escapeHtml(str)
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}
function taskStatusChip(t) {
  if (t.status === 'answer-added') return '<span class="chip green">есть ответ</span>';
  if (t.status === 'raw-memory') return '<span class="chip gold">отзыв</span>';
  if (t.status === 'needs-review') return '<span class="chip red">сверить OCR</span>';
  return '<span class="chip">черновик</span>';
}
function filteredTasks() {
  const q = state.query.trim().toLowerCase();
  return TASKS.filter(t => {
    if (state.topic !== 'all' && t.topic !== state.topic) return false;
    if (state.year !== 'all' && t.year !== state.year) return false;
    if (state.status === 'solved' && !p(t.id).solved) return false;
    if (state.status === 'starred' && !p(t.id).starred) return false;
    if (q) {
      const hay = [t.title,t.topic,t.statement,t.answer,t.sourceFile,t.variant,t.year].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function randomTask() {
  const arr = filteredTasks();
  if (!arr.length) return;
  state.activeId = arr[Math.floor(Math.random()*arr.length)].id;
  render();
}
function makeTicket() {
  const groups = new Map();
  for (const t of filteredTasks()) {
    if (!groups.has(t.variantId)) groups.set(t.variantId, []);
    groups.get(t.variantId).push(t);
  }
  const variants = [...groups.values()].filter(g => g.length >= 5);
  if (!variants.length) { state.ticket = []; render(); return; }
  const g = variants[Math.floor(Math.random()*variants.length)].sort((a,b)=>String(a.taskNo).localeCompare(String(b.taskNo),'ru'));
  state.ticket = g;
  state.activeId = g[0].id;
  render();
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
  try { progress = JSON.parse(txt); saveProgress(); render(); alert('Прогресс импортирован.'); }
  catch(e) { alert('Не получилось прочитать JSON.'); }
}
function render() {
  const topics = uniq(TASKS.map(t=>t.topic));
  const years = uniq(TASKS.map(t=>t.year));
  const arr = filteredTasks();
  const active = TASKS.find(t=>t.id===state.activeId) || arr[0] || TASKS[0];
  if (active) state.activeId = active.id;
  const solved = TASKS.filter(t=>p(t.id).solved).length;
  const starred = TASKS.filter(t=>p(t.id).starred).length;
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
          <input id="q" placeholder="Поиск по задачам, источникам, формулам" value="${escapeHtml(state.query)}" />
          <div class="filter-grid">
            <select id="topic"><option value="all">Все темы</option>${topics.map(x=>`<option ${state.topic===x?'selected':''} value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')}</select>
            <select id="year"><option value="all">Все годы</option>${years.map(x=>`<option ${state.year===x?'selected':''} value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')}</select>
          </div>
          <select id="status">
            <option value="all" ${state.status==='all'?'selected':''}>Все задачи</option>
            <option value="solved" ${state.status==='solved'?'selected':''}>Только решённые</option>
            <option value="starred" ${state.status==='starred'?'selected':''}>Только со звёздочкой</option>
          </select>
          <div class="stats">
            <div class="stat"><strong>${TASKS.length}</strong><span>в базе</span></div>
            <div class="stat"><strong>${solved}</strong><span>решено</span></div>
            <div class="stat"><strong>${starred}</strong><span>повторить</span></div>
          </div>
        </div>
        <div class="task-list">
          ${arr.slice(0, 500).map(t => `
            <button class="task-row ${active && active.id===t.id?'active':''}" onclick="state.activeId='${t.id}'; render();">
              <span class="badge">${escapeHtml(t.taskNo)}</span>
              <span><span class="task-title">${escapeHtml(t.title)}</span><span class="task-meta">${escapeHtml(t.topic)}<br>${escapeHtml(t.sourceLabel)}</span></span>
              <span class="icons"><span>${p(t.id).solved?'✓':''}</span><span>${p(t.id).starred?'★':''}</span></span>
            </button>`).join('')}
          ${arr.length > 500 ? `<div class="task-meta">Показаны первые 500 задач. Уточни фильтр или поиск.</div>` : ''}
        </div>
      </aside>
      <main class="main">
        <section class="hero card">
          <h2>Письменная семестровая по ТФКП</h2>
          <p>Здесь собраны варианты МФТИ по годам, реальные отзывы с экзамена 2019, ответы и частичные решения там, где они были в материалах. Старые сканы помечены как «сверить OCR»: формулы лучше точечно проверить перед публичным использованием как финального условия.</p>
          <div class="chips"><span class="chip blue">localStorage-прогресс</span><span class="chip">экспорт/импорт</span><span class="chip">случайный вариант</span></div>
        </section>
        ${active ? detail(active) : '<div class="card hero"><h2>Нет задач по фильтру</h2></div>'}
        ${ticketBlock()}
        ${progressBlock()}
      </main>
    </div>
  </div>`;
  $('#q').addEventListener('input', e => { state.query=e.target.value; render(); });
  $('#topic').addEventListener('change', e => { state.topic=e.target.value; render(); });
  $('#year').addEventListener('change', e => { state.year=e.target.value; render(); });
  $('#status').addEventListener('change', e => { state.status=e.target.value; render(); });
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
    <div class="statement"><pre class="statement-pre">${escapeHtml(t.statement)}</pre></div>
    <div class="actions">
      <button class="${pr.solved?'primary':''}" onclick="setP('${t.id}', {solved:${!pr.solved}})">${pr.solved?'✓ Решено':'Отметить решённой'}</button>
      <button onclick="setP('${t.id}', {starred:${!pr.starred}})">${pr.starred?'★ В повторении':'☆ В повторение'}</button>
      <button onclick="navigator.clipboard?.writeText(${JSON.stringify(t.statement)})">Копировать условие</button>
    </div>
    ${t.notes ? `<section class="section"><div class="note-box">${mdish(t.notes)}</div></section>` : ''}
    <section class="section"><h3>Подсказки</h3><ol>${(t.hints||[]).map(x=>`<li>${mdish(x)}</li>`).join('')}</ol></section>
    <section class="section"><h3>Маршрут решения</h3><ol>${(t.algorithm||[]).map(x=>`<li>${mdish(x)}</li>`).join('')}</ol></section>
    ${t.solution ? `<section class="section"><h3>Полное решение</h3><div class="solution-box">${mdish(t.solution)}</div></section>` : ''}
    ${t.answer ? `<section class="section"><h3>Ответ / сверка</h3><div class="answer-box">${mdish(t.answer)}</div></section>` : `<section class="section"><h3>Ответ / сверка</h3><div class="note-box">Ответ пока не внесён. Эту задачу надо решить по методичкам и затем добавить в data/tasks.js в поле answer/solution.</div></section>`}
  </article>`;
}
function ticketBlock() {
  if (!state.ticket.length) return '';
  return `<section class="ticket card"><h3>Собранный вариант</h3><div class="task-meta">${escapeHtml(state.ticket[0].year)} · вариант ${escapeHtml(state.ticket[0].variant)}</div><div class="ticket-list">${state.ticket.map(t=>`<button class="task-row" onclick="state.activeId='${t.id}'; render();"><span class="badge">${escapeHtml(t.taskNo)}</span><span><span class="task-title">${escapeHtml(t.title)}</span><span class="task-meta">${escapeHtml(t.topic)}</span></span><span></span></button>`).join('')}</div></section>`;
}
function progressBlock() {
  return `<section class="ticket card"><h3>Прогресс</h3><p class="task-meta">Прогресс хранится локально в браузере по ключу <b>${PROGRESS_KEY}</b>. При обновлении сайта он сохранится, если не менять ID старых задач.</p><div class="progress-tools"><button onclick="exportProgress()">Экспорт прогресса</button><button onclick="importProgress()">Импорт прогресса</button><button onclick="if(confirm('Стереть прогресс?')){progress={};saveProgress();render();}">Сбросить</button></div><textarea id="importBox" placeholder="Сюда можно вставить JSON прогресса для импорта"></textarea></section>`;
}
render();
