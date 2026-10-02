const RAW_TASKS = [...(window.TFKP_TASKS || []), ...(window.TFKP_EXTRA_TASKS || [])];
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

const ALL_TASKS = RAW_TASKS.map(mergeTask);
// Exam recollections are source notes, not exercises with recoverable conditions.
const SOURCE_NOTES = ALL_TASKS.filter(t => t.status === 'raw-memory');
const STUDY_TASKS = ALL_TASKS.filter(t => t.status !== 'raw-memory');
const TASKS = STUDY_TASKS.filter(t => t.statementPretty && t.answer && t.solution)
  .sort((a, b) => String(b.year).localeCompare(String(a.year), 'ru', { numeric: true })
    || String(a.variant).localeCompare(String(b.variant), 'ru', { numeric: true })
    || String(a.taskNo).localeCompare(String(b.taskNo), 'ru', { numeric: true }));
let state = { query: '', topic: 'all', year: 'all', kind: 'all', quality: 'all', status: 'all', activeId: TASKS[0]?.id || null, ticket: [] };
let progressNotice = '';
let progress = loadProgress();

function validProgress(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every(entry => entry !== null && typeof entry === 'object'
      && !Array.isArray(entry)
      && (entry.solved === undefined || typeof entry.solved === 'boolean')
      && (entry.starred === undefined || typeof entry.starred === 'boolean'));
}
function loadProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
    if (!validProgress(value)) throw new Error('Invalid progress');
    return value;
  } catch {
    progressNotice = 'Не удалось прочитать сохранённые отметки. Можно восстановить их из экспортированного JSON.';
    return {};
  }
}
function saveProgress(value = progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(value));
    progressNotice = '';
    return true;
  } catch {
    progressNotice = 'Браузер не сохранил изменения. Экспортируй прогресс перед закрытием страницы.';
    return false;
  }
}
function p(id) { return progress[id] || {}; }
function setP(id, patch) { progress[id] = { ...p(id), ...patch, updatedAt: new Date().toISOString() }; saveProgress(); render({ preserveFocus: false }); }
function escapeHtml(str='') { return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }

