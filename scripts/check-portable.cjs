// Real HTTP checks for the portable server; Redis and user accounts are fixtures.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {createApp}=require('../server/index.cjs');
const ids=require('../data/progress-ids.js');
const redis=require('./test-redis.cjs')({omitNullFields:true});
const fetchOriginal=global.fetch;
const env={url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN};
process.env.UPSTASH_REDIS_REST_URL='https://test-store.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN='test-only-token';
global.fetch=async(url,options)=>{
  assert.equal(url,'https://test-store.upstash.io');
  assert.equal(options.headers.Authorization,'Bearer test-only-token');
  return new Response(JSON.stringify({result:redis.run(JSON.parse(options.body))}),{status:200});
};
let server;
function request(route,{method='GET',body,auth,headers={}}={}){
  return new Promise((resolve,reject)=>{
    const bytes=typeof body==='string'?body:body===undefined?null:JSON.stringify(body);
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method,headers:{host:'tfkp.test',origin:'https://tfkp.test','x-forwarded-proto':'https','content-type':'application/json',cookie:auth?.cookie||'','x-tfkp-csrf':auth?.csrf||'',...(bytes?{'Content-Length':Buffer.byteLength(bytes)}:{}),...headers}},res=>{
      const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>{
        const buffer=Buffer.concat(chunks),text=buffer.toString();
        let json;try{json=JSON.parse(text);}catch{}
        resolve({status:res.statusCode,headers:res.headers,buffer,text,json});
      });
    });
    req.on('error',reject);if(bytes)req.write(bytes);req.end();
  });
}
function auth(response){return {id:response.json.user.id,csrf:response.json.csrf,cookie:response.headers['set-cookie'][0].split(';')[0]};}
function action(name,body={},session,headers={}){return request('/api/account',{method:'POST',body:{action:name,userId:session?.id,...body},auth:session,headers});}
async function start(options){
  server=createApp(options).listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
}
async function stop(){if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
(async()=>{
  assert.throws(()=>createApp({publicOrigin:'https://user:pass@tfkp.test'}));
  assert.throws(()=>createApp({proxyHops:-1}));
  await start({publicOrigin:'https://tfkp.test',proxyHops:1,indexed:false});
  const root=await request('/');assert.equal(root.status,200);
  assert.match(root.text,/\.\/vendor\/mathjax\/tex-svg\.js/);assert(!root.text.includes('cdn.jsdelivr.net'));
  assert.match(root.text,/content="https:\/\/tfkp.test\/"/);assert.match(root.headers['x-robots-tag'],/noindex/);
  assert.match((await request('/robots.txt')).text,/Disallow: \//);
  assert.deepEqual((await request('/healthz')).json,{ok:true});
  const scripts=[...root.text.matchAll(/<script[^>]+src="([^\"]+)"/g)].map(m=>m[1]);
  assert(scripts.length>20);
  for(const script of scripts){assert(!/^https?:/.test(script));assert.equal((await request('/'+script.replace(/^\.\//,''))).status,200,script);}
  assert.equal((await request('/vendor/mathjax/input/tex/extensions/color.js')).status,200,'autoload extensions remain local');
  const pdf=await request('/sources/hasanov-2022.pdf',{headers:{Range:'bytes=0-31'}});
  assert.equal(pdf.status,206);assert.equal(pdf.buffer.length,32);assert.match(pdf.buffer.toString(),/^%PDF/);
  for(const route of ['/api/account.js','/server/index.cjs','/package.json','/.env','/.git/config','/scripts/check-portable.cjs','/node_modules/express/package.json','/%2e%2e%2fpackage.json']){
    const response=await request(route);assert([403,404].includes(response.status),route);assert(!response.text.includes('test-only-token'));
  }
  assert.equal((await request('/missing-page')).status,404);
  const theory=(await request('/data/theory.json')).json;assert(theory);assert.equal(ids.tasks.length,500);
  delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;
  assert.equal((await request('/api/account')).json.configured,false);
  assert.equal((await action('login',{nickname:'test_user',password:'test-password-only'})).status,503);
  process.env.UPSTASH_REDIS_REST_URL='https://test-store.upstash.io';process.env.UPSTASH_REDIS_REST_TOKEN='test-only-token';
  assert.equal((await request('/api/account',{method:'DELETE'})).status,405);
  assert.equal((await request('/api/account',{method:'POST',body:'{bad'})).status,400);
  assert.equal((await request('/api/account',{method:'POST',body:'x'.repeat(250001)})).status,413);
  assert.equal((await action('register',{nickname:'test_user',password:'test-password-only'},null,{origin:'https://another.test'})).status,403);
  const register=await action('register',{nickname:'test_user',password:'test-password-only'});assert.equal(register.status,200);
  assert.match(register.headers['set-cookie'][0],/HttpOnly; Secure; SameSite=Lax/);
  assert.match(register.headers['cache-control'],/no-store/);const first=auth(register);
  const login=await action('login',{nickname:'TEST_USER',password:'test-password-only'});assert.equal(login.status,200);const second=auth(login);assert.equal(first.id,second.id);
  const now=Date.now()-1000,key='tasks:'+ids.tasks[0],topic='topics:'+ids.topics[0],card='cards:'+ids.cards[0];
  const stamp=(value,at,op='portable-test-operation-0001')=>({value,at,op});
  const solved={solved:true,starred:false,learningStatus:'solved-self'};
  let response=await action('sync',{changes:{[key]:stamp(solved,now),[topic]:stamp(true,now),[card]:stamp('known',now)}},first);assert.equal(response.status,200);
  let progress=(await request('/api/account',{auth:second})).json.progress;
  assert.deepEqual(progress.records[key].value,solved);assert.equal(progress.records[topic].value,true);assert.equal(progress.records[card].value,'known');
  assert.equal((await action('sync',{changes:{[key]:stamp(null,now+10)}},second)).status,200);
  await action('sync',{changes:{[key]:stamp(solved,now+1)}},first);
  assert.equal((await request('/api/account',{auth:first})).json.progress.records[key].value,null);
  assert.equal((await action('sync',{changes:{}},{...first,csrf:'invalid'})).status,403);
  assert.equal((await action('sync',{changes:{},userId:'another-account'},first)).status,409);
  assert.equal((await action('logout',{},first)).status,200);
  assert.equal((await request('/api/account',{auth:first})).json.user,null);
  assert.equal((await request('/api/account',{auth:second})).json.user.id,second.id);
  await stop();
  // A fresh server process reads the same store and accepts the existing session.
  await start({proxyHops:1,indexed:true});
  assert.equal((await request('/api/account',{auth:second})).json.progress.records[key].value,null);
  assert.match((await request('/robots.txt')).text,/Sitemap: https:\/\/tfkp.test\/sitemap.xml/);
  assert(!(await request('/')).headers['x-robots-tag']);
  assert.match((await request('/sitemap.xml')).text,/<loc>https:\/\/tfkp.test\/<\/loc>/);
  assert.match((await request('/legacy-progress.html')).headers['x-robots-tag'],/noindex/);
  console.log('Portable HTTP server OK: all scripts local, theory/PDF/range, no source or secrets served, request limits, two accounts sessions, task/theory sync, stale-reset protection, logout, preserved sessions after restart and staging/primary SEO.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  await stop();global.fetch=fetchOriginal;
  if(env.url===undefined)delete process.env.UPSTASH_REDIS_REST_URL;else process.env.UPSTASH_REDIS_REST_URL=env.url;
  if(env.token===undefined)delete process.env.UPSTASH_REDIS_REST_TOKEN;else process.env.UPSTASH_REDIS_REST_TOKEN=env.token;
});
