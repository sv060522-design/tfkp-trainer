'use strict';
const THEORY = window.TFKP_THEORY;
const THEORY_PROGRESS_KEY = 'tfkp-theory-progress-v1';
const THEORY_PREFS_KEY = 'tfkp-theory-preferences-v1';
const theoryDocs = new Map(THEORY.docs.map(d=>[d.key,d]));
const theoryCards = new Map(THEORY.cards.map(c=>[c.id,c]));
const chapterCache = new Map();
const theoryEscape = value=>String(value??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const theoryArg = value=>theoryEscape(JSON.stringify(value));
const CARD_STATUSES = {new:'Не учил',viewed:'Посмотрел ответ',known:'Знаю',repeat:'Повторить'};
let theoryNotice='', theoryError='', theoryRenderId=0, importTheoryDraft='', lastTheoryHash='';
const theoryState={doc:'themes',chapter:1,mode:'read',cardId:THEORY.cards[0]?.id,query:'',listMode:'chapters',kind:'all',cardStatus:'all',scope:'all',revealed:false,fontSize:18,tocOpen:!window.matchMedia?.('(max-width:900px)').matches,anchor:''};

function validTheoryProgress(value){
 const mapOk=(map,statuses)=>map && typeof map==='object' && !Array.isArray(map) && !Object.keys(map).some(k=>['__proto__','constructor','prototype'].includes(k)) && Object.values(map).every(v=>v && typeof v==='object' && !Array.isArray(v) && statuses.includes(v.status));
 return value?.version===1 && mapOk(value.cards,Object.keys(CARD_STATUSES)) && mapOk(value.chapters,['read','repeat','new']);
}
function loadTheoryProgress(){
 try{const v=JSON.parse(localStorage.getItem(THEORY_PROGRESS_KEY)||'{"version":1,"cards":{},"chapters":{}}');if(!validTheoryProgress(v))throw Error();return v;}
 catch{theoryError='Не удалось прочитать отметки теории. Восстанови их из экспортированной копии.';return {version:1,cards:{},chapters:{}};}
}
let theoryProgress=loadTheoryProgress();
try{const p=JSON.parse(localStorage.getItem(THEORY_PREFS_KEY)||'{}');if([17,18,20,22,24].includes(p.fontSize))theoryState.fontSize=p.fontSize;}catch{}
function saveTheoryProgress(next){
 try{localStorage.setItem(THEORY_PROGRESS_KEY,JSON.stringify(next));theoryProgress=next;theoryError='';return true;}
 catch{theoryError='Браузер не сохранил отметку. Экспортируй теорию перед закрытием страницы.';return false;}
}
function cardStatus(id){return theoryProgress.cards[id]?.status||'new';}
function markTheoryCard(id,status){
 if(!theoryCards.has(id)||!Object.hasOwn(CARD_STATUSES,status))return;
 const next={...theoryProgress,cards:{...theoryProgress.cards,[id]:{...theoryProgress.cards[id],status,updatedAt:new Date().toISOString()}}};
 saveTheoryProgress(next);renderTheory({preserveScroll:true});
}
function markTheoryChapter(status){
 if(!['read','repeat','new'].includes(status))return;
 const id=theoryState.doc+'-'+theoryState.chapter;
 saveTheoryProgress({...theoryProgress,chapters:{...theoryProgress.chapters,[id]:{status,updatedAt:new Date().toISOString()}}});renderTheory({preserveScroll:true});
}
function theoryRoute(doc=theoryState.doc,chapter=theoryState.chapter,anchor=''){return '#doc='+encodeURIComponent(doc)+'&chapter='+chapter+(anchor?'&anchor='+encodeURIComponent(anchor):'');}
function quizRoute(id=theoryState.cardId){return '#doc='+theoryState.doc+'&quiz='+encodeURIComponent(id||'');}
function parseTheoryHash(){
 const params=new URLSearchParams(location.hash.slice(1));
 const doc=theoryDocs.has(params.get('doc'))?params.get('doc'):'themes';
 const number=Number(params.get('chapter')??1);
 const chapter=theoryDocs.get(doc).chapters.some(c=>c.number===number)?number:1;
 const quiz=params.get('quiz');
 Object.assign(theoryState,{doc,chapter,mode:quiz?'quiz':'read',anchor:params.get('anchor')||''});
 if(quiz&&theoryCards.has(quiz))theoryState.cardId=quiz;
 lastTheoryHash=location.hash;
}
function captureTheoryPosition(){
 const old=history.state||{};
 history.replaceState({...old,theory:true,scrollY:window.scrollY,ui:{...theoryState}},'',location.href);
}
function navigateTheory(hash,opts={}){
 if(hash===location.hash && !opts.force){document.getElementById(theoryState.anchor)?.scrollIntoView({block:'start'});return;}
 captureTheoryPosition();
 const before=location.hash;
 history.pushState({theory:true,returnHash:before,scrollY:0},'',hash);
 theoryState.revealed=false;theoryNotice='';parseTheoryHash();
 renderTheory({scrollTop:true});
}
function goTheoryBack(){if(history.state?.returnHash)history.back();}
function switchTheoryDoc(doc){if(!theoryDocs.has(doc))return;theoryState.query='';theoryState.scope='all';navigateTheory(theoryRoute(doc,1),{force:true});}
function switchTheoryMode(mode){
 if(mode==='quiz'){theoryState.listMode='results';theoryState.cardStatus='all';theoryState.scope='all';navigateTheory(quizRoute(),{force:true});}
 else {const card=theoryCards.get(theoryState.cardId);const h=theoryDocs.get(theoryState.doc).headings.find(h=>h.id===card?.id);navigateTheory(theoryRoute(theoryState.doc,h?.chapter||card?.chapter||theoryState.chapter,h?.anchor||''),{force:true});}
}
function changeTheoryFilter(name,value){
 theoryState[name]=value;
 if(['kind','cardStatus','scope'].includes(name)){theoryState.revealed=false;const pool=filteredTheoryCards();if(pool.length)theoryState.cardId=pool[0].id;}
 renderTheory({preserveScroll:true,preserveFocus:name==='query'});
}
function filteredTheoryCards(){
 const q=theoryState.query.trim().toLocaleLowerCase('ru');
 return THEORY.cards.filter(c=>{
  if(theoryState.kind==='definition'&&c.kind!=='definition')return false;
  if(theoryState.kind==='assertion'&&c.kind==='definition')return false;
  if(theoryState.cardStatus!=='all'&&cardStatus(c.id)!==theoryState.cardStatus)return false;
  if(theoryState.scope!=='all'&&!theoryDocs.get(theoryState.doc).chapters.find(x=>String(x.number)===theoryState.scope)?.headings.some(h=>h.id===c.id))return false;
  return !q||[c.name,c.title,c.statementText].join(' ').toLocaleLowerCase('ru').includes(q);
 });
}
function openTheoryCards(status){
 theoryState.cardStatus=status;theoryState.scope='all';theoryState.query='';theoryState.kind='all';theoryState.listMode='results';
 const pool=filteredTheoryCards();if(pool.length)theoryState.cardId=pool[0].id;
 navigateTheory(quizRoute(),{force:true});
}
function nextTheoryCard(random=false){
 const pool=filteredTheoryCards();if(!pool.length)return;
 const index=pool.findIndex(c=>c.id===theoryState.cardId);
 let next=random?Math.floor(Math.random()*pool.length):(index+1)%pool.length;
 if(random&&pool.length>1&&next===index)next=(next+1)%pool.length;
 navigateTheory(quizRoute(pool[next].id));
}
function revealTheoryCard(){
 theoryState.revealed=true;
 if(cardStatus(theoryState.cardId)==='new'){
  const id=theoryState.cardId;
  saveTheoryProgress({...theoryProgress,cards:{...theoryProgress.cards,[id]:{status:'viewed',updatedAt:new Date().toISOString()}}});
 }
 renderTheory({preserveScroll:true});
}
function setTheoryFontSize(value){
 const number=Number(value);if(![17,18,20,22,24].includes(number))return;
 theoryState.fontSize=number;
 try{localStorage.setItem(THEORY_PREFS_KEY,JSON.stringify({fontSize:number}));}catch{}
 document.querySelectorAll('.theory-body,.quiz-answer').forEach(e=>e.style.setProperty('--reading-size',number+'px'));
}
async function loadTheoryChapter(doc,number){
 const chapter=theoryDocs.get(doc)?.chapters.find(c=>c.number===number);if(!chapter)throw Error('Раздел не найден.');
 const file=chapter.contentFile;
 if(!chapterCache.has(file))chapterCache.set(file,fetch('./'+file).then(r=>{if(!r.ok)throw Error('Не удалось загрузить раздел. Проверь подключение и повтори.');return r.json();}).then(envelope=>{if(envelope.format!=='tfkp-source-gzip-v1'||typeof envelope.data!=='string')throw Error('Данные раздела повреждены.');const bytes=Uint8Array.from(atob(envelope.data),c=>c.charCodeAt(0));const data=JSON.parse(window.pako.ungzip(bytes,{to:'string'}));if(typeof data.html!=='string'||typeof data.vectors!=='string')throw Error('Данные раздела повреждены.');return data;}).catch(error=>{chapterCache.delete(file);throw error;}));
 return chapterCache.get(file);
}
function theoryFontControl(){return `<label>Размер текста <select id="theory-font" onchange="setTheoryFontSize(this.value)">${[17,18,20,22,24].map(n=>`<option value="${n}" ${n===theoryState.fontSize?'selected':''}>${n}</option>`).join('')}</select></label>`;}
function theorySourceGuide(){return `<details class="theory-source-guide"><summary>Источники и порядок подготовки</summary><p>${theoryEscape(THEORY.sourceNotes)}</p><p>Основной учебник: ${theoryEscape(THEORY.textbook.title)}. Ссылки «Хасанов, с. …» относятся к печатным страницам учебника. Ссылки «с. … настоящего PDF» ведут к полному доказательству в выбранной подборке.</p><p>Фиолетовый — определения и формулировки; синий — доказательства; зелёный — пояснения и поправки. Формулы сохранены из оригинальных документов, текст адаптирован для чтения на телефоне.</p><p><a href="./theory-sources/tfkp_20_full.pdf" target="_blank" rel="noopener">20 пунктов — исходный PDF</a> · <a href="./theory-sources/tfkp_32_tickets_full.pdf" target="_blank" rel="noopener">32 билета — исходный PDF</a></p></details>`;}
function renderTheorySidebar(){
 const doc=theoryDocs.get(theoryState.doc);const q=theoryState.query.trim().toLocaleLowerCase('ru');
 const chapters=doc.chapters.filter(c=>c.number&&(!q||[c.title,c.searchText].join(' ').toLocaleLowerCase('ru').includes(q)));
 const pool=filteredTheoryCards();
 let rows;
 if(theoryState.listMode==='chapters')rows=chapters.map(c=>{const status=theoryProgress.chapters[doc.key+'-'+c.number]?.status;return `<a class="theory-row ${theoryState.mode==='read'&&theoryState.chapter===c.number?'active':''}" href="${theoryRoute(doc.key,c.number)}"><span class="badge">${c.number}</span><span><strong>${theoryEscape(c.title)}</strong><small>с. ${c.startPage}–${c.endPage} · ${c.headings.length} формулировок${status==='read'?' · Прочитал':status==='repeat'?' · Повторить':''}</small></span></a>`;}).join('');
 else rows=pool.map(c=>{const h=doc.headings.find(h=>h.id===c.id)||c;const href=theoryState.mode==='quiz'?quizRoute(c.id):theoryRoute(doc.key,h.chapter,h.anchor);return `<a class="theory-row ${theoryState.mode==='quiz'&&theoryState.cardId===c.id?'active':''}" href="${href}"><span class="badge">${c.kind==='definition'?'О':'Т'}</span><span><strong>${theoryEscape(c.name)}</strong><small>${theoryEscape(c.number)} · ${CARD_STATUSES[cardStatus(c.id)]}</small></span></a>`;}).join('');
 const counts=['all','known','repeat'].map(status=>`<button class="${theoryState.mode==='quiz'&&theoryState.cardStatus===status?'active':''}" onclick="openTheoryCards(${theoryArg(status)})"><strong>${status==='all'?THEORY.cards.length:THEORY.cards.filter(c=>cardStatus(c.id)===status).length}</strong>${status==='all'?'карточек':CARD_STATUSES[status]}</button>`).join('');
 return `<aside class="theory-sidebar"><div class="theory-modes" aria-label="Порядок теории"><button onclick="switchTheoryDoc('themes')" class="${doc.key==='themes'?'active':''}">20 тем программы</button><button onclick="switchTheoryDoc('tickets')" class="${doc.key==='tickets'?'active':''}">32 предполагаемых билета</button></div><div class="theory-counts">${counts}</div><div class="theory-filters"><input id="theory-search" type="search" aria-label="Поиск по теории" placeholder="Определение, теорема, доказательство" value="${theoryEscape(theoryState.query)}"><div class="theory-contents-tabs"><button class="small ${theoryState.listMode==='chapters'?'active':''}" onclick="changeTheoryFilter('listMode','chapters')">Разделы</button><button class="small ${theoryState.listMode==='results'?'active':''}" onclick="changeTheoryFilter('listMode','results')">Определения и теоремы</button></div>${theoryState.mode==='quiz'||theoryState.listMode==='results'?`<label>Формулировки<select id="theory-kind"><option value="all">Все</option><option value="definition" ${theoryState.kind==='definition'?'selected':''}>Определения</option><option value="assertion" ${theoryState.kind==='assertion'?'selected':''}>Теоремы, леммы и следствия</option></select></label><label>Мой статус<select id="theory-card-status">${[['all','Все'],...Object.entries(CARD_STATUSES)].map(([v,l])=>`<option value="${v}" ${theoryState.cardStatus===v?'selected':''}>${l}</option>`).join('')}</select></label><label>${doc.key==='themes'?'Пункт программы':'Предполагаемый билет'}<select id="theory-scope"><option value="all">Все разделы</option>${doc.chapters.filter(c=>c.number).map(c=>`<option value="${c.number}" ${theoryState.scope===String(c.number)?'selected':''}>${c.number}. ${theoryEscape(c.title)}</option>`).join('')}</select></label>`:''}</div><details class="theory-contents" id="theory-toc" ${theoryState.tocOpen?'open':''}><summary>${theoryState.listMode==='chapters'?'Разделы':'Формулировки'} · ${theoryState.listMode==='chapters'?chapters.length:pool.length}</summary><div class="theory-list">${rows||'<p class="task-meta">Совпадений нет. Измени поиск или фильтры.</p>'}</div></details><a class="intro-link" href="${theoryRoute(doc.key,0)}">О документе, источниках и нумерации</a></aside>`;
}
function renderReadingShell(){
 const doc=theoryDocs.get(theoryState.doc),chapter=doc.chapters.find(c=>c.number===theoryState.chapter);
 const status=theoryProgress.chapters[doc.key+'-'+chapter.number]?.status;
 return `<div class="theory-breadcrumbs">Теория / ${doc.key==='themes'?'Программа Волкова':'Предполагаемые билеты'} / ${chapter.number||'Введение'}</div><article class="card theory-article"><button class="small" onclick="goTheoryBack()" ${history.state?.returnHash?'':'disabled'}>← Вернуться к предыдущему месту</button><h1>${chapter.number?chapter.number+'. ':''}${theoryEscape(chapter.title)}</h1><div class="theory-mini-source">Полный материал из ${doc.key==='themes'?'«ТФКП: 20 пунктов программы Волкова»':'«ТФКП: 32 теоретических билета»'}, с. ${chapter.startPage}–${chapter.endPage}. ${doc.key==='tickets'?'Нумерация билетов предполагаемая. ':''}<a href="./${doc.sourceFile}#page=${chapter.startPage}" target="_blank" rel="noopener">Открыть исходный PDF</a></div><div class="theory-toolbar">${theoryFontControl()}<button class="small" onclick="markTheoryChapter('read')">✓ Прочитал</button><button class="small" onclick="markTheoryChapter('repeat')">В повторение</button><button class="small" onclick="markTheoryChapter('new')">Снять отметку</button><span class="theory-status">${status==='read'?'Прочитал':status==='repeat'?'Повторить':''}</span>${chapter.headings.length?`<label class="jump-label">Перейти к определению или теореме<select id="theory-jump"><option value="">Выбери формулировку</option>${chapter.headings.map(h=>`<option value="${theoryEscape(h.anchor)}">${theoryEscape(theoryCards.get(h.id)?.name||h.title)}</option>`).join('')}</select></label>`:''}</div><div id="theory-content" class="theory-body" style="--reading-size:${theoryState.fontSize}px"><p class="theory-loading" role="status">Загружаю полный текст…</p></div>${theorySourceGuide()}</article><nav class="theory-neighbours">${chapter.number>0?`<a href="${theoryRoute(doc.key,chapter.number-1)}">← ${chapter.number===1?'О документе':'Предыдущий раздел'}</a>`:''}${chapter.number<doc.chapters.length-1?`<a href="${theoryRoute(doc.key,chapter.number+1)}">Следующий раздел →</a>`:''}</nav>`;
}
function renderQuizShell(){
 const pool=filteredTheoryCards();const card=pool.find(c=>c.id===theoryState.cardId)||pool[0];
 if(!card)return `<article class="card theory-article"><h1>Самопроверка формулировок</h1><p class="theory-empty">Карточек с такими фильтрами нет. Можно снять фильтры или выбрать другой статус.</p><button onclick="openTheoryCards('all')">Все карточки</button></article>`;
 theoryState.cardId=card.id;
 const index=pool.findIndex(c=>c.id===card.id),chapter=theoryDocs.get('themes').chapters.find(c=>c.number===card.chapter);
 const kind=card.kind==='definition'?'Определение':card.kind==='lemma'?'Лемма':card.kind==='corollary'?'Следствие':'Теорема';
 return `<div class="theory-breadcrumbs">Теория / Самопроверка / ${index+1} из ${pool.length}</div><article class="card theory-article"><button class="small" onclick="goTheoryBack()" ${history.state?.returnHash?'':'disabled'}>← Вернуться к предыдущему месту</button><h1>Вспомни формулировку</h1><div class="quiz-prompt"><small>${kind} · ${theoryEscape(card.number)} · ${CARD_STATUSES[cardStatus(card.id)]}</small><h2>${theoryEscape(card.name)}</h2><p>${theoryEscape(chapter.title)}</p><p>Назови все условия и вывод. Для определения — перечисли свойства, которые входят в него.</p></div><div class="quiz-actions"><button id="quiz-reveal" class="primary" onclick="${theoryState.revealed?"theoryState.revealed=false;renderTheory({preserveScroll:true})":"revealTheoryCard()"}">${theoryState.revealed?'Скрыть ответ':'Показать ответ'}</button><button onclick="nextTheoryCard()">Следующая карточка →</button><button onclick="nextTheoryCard(true)">Случайная</button></div>${theoryState.revealed?`<div id="quiz-answer" class="quiz-answer" style="--reading-size:${theoryState.fontSize}px"><p class="theory-loading" role="status">Загружаю точную формулировку…</p></div><div class="quiz-actions"><button id="quiz-known" class="quiz-known" onclick="markTheoryCard(${theoryArg(card.id)},'known')">✓ Знаю</button><button id="quiz-repeat" class="quiz-repeat" onclick="markTheoryCard(${theoryArg(card.id)},'repeat')">Нужно повторить</button><button id="quiz-new" onclick="markTheoryCard(${theoryArg(card.id)},'new')">Снять отметку</button>${theoryFontControl()}</div>`:''}<p class="task-meta">Открытие ответа отмечается как «Посмотрел ответ». Только кнопка «Знаю» отмечает выученную формулировку.</p><p><a href="${theoryRoute('themes',card.chapter,card.anchor)}">Формулировка, полное доказательство и пояснения →</a></p>${theorySourceGuide()}</article>`;
}
function theoryProgressPanel(){return `<section id="theory-progress" class="card theory-progress"><h3>Прогресс по теории</h3><p class="task-meta">Карточки и прочитанные разделы сохраняются после перезагрузки. Отметки задач сохраняются отдельно. Для переноса на другое устройство экспортируй обе копии.</p><div class="quiz-actions"><button onclick="exportTheoryProgress()">Экспорт теории</button><button onclick="importTheoryProgress()">Импорт теории</button></div><textarea id="theory-import" aria-label="JSON прогресса теории" placeholder="Резервная копия теории"></textarea></section>`;}
async function renderTheory(opts={}){
 const ticket=++theoryRenderId;
 const savedY=opts.preserveScroll?window.scrollY:0;
 const focused=opts.preserveFocus?document.activeElement?.id:null;
 const selection=focused?document.activeElement?.selectionStart:null;
 const old=document.getElementById('theory-import');if(old)importTheoryDraft=old.value;
 document.getElementById('theory-app').innerHTML=`<div class="theory-shell"><svg class="vector-definitions" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${window.TFKP_THEORY_GLYPHS}</defs></svg><header class="topbar"><div class="brand"><h1>ТФКП — теория</h1><p>Хасанов · программа Волкова · определения и доказательства</p></div><nav class="section-nav" aria-label="Разделы"><a href="./index.html">Задачи</a><a class="active" href="./theory.html" aria-current="page">Теория</a></nav><div class="theory-global-mode"><button class="${theoryState.mode==='read'?'active':''}" onclick="switchTheoryMode('read')">Читать теорию</button><button class="${theoryState.mode==='quiz'?'active':''}" onclick="switchTheoryMode('quiz')">Самопроверка</button><button onclick="document.getElementById('theory-progress').scrollIntoView({behavior:'smooth'})">Прогресс</button></div></header><div class="theory-layout">${renderTheorySidebar()}<main class="theory-main">${theoryNotice?`<div class="theory-notice" role="status">${theoryEscape(theoryNotice)}</div>`:''}${theoryError?`<div class="theory-notice theory-error" role="alert">${theoryEscape(theoryError)}</div>`:''}${theoryState.mode==='read'?renderReadingShell():renderQuizShell()}${theoryProgressPanel()}</main></div></div>`;
 const root=document.getElementById('theory-app');root.dataset.build=THEORY.build;
 document.getElementById('theory-import').value=importTheoryDraft;
 document.getElementById('theory-search').addEventListener('input',e=>changeTheoryFilter('query',e.target.value));
 document.getElementById('theory-toc').addEventListener('toggle',e=>theoryState.tocOpen=e.target.open);
 for(const [id,name] of [['theory-kind','kind'],['theory-card-status','cardStatus'],['theory-scope','scope']])document.getElementById(id)?.addEventListener('change',e=>changeTheoryFilter(name,e.target.value));
 document.getElementById('theory-jump')?.addEventListener('change',e=>{if(e.target.value)navigateTheory(theoryRoute(theoryState.doc,theoryState.chapter,e.target.value));});
 if(focused){const e=document.getElementById(focused);e?.focus();try{e?.setSelectionRange(selection,selection);}catch{}}
 const card=theoryCards.get(theoryState.cardId);
 try{
  if(theoryState.mode==='read'||theoryState.revealed){
   const doc=theoryState.mode==='read'?theoryState.doc:'themes';const chapter=theoryState.mode==='read'?theoryState.chapter:card.chapter;
   const data=await loadTheoryChapter(doc,chapter);if(ticket!==theoryRenderId)return;
   const target=document.getElementById(theoryState.mode==='read'?'theory-content':'quiz-answer');
   if(target)target.innerHTML=data.vectors+(theoryState.mode==='read'?data.html:card.answerHtml);
  }
 }catch(error){if(ticket!==theoryRenderId)return;const target=document.getElementById('theory-content')||document.getElementById('quiz-answer');if(target)target.innerHTML=`<p class="theory-error" role="alert">${theoryEscape(error.message)}</p><button onclick="renderTheory({preserveScroll:true})">Повторить загрузку</button>`;}
 if(ticket!==theoryRenderId)return;
 if(opts.restoreY!==undefined)window.scrollTo(0,opts.restoreY);
 else if(opts.preserveScroll)window.scrollTo(0,savedY);
 else if(theoryState.anchor)document.getElementById(theoryState.anchor)?.scrollIntoView({block:'start'});
 else if(opts.scrollTop)window.scrollTo(0,0);
}
function exportTheoryProgress(){
 const value=JSON.stringify(theoryProgress,null,2);importTheoryDraft=value;document.getElementById('theory-import').value=value;
 const blob=new Blob([value],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='tfkp-theory-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 theoryNotice='Копия теории экспортирована и помещена в поле ниже.';
}
function importTheoryProgress(){
 let value;try{value=JSON.parse(document.getElementById('theory-import').value);if(!validTheoryProgress(value))throw Error();}
 catch{theoryError='Неверный формат копии теории. Текущие отметки сохранены.';renderTheory({preserveScroll:true});return;}
 if(saveTheoryProgress(value)){theoryNotice='Прогресс теории восстановлен.';theoryState.revealed=false;}
 renderTheory({preserveScroll:true});
}
document.addEventListener('click',event=>{
 const a=event.target.closest?.('a[href^="#"]');if(!a||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const hash=a.getAttribute('href');if(!/^#doc=/.test(hash))return;
 event.preventDefault();navigateTheory(hash);
});
function restoreTheoryHistory(){
 if(lastTheoryHash===location.hash)return;
 parseTheoryHash();
 if(history.state?.theory&&history.state.ui)Object.assign(theoryState,history.state.ui);
 else theoryState.revealed=false;
 renderTheory({restoreY:history.state?.scrollY??0});
}
window.addEventListener('popstate',restoreTheoryHistory);
window.addEventListener('hashchange',restoreTheoryHistory);
parseTheoryHash();
if(!location.hash)history.replaceState({theory:true,scrollY:0},'',theoryRoute());
renderTheory();
