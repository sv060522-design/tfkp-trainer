/* Full source-backed theory reader. Task progress keeps its original key. */
(() => {
  'use strict';
  const KEY = 'tfkp-trainer-theory-progress-v1';
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MODES = {program:'По программе · 20 тем', tickets:'По билетам · 32', quiz:'Самопроверка', book:'Учебник Хасанова'};
  let data, dataPromise, pdfLibPromise, observer, version = 0, active = false, lastTask = '';
  let query = '', quizType = 'all', quizTopic = 'all', quizStatus = 'all', quizReveal = false;
  let quizScopeDoc = 'program', quizSort = 'program', quizSearch = '', quizOnlySelected = false;
  let quizSelected = new Set(), quizListOpen = window.innerWidth > 900;
  const PREF_KEY = KEY + '-preferences';
  let lastRoutes = {};
  let quizId = '', quizQueue = [], zoom = 'fit', progressError = '';
  const pdfs = new Map(), renderJobs = new Set();
  const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
  function validProgress(v) {
    return isObject(v) && !Object.keys(v).some(k=>['__proto__','constructor','prototype'].includes(k)) &&
      isObject(v.topics) && Object.values(v.topics).every(x=>typeof x==='boolean') &&
      isObject(v.cards) && Object.values(v.cards).every(x=>['known','repeat','new'].includes(x)) &&
      ![...Object.keys(v.topics),...Object.keys(v.cards)].some(k=>['__proto__','constructor','prototype'].includes(k));
  }
  function readProgress() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY)||'{"topics":{},"cards":{}}');
      if (!validProgress(v)) throw Error('format');
      return v;
    } catch { progressError = 'Не удалось прочитать отметки теории. Импортируй резервную копию.'; return {topics:{},cards:{}}; }
  }
  let progress = readProgress();
  try {
    const prefs = JSON.parse(localStorage.getItem(PREF_KEY)||'{}');
    if (Array.isArray(prefs.selected)) quizSelected = new Set(prefs.selected.filter(id=>typeof id==='string'));
    if (['program','name','status','random'].includes(prefs.sort)) quizSort=prefs.sort;
    if (['fit','1','1.5','2'].includes(prefs.zoom)) zoom=prefs.zoom;
    quizOnlySelected=!!prefs.onlySelected;
    if(['program','tickets','book'].includes(prefs.scopeDoc))quizScopeDoc=prefs.scopeDoc;
    if(prefs.topic==='all'||/^\d{1,2}$/.test(prefs.topic||''))quizTopic=prefs.topic;
    if(['all','definition','theorem'].includes(prefs.type))quizType=prefs.type;
    if(['all','new','repeat','known'].includes(prefs.status))quizStatus=prefs.status;
    if(typeof prefs.search==='string')quizSearch=prefs.search.slice(0,200);
    if (isObject(prefs.routes)) for (const mode of ['program','tickets','book','quiz']) {
      if (prefs.routes[mode]?.mode===mode) lastRoutes[mode]=prefs.routes[mode];
    }
  } catch {}
  function savePreferences() {
    try { localStorage.setItem(PREF_KEY,JSON.stringify({selected:[...quizSelected],sort:quizSort,routes:lastRoutes,onlySelected:quizOnlySelected,scopeDoc:quizScopeDoc,topic:quizTopic,type:quizType,status:quizStatus,search:quizSearch,zoom})); } catch {}
  }
  function uiState() { return {query,quizType,quizTopic,quizScopeDoc,quizStatus,quizSort,quizSearch,quizOnlySelected,quizSelected:[...quizSelected],quizListOpen,quizId,quizReveal,quizQueue:[...quizQueue],zoom}; }
  function restoreUi(v) {
    if(!isObject(v))return;
    query=v.query||'';quizType=v.quizType||'all';quizTopic=v.quizTopic||'all';quizScopeDoc=v.quizScopeDoc||'program';
    quizStatus=v.quizStatus||'all';quizSort=v.quizSort||'program';quizSearch=v.quizSearch||'';
    quizOnlySelected=!!v.quizOnlySelected;quizSelected=new Set(v.quizSelected||[]);quizListOpen=!!v.quizListOpen;
    quizId=v.quizId||'';quizReveal=!!v.quizReveal;quizQueue=v.quizQueue||[];zoom=v.zoom||'fit';
  }
  function saveProgress(next) {
    try { localStorage.setItem(KEY,JSON.stringify(next)); progress=next; progressError=''; window.TFKPSync?.changed('theory'); return true; }
    catch { progressError='Браузер не сохранил отметку. Экспортируй прогресс теории перед закрытием.'; return false; }
  }
  function route() {
    const p = new URLSearchParams(location.hash.slice(1));
    const mode = Object.hasOwn(MODES,p.get('mode')) ? p.get('mode') : 'program';
    return {mode, item:Math.max(1,Number(p.get('item'))||1), page:Math.min(data?.docs[mode]?.pages||9999,Math.max(0,Math.floor(Number(p.get('page'))||0))), claim:p.get('claim')||'',card:p.get('card')||'',scope:p.get('scope')||''};
  }
  function hashFor(r) {
    const p=new URLSearchParams({section:'theory',mode:r.mode,item:String(r.item||1)});
    if(r.page)p.set('page',r.page); if(r.claim)p.set('claim',r.claim); if(r.card)p.set('card',r.card); if(r.scope)p.set('scope',r.scope);
    return '#'+p.toString();
  }
  function navigate(r) {
    const before=location.hash;
    if (isActive()) lastRoutes[route().mode]=route();
    history.replaceState({...history.state,tfkpScroll:window.scrollY,tfkpQuery:query,tfkpUI:uiState()},'',location.href);
    history.pushState({tfkpReturn:before,tfkpScroll:0},'',hashFor(r));
    query=''; savePreferences(); render(); window.scrollTo({top:0});
  }
  function getSection(mode,item) {
    return data.docs[mode]?.sections.find(s=>s.id===Number(item)) || data.docs[mode]?.sections[0];
  }
  function cardById(id) { return data.cards.find(c=>c.id===id); }
  function locationFor(card,preferred) {
    if(!card)return null;
    return card.locations[preferred]?.[0] || card.locations.program?.[0] || card.locations.tickets?.[0];
  }
  function openClaim(id,preferred=route().mode) {
    const card=cardById(id); if(!card)return;
    const loc=locationFor(card,preferred); if(!loc)return;
    navigate({mode:loc.doc,item:loc.section,page:loc.page,claim:id});
  }
  function openPage(doc,page) {
    if(!data.docs[doc] || !Number.isInteger(Number(page)) || page<1 || page>data.docs[doc].pages)return;
    const s=data.docs[doc].sections.find(s=>s.start<=page&&s.end>=page);
    navigate({mode:doc,item:s?.id||1,page:Number(page)});
  }
  function header() {
    return `<header class="topbar"><div class="brand"><h1>ТФКП — подготовка</h1><p>ФЭФМ МФТИ · теория и задачи</p></div><nav class="section-switch" aria-label="Раздел подготовки"><a href="${E(lastTask||'#task=2024-2025-osen-v1-n1')}">Задачи</a><a class="active" aria-current="page" href="${E(hashFor(lastRoutes[route().mode]||{mode:'program',item:1}))}">Теория</a></nav><div class="nav"><button data-action="back" ${history.state?.tfkpReturn?'':'disabled'}>← К месту чтения</button><button data-action="copy">Ссылка</button><button data-sync-action="open" class="account-open">${E(window.TFKPSync?.buttonLabel()||'Вход и синхронизация')}</button></div></header>`;
  }
  async function loadData() {
    if(data)return data;
    dataPromise ||= fetch('./data/theory.json').then(async r=>{
      if(!r.ok)throw Error('Теория не загрузилась');
      const v=await r.json();
      if(v.schemaVersion!==1 || !Array.isArray(v.cards) || !v.docs?.program || v.docs.program.sections.length!==20 || v.docs.tickets.sections.length!==32)throw Error('Формат теории не распознан');
      data=v;return v;
    }).catch(e=>{dataPromise=null;throw e;});
    return dataPromise;
  }
  async function pdfLibrary() {
    pdfLibPromise ||= import('./vendor/pdfjs/pdf.min.mjs').then(lib=>{
      lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.mjs',document.baseURI).href;
      return lib;
    }).catch(e=>{pdfLibPromise=null;throw e;});
    return pdfLibPromise;
  }
  async function pdfDocument(doc) {
    if(!pdfs.has(doc))pdfs.set(doc,pdfLibrary().then(lib=>lib.getDocument({url:data.docs[doc].file,isEvalSupported:false}).promise).catch(e=>{pdfs.delete(doc);throw e;}));
    return pdfs.get(doc);
  }
  function modeTabs(r) {
    return `<nav class="theory-tabs" aria-label="Способ изучения теории">${Object.entries(MODES).map(([key,label])=>`<button class="${key===r.mode?'primary':''}" data-action="mode" data-mode="${key}" aria-pressed="${key===r.mode}">${label}</button>`).join('')}</nav>`;
  }
  function searchResults(r) {
    if(!query.trim())return '';
    const q=query.toLocaleLowerCase('ru');
    const cards=data.cards.filter(c=>[c.title,c.label,c.heading,c.text].join(' ').toLocaleLowerCase('ru').includes(q));
    const sections=Object.entries(data.docs).flatMap(([doc,m])=>m.sections.filter(s=>[s.title,s.text].join(' ').toLocaleLowerCase('ru').includes(q)).map(s=>({doc,s})));
    const pages=Object.entries(data.docs).flatMap(([doc,m])=>m.pageIndex.map((p,i)=>({doc,page:i+1,text:p.text})).filter(p=>p.text.toLocaleLowerCase('ru').includes(q))).slice(0,30);
    return `<section class="theory-search-results"><h3>Результаты поиска</h3><p class="task-meta">${cards.length} утверждений · ${sections.length} разделов</p>${cards.slice(0,25).map(c=>`<button class="theory-search-hit" data-action="claim" data-id="${c.id}" data-doc="${r.mode}"><strong>${E(c.title)}</strong><small>${E(c.label)}</small></button>`).join('')}${sections.slice(0,15).map(({doc,s})=>`<button class="theory-search-hit" data-action="section" data-mode="${doc}" data-item="${s.id}">${doc==='tickets'?'Билет':doc==='program'?'Тема':'§'} ${s.id}. ${E(s.title)}</button>`).join('')}<details><summary>Найденные страницы · ${pages.length}${pages.length===30?' +':''}</summary>${pages.map(p=>`<button class="theory-search-hit" data-action="page" data-doc="${p.doc}" data-page="${p.page}">${p.doc==='book'?'Хасанов':p.doc==='program'?'Программа':'Билеты'} · с. ${p.page}</button>`).join('')}</details>${!cards.length&&!sections.length?'<p>Совпадений нет. Попробуй название или номер теоремы.</p>':''}</section>`;
  }
  function sidebar(r) {
    const doc = r.mode==='quiz'?'program':r.mode;
    const meta = data.docs[doc];
    return `<aside class="theory-sidebar"><div class="theory-search"><label for="theory-search">Поиск по всей теории</label><input id="theory-search" type="search" placeholder="Например: Лоран, Морера, 9.1" value="${E(query)}" autocomplete="off"></div>${searchResults(r)}<details class="theory-contents" ${window.innerWidth>900?'open':''}><summary>${doc==='tickets'?'32 предполагаемых билета':doc==='book'?'25 параграфов учебника':'20 пунктов программы'}</summary><div class="theory-section-list">${meta.sections.map(s=>`<button class="theory-section ${r.mode===doc&&r.item===s.id?'active':''}" data-action="section" data-mode="${doc}" data-item="${s.id}"><span class="theory-section-number">${s.id}</span><span>${E(s.title)}<small>с. ${s.start}–${s.end}${progress.topics[doc+'-'+s.id]?' · ✓ прочитано':''}${s.extra?' · дополнительно':''}</small></span></button>`).join('')}</div></details><div class="theory-progress-summary"><strong>${Object.values(progress.topics).filter(Boolean).length}</strong> разделов прочитано<br><strong>${Object.values(progress.cards).filter(v=>v==='known').length}</strong> формулировок знаю<button data-action="progress">Прогресс теории</button></div></aside>`;
  }
  function pageMarkup(doc,page,clip=null) {
    const p=data.docs[doc].pageIndex[page-1],rect=clip||[0,0,p.width,p.height];
    const ratio=(rect[3]-rect[1])/(rect[2]-rect[0]);
    return `<div class="theory-page-scroll" tabindex="0" role="region" aria-label="Текст страницы ${page}: горизонтальная прокрутка"><div class="theory-page" data-doc="${doc}" data-page="${page}" data-clip="${E(JSON.stringify(rect))}" style="aspect-ratio:${1/ratio}"><div class="theory-page-loading">Загрузка страницы ${page}…</div></div></div>`;
  }
  function readerMarkup(r) {
    const s=getSection(r.mode,r.item),meta=data.docs[r.mode];
    const standalonePage=r.page && (r.page<s.start||r.page>s.end);
    const pages=standalonePage?[r.page]:Array.from({length:s.end-s.start+1},(_,i)=>s.start+i);
    const key=r.mode+'-'+s.id;
    const counterparts = r.mode==='program'?data.docs.tickets.sections.filter(t=>t.programIds.includes(s.id)):
      r.mode==='tickets'?s.programIds.map(id=>getSection('program',id)):[];
    const claims=s.claimIds.map(cardById).filter(Boolean);
    const references=s.references.filter(id=>!s.claimIds.includes(id)).map(cardById).filter(Boolean);
    return `<article class="card theory-article"><div class="theory-article-head"><div class="chips"><span class="chip blue">${r.mode==='program'?'Программа Волкова':r.mode==='tickets'?'Предполагаемые билеты':'Хасанов · МФТИ · 2022'}</span><span class="chip">${r.mode==='book'?'§':r.mode==='program'?'Тема':'Билет'} ${s.id}</span><span class="chip">${pages.length} ${pages.length===1?'страница':'стр.'}</span></div><h2>${E(s.title)}</h2><p class="task-meta">${E(s.source||data.sourceNotes[r.mode])}</p>${r.mode==='tickets'?'<p class="theory-note">Нумерация взята из присланной карты: это предполагаемые билеты, не утверждённый комплект.</p>':''}${r.mode==='book'&&s.extra?'<p class="theory-note">Дополнительная глава. §§24–25 не входят в присланные конспекты по программе и билетам.</p>':''}<div class="theory-controls"><button data-action="read" data-key="${key}">${progress.topics[key]?'✓ Прочитано · снять отметку':'Отметить прочитанным'}</button>${s.claimIds.length?`<button data-action="practice-section" data-doc="${r.mode}" data-item="${s.id}">Повторить формулировки · ${s.claimIds.length}</button>`:''}<a class="button-link" href="${E(meta.file)}#page=${r.page||s.start}" target="_blank" rel="noopener">Открыть PDF</a></div>${counterparts.length?`<div class="theory-counterparts"><span>Этот материал также:</span>${counterparts.map(t=>`<button class="small" data-action="section" data-mode="${r.mode==='program'?'tickets':'program'}" data-item="${t.id}">${r.mode==='program'?'Билет':'Тема'} ${t.id}</button>`).join('')}</div>`:''}${claims.length?`<details class="theory-claim-index"><summary>Определения и утверждения · ${claims.length}</summary><div>${claims.map(c=>`<button data-action="claim" data-id="${c.id}" data-doc="${r.mode}"><span>${E(c.title)}</span><small>${E(c.label)}</small></button>`).join('')}</div></details>`:''}${references.length?`<details class="theory-claim-index"><summary>Упоминаемые результаты из других разделов · ${references.length}</summary><div>${references.map(c=>`<button data-action="claim" data-id="${c.id}" data-doc="${r.mode}">${E(c.title)} <small>${E(c.label)}</small></button>`).join('')}</div></details>`:''}</div><div class="theory-reader-toolbar"><span>Полный текст · формулировки, доказательства и поправки</span><label>Масштаб <select id="theory-zoom">${[['fit','По ширине'],['1','100%'],['1.5','150%'],['2','200%']].map(([value,label])=>`<option value="${value}" ${zoom===value?'selected':''}>${label}</option>`).join('')}</select></label></div><p class="reader-help">Подчёркнутые ссылки ведут к нужному утверждению. На телефоне увеличь масштаб и прокручивай страницу внутри рамки.</p><div class="theory-reader" aria-label="Полный текст раздела">${pages.map(page=>`<section class="theory-reader-page" id="theory-page-${page}"><p class="theory-page-caption">${r.mode==='book'?'Хасанов':'Конспект'} · страница PDF ${page}${r.mode==='book'&&meta.pageIndex[page-1].printedPage?' · печатная '+meta.pageIndex[page-1].printedPage:''}</p>${pageMarkup(r.mode,page)}</section>`).join('')}</div><div class="theory-section-navigation"><button data-action="section" data-mode="${r.mode}" data-item="${s.id-1}" ${s.id===1?'disabled':''}>← Предыдущий раздел</button><button data-action="section" data-mode="${r.mode}" data-item="${s.id+1}" ${s.id===meta.sections.length?'disabled':''}>Следующий раздел →</button></div></article>`;
  }
  const CARD_STATUS = {new:'Ещё не учил',known:'Знаю',repeat:'Повторить'};
  const CARD_KIND = {definition:'Определение',theorem:'Теорема',lemma:'Лемма',corollary:'Следствие',proposition:'Утверждение'};
  function quizScope() { return quizTopic==='all'?'':quizScopeDoc+'-'+quizTopic; }
  function quizPool(selectedOnly=true) {
    const match=/^(program|tickets|book)-(\d+)$/.exec(route().scope||quizScope());
    const scopeIds=match?getSection(match[1],Number(match[2]))?.claimIds:null;
    const search=quizSearch.trim().toLocaleLowerCase('ru');
    const pool=data.cards.filter(c=>(!scopeIds||scopeIds.includes(c.id)) &&
      (quizType==='all'||(quizType==='definition'?c.kind==='definition':c.kind!=='definition')) &&
      (quizStatus==='all'||(progress.cards[c.id]||'new')===quizStatus) &&
      (!search||[c.title,c.label].join(' ').toLocaleLowerCase('ru').includes(search)) &&
      (!selectedOnly||!quizOnlySelected||quizSelected.has(c.id)));
    const rank={repeat:0,new:1,known:2};
    const byName=(a,b)=>a.title.localeCompare(b.title,'ru',{numeric:true});
    if(quizSort==='name')pool.sort(byName);
    else if(quizSort==='status')pool.sort((a,b)=>rank[progress.cards[a.id]||'new']-rank[progress.cards[b.id]||'new']||byName(a,b));
    else pool.sort((a,b)=>(a.locations[quizScopeDoc]?.[0]?.section||999)-(b.locations[quizScopeDoc]?.[0]?.section||999));
    return pool;
  }
  function selectQuizCard(exclude='') {
    const pool=quizPool();if(!pool.length){quizId='';quizReveal=false;return;}
    const valid=new Set(pool.map(c=>c.id));quizQueue=quizQueue.filter(id=>valid.has(id)&&id!==exclude);
    if(!quizQueue.length){
      if(quizSort!=='random'&&exclude){const pos=pool.findIndex(c=>c.id===exclude);quizQueue=[...pool.slice(pos+1),...pool.slice(0,pos+1)].map(c=>c.id).filter(id=>id!==exclude);}
      else quizQueue=pool.map(c=>c.id).filter(id=>id!==exclude);
      if(!quizQueue.length)quizQueue=pool.map(c=>c.id);
      if(quizSort==='random')for(let i=quizQueue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[quizQueue[i],quizQueue[j]]=[quizQueue[j],quizQueue[i]];}
    }
    quizId=quizQueue.shift();quizReveal=false;
  }
  function quizListMarkup() {
    const pool=quizPool(false);
    return `<details id="quiz-card-list" class="quiz-card-list" ${quizListOpen?'open':''}><summary>Выбрать карточки · найдено ${pool.length} · выбрано ${quizSelected.size}</summary><p class="task-meta">Открой любой вопрос по названию или отметь несколько для своей тренировки. Выбор сохраняется в этом браузере.</p><div class="theory-controls"><button data-action="select-found">Выбрать найденные</button><button data-action="clear-selection">Очистить выбор</button><label class="quiz-selection-toggle"><input id="quiz-only-selected" type="checkbox" ${quizOnlySelected?'checked':''}>Только выбранные</label></div><div class="quiz-card-rows">${pool.map(c=>`<div class="quiz-card-row ${c.id===quizId?'current':''}"><label><input type="checkbox" data-card-select="${E(c.id)}" aria-label="Выбрать: ${E(c.title)}" ${quizSelected.has(c.id)?'checked':''}></label><button data-action="open-card" data-id="${E(c.id)}" aria-current="${c.id===quizId?'true':'false'}"><strong>${E(c.title)}</strong><small>${E(CARD_KIND[c.kind])} · ${CARD_STATUS[progress.cards[c.id]||'new']}</small></button></div>`).join('')||'<p>Нет карточек по этим фильтрам.</p>'}</div></details>`;
  }
  function quizMarkup(r) {
    const scope=/^(program|tickets|book)-(\d+)$/.exec(r.scope);
    if(scope){quizScopeDoc=scope[1];quizTopic=scope[2];}
    const pool=quizPool();const requested=r.card&&pool.find(c=>c.id===r.card);
    if(requested&&requested.id!==quizId){quizId=requested.id;quizReveal=false;}
    if(!pool.some(c=>c.id===quizId)&&!(quizReveal&&r.card===quizId&&cardById(quizId)))selectQuizCard();
    const c=cardById(quizId);
    const counts=Object.fromEntries(['new','repeat','known'].map(status=>[status,data.cards.filter(c=>(progress.cards[c.id]||'new')===status).length]));
    return `<article class="card theory-quiz">
      <div class="theory-article-head"><span class="chip blue">Самопроверка</span><h2>Вспомни формулировку</h2>
        <p>Вопросы названы по смыслу. Вспомни определение или утверждение, затем раскрой ответ и проверь все условия.</p>
        <div class="quiz-statistics" aria-label="Отметки формулировок">${[['all','Всего',data.cards.length],['new','Ещё не учил',counts.new],['repeat','Повторить',counts.repeat],['known','Знаю',counts.known]].map(([status,label,n])=>`<button data-action="card-collection" data-status="${status}"><strong>${n}</strong><span>${label}</span></button>`).join('')}</div>
        <div class="theory-quiz-filters">
          <label>Карточки<select id="quiz-type">${[['all','Определения и утверждения'],['definition','Только определения'],['theorem','Теоремы, леммы и следствия']].map(([v,l])=>`<option value="${v}" ${quizType===v?'selected':''}>${l}</option>`).join('')}</select></label>
          <label>Разбиение<select id="quiz-source">${[['program','По программе'],['tickets','По билетам'],['book','По параграфам учебника']].map(([v,l])=>`<option value="${v}" ${quizScopeDoc===v?'selected':''}>${l}</option>`).join('')}</select></label>
          <label>Раздел<select id="quiz-topic"><option value="all">Вся теория</option>${data.docs[quizScopeDoc].sections.map(sec=>`<option value="${sec.id}" ${quizTopic===String(sec.id)?'selected':''}>${sec.id}. ${E(sec.title)}</option>`).join('')}</select></label>
          <label>Моя отметка<select id="quiz-status">${[['all','Все'],['new','Ещё не учил'],['repeat','Повторить'],['known','Знаю']].map(([v,l])=>`<option value="${v}" ${quizStatus===v?'selected':''}>${l}</option>`).join('')}</select></label>
          <label>Порядок карточек<select id="quiz-sort">${[['program','По порядку разделов'],['name','По названию · А–Я'],['status','По отметке'],['random','В случайном порядке']].map(([v,l])=>`<option value="${v}" ${quizSort===v?'selected':''}>${l}</option>`).join('')}</select></label>
          <label>Поиск карточек<input id="quiz-search" type="search" value="${E(quizSearch)}" placeholder="Например: связное множество" autocomplete="off"></label>
        </div>
        <p class="task-meta" id="quiz-pool-count">${pool.length} карточек в тренировке · ${data.cards.length} всего${quizOnlySelected?' · только выбранные':''}</p>
        <button class="small" data-action="quiz-reset">Сбросить фильтры</button>
        ${quizListMarkup()}
      </div>
      ${c?`<div class="theory-quiz-question"><p class="task-meta">${E(CARD_KIND[c.kind])}${c.locations.program?.length?' · '+[...new Set(c.locations.program.map(l=>'Тема '+l.section))].join(', '):' · Дополнение к билетам'}</p>
        <p class="quiz-prompt">${c.kind==='definition'?'Дай определение понятия:':'Сформулируй утверждение и перечисли его условия:'}</p><h3>${E(c.title)}</h3>
        <button class="primary" id="quiz-show-answer" data-action="reveal" aria-expanded="${quizReveal}">${quizReveal?'Скрыть ответ':'Показать ответ'}</button>
        <button data-action="next" ${!pool.length?'disabled':''}>Следующая →</button>
      </div>
      ${quizReveal?`<section class="theory-quiz-answer" aria-label="Точная формулировка"><p class="task-meta">${E(c.label)} · точная формулировка из полного конспекта.</p>
        <div class="theory-reader-toolbar"><label>Масштаб ответа <select id="theory-zoom">${[['fit','По ширине'],['1','100%'],['1.5','150%'],['2','200%']].map(([value,label])=>`<option value="${value}" ${zoom===value?'selected':''}>${label}</option>`).join('')}</select></label></div>
        <p class="reader-help">Для мелкого текста выбери 100% или больше. Увеличенную формулировку можно прокручивать внутри рамки.</p>
        ${c.segments.map(seg=>pageMarkup(c.answerDoc,seg.page,seg.rect)).join('')}
        <div class="theory-controls"><button data-action="grade" data-grade="known" data-id="${c.id}">✓ Знаю</button><button data-action="grade" data-grade="repeat" data-id="${c.id}">↻ Повторить</button><button data-action="grade" data-grade="new" data-id="${c.id}">Снять отметку</button><button data-action="claim" data-id="${c.id}" data-doc="${c.answerDoc}">Открыть в теории</button></div>
        <p class="task-meta" role="status">Моя отметка: ${CARD_STATUS[progress.cards[c.id]||'new'].toLocaleLowerCase('ru')}.</p>
      </section>`:''}`:'<div class="theory-quiz-question"><p>По этим фильтрам карточек нет. Выбери вопросы в списке или измени фильтры.</p><button data-action="quiz-reset">Все карточки</button></div>'}
    </article>`;
  }
  function progressMarkup() {
    return `<section class="card theory-progress" id="theory-progress"><h2>Прогресс теории</h2><p>Отметки прочитанных тем и выученных формулировок сохраняются в этом браузере. Для другого устройства используй экспорт и импорт.</p><div class="theory-controls"><button data-action="export">Экспорт теории</button><button data-action="import">Импорт теории</button></div><label for="theory-import">Резервная копия JSON</label><textarea id="theory-import" placeholder="Вставь экспортированный прогресс теории"></textarea><p id="theory-import-result" role="status"></p></section>`;
  }
  function cancelRendering() {
    observer?.disconnect();observer=null;
    for(const job of renderJobs){try{job.cancel();}catch{}} renderJobs.clear();
  }
  async function paintPage(node,token) {
    if(!node.isConnected||token!==version||node.dataset.ready==='true')return;
    node.dataset.ready='loading';
    try {
      const doc=node.dataset.doc,pageNumber=Number(node.dataset.page),clip=JSON.parse(node.dataset.clip);
      const pdf=await pdfDocument(doc),page=await pdf.getPage(pageNumber);
      if(!node.isConnected||token!==version)return;
      const width=clip[2]-clip[0],height=clip[3]-clip[1],available=node.parentElement.clientWidth;
      const scale=zoom==='fit'?available/width:Number(zoom)*1.25;
      const dpr=Math.min(window.devicePixelRatio||1,2);
      node.style.width=width*scale+'px';node.style.height=height*scale+'px';node.style.aspectRatio='auto';
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale*dpr);canvas.height=Math.ceil(height*scale*dpr);
      canvas.style.width=width*scale+'px';canvas.style.height=height*scale+'px';
      canvas.setAttribute('role','img');canvas.setAttribute('aria-label',doc==='book'?`Учебник Хасанова, страница ${pageNumber}`:`Полный текст теории, страница ${pageNumber}`);
      const context=canvas.getContext('2d');
      const job=page.render({canvasContext:context,viewport:page.getViewport({scale}),transform:[dpr,0,0,dpr,-clip[0]*scale*dpr,-clip[1]*scale*dpr],background:'white'});
      renderJobs.add(job);try{await job.promise;}finally{renderJobs.delete(job);}
      if(!node.isConnected||token!==version)return;
      node.replaceChildren(canvas);
      const layer=document.createElement('div');layer.className='theory-link-layer';layer.setAttribute('aria-label','Ссылки на связанные утверждения');
      const meta=data.docs[doc].pageIndex[pageNumber-1];
      for(const link of meta.links){
        const r=link.rect;if(r[2]<=clip[0]||r[0]>=clip[2]||r[3]<=clip[1]||r[1]>=clip[3])continue;
        const a=document.createElement('a');a.className='theory-pdf-link';a.title=link.label;a.setAttribute('aria-label',link.label);
        const left=Math.max(r[0],clip[0]),top=Math.max(r[1],clip[1]);
        Object.assign(a.style,{left:(left-clip[0])*scale+'px',top:(top-clip[1])*scale+'px',width:(Math.min(r[2],clip[2])-left)*scale+'px',height:(Math.min(r[3],clip[3])-top)*scale+'px'});
        if(link.claim){const card=cardById(link.claim),loc=card&&locationFor(card,doc);if(!loc)continue;a.href=hashFor({mode:loc.doc,item:loc.section,page:loc.page,claim:card.id});a.dataset.action='claim';a.dataset.id=card.id;a.dataset.doc=doc;}
        else if(link.doc){const s=data.docs[link.doc].sections.find(s=>s.start<=link.page&&s.end>=link.page);a.href=hashFor({mode:link.doc,item:s?.id||1,page:link.page});a.dataset.action='page';a.dataset.doc=link.doc;a.dataset.page=link.page;}
        else if(link.url){a.href=link.url;a.target='_blank';a.rel='noopener';}
        layer.append(a);
      }
      for(const claim of meta.claims){
        if(claim.rect[1]<clip[1]||claim.rect[1]>clip[3])continue;
        const anchor=document.createElement('span');anchor.className='theory-claim-anchor';anchor.dataset.claim=claim.id;
        anchor.style.top=(claim.rect[1]-clip[1])*scale+'px';layer.append(anchor);
      }
      node.append(layer);node.dataset.ready='true';
      if(route().claim&&meta.claims.some(c=>c.id===route().claim)){const c=meta.claims.find(c=>c.id===route().claim);const highlight=document.createElement('div');highlight.className='theory-claim-highlight';Object.assign(highlight.style,{top:(c.rect[1]-clip[1])*scale+'px',height:(c.rect[3]-c.rect[1])*scale+'px'});node.append(highlight);}
    } catch(e) {
      if(!node.isConnected||token!==version||e?.name==='RenderingCancelledException')return;
      node.dataset.ready='error';node.innerHTML=`<div class="theory-page-error"><p>Страница не загрузилась.</p><button data-action="retry-page">Повторить</button><a href="${E(data.docs[node.dataset.doc].file)}#page=${node.dataset.page}" target="_blank" rel="noopener">Открыть PDF</a></div>`;
      console.error('Theory page render failed',node.dataset.doc,node.dataset.page,e);
    }
  }
  function schedulePages(token) {
    const nodes=document.querySelectorAll('.theory-page');
    for(const node of nodes){const clip=JSON.parse(node.dataset.clip),width=clip[2]-clip[0],height=clip[3]-clip[1];const scale=zoom==='fit'?node.parentElement.clientWidth/width:Number(zoom)*1.25;node.style.width=width*scale+'px';node.style.height=height*scale+'px';}
    if(typeof IntersectionObserver==='undefined'){for(const node of nodes)paintPage(node,token);return;}
    observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);paintPage(entry.target,token);}},{rootMargin:'700px'});
    for(const node of nodes)observer.observe(node);
  }
  function restoreReading(r) {
    if(history.state?.tfkpScroll){window.scrollTo({top:history.state.tfkpScroll});return;}
    if(!r.page&&!r.claim)return;
    const page=r.page||locationFor(cardById(r.claim),r.mode)?.page;
    const node=document.getElementById('theory-page-'+page);if(!node)return;
    const card=cardById(r.claim),loc=card&&locationFor(card,r.mode),p=data.docs[r.mode].pageIndex[page-1];
    const frame=node.querySelector('.theory-page');const scale=frame.offsetWidth/p.width;
    const top=node.getBoundingClientRect().top+window.scrollY+(loc?.y||0)*scale-120;
    window.scrollTo({top:Math.max(0,top)});
  }
  async function render() {
    const token=++version;active=true;cancelRendering();
    const app=document.getElementById('app');
    if(!data){app.innerHTML=`<div class="app-shell">${header()}<main class="theory-loading"><h2>Теория</h2><p>Загружаю темы, билеты и формулировки…</p></main></div>`;}
    try {
      await loadData();if(token!==version||!isActive())return;
      const r=route();const draft=document.getElementById('theory-import')?.value||'';
      app.innerHTML=`<div class="app-shell theory-shell">${header()}${modeTabs(r)}<div class="theory-layout">${sidebar(r)}<main class="theory-main">${progressError?`<p class="quality-note" role="alert">${E(progressError)}</p>`:''}${r.mode==='quiz'?quizMarkup(r):readerMarkup(r)}${progressMarkup()}</main></div></div>`;
      app.dataset.build=window.TFKP_BUILD||'2026-10-10-v39';
      lastRoutes[r.mode]=r; savePreferences(); window.TFKPSync?.mount();
      app.addEventListener('click',onClick,{signal:eventController().signal});
      document.getElementById('theory-import').value=draft;
      const search=document.getElementById('theory-search');let searchTimer;
      search.addEventListener('input',()=>{query=search.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const focus=search.selectionStart;render().then(()=>{const n=document.getElementById('theory-search');n?.focus();try{n.setSelectionRange(focus,focus);}catch{}});},180);});
      document.getElementById('theory-zoom')?.addEventListener('change',e=>{zoom=e.target.value;savePreferences();history.replaceState({...history.state,tfkpScroll:window.scrollY},'',location.href);render();});
      for(const [id,key] of [['quiz-type','type'],['quiz-topic','topic'],['quiz-status','status'],['quiz-source','source'],['quiz-sort','sort']])document.getElementById(id)?.addEventListener('change',e=>{
        if(key==='type')quizType=e.target.value;else if(key==='topic')quizTopic=e.target.value;else if(key==='source'){quizScopeDoc=e.target.value;quizTopic='all';}else if(key==='sort')quizSort=e.target.value;else quizStatus=e.target.value;
        quizQueue=[];quizId='';quizReveal=false;savePreferences();history.replaceState({...history.state,tfkpScroll:0},'',hashFor({mode:'quiz',scope:quizScope()}));render();
      });
      const cardSearch=document.getElementById('quiz-search');let cardSearchTimer;
      cardSearch?.addEventListener('input',()=>{quizSearch=cardSearch.value;clearTimeout(cardSearchTimer);cardSearchTimer=setTimeout(()=>{const pos=cardSearch.selectionStart;quizId='';quizReveal=false;quizQueue=[];history.replaceState({...history.state,tfkpScroll:window.scrollY},'',hashFor({mode:'quiz',scope:quizScope()}));render().then(()=>{const n=document.getElementById('quiz-search');n?.focus();try{n.setSelectionRange(pos,pos);}catch{}});},180);});
      document.getElementById('quiz-card-list')?.addEventListener('toggle',e=>quizListOpen=e.target.open);
      document.getElementById('quiz-only-selected')?.addEventListener('change',e=>{quizOnlySelected=e.target.checked;resetQuizChoice();});
      for(const checkbox of document.querySelectorAll('[data-card-select]'))checkbox.addEventListener('change',()=>{if(checkbox.checked)quizSelected.add(checkbox.dataset.cardSelect);else quizSelected.delete(checkbox.dataset.cardSelect);savePreferences();if(quizOnlySelected)resetQuizChoice();else render();});
      schedulePages(token);restoreReading(r);
    } catch(e){if(token!==version)return;app.innerHTML=`<div class="app-shell">${header()}<main class="theory-loading"><h2>Теория пока не загрузилась</h2><p>Повтори загрузку страницы.</p><button id="theory-retry">Повторить</button></main></div>`;document.getElementById('theory-retry').onclick=()=>render();console.error(e);}
  }
  let controller;
  function eventController(){controller?.abort();controller=new AbortController();return controller;}
  function resetQuizChoice() { quizId='';quizReveal=false;quizQueue=[];history.replaceState({...history.state,tfkpScroll:window.scrollY},'',hashFor({mode:'quiz',scope:quizScope()}));savePreferences();render(); }
  function onClick(e) {
    const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
    e.preventDefault();const a=button.dataset.action,r=route();
    if(a==='back'){if(history.state?.tfkpReturn)history.back();return;}
    if(a==='copy'){navigator.clipboard?.writeText(location.href);button.textContent='Ссылка скопирована';return;}
    if(a==='mode'){navigate(lastRoutes[button.dataset.mode]||{mode:button.dataset.mode,item:1});return;}
    if(a==='section'){navigate({mode:button.dataset.mode,item:Number(button.dataset.item)});return;}
    if(a==='claim'){openClaim(button.dataset.id,button.dataset.doc);return;}
    if(a==='page'){openPage(button.dataset.doc,Number(button.dataset.page));return;}
    if(a==='read'){const key=button.dataset.key;saveProgress({...progress,topics:{...progress.topics,[key]:!progress.topics[key]}});history.replaceState({...history.state,tfkpScroll:window.scrollY},'',location.href);render();return;}
    if(a==='practice-section'){const s=getSection(button.dataset.doc,button.dataset.item);quizScopeDoc=button.dataset.doc;quizTopic=String(s.id);quizType=quizStatus='all';quizSearch='';quizOnlySelected=false;quizQueue=[];quizId='';quizReveal=false;navigate({mode:'quiz',scope:quizScope()});return;}
    if(a==='open-card'){quizId=button.dataset.id;quizReveal=false;quizQueue=[];history.replaceState({...history.state,tfkpScroll:window.scrollY},'',hashFor({mode:'quiz',card:quizId,scope:quizScope()}));render().then(()=>document.querySelector('.theory-quiz-question')?.scrollIntoView({block:'start',behavior:'smooth'}));return;}
    if(a==='select-found'){for(const c of quizPool(false))quizSelected.add(c.id);savePreferences();render();return;}
    if(a==='clear-selection'){quizSelected.clear();savePreferences();if(quizOnlySelected)resetQuizChoice();else render();return;}
    if(a==='card-collection'){quizStatus=button.dataset.status;quizType=quizTopic='all';quizSearch='';quizOnlySelected=false;resetQuizChoice();return;}
    if(a==='reveal'){quizReveal=!quizReveal;history.replaceState({...history.state,tfkpScroll:window.scrollY},'',hashFor({mode:'quiz',card:quizId,scope:quizScope()}));render();return;}
    if(a==='next'){selectQuizCard(quizId);history.replaceState({...history.state,tfkpScroll:0},'',hashFor({mode:'quiz',card:quizId,scope:route().scope}));render();return;}
    if(a==='grade'){saveProgress({...progress,cards:{...progress.cards,[button.dataset.id]:button.dataset.grade}});history.replaceState({...history.state,tfkpScroll:window.scrollY},'',hashFor({mode:'quiz',card:quizId,scope:quizScope()}));render();return;}
    if(a==='quiz-reset'){quizType=quizTopic=quizStatus='all';quizSearch='';quizOnlySelected=false;quizId='';quizReveal=false;quizQueue=[];navigate({mode:'quiz'});return;}
    if(a==='progress'){document.getElementById('theory-progress')?.scrollIntoView({behavior:'smooth'});return;}
    if(a==='export'){const text=JSON.stringify(progress,null,2);document.getElementById('theory-import').value=text;const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='tfkp-theory-progress.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
    if(a==='import'){const message=document.getElementById('theory-import-result');try{const v=JSON.parse(document.getElementById('theory-import').value);if(!validProgress(v))throw Error('format');if(!saveProgress(v)){message.textContent=progressError;return;}history.replaceState({...history.state,tfkpScroll:window.scrollY},'',location.href);render().then(()=>{document.getElementById('theory-import-result').textContent='Прогресс теории импортирован.';});}catch{message.textContent='Неверный JSON. Текущие отметки сохранены.';}return;}
    if(a==='retry-page'){const node=button.closest('.theory-page');node.dataset.ready='';paintPage(node,version);}
  }
  function isActive(){return new URLSearchParams(location.hash.slice(1)).get('section')==='theory';}
  function deactivate(taskId){if(taskId)lastTask='#task='+encodeURIComponent(taskId);if(!active)return;active=false;++version;cancelRendering();controller?.abort();}
  window.TFKPTheory={isActive,render,deactivate,openClaim,openPage,validProgress,lastHash:()=>hashFor(lastRoutes[route().mode]||lastRoutes.program||{mode:'program',item:1})};
  window.addEventListener('popstate',()=>{restoreUi(history.state?.tfkpUI);query=history.state?.tfkpQuery||query;if(isActive())render();});
  window.addEventListener('tfkp:progress-changed',()=>{progress=readProgress();if(isActive())render();});
  window.addEventListener('storage',e=>{if(e.key===KEY){progress=readProgress();if(isActive())render();}});
})();

