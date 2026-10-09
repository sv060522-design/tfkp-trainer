const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),handler=require('../api/account.js'),ids=require('../data/progress-ids.js');
const redis=require('./test-redis.cjs')(),originalFetch=global.fetch;
const env={url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN};
process.env.UPSTASH_REDIS_REST_URL='https://test-store.upstash.io';process.env.UPSTASH_REDIS_REST_TOKEN='test-only-token';
global.fetch=async(url,options)=>new Response(JSON.stringify({result:redis.run(JSON.parse(options.body))}),{status:200});
const taskKey='tfkp-trainer-progress-v2',theoryKey='tfkp-trainer-theory-progress-v1';
const tick=()=>new Promise(r=>setTimeout(r,25));
async function until(fn){for(let i=0;i<160;i++){if(fn())return;await tick();}throw Error('Timed out waiting for account state');}
function boot(storage={},cookie=''){
 const dom=new JSDOM('<button class="account-open" data-sync-action="open"></button>',{url:'https://tfkp.test/',runScripts:'outside-only'}),w=dom.window;
 let cookieJar=cookie,offline=false;
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 w.fetch=async(url,options={})=>{
  if(offline)throw Error('offline');
  const req={method:options.method||'GET',headers:{host:'tfkp.test',origin:'https://tfkp.test','content-type':'application/json','x-forwarded-for':'192.0.2.7',cookie:cookieJar,'x-tfkp-csrf':options.headers?.['X-TFKP-CSRF']||''},body:options.body?JSON.parse(options.body):undefined};
  let result;const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(text){if(this.headers['Set-Cookie'])cookieJar=this.headers['Set-Cookie'].split(';')[0];result={ok:this.statusCode<400,status:this.statusCode,json:async()=>JSON.parse(text)};}};
  await handler(req,res);return result;
 };
 for(const [k,v]of Object.entries(storage))w.localStorage.setItem(k,v);
 w.TFKP_SYNC_IDS=ids;w.eval(fs.readFileSync(path.join(__dirname,'../sync.js'),'utf8'));
 return {w,dom,getCookie:()=>cookieJar,offline:v=>offline=v,store:()=>Object.fromEntries(Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return [k,w.localStorage.getItem(k)];})),click:s=>w.document.querySelector(s).click()};
}
async function auth(browser,register,name='sync_student',password='test-sync-password'){
 browser.w.TFKPSync.open();
 browser.w.document.getElementById('account-nickname').value=name;browser.w.document.getElementById('account-password').value=password;
 browser.w.document.getElementById('account-register').checked=register;
 browser.w.document.getElementById('account-form').dispatchEvent(new browser.w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>browser.w.document.querySelector('[data-sync-action="logout"]'));
 assert(!JSON.stringify(browser.store()).includes(password),'plaintext password is never stored');
}
(async()=>{
 const first=ids.tasks[0],second=ids.tasks[1],third=ids.tasks[2];
 const a=boot({[taskKey]:JSON.stringify({[first]:{solved:true,starred:true,learningStatus:'solved-self'}}),[theoryKey]:JSON.stringify({topics:{'program-8':true},cards:{'theorem-11-2':'known'}})});
 await a.w.TFKPSync.loadSession();await auth(a,true);
 assert.match(a.w.document.getElementById('sync-status').textContent,/сохранены на сервере/);
 const bGuest=JSON.stringify({[second]:{solved:false,starred:true,learningStatus:'viewed'}});
 const b=boot({[taskKey]:bGuest});await b.w.TFKPSync.loadSession();await auth(b,false);
 assert(JSON.parse(b.w.localStorage.getItem(taskKey))[first].solved,'second browser receives solved tasks');
 assert.equal(JSON.parse(b.w.localStorage.getItem(theoryKey)).cards['theorem-11-2'],'known','second browser receives theory cards');
 assert.equal(JSON.parse(b.w.localStorage.getItem(taskKey))[second],undefined,'anonymous progress is kept apart until requested');
 b.click('[data-sync-action="merge-guest"]');await b.w.TFKPSync.synchronize();await a.w.TFKPSync.synchronize();
 assert.equal(JSON.parse(a.w.localStorage.getItem(taskKey))[second].learningStatus,'viewed');
 let tasks=JSON.parse(a.w.localStorage.getItem(taskKey));tasks[first]={solved:false,starred:true,learningStatus:'not-started'};a.w.localStorage.setItem(taskKey,JSON.stringify(tasks));a.w.TFKPSync.changed('tasks');await a.w.TFKPSync.synchronize();await b.w.TFKPSync.synchronize();
 assert.equal(JSON.parse(b.w.localStorage.getItem(taskKey))[first].solved,false,'return-to-unsolved is synchronized');
 a.offline(true);tasks=JSON.parse(a.w.localStorage.getItem(taskKey));tasks[third]={solved:true,starred:false,learningStatus:'solved-hint'};a.w.localStorage.setItem(taskKey,JSON.stringify(tasks));a.w.TFKPSync.changed('tasks');assert.equal(await a.w.TFKPSync.synchronize(),false);
 const saved=a.store(),cookie=a.getCookie();a.dom.window.close();const reloaded=boot(saved,cookie);await reloaded.w.TFKPSync.loadSession();await reloaded.w.TFKPSync.synchronize();await b.w.TFKPSync.synchronize();
 assert.equal(JSON.parse(b.w.localStorage.getItem(taskKey))[third].learningStatus,'solved-hint','offline queue survives reload and reconnect');
 b.click('[data-sync-action="logout"]');await until(()=>!b.w.document.querySelector('[data-sync-action="logout"]'));
 assert.equal(b.w.localStorage.getItem(taskKey),bGuest,'logout restores anonymous progress');
 delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;
 const disabled=boot();await disabled.w.TFKPSync.loadSession();disabled.w.TFKPSync.open();assert(!disabled.w.document.querySelector('#account-form'),'no fake signup without storage');assert.match(disabled.w.document.getElementById('account-dialog').textContent,/ещё не подключено/);
 reloaded.dom.window.close();b.dom.window.close();disabled.dom.window.close();
 console.log('Account client OK: optional disabled state, registration transfer, two independent browser stores, tasks + theory, manual guest merge, synchronized unsolved status, offline/reload queue, logout restore and no password storage.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;if(env.url===undefined)delete process.env.UPSTASH_REDIS_REST_URL;else process.env.UPSTASH_REDIS_REST_URL=env.url;if(env.token===undefined)delete process.env.UPSTASH_REDIS_REST_TOKEN;else process.env.UPSTASH_REDIS_REST_TOKEN=env.token;});
