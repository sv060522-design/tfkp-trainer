'use strict';
const assert=require('node:assert/strict');
const base='http://127.0.0.1:8080';
(async()=>{
  let ready=false;
  for(let i=0;i<40;i++){
    try{const r=await fetch(base+'/healthz',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert(ready,'Docker runtime did not become ready');
  const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag'),/noindex/);
  const html=await r.text();assert(!html.includes('cdn.jsdelivr.net'));assert(html.includes('./vendor/mathjax/tex-svg.js'));
  const scripts=[...html.matchAll(/<script[^>]+src="([^\"]+)"/g)].map(m=>m[1]);
  for(const src of scripts)assert.equal((await fetch(new URL(src,base+'/'))).status,200,src);
  const range=await fetch(base+'/sources/hasanov-2022.pdf',{headers:{Range:'bytes=0-31'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);
  assert.equal((await (await fetch(base+'/api/account')).json()).configured,false);
  for(const file of ['/api/account.js','/server/index.cjs','/.env','/package.json','/node_modules/express/package.json'])assert([403,404].includes((await fetch(base+file)).status),file);
  console.log('Docker runtime OK: startup, all website scripts, local MathJax, PDF ranges, account API and private-file boundaries.');
})().catch(e=>{console.error(e);process.exitCode=1;});
