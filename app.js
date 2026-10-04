const RAW_TASKS = [...(window.TFKP_TASKS || []), ...(window.TFKP_EXTRA_TASKS || [])];
const PROGRESS_KEY = 'tfkp-trainer-progress-v2';
const $ = sel => document.querySelector(sel);
const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ru',{numeric:true}));
function mergeTask(t){const patch=window.TFKP_TASK_OVERRIDES?.[t.id]||{};return {...t,...patch,tags:uniq([...(t.tags||[]),...(patch.tags||[])])};}
const ALL_TASKS = RAW_TASKS.map(mergeTask);
const SOURCE_NOTES = ALL_TASKS.filter(t=>t.status==='raw-memory');
const STUDY_TASKS = ALL_TASKS.filter(t=>t.status!=='raw-memory');
const TASKS = STUDY_TASKS.filter(t=>t.statementPretty && t.solution && t.answer).sort((a,b)=>String(b.year).localeCompare(String(a.year),'ru',{numeric:true})||String(a.variant).localeCompare(String(b.variant),'ru',{numeric:true})||String(a.taskNo).localeCompare(String(b.taskNo),'ru',{numeric:true}));
const LEARNING_STATUSES = {'not-started':'Не решал','in-progress':'Решаю','solved-self':'Решил сам','solved-hint':'Решил с подсказкой','viewed':'Посмотрел решение','unclear':'Не понял'};
let state={query:'',topic:'all',topics:[],subtopic:'all',year:'all',source:'all',kind:'all',difficulty:'all',quality:'all',status:'all',activeId:TASKS[0]?.id||null,ticket:[],trainingKind:'',trainingCount:5,visibleLimit:50,notice:'',pinned:false,reveals:{},filtersOpen:!(window.matchMedia?.('(max-width: 900px)').matches),listOpen:!(window.matchMedia?.('(max-width: 900px)').matches)};
let progressNotice='';
let progress=loadProgress();
function validProgress(value){return value!==null && typeof value==='object' && !Array.isArray(value) && !Object.keys(value).some(k=>['__proto__','constructor','prototype'].includes(k)) && Object.values(value).every(e=>e!==null && typeof e==='object' && !Array.isArray(e) && (e.solved===undefined||typeof e.solved==='boolean') && (e.starred===undefined||typeof e.starred==='boolean') && (e.learningStatus===undefined||Object.hasOwn(LEARNING_STATUSES,e.learningStatus)));}
function normalizeProgress(value){return Object.fromEntries(Object.entries(value).map(([id,entry])=>[id,{...entry,...(entry.learningStatus?{solved:['solved-self','solved-hint'].includes(entry.learningStatus)}:{})}]));}
function loadProgress(){try{const v=JSON.parse(localStorage.getItem(PROGRESS_KEY)||'{}');if(!validProgress(v))throw Error();return normalizeProgress(v);}catch{progressNotice='Не удалось прочитать сохранённые отметки. Восстанови их из экспортированного JSON.';return {};}}
function saveProgress(value=progress){try{localStorage.setItem(PROGRESS_KEY,JSON.stringify(value));progressNotice='';return true;}catch{progressNotice='Браузер не сохранил изменения. Экспортируй прогресс перед закрытием страницы.';return false;}}
function p(id){return progress[id]||{};}
function learningStatus(id){return p(id).learningStatus||(p(id).solved?'solved-self':'not-started');}
function setP(id,patch){progress[id]={...p(id),...patch,updatedAt:new Date().toISOString()};saveProgress();render();}
function setLearningStatus(id,status){if(!Object.hasOwn(LEARNING_STATUSES,status))return;setP(id,{learningStatus:status,solved:['solved-self','solved-hint'].includes(status)});}
function escapeHtml(str=''){return String(str).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));}
const jsArg = value => escapeHtml(JSON.stringify(value));
const suspicious = t => /по рукописной сверке|решение неполное|надо сверить|далее очевидно|маршрут такой без|TODO|PLACEHOLDER/i.test([t.solution,t.notes].join(' '));
function statementChecked(t){return t.statementVerification==='source-verified';}
function answerChecked(t){return ['independently-verified','source-verified','numeric-verified'].includes(t.answerVerification);}
function solutionChecked(t){return t.solutionVerification==='reviewed' && !suspicious(t);}
function isVerified(t){return statementChecked(t)&&answerChecked(t)&&solutionChecked(t)&&Boolean(t.statementPretty&&t.answer&&t.solution);}
function isNeedsReview(t){return !isVerified(t);}
function taskStatusChip(t){return `<span class="chip ${isVerified(t)?'green':'gold'}">${isVerified(t)?'✓ полностью проверено':'требует проверки'}</span>`;}
function rich(text=''){
 const source=escapeHtml(text).trim().replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
 return source.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean).map(block=>/^\$\$[\s\S]*\$\$$/.test(block)?`<div class="math-block">${block}</div>`:block.split('\n').every(x=>/^[-–—]\s+/.test(x))?`<ul>${block.split('\n').map(x=>`<li>${x.replace(/^[-–—]\s+/,'')}</li>`).join('')}</ul>`:`<p>${block.replace(/\n/g,'<br>')}</p>`).join('');
}
function mdish(text=''){return rich(text);}
function renderStatement(t){return `<div class="statement-rich">${rich(t.statementPretty||t.statement)}</div>`;}
function plainTaskText(t){return (t.statementPretty||t.statement||'').replace(/\$\$|\\\(|\\\)/g,'').trim();}
function taskTopics(t){return t.topics?.length?t.topics:[t.primaryTopic||t.topic];}
function searchHaystack(t){return [t.id,t.title,t.primaryTopic,t.topic,t.statementPretty,t.answer,t.solution,t.sourceFile,t.sourceLabel,t.variant,t.year,...taskTopics(t),...(t.subtopics||[]),...(t.tags||[])].join(' ').toLowerCase();}
function selectedTopics(){return state.topics.length?state.topics:(state.topic==='all'?[]:[state.topic]);}
function filteredTasks(){const q=state.query.trim().toLowerCase();return TASKS.filter(t=>{
 if(!selectedTopics().every(topic=>taskTopics(t).includes(topic)))return false;
 if(state.subtopic!=='all'&&!t.subtopics?.includes(state.subtopic))return false;
 if(state.year!=='all'&&t.year!==state.year)return false;
 if(state.source!=='all'&&t.sourceFile!==state.source)return false;
 if(state.kind!=='all'&&t.kind!==state.kind&&t.type!==state.kind)return false;
 if(state.difficulty!=='all'&&t.difficulty!==Number(state.difficulty))return false;
 if(state.quality==='verified'&&!isVerified(t))return false;
 if(state.quality==='statement'&&statementChecked(t))return false;
 if(state.quality==='answer'&&answerChecked(t))return false;
 if(state.quality==='solution'&&solutionChecked(t))return false;
 if(state.quality==='needs-review'&&!isNeedsReview(t))return false;
 if(state.status==='solved'&&!p(t.id).solved)return false;
 if(state.status==='starred'&&!p(t.id).starred)return false;
 if(!['all','solved','starred'].includes(state.status)&&learningStatus(t.id)!==state.status)return false;
 return !q||searchHaystack(t).includes(q);
});}
function updateHash(id){if(typeof location!=='undefined'&&typeof history!=='undefined')history.replaceState(null,'',`${location.pathname}${location.search}#task=${encodeURIComponent(id)}`);}
function selectTask(id,pinned=false){if(!TASKS.some(t=>t.id===id))return;state.activeId=id;state.pinned=pinned;updateHash(id);render();document.querySelector('.detail')?.scrollIntoView?.({behavior:'smooth',block:'start'});}
function openHashTask(){if(typeof location==='undefined')return;const id=new URLSearchParams(location.hash.slice(1)).get('task');if(id&&TASKS.some(t=>t.id===id)){state.activeId=id;state.pinned=true;}}
function randomTask(){const a=filteredTasks();if(!a.length){state.notice='По выбранным фильтрам задач нет.';render();return;}selectTask(a[Math.floor(Math.random()*a.length)].id);}
function makeTicket(){const eligible=new Set(filteredTasks().filter(t=>t.type==='semester').map(t=>t.variantId));const groups=new Map();for(const t of TASKS.filter(t=>t.type==='semester'&&eligible.has(t.variantId))){if(!groups.has(t.variantId))groups.set(t.variantId,[]);groups.get(t.variantId).push(t);}const variants=[...groups.values()].filter(g=>g.length>=5);if(!variants.length){state.notice='В выбранной выборке нет исторического варианта. Выбери семестровые или экзаменационные задачи.';render();return;}state.ticket=variants[Math.floor(Math.random()*variants.length)].sort((a,b)=>String(a.taskNo).localeCompare(String(b.taskNo),'ru',{numeric:true}));state.trainingKind='Реальный вариант';state.notice='Открыт полный исторический вариант. Тематические фильтры не обрезают его состав.';selectTask(state.ticket[0].id,true);}
function makeTraining(){const pool=[...filteredTasks()];for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}state.ticket=pool.slice(0,Math.max(1,Math.min(20,Number(state.trainingCount)||5)));state.trainingKind='Тренировка по теме';state.notice=state.ticket.length?`В тренировке ${state.ticket.length} задач из текущей выборки.`:'По выбранным фильтрам задач нет.';if(state.ticket.length)selectTask(state.ticket[0].id,true);else render();}
function exportProgress(){const blob=new Blob([JSON.stringify(progress,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tfkp-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function importProgress(){let v;try{v=JSON.parse($('#importBox').value.trim());if(!validProgress(v))throw Error();v=normalizeProgress(v);}catch{return alert('Неверный формат прогресса. Текущие отметки сохранены.');}if(!saveProgress(v)){render();return;}progress=v;render();alert('Прогресс импортирован.');}
function rememberFocus(){const e=document.activeElement;return e?.id?{id:e.id,start:e.selectionStart,end:e.selectionEnd}:null;}
function restoreFocus(f){if(!f)return;const e=document.getElementById(f.id);if(!e)return;e.focus();try{e.setSelectionRange(f.start??e.value.length,f.end??e.value.length);}catch{}}
function changeFilter(name,value){state[name]=value;state.visibleLimit=50;state.pinned=false;state.notice='';render({preserveFocus:name==='query'});}
function addTopic(topic){if(topic==='all')return;state.topics=uniq([...selectedTopics(),topic]);state.topic='all';state.visibleLimit=50;state.pinned=false;render();}
function removeTopic(topic){state.topics=selectedTopics().filter(x=>x!==topic);state.topic='all';state.visibleLimit=50;state.pinned=false;render();}
function resetFilters(){Object.assign(state,{query:'',topic:'all',topics:[],subtopic:'all',year:'all',source:'all',kind:'all',difficulty:'all',quality:'all',status:'all',visibleLimit:50,pinned:false,notice:''});render();}
function markSolutionViewed(id){if(learningStatus(id)!=='not-started')return false;progress[id]={...p(id),solved:false,learningStatus:'viewed',updatedAt:new Date().toISOString()};saveProgress();return true;}
function revealAll(id){const t=TASKS.find(t=>t.id===id);if(!t)return;const keys=['prerequisites','idea','route','short','solution','answer',...(t.hints||[]).map((_,i)=>'hint'+i),...(t.methodRefs||[]).map(key=>'method-'+key),'source'];state.reveals[id]=Object.fromEntries(keys.map(key=>[key,true]));markSolutionViewed(id);render({syncDisclosures:false});}
function hideAll(id){state.reveals[id]={};render({syncDisclosures:false});}
function onDisclosureToggle(d){if(d.isConnected===false)return;const id=d.dataset.task,key=d.dataset.part;state.reveals[id]={...(state.reveals[id]||{}),[key]:d.open};if(d.open&&['solution','short'].includes(key)&&markSolutionViewed(id)){render({preserveFocus:true});return;}if(d.open&&window.MathJax?.typesetPromise)window.MathJax.typesetPromise([d]).catch(()=>{});}
function disclosure(t,key,label,body){const open=state.reveals[t.id]?.[key];return `<details class="learning-block" data-task="${escapeHtml(t.id)}" data-part="${escapeHtml(key)}" ${open?'open':''}><summary id="learn-${escapeHtml(key)}">${escapeHtml(label)}</summary><div class="learning-content">${body}</div></details>`;}
function options(values,current,counts){return values.map(x=>`<option value="${escapeHtml(x)}" ${current===x?'selected':''}>${escapeHtml(x)}${counts?` — ${counts(x)}`:''}</option>`).join('');}
function taskRow(t,active){return `<button class="task-row ${active?.id===t.id?'active':''} ${isVerified(t)?'verified-row':'raw-row'}" onclick="selectTask(${jsArg(t.id)},true)"><span class="badge">${escapeHtml(t.taskNo)}</span><span><span class="task-title">${escapeHtml(t.title)}</span><span class="task-meta">${escapeHtml(t.primaryTopic||t.topic)} · сложность ${t.difficulty||'—'}/5<br>${escapeHtml(t.sourceLabel)}</span></span><span class="icons">${isVerified(t)?'✓':''}${p(t.id).solved?' ✓':''}${p(t.id).starred?' ★':''}</span></button>`;}
function render(opts={}){
 // Native details toggle events are queued. Preserve the current DOM state even
 // if another action renders before a pending toggle event is delivered.
 if(opts.syncDisclosures!==false)for(const d of document.querySelectorAll?.('.learning-block')||[]){const id=d.dataset.task,key=d.dataset.part;state.reveals[id]={...(state.reveals[id]||{}),[key]:d.open};}
 window.MathJax?.typesetClear?.();
 const focus=opts.preserveFocus?rememberFocus():null;const importDraft=document.getElementById('importBox')?.value||'';const topics=uniq(TASKS.flatMap(taskTopics)),subs=uniq(TASKS.flatMap(t=>t.subtopics||[])),years=uniq(TASKS.map(t=>t.year)),sources=uniq(TASKS.map(t=>t.sourceFile));const arr=filteredTasks();const active=(state.pinned?TASKS:arr).find(t=>t.id===state.activeId)||arr[0]||null;if(active){state.activeId=active.id;updateHash(active.id);}const verified=TASKS.filter(isVerified).length;
 document.getElementById('app').innerHTML=`<div class="app-shell"><header class="topbar"><div class="brand"><h1>ТФКП — тренажёр</h1><p>ФЭФМ МФТИ · самостоятельная подготовка · прогресс в браузере</p></div><div class="nav"><button class="primary" onclick="randomTask()">Случайная задача</button><button onclick="makeTicket()">Реальный вариант</button><button onclick="document.getElementById('progress-panel').scrollIntoView({behavior:'smooth'})">Прогресс</button></div></header><div class="layout"><aside class="sidebar"><div class="card filters"><input id="q" aria-label="Поиск задач" placeholder="Поиск по задаче, формуле или ID" value="${escapeHtml(state.query)}" autocomplete="off"><div class="stats"><div class="stat"><strong>${TASKS.length}</strong><span>в базе</span></div><div class="stat"><strong>${verified}</strong><span>полностью проверено</span></div><div class="stat"><strong>${TASKS.filter(t=>p(t.id).solved).length}</strong><span>решено</span></div><div class="stat"><strong>${TASKS.filter(t=>p(t.id).starred).length}</strong><span>повторить</span></div></div><details id="filterPanel" ${state.filtersOpen?'open':''}><summary>Фильтры · найдено ${arr.length}</summary><div class="filter-controls"><label>Добавить тему<select id="topic"><option value="all">Все темы</option>${options(topics,'',x=>TASKS.filter(t=>taskTopics(t).includes(x)).length)}</select></label><div class="selected-topics">${selectedTopics().map(x=>`<button class="small" onclick="removeTopic(${jsArg(x)})">${escapeHtml(x)} ×</button>`).join('')}${selectedTopics().length>1?'<span class="task-meta">Нужны все выбранные темы</span>':''}</div><label>Подтема<select id="subtopic"><option value="all">Все подтемы</option>${options(subs,state.subtopic,x=>TASKS.filter(t=>t.subtopics?.includes(x)).length)}</select></label><div class="filter-grid"><label>Год<select id="year"><option value="all">Все годы</option>${options(years,state.year)}</select></label><label>Сложность<select id="difficulty"><option value="all">Все уровни</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(state.difficulty)===n?'selected':''}>${n}/5</option>`).join('')}</select></label></div><label>Источник<select id="source"><option value="all">Все источники</option>${options(sources,state.source,x=>TASKS.filter(t=>t.sourceFile===x).length)}</select></label><label>Тип задачи<select id="kind"><option value="all">Все типы</option>${[['semester','Семестровая'],['exam','Экзамен'],['textbook','Задачник'],['oral','Устная']].map(([v,l])=>`<option value="${v}" ${state.kind===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Качество<select id="quality">${[['all','Все'],['verified','Полностью проверенные'],['needs-review','Требуют проверки'],['statement','Нужно проверить условие'],['answer','Нужно проверить ответ'],['solution','Нужно проверить решение']].map(([v,l])=>`<option value="${v}" ${state.quality===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Мой статус<select id="status">${[['all','Все задачи'],['solved','Все решённые'],['starred','Повторить'],...Object.entries(LEARNING_STATUSES)].map(([v,l])=>`<option value="${v}" ${state.status===v?'selected':''}>${l}</option>`).join('')}</select></label><button class="small" onclick="resetFilters()">Сбросить фильтры</button></div></details><div class="training-controls"><label>Задач в тренировке<select id="trainingCount">${[5,10,15,20].map(n=>`<option value="${n}" ${state.trainingCount===n?'selected':''}>${n}</option>`).join('')}</select></label><button onclick="makeTraining()">Тренировка по теме</button></div></div><details id="taskListPanel" ${state.listOpen?'open':''}><summary>Список задач · ${arr.length}</summary><div class="task-list">${arr.slice(0,state.visibleLimit).map(t=>taskRow(t,active)).join('')}${arr.length>state.visibleLimit?`<button onclick="state.visibleLimit+=50;render()">Показать ещё · ${arr.length-state.visibleLimit} осталось</button>`:''}${!arr.length?'<p>По выбранным фильтрам задач нет.</p>':''}</div></details></aside><main class="main">${state.notice?`<div class="quality-note" role="status">${escapeHtml(state.notice)}</div>`:''}${progressNotice?`<div class="quality-note" role="alert">${escapeHtml(progressNotice)}</div>`:''}${active?detail(active):'<div class="card hero"><h2>Нет задач по фильтру</h2><button onclick="resetFilters()">Сбросить фильтры</button></div>'}${ticketBlock()}${progressBlock()}</main></div></div>`;
 $('#q').addEventListener('input',e=>changeFilter('query',e.target.value));$('#topic').addEventListener('change',e=>addTopic(e.target.value));for(const id of ['subtopic','year','source','kind','difficulty','quality','status'])$('#'+id).addEventListener('change',e=>changeFilter(id,e.target.value));$('#trainingCount').addEventListener('change',e=>state.trainingCount=Number(e.target.value));$('#filterPanel').addEventListener('toggle',e=>state.filtersOpen=e.target.open);$('#taskListPanel').addEventListener('toggle',e=>state.listOpen=e.target.open);
 for(const d of document.querySelectorAll?.('.learning-block')||[])d.addEventListener('toggle',()=>onDisclosureToggle(d));
 $('#importBox').value=importDraft;
 document.getElementById('app').dataset.build=window.TFKP_BUILD||'';
 restoreFocus(focus);if(window.MathJax?.typesetPromise){window.MathJax.typesetPromise().catch(()=>{});}
}
function renderTaskDiagram(t) {
  if (['keyhole','jordan'].includes(t.diagram?.type)) return renderMethodDiagram(t.diagram);
  if (t.diagram?.type === 'annulus') return renderAnnulusDiagram(t.diagram);
  if (t.diagram?.type === 'roots') return renderRootsDiagram(t.diagram);
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
function renderMethodDiagram(d) {
 const keyhole=d.type==='keyhole';
 const path=keyhole?'<path d="M220 163H346 A125 125 0 1 0 346 187H220 A20 20 0 1 1 220 163" fill="none" stroke="#2563eb" stroke-width="3"/><path d="M210 175H370" stroke="#dc2626" stroke-width="2" stroke-dasharray="5 4"/><text x="257" y="152">верхний берег →</text><text x="257" y="212">← нижний берег</text><text x="240" y="283">e²πⁱ⁽ˢ⁻¹⁾ · xˢ⁻¹</text><text x="138" y="160">ε</text><text x="283" y="55">R</text><circle cx="123" cy="140" r="4" fill="#dc2626"/><text x="62" y="124">полюс r</text>':'<path d="M65 175 A145 145 0 0 1 355 175" fill="none" stroke="#2563eb" stroke-width="3"/><path d="M65 175H355" stroke="#2563eb" stroke-width="3"/><text x="87" y="161">−R</text><text x="331" y="161">R</text><text x="177" y="119">Im z &gt; 0</text><text x="171" y="219">по оси слева направо →</text><text x="125" y="272">|eⁱᵏᶻ| = e⁻ᵏ ⁱᵐ ᶻ, k &gt; 0</text><circle cx="242" cy="98" r="4" fill="#dc2626"/><text x="251" y="94">полюс</text>';
 return `<figure class="solution-diagram"><svg viewBox="0 0 420 340" role="img" aria-label="${keyhole?'Контур с разрезом по положительной полуоси':'Контур в верхней полуплоскости'}"><path d="M20 175H400 M210 315V15" stroke="#94a3b8"/><text x="367" y="170">Re z</text><text x="220" y="26">Im z</text>${path}</svg><figcaption>${keyhole?'Положительный обход: верхний берег от ε к R, нижний — обратно. Малая окружность обходится по часовой стрелке.':'Для k > 0 дуга идёт от R к −R против часовой стрелки. При k < 0 контур отражается вниз и меняет ориентацию.'}</figcaption></figure>`;
}

function renderAnnulusDiagram(d) {
  if (!d.center?.every(Number.isFinite) || !Number.isFinite(d.inner) || d.inner<0 || (d.outer!==null && (!Number.isFinite(d.outer)||d.outer<=d.inner))) return '';
  const range=Math.max(d.outer||d.inner*2||2,...(d.poles||[]).map(p=>Math.hypot(p[0]-d.center[0],p[1]-d.center[1])),d.point?Math.hypot(d.point[0]-d.center[0],d.point[1]-d.center[1]):0)*1.28;
  const scale=140/range, xy=p=>[210+(p[0]-d.center[0])*scale,175-(p[1]-d.center[1])*scale];
  const ring=d.outer===null?'<rect x="20" y="20" width="380" height="310" fill="#e0f2fe"/>':`<circle cx="210" cy="175" r="${d.outer*scale}" fill="#e0f2fe" stroke="#2563eb" stroke-dasharray="6 4"/>`;
  const hole=d.inner?`<circle cx="210" cy="175" r="${d.inner*scale}" fill="white" stroke="#2563eb" stroke-dasharray="6 4"/>`:'';
  const poles=(d.poles||[]).map(p=>{const [px,py]=xy(p);return `<circle cx="${px}" cy="${py}" r="4" fill="#dc2626"/><text x="${px+7}" y="${py-7}" font-size="11">${escapeHtml(p[0]+(p[1]>=0?'+':'')+p[1]+'i')} (${p[2]})</text>`;}).join('');
  const point=d.point?(()=>{const [px,py]=xy(d.point);return `<circle cx="${px}" cy="${py}" r="4" fill="#16a34a"/><text x="${px+7}" y="${py+14}">z₀</text>`;})():'';
  return `<figure class="solution-diagram"><svg viewBox="0 0 420 360" role="img" aria-label="Кольцо сходимости ряда Лорана, заданная точка и полюса">${ring}${hole}<path d="M20 175H400 M210 330V20" stroke="#94a3b8"/><text x="363" y="169">Re u</text><text x="218" y="30">Im u</text><circle cx="210" cy="175" r="3" fill="#1d4ed8"/><text x="217" y="190">c</text>${poles}${point}<text x="24" y="349">${escapeHtml(d.outer===null?'Внешний радиус ∞':'Пунктир: границы не входят в кольцо')}</text></svg><figcaption>${escapeHtml(d.caption)}</figcaption></figure>`;
}
function renderRootsDiagram(d) {
 if(!Number.isInteger(d.n)||d.n<2||d.n>16||!Number.isFinite(d.angle))return '';
 const marks=Array.from({length:d.n},(_,k)=>{const a=d.angle+2*Math.PI*k/d.n,x=210+118*Math.cos(a),y=175-118*Math.sin(a);return `<circle cx="${x}" cy="${y}" r="4" fill="#2563eb"/><text x="${210+140*Math.cos(a)}" y="${180-140*Math.sin(a)}" text-anchor="middle">z${k}</text>`;}).join('');
 return `<figure class="solution-diagram"><svg viewBox="0 0 420 350" role="img" aria-label="Корни на окружности"><circle cx="210" cy="175" r="118" fill="none" stroke="#cbd5e1"/><path d="M20 175H400 M210 325V20" stroke="#94a3b8"/>${marks}<text x="222" y="195">0</text></svg><figcaption>${escapeHtml(d.caption)}</figcaption></figure>`;
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
  return `<figure class="solution-diagram"><svg viewBox="0 0 420 370" role="img" aria-label="${escapeHtml(d.caption || 'Геометрическая схема на комплексной плоскости')}">
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

function detail(t){const pr=p(t.id),id=jsArg(t.id);const checks=[['Условие сверено',statementChecked(t)],['Ответ проверен',answerChecked(t)],['Решение проверено',solutionChecked(t)]];return `<article class="detail card"><div class="detail-head"><div class="chips"><span class="chip blue">${escapeHtml(t.primaryTopic||t.topic)}</span><span class="chip">${escapeHtml(t.year)}</span><span class="chip">Сложность ${t.difficulty||'—'}/5</span>${taskStatusChip(t)}</div><h2>${escapeHtml(t.title)}</h2><div class="task-meta">${escapeHtml(t.sourceLabel)} · ${escapeHtml(t.sourceTask||t.taskNo)}${t.sourcePage?` · PDF: ${t.sourcePage}`:''}</div><div class="quality-checks">${checks.map(([label,ok])=>`<span class="${ok?'check-ok':'check-pending'}">${ok?'✓':'○'} ${label}</span>`).join('')}</div></div><div class="statement">${renderStatement(t)}${t.statementDiagram?renderTaskDiagram({...t,diagram:t.statementDiagram}):''}</div><div class="actions"><label>Мой статус<select id="learningStatus" onchange="setLearningStatus(${id},this.value)">${Object.entries(LEARNING_STATUSES).map(([v,l])=>`<option value="${v}" ${learningStatus(t.id)===v?'selected':''}>${l}</option>`).join('')}</select></label><button onclick="setP(${id},{starred:${!pr.starred}})">${pr.starred?'★ В повторении':'☆ В повторение'}</button><button onclick="navigator.clipboard?.writeText(${jsArg(plainTaskText(t))})">Копировать условие</button><button onclick="navigator.clipboard?.writeText(location.href)">Ссылка на задачу</button><button onclick="revealAll(${id})">Раскрыть всё</button><button onclick="hideAll(${id})">Свернуть всё</button></div><section class="section learning-tools">${t.prerequisites?.length?disclosure(t,'prerequisites','Нужно знать',`<ul>${t.prerequisites.map(x=>`<li>${mdish(x)}</li>`).join('')}</ul>`):''}${disclosure(t,'idea','Показать идею',mdish(t.idea||t.hints?.[0]||''))}${(t.hints||[]).map((x,i)=>disclosure(t,'hint'+i,'Показать подсказку '+(i+1),mdish(x))).join('')}${disclosure(t,'route','Показать маршрут решения',`<ol>${(t.algorithm||[]).map(x=>`<li>${mdish(x)}</li>`).join('')}</ol>`)}${t.shortSolution?disclosure(t,'short','Показать краткое решение',mdish(t.shortSolution)):''}${disclosure(t,'solution','Показать подробное решение',`<div class="solution-box">${mdish(t.solution)}${renderTaskDiagram(t)}</div>`)}${disclosure(t,'answer','Показать ответ',`<div class="answer-box">${mdish(t.answer)}</div>`)}${(t.methodRefs||[]).map(key=>{const m=window.TFKP_METHODS?.[key];return m?disclosure(t,'method-'+key,'Метод: '+m.title,mdish(m.body)+(m.diagram?renderTaskDiagram({diagram:m.diagram}):'')+`<p class="task-meta">${escapeHtml(m.source||'Пояснение тренажёра')}</p>`):'';}).join('')}${disclosure(t,'source','Источник и проверка',`<p>${escapeHtml(t.sourceFile)} · ${escapeHtml(t.sourceTask||t.taskNo)} · ${t.sourcePrintedPage?'страница книги '+escapeHtml(t.sourcePrintedPage)+' · ':''}страница PDF ${escapeHtml(t.sourcePage||'—')}</p>${/^https?:\/\//i.test(t.sourceUrl||'')?`<p><a href="${escapeHtml(t.sourceUrl)}" target="_blank" rel="noopener">Открыть первичный источник</a></p>`:''}<p>${escapeHtml(t.verificationEvidence?.summary||'Проверка карточки не завершена.')}</p>`)}</section></article>`;}
function ticketBlock(){return state.ticket.length?`<section class="ticket card"><h3>${escapeHtml(state.trainingKind)}</h3><p class="task-meta">${state.ticket.length} задач${state.trainingKind==='Реальный вариант'?` · ${escapeHtml(state.ticket[0].year)} · вариант ${escapeHtml(state.ticket[0].variant)}`:''}</p><div class="ticket-list">${state.ticket.map(t=>taskRow(t,{id:state.activeId})).join('')}</div></section>`:'';}
function progressBlock(){return `<section id="progress-panel" class="ticket card"><h3>Прогресс</h3><p class="task-meta">Статусы и отметки повторения сохраняются в этом браузере после перезагрузки и обновления сайта. Для резервной копии или переноса на другое устройство экспортируй JSON. Старые отметки «Решено» и «В повторении» поддерживаются.</p><div class="progress-tools"><button onclick="exportProgress()">Экспорт прогресса</button><button onclick="importProgress()">Импорт прогресса</button><button onclick="if(confirm('Стереть прогресс?')){progress={};saveProgress();render();}">Сбросить</button></div><textarea id="importBox" aria-label="JSON прогресса" placeholder="JSON прогресса для импорта"></textarea></section>`;}
openHashTask();
window.addEventListener?.('hashchange',()=>{openHashTask();render();});
render();
