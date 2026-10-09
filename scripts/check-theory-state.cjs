// Exercise reader and quiz state without touching a real user's browser/storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/theory.json')));
const code=fs.readFileSync(path.join(root,'theory.js'),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
function boot(hash,storage={}){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://tfkp.test/'+hash,runScripts:'outside-only'}),w=dom.window;
 w.fetch=async()=>({ok:true,json:async()=>data});
 w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 w.scrollTo=({top})=>{w.scrollY=top;};
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.HTMLAnchorElement.prototype.click=function(){};
 for(const [key,value] of Object.entries(storage))w.localStorage.setItem(key,value);
 w.eval(code);
 return {dom,w,app:w.document.getElementById('app'),render:()=>w.TFKPTheory.render(),click:selector=>w.document.querySelector(selector).click()};
}
(async()=>{
 const taskKey='tfkp-trainer-progress-v2',taskProgress='{"old-id":{"solved":true,"starred":true}}';
 const a=boot('#section=theory&mode=program&item=8',{[taskKey]:taskProgress});await a.render();
 assert.match(a.app.querySelector('h2').textContent,/Ряд Лорана/);
 assert.equal(a.app.querySelectorAll('.theory-section').length,20);
 a.click('[data-action="claim"][data-id="theorem-10-3"]');await tick();
 assert.match(a.w.location.hash,/item=6/);
 assert.match(a.w.location.hash,/claim=theorem-10-3/);
 assert.equal(a.w.history.state.tfkpReturn,'#section=theory&mode=program&item=8');
 a.click('[data-action="back"]');await tick();await tick();
 assert.match(a.app.querySelector('h2').textContent,/Ряд Лорана/);
 a.click('[data-action="read"]');await tick();
 assert.equal(JSON.parse(a.w.localStorage.getItem('tfkp-trainer-theory-progress-v1')).topics['program-8'],true);
 a.click('[data-action="read"]');await tick();
 assert.equal(JSON.parse(a.w.localStorage.getItem('tfkp-trainer-theory-progress-v1')).topics['program-8'],false);
 a.w.history.pushState({},'','#section=theory&mode=quiz&card=theorem-11-2');await a.render();
 assert.equal(a.app.querySelector('.theory-quiz-answer'),null,'answer starts hidden');
 assert.match(a.app.querySelector('.theory-quiz-question h3').textContent,/Лорана/);
 a.click('[data-action="reveal"]');await tick();
 assert(a.app.querySelector('.theory-quiz-answer .theory-page'));
 a.click('[data-action="grade"][data-grade="known"]');await tick();
 const backup=a.w.localStorage.getItem('tfkp-trainer-theory-progress-v1');
 assert.equal(JSON.parse(backup).cards['theorem-11-2'],'known');
 assert.equal(a.w.localStorage.getItem(taskKey),taskProgress,'task progress is untouched');
 a.app.querySelector('#theory-import').value='{"topics":{"program-8":"true"},"cards":{}}';
 a.click('[data-action="import"]');await tick();
 assert.equal(a.w.localStorage.getItem('tfkp-trainer-theory-progress-v1'),backup,'invalid import is atomic');
 a.click('[data-action="export"]');
 assert.deepEqual(JSON.parse(a.app.querySelector('#theory-import').value),JSON.parse(backup));
 const b=boot('#section=theory&mode=quiz&card=theorem-11-2',{'tfkp-trainer-theory-progress-v1':backup});await b.render();
 b.click('[data-action="reveal"]');await tick();assert.match(b.app.querySelector('.theory-quiz-answer').textContent,/Моя отметка: знаю/);
 b.w.history.pushState({},'','#section=theory&mode=quiz&scope=tickets-32');await b.render();
 for(let i=0;i<5;i++){assert.match(b.app.querySelector('.theory-quiz-question h3').textContent,/соответствия границ/);b.click('[data-action="next"]');await tick();}
 b.w.history.pushState({},'','#section=theory&mode=book&item=5&claim=theorem-5-1&page=31');await b.render();
 assert.equal(b.app.querySelectorAll('.theory-section').length,25);
 assert(b.app.querySelector('#theory-page-31'));
 b.w.history.pushState({},'','#section=theory&mode=program&item=8&claim=unknown');await b.render();
 assert(b.app.querySelector('.theory-article'),'unknown claim remains readable');
 a.dom.window.close();b.dom.window.close();
 console.log('Theory state OK: routes/back, hidden answers, topic scopes, grades, reload, safe export/import, independent task storage');
})().catch(e=>{console.error(e);process.exit(1);});
