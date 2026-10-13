'use strict';
const express=require('express');
const fs=require('node:fs');
const path=require('node:path');
const account=require('../api/account.js');

function publicOrigin(value){
  if(!value)return null;
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('PUBLIC_ORIGIN must be an HTTPS origin without a path');
  return u.origin;
}
function createApp(options={}){
  const assets=options.assets||path.resolve(__dirname,'../dist');
  const canonical=publicOrigin(options.publicOrigin??process.env.PUBLIC_ORIGIN);
  const indexed=options.indexed??process.env.INDEX_SITE==='true';
  const hops=options.proxyHops??Number(process.env.TRUST_PROXY_HOPS||0);
  if(!Number.isInteger(hops)||hops<0||hops>5)throw Error('TRUST_PROXY_HOPS must be an integer from 0 to 5');
  const template=fs.readFileSync(path.join(assets,'index.html'),'utf8');
  const app=express();
  app.disable('x-powered-by');
  app.set('trust proxy',hops);
  app.use((req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    if(!indexed)res.setHeader('X-Robots-Tag','noindex, nofollow');
    next();
  });
  // Keep the existing account format, Redis keys and secure session cookies.
  // Only this wrapper adapts real HTTP bodies and the trusted proxy client IP.
  app.all('/api/account',express.json({limit:250000,strict:true}),(req,res)=>{
    req.headers['x-forwarded-for']=req.ip;
    return account(req,res);
  });
  app.get('/healthz',(req,res)=>res.json({ok:true}));
  function origin(req){
    if(canonical)return canonical;
    const host=req.headers.host||'';
    if(!/^[a-z0-9.-]+(?::[0-9]{1,5})?$/i.test(host))throw Object.assign(Error('Invalid host'),{status:400});
    return new URL(req.protocol+'://'+host).origin;
  }
  function index(req,res){
    let html=template.replace(/(<meta property="og:url" content=")[^"]+("\s*\/?>)/,(_,before,after)=>before+origin(req)+'/'+after);
    if(!indexed)html=html.replace('content="index, follow"','content="noindex, nofollow"');
    res.setHeader('Cache-Control','no-cache');
    res.type('html').send(html);
  }
  app.get('/',index);
  app.get('/index.html',index);
  app.get('/robots.txt',(req,res)=>{
    res.type('text').send(indexed?'User-agent: *\nAllow: /\n\nSitemap: '+origin(req)+'/sitemap.xml\n':'User-agent: *\nDisallow: /\n');
  });
  app.get('/sitemap.xml',(req,res)=>{
    res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+origin(req)+'/</loc></url></urlset>\n');
  });
  app.get('/legacy-progress.html',(req,res,next)=>{
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    next();
  });
  // Only the curated build is public: never the repo root, API source or .env.
  app.use(express.static(assets,{dotfiles:'deny',index:false,maxAge:0,redirect:false}));
  app.use((req,res)=>res.status(404).type('text').send('Страница не найдена.'));
  app.use((error,req,res,next)=>{
    if(res.headersSent)return next(error);
    const status=error.type==='entity.too.large'?413:error.status===400?400:error.status===403?403:500;
    res.setHeader('Cache-Control','no-store');
    res.status(status).json({error:status===413?'Слишком большой запрос.':status===400?'Неверный запрос.':status===403?'Доступ запрещён.':'Сервис временно недоступен.'});
  });
  return app;
}
if(require.main===module){
  const port=Number(process.env.PORT||8080);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be from 1 to 65535');
  const server=createApp().listen(port,'0.0.0.0',()=>console.log('Trainer listening on port '+port));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
    server.close(()=>process.exit(0));
    setTimeout(()=>process.exit(1),10000).unref();
  });
}
module.exports={createApp};
