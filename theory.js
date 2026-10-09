/* Full source-backed theory reader. Task progress keeps its original key. */
(() => {
  'use strict';
  const KEY = 'tfkp-trainer-theory-progress-v1';
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MODES = {program:'По программе · 20 тем', tickets:'По билетам · 32', quiz:'Самопроверка', book:'Учебник Хасанова'};
  let data, dataPromise, pdfLibPromise, observer, version = 0, active = false, lastTask = '';
  let query = '', quizType = 'all', quizTopic = 'all', quizStatus = 'all', quizReveal = false;
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
  function saveProgress(next) {
    try { localStorage.setItem(KEY,JSON.stringify(next)); progress=next; progressError=''; return true; }
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
    history.replaceState({...history.state,tfkpScroll:window.scrollY,tfkpQuery:query},'',location.href);
    history.pushState({tfkpReturn:before,tfkpScroll:0},'',hashFor(r));
    query=''; render(); window.scrollTo({top:0});
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
    return `<header class="topbar"><div class="brand"><h1>ТФКП — подготовка</h1><p>ФЭФМ МФТИ · теория и задачи</p></div><nav class="section-switch" aria-label="Раздел подготовки"><a href="${E(lastTask||'#task=2024-2025-osen-v1-n1')}">Задачи</a><a class="active" aria-current="page" href="#section=theory&mode=program&item=1">Теория</a></nav><div class="nav"><button data-action="back" ${history.state?.tfkpReturn?'':'disabled'}>← К месту чтения</button><button data-action="copy">Ссылка</button></div></header>`;
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
    return `<div class="theory-page-scroll"><div class="theory-page" data-doc="${doc}" data-page="${page}" data-clip="${E(JSON.stringify(rect))}" style="aspect-ratio:${1/ratio}"><div class="theory-page-loading">Загрузка страницы ${page}…</div></div></div>`;
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
  function quizPool() {
    const match=/^(program|tickets|book)-(\d+)$/.exec(route().scope);
    const scopeIds=match?getSection(match[1],Number(match[2])).claimIds:null;
    return data.cards.filter(c=>(!scopeIds||scopeIds.includes(c.id)) && (quizType==='all'||(quizType==='definition'?c.kind==='definition':c.kind!=='definition')) &&
      (quizTopic==='all'||c.locations.program?.some(l=>l.section===Number(quizTopic))) &&
      (quizStatus==='all'||(progress.cards[c.id]||'new')===quizStatus));
  }
  function selectQuizCard(exclude='') {
    const pool=quizPool();if(!pool.length){quizId='';return;}
    const valid=new Set(pool.map(c=>c.id));quizQueue=quizQueue.filter(id=>valid.has(id)&&id!==exclude);
    if(!quizQueue.length){quizQueue=pool.map(c=>c.id).filter(id=>id!==exclude);if(!quizQueue.length)quizQueue=pool.map(c=>c.id);for(let i=quizQueue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[quizQueue[i],quizQueue[j]]=[quizQueue[j],quizQueue[i]];}}
    quizId=quizQueue.shift();quizReveal=false;
  }
  function quizMarkup(r) {
    const pool=quizPool();const requested=r.card&&pool.find(c=>c.id===r.card);
    if(requested&&requested.id!==quizId){quizId=requested.id;quizReveal=false;}
    if(!pool.some(c=>c.id===quizId))selectQuizCard();
    const c=cardById(quizId);
    return `<article class="card theory-quiz"><div class="theory-article-head"><span class="chip blue">Самопроверка</span><h2>Вспомни формулировку</h2><p>Сначала назови определение или теорему своими словами. Затем раскрой точную формулировку и проверь все условия.</p><div class="theory-quiz-filters"><label>Карточки<select id="quiz-type"><option value="all">Определения и утверждения</option><option value="definition" ${quizType==='definition'?'selected':''}>Только определения</option><option value="theorem" ${quizType==='theorem'?'selected':''}>Теоремы, леммы и следствия</option></select></label><label>Тема программы<select id="quiz-topic"><option value="all">Все 20 тем</option>${data.docs.program.sections.map(s=>`<option value="${s.id}" ${quizTopic===String(s.id)?'selected':''}>${s.id}. ${E(s.title)}</option>`).join('')}</select></label><label>Моя отметка<select id="quiz-status">${[['all','Все'],['new','Ещё не учил'],['repeat','Повторить'],['known','Знаю']].map(([v,l])=>`<option value="${v}" ${quizStatus===v?'selected':''}>${l}</option>`).join('')}</select></label></div><p class="task-meta">${pool.length} карточек в выборке · ${data.cards.length} всего · ${data.cards.filter(c=>c.kind==='definition').length} определений</p></div>${c?`<div class="theory-quiz-question"><p class="task-meta">${E(c.label)} · ${c.locations.program?.map(l=>'Тема '+l.section).filter((x,i,a)=>a.indexOf(x)===i).join(', ')||'Дополнение к билетам'}</p><h3>${E(c.title)}</h3><button class="primary" id="quiz-show-answer" data-action="reveal" aria-expanded="${quizReveal}">${quizReveal?'Скрыть ответ':'Показать ответ'}</button><button data-action="next">Следующая →</button></div>${quizReveal?`<section class="theory-quiz-answer" aria-label="Точная формулировка"><p class="task-meta">Формулировка из присланного полного конспекта; исходная нумерация Хасанова сохранена.</p>${c.segments.map(s=>pageMarkup(c.answerDoc,s.page,s.rect)).join('')}<div class="theory-controls"><button data-action="grade" data-grade="known" data-id="${c.id}">✓ Знаю</button><button data-action="grade" data-grade="repeat" data-id="${c.id}">↻ Повторить</button><button data-action="grade" data-grade="new" data-id="${c.id}">Снять отметку</button><button data-action="claim" data-id="${c.id}" data-doc="${c.answerDoc}">Открыть в теории</button></div><p class="task-meta" role="status">Моя отметка: ${{known:'знаю',repeat:'повторить',new:'ещё не учил'}[progress.cards[c.id]||'new']}.</p></section>`:''}`:'<div class="theory-quiz-question"><p>По этим фильтрам карточек нет.</p><button data-action="quiz-reset">Все карточки</button></div>'}</article>`;
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
      app.dataset.build='2026-10-09-theory';
      app.addEventListener('click',onClick,{signal:eventController().signal});
      document.getElementById('theory-import').value=draft;
      const search=document.getElementById('theory-search');let searchTimer;
      search.addEventListener('input',()=>{query=search.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const focus=search.selectionStart;render().then(()=>{const n=document.getElementById('theory-search');n?.focus();try{n.setSelectionRange(focus,focus);}catch{}});},180);});
      document.getElementById('theory-zoom')?.addEventListener('change',e=>{zoom=e.target.value;history.replaceState({...history.state,tfkpScroll:window.scrollY},'',location.href);render();});
      for(const [id,key] of [['quiz-type','type'],['quiz-topic','topic'],['quiz-status','status']])document.getElementById(id)?.addEventListener('change',e=>{if(key==='type')quizType=e.target.value;else if(key==='topic')quizTopic=e.target.value;else quizStatus=e.target.value;quizQueue=[];quizId='';quizReveal=false;history.replaceState({},'',hashFor({mode:'quiz'}));render();});
      schedulePages(token);restoreReading(r);
    } catch(e){if(token!==version)return;app.innerHTML=`<div class="app-shell">${header()}<main class="theory-loading"><h2>Теория пока не загрузилась</h2><p>Повтори загрузку страницы.</p><button id="theory-retry">Повторить</button></main></div>`;document.getElementById('theory-retry').onclick=()=>render();console.error(e);}
  }
  let controller;
  function eventController(){controller?.abort();controller=new AbortController();return controller;}
  function onClick(e) {
    const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
    e.preventDefault();const a=button.dataset.action,r=route();
    if(a==='back'){if(history.state?.tfkpReturn)history.back();return;}
    if(a==='copy'){navigator.clipboard?.writeText(location.href);button.textContent='Ссылка скопирована';return;}
    if(a==='mode'){quizReveal=false;quizId='';navigate({mode:button.dataset.mode,item:1});return;}
    if(a==='section'){navigate({mode:button.dataset.mode,item:Number(button.dataset.item)});return;}
    if(a==='claim'){openClaim(button.dataset.id,button.dataset.doc);return;}
    if(a==='page'){openPage(button.dataset.doc,Number(button.dataset.page));return;}
    if(a==='read'){const key=button.dataset.key;saveProgress({...progress,topics:{...progress.topics,[key]:!progress.topics[key]}});history.replaceState({...history.state,tfkpScroll:window.scrollY},'',location.href);render();return;}
    if(a==='practice-section'){const s=getSection(button.dataset.doc,button.dataset.item);quizTopic=button.dataset.doc==='program'?String(s.id):'all';quizType='all';quizStatus='all';quizQueue=[...s.claimIds];quizId='';selectQuizCard();navigate({mode:'quiz',card:quizId,scope:button.dataset.doc+'-'+s.id});return;}
    if(a==='reveal'){quizReveal=!quizReveal;history.replaceState({...history.state,tfkpScroll:window.scrollY},'',location.href);render();return;}
    if(a==='next'){selectQuizCard(quizId);history.replaceState({...history.state,tfkpScroll:0},'',hashFor({mode:'quiz',card:quizId,scope:route().scope}));render();return;}
    if(a==='grade'){saveProgress({...progress,cards:{...progress.cards,[button.dataset.id]:button.dataset.grade}});if(quizStatus!=='all')selectQuizCard(button.dataset.id);history.replaceState({...history.state,tfkpScroll:window.scrollY},'',hashFor({mode:'quiz',card:quizId,scope:route().scope}));render();return;}
    if(a==='quiz-reset'){quizType=quizTopic=quizStatus='all';quizId='';quizQueue=[];navigate({mode:'quiz'});return;}
    if(a==='progress'){document.getElementById('theory-progress')?.scrollIntoView({behavior:'smooth'});return;}
    if(a==='export'){const text=JSON.stringify(progress,null,2);document.getElementById('theory-import').value=text;const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='tfkp-theory-progress.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
    if(a==='import'){const message=document.getElementById('theory-import-result');try{const v=JSON.parse(document.getElementById('theory-import').value);if(!validProgress(v))throw Error('format');if(!saveProgress(v)){message.textContent=progressError;return;}history.replaceState({...history.state,tfkpScroll:window.scrollY},'',location.href);render().then(()=>{document.getElementById('theory-import-result').textContent='Прогресс теории импортирован.';});}catch{message.textContent='Неверный JSON. Текущие отметки сохранены.';}return;}
    if(a==='retry-page'){const node=button.closest('.theory-page');node.dataset.ready='';paintPage(node,version);}
  }
  function isActive(){return new URLSearchParams(location.hash.slice(1)).get('section')==='theory';}
  function deactivate(taskId){if(taskId)lastTask='#task='+encodeURIComponent(taskId);if(!active)return;active=false;++version;cancelRendering();controller?.abort();}
  window.TFKPTheory={isActive,render,deactivate,openClaim,openPage,validProgress};
  window.addEventListener('popstate',()=>{query=history.state?.tfkpQuery||'';if(isActive())render();});
})();