function isVerified(t) {
  // A checked answer or an old status flag does not verify an OCR statement.
  return Boolean(t.statementPretty);
}
function isNeedsReview(t) {
  return !isVerified(t) && (t.status === 'verified' || t.status === 'needs-review' || /OCR|сверить|черновик/i.test([t.notes, t.status].join(' ')));
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
    if (state.kind === 'textbook' && t.type !== 'textbook') return false;
    if (state.kind === 'semester' && t.type !== 'semester') return false;
    if (state.kind === 'oral' && t.type !== 'oral') return false;
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
  let value;
  try {
    value = JSON.parse(txt);
    if (!validProgress(value)) throw new Error('Invalid progress');
  } catch {
    return alert('Неверный формат прогресса. Нужен JSON из кнопки «Экспорт прогресса». Текущие отметки сохранены.');
  }
  if (!saveProgress(value)) { render({ preserveFocus: false }); return; }
  progress = value;
  render({ preserveFocus: false });
  alert('Прогресс импортирован.');
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
  const active = arr.find(t=>t.id===state.activeId) || arr[0] || null;
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
          <select id="kind" aria-label="Источник задач">
            <option value="all" ${state.kind==='all'?'selected':''}>Все источники</option>
            <option value="semester" ${state.kind==='semester'?'selected':''}>Семестровые и экзамены</option>
            <option value="oral" ${state.kind==='oral'?'selected':''}>Устные задачи</option>
            <option value="textbook" ${state.kind==='textbook'?'selected':''}>Задачи из пособий</option>
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
          <h2>Практика по ТФКП</h2>
          <p>Семестровые варианты прошлых лет и типовые задачи из пособий. У каждой карточки есть сверенное условие, ответ и полное решение. Выбирай тему, год или источник и сохраняй задачи для повторения.</p>
          <div class="chips"><span class="chip blue">прогресс в браузере</span><span class="chip green">${verified} проверенных</span><span class="chip">экспорт/импорт</span><span class="chip">случайный вариант</span></div>
        </section>
        ${progressNotice ? `<div class="quality-note" role="alert">${escapeHtml(progressNotice)}</div>` : ''}
        ${active ? detail(active) : '<div class="card hero"><h2>Нет задач по фильтру</h2></div>'}
        ${ticketBlock()}
        ${progressBlock()}
      </main>
    </div>
  </div>`;

  $('#q').addEventListener('input', e => { state.query=e.target.value; render({ preserveFocus: true }); });
  $('#topic').addEventListener('change', e => { state.topic=e.target.value; render({ preserveFocus: false }); });
  $('#year').addEventListener('change', e => { state.year=e.target.value; render({ preserveFocus: false }); });
  $('#kind').addEventListener('change', e => { state.kind=e.target.value; render({ preserveFocus: false }); });
  $('#status').addEventListener('change', e => { state.status=e.target.value; render({ preserveFocus: false }); });
  restoreFocus(focus);
  if (window.MathJax?.typesetPromise) MathJax.typesetPromise();
}

function renderTaskDiagram(t) {
  if (t.diagram?.type === 'branch-cut') return renderBranchDiagram(t.diagram);
  if (t.diagram?.type === 'sector-map') return renderSectorDiagram(t.diagram);
  if (['conformal-arc', 'hyperbolic-region', 'halfplane-disk'].includes(t.diagram?.type)) return renderConformalDiagram(t.diagram);
  if (t.diagram?.type !== 'rays') return '';
  const angles = t.diagram.angles || [];
  if (!angles.length || angles.length > 8 || !angles.every(Number.isFinite)) return '';
  const labels = t.diagram.labels || [];
  const rays = angles.map((degrees, index) => {
    const angle = degrees * Math.PI / 180;
    const x = 230 + 135 * Math.cos(angle), y = 160 - 135 * Math.sin(angle);
    const lx = 230 + 155 * Math.cos(angle), ly = 160 - 155 * Math.sin(angle);
    return `<line x1="230" y1="160" x2="${x}" y2="${y}" stroke="#2563eb" stroke-width="3" marker-end="url(#solution-ray-arrow)" />
      <text x="${lx}" y="${ly + 5}" text-anchor="${Math.cos(angle) >= 0 ? 'start' : 'end'}" fill="#1d4ed8">${escapeHtml(labels[index] || `${degrees}°`)}</text>`;
  }).join('');
  return `<figure class="solution-diagram"><svg viewBox="0 0 460 320" role="img" aria-label="Множество решений на комплексной плоскости: два луча из начала координат">
    <defs><marker id="solution-axis-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#64748b" /></marker>
    <marker id="solution-ray-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="#2563eb" /></marker></defs>
    <line x1="40" y1="160" x2="420" y2="160" stroke="#64748b" marker-end="url(#solution-axis-arrow)" />
    <line x1="230" y1="295" x2="230" y2="25" stroke="#64748b" marker-end="url(#solution-axis-arrow)" />
    <text x="399" y="185" fill="#475569">Re z</text><text x="240" y="31" fill="#475569">Im z</text>
    ${rays}<circle cx="230" cy="160" r="4" fill="#2563eb" /><text x="239" y="181" fill="#475569">0</text>
  </svg><figcaption>Два луча с отмеченными углами. Начало координат входит в множество решений.</figcaption></figure>`;
}

function renderBranchDiagram(d) {
  const range = d.range || 3;
  if (!Number.isFinite(range) || range <= 0) return '';
  const scale = 150 / range;
  const xy = p => [210 + scale * p[0], 185 - scale * p[1]];
  const path = points => points.map((p, i) => `${i ? 'L' : 'M'}${xy(p).join(' ')}`).join(' ');
  const segments = (d.segments || []).map(p => `<path d="${path(p)}" stroke="#dc2626" stroke-width="4" fill="none"/>`).join('');
  const arcs = (d.arcs || []).map(a => {
    const points = Array.from({length: 81}, (_, i) => {
      const angle = (a.start + (a.end - a.start) * i / 80) * Math.PI / 180;
      return [a.center[0] + a.r * Math.cos(angle), a.center[1] + a.r * Math.sin(angle)];
    });
    return `<path d="${path(points)}" stroke="#dc2626" stroke-width="4" fill="none"/>`;
  }).join('');
  const circles = (d.circles || []).map(c => {
    const [x,y] = xy(c.center);
    return `<circle cx="${x}" cy="${y}" r="${c.r * scale}" fill="none" stroke="${c.color === '#dc2626' ? '#dc2626' : '#2563eb'}" stroke-width="2" ${c.dashed ? 'stroke-dasharray="5 4"' : ''}/>`;
  }).join('');
  const contours = (d.contours || []).map(p => `<path d="${path(p)}" stroke="#2563eb" stroke-width="2" fill="none"/>`).join('');
  const points = (d.points || []).map(p => {
    const [x,y] = xy(p.at);
    return `<circle cx="${x}" cy="${y}" r="4" fill="#1d4ed8"/><text x="${x + 9}" y="${y + 18}" fill="#1e3a8a">${escapeHtml(p.label)}</text>`;
  }).join('');
  return `<figure class="solution-diagram"><svg viewBox="0 0 420 370" role="img" aria-label="Разрез и точки нормировки на комплексной плоскости">
    <path d="M20 185H400 M210 350V20" stroke="#94a3b8" fill="none"/><text x="362" y="177">Re z</text><text x="220" y="26">Im z</text>
    ${circles}${contours}${segments}${arcs}${points}</svg><figcaption>${escapeHtml(d.caption || 'Красным обозначен удалённый разрез.')}</figcaption></figure>`;
}

function renderSectorDiagram(d) {
  return `<figure class="solution-diagram mapping-diagram"><div class="mapping-panels"><div><svg viewBox="0 0 280 260" role="img" aria-label="Угол −π/4 меньше arg z меньше π/4">
    <path d="M70 130L190 10H265V250H190Z" fill="#dbeafe"/><path d="M70 130L190 10 M70 130L190 250" stroke="#2563eb" stroke-width="2" fill="none"/>
    <path d="M20 130H265 M70 245V15" stroke="#94a3b8" fill="none"/><circle cx="70" cy="130" r="4" fill="white" stroke="#2563eb"/>
    <circle cx="145" cy="130" r="4" fill="#1d4ed8"/><text x="141" y="150">1</text><text x="57" y="150">0</text><text x="120" y="69">π/4</text><text x="120" y="202">−π/4</text></svg></div><span class="mapping-arrow" aria-hidden="true">→</span><div><svg viewBox="0 0 280 260" role="img" aria-label="Единичный круг">
    <circle cx="135" cy="130" r="78" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/><path d="M25 130H255 M135 225V20" stroke="#94a3b8" fill="none"/>
    <circle cx="135" cy="130" r="4" fill="#1d4ed8"/><text x="146" y="151">0</text><text x="75" y="245">|w| &lt; 1</text></svg></div></div><figcaption>${escapeHtml(d.caption)}</figcaption></figure>`;
}

function renderConformalDiagram(d) {
  const axes = '<path d="M25 130H255 M135 225V20" fill="none" stroke="#94a3b8"/><text x="238" y="151">Re</text><text x="146" y="30">Im</text>';
  let source, target, caption;
  const disk = (boundary) => {
    const mark = boundary === 'i' ? '<circle cx="135" cy="52" r="4" fill="#dc2626"/><text x="146" y="47">i</text>'
      : boundary === '1' ? '<circle cx="213" cy="130" r="4" fill="#dc2626"/><text x="222" y="124">1</text>' : '';
    return `<svg viewBox="0 0 280 260" role="img" aria-label="Образ: единичный круг"><circle cx="135" cy="130" r="78" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>${axes}<circle cx="135" cy="130" r="4" fill="#2563eb"/><text x="144" y="151">0</text>${mark}<text x="75" y="245">|w| &lt; 1</text></svg>`;
  };
  const halfplane = (sourceView) => `<svg viewBox="0 0 280 260" role="img" aria-label="Верхняя полуплоскость"><path d="M25 25H255V190H25Z" fill="#dbeafe"/><path d="M25 190H255 M135 225V20" fill="none" stroke="#94a3b8"/><text x="236" y="210">Re</text><text x="146" y="30">Im</text>${sourceView ? '<circle cx="135" cy="130" r="4" fill="#2563eb"/><text x="146" y="131">i</text>' : '<circle cx="135" cy="190" r="4" fill="#dc2626"/><text x="123" y="211">0</text><circle cx="205" cy="190" r="4" fill="#dc2626"/><text x="207" y="211">1</text>'}<text x="65" y="245">Im ${sourceView ? 'z' : 'w'} &gt; 0</text></svg>`;
  if (d.type === 'conformal-arc') {
    if (![d.start, d.end].every(Number.isFinite) || d.end <= d.start || d.end - d.start > 360) return '';
    const points = Array.from({ length: 97 }, (_, k) => {
      const angle = (d.start + (d.end - d.start) * k / 96) * Math.PI / 180;
      return [135 + 78 * Math.cos(angle), 130 - 78 * Math.sin(angle)];
    });
    const path = points.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const endpoints = [points[0], points.at(-1)].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#dc2626"/>`).join('');
    source = `<svg viewBox="0 0 280 260" role="img" aria-label="Исходная область: плоскость с удалённой дугой"><path d="M15 15H265V228H15Z" fill="#eff6ff"/>${axes}<circle cx="135" cy="130" r="78" fill="none" stroke="#cbd5e1" stroke-dasharray="4 4"/><path d="${path}" fill="none" stroke="#dc2626" stroke-width="4"/>${endpoints}<circle cx="135" cy="130" r="4" fill="#2563eb"/><text x="145" y="151">0</text><text x="221" y="122">1</text><text x="146" y="49">i</text><text x="142" y="222">−i</text><text x="53" y="245">Красная дуга удалена</text></svg>`;
    target = disk(d.target);
    caption = 'Исходная область содержит точки с обеих сторон окружности. Удалена только красная дуга; синяя точка 0 переходит в центр круга.';
  } else if (d.type === 'hyperbolic-region') {
    const points = Array.from({ length: 81 }, (_, k) => {
      const x = .32 + 3 * k / 80;
      return [45 + 58 * x, 215 - 58 / x];
    });
    const curve = points.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const region = `M45 25L${points[0].join(' ')} ${points.map(([x,y])=>`L${x} ${y}`).join(' ')} L238 215H45Z`;
    source = `<svg viewBox="0 0 280 260" role="img" aria-label="Первый квадрант под гиперболой xy=1"><path d="${region}" fill="#dbeafe"/><path d="M25 215H255 M45 228V20" fill="none" stroke="#94a3b8"/><path d="${curve}" fill="none" stroke="#2563eb" stroke-width="2"/><circle cx="103" cy="157" r="4" fill="#dc2626"/><text x="110" y="153">1+i</text><circle cx="103" cy="215" r="4" fill="#dc2626"/><text x="105" y="235">1</text><text x="159" y="179">xy=1</text><text x="238" y="235">Re</text><text x="55" y="30">Im</text><text x="75" y="245">x &gt; 0, y &gt; 0, xy &lt; 1</text></svg>`;
    target = halfplane(false);
    caption = 'Квадрат превращает область под гиперболой в полосу 0 < Im ζ < 2. Экспонента и положительный сдвиг дают верхнюю полуплоскость; 1+i → 0, 1 → 1.';
  } else {
    source = halfplane(true);
    target = disk();
    caption = 'Точка i переходит в центр круга. Вещественная ось переходит в единичную окружность.';
  }
  return `<figure class="solution-diagram mapping-diagram"><div class="mapping-panels"><div>${source}</div><span class="mapping-arrow" aria-hidden="true">→</span><div>${target}</div></div><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

function detail(t) {
  const pr = p(t.id);
  return `<article class="detail card">
    <div class="detail-head">
      <div class="chips"><span class="chip blue">${escapeHtml(t.topic)}</span><span class="chip">${escapeHtml(t.year)}</span><span class="chip">${t.type === 'textbook' ? 'пример' : t.type === 'oral' ? 'устная задача' : 'вариант'} ${escapeHtml(t.variant)}</span>${taskStatusChip(t)}</div>
      <h2>${escapeHtml(t.title)}</h2>
      <div class="task-meta">Источник: ${escapeHtml(t.sourceLabel)} · ID: ${escapeHtml(t.id)}</div>
    </div>
    <div class="statement">${renderStatement(t)}</div>
    <div class="actions">
      <button class="${pr.solved?'primary':''}" onclick="setP('${t.id}', {solved:${!pr.solved}})">${pr.solved?'✓ Решено':'Отметить решённой'}</button>
      <button onclick="setP('${t.id}', {starred:${!pr.starred}})">${pr.starred?'★ В повторении':'☆ В повторение'}</button>
      <button onclick="navigator.clipboard?.writeText(${escapeHtml(JSON.stringify(plainTaskText(t)))})">Копировать условие</button>
    </div>
    ${t.notes ? `<section class="section"><div class="note-box">${mdish(t.notes)}</div></section>` : ''}
    ${t.hints?.length ? `<section class="section"><h3>Подсказки</h3><ol>${t.hints.map(x=>`<li>${mdish(x)}</li>`).join('')}</ol></section>` : ''}
    ${t.algorithm?.length ? `<section class="section"><h3>Маршрут решения</h3><ol>${t.algorithm.map(x=>`<li>${mdish(x)}</li>`).join('')}</ol></section>` : ''}
    ${t.solution ? `<section class="section"><h3>Полное решение</h3><div class="solution-box">${mdish(t.solution)}${renderTaskDiagram(t)}</div></section>` : ''}
    <section class="section"><h3>Ответ / сверка</h3><div class="answer-box">${mdish(t.answer)}</div></section>
  </article>`;
}
function ticketBlock() {
  if (!state.ticket.length) return '';
  return `<section class="ticket card"><h3>Собранный вариант</h3><div class="task-meta">${escapeHtml(state.ticket[0].year)} · вариант ${escapeHtml(state.ticket[0].variant)}</div><div class="ticket-list">${state.ticket.map(t=>`<button class="task-row" onclick="state.activeId='${t.id}'; render({preserveFocus:false});"><span class="badge">${escapeHtml(t.taskNo)}</span><span><span class="task-title">${escapeHtml(t.title)}</span><span class="task-meta">${escapeHtml(t.topic)}</span></span><span></span></button>`).join('')}</div></section>`;
}
function progressBlock() {
  return `<section class="ticket card"><h3>Прогресс</h3><p class="task-meta">Отметки «Решено» и «В повторении» автоматически сохраняются в этом браузере и остаются после перезагрузки и обновления сайта. Для резервной копии или переноса в другой браузер используй экспорт и импорт.</p><div class="progress-tools"><button onclick="exportProgress()">Экспорт прогресса</button><button onclick="importProgress()">Импорт прогресса</button><button onclick="if(confirm('Стереть прогресс?')){progress={};saveProgress();render({preserveFocus:false});}">Сбросить</button></div><textarea id="importBox" placeholder="Сюда можно вставить JSON прогресса для импорта"></textarea></section>`;
}
render();
