// Same-origin, optional progress accounts. Secrets are read only on the server.
'use strict';
const {randomBytes,createHash,scrypt,timingSafeEqual}=require('node:crypto');
const {promisify}=require('node:util');
const derive=promisify(scrypt);
const IDS=require('../data/progress-ids.js');
const ALLOWED=Object.fromEntries(Object.entries(IDS).map(([key,list])=>[key,new Set(list)]));
const COOKIE='__Host-tfkp_session',TTL=60*60*24*30,PREFIX='tfkp:v1:';
const STATUSES=new Set(['not-started','in-progress','solved-self','solved-hint','viewed','unclear']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeKey=k=>typeof k==='string'&&k.length<=160&&/^[\p{L}\p{N}_.:-]+$/u.test(k)&&!['__proto__','constructor','prototype'].includes(k);
const hash=s=>createHash('sha256').update(s).digest('hex');
const random=()=>randomBytes(32).toString('hex');
function failure(status,message){return Object.assign(new Error(message),{status});}
function config(){
  const url=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
  const token=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
  if(!url||!token)return null;
  try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)return null;}catch{return null;}
  return {url:url.replace(/\/$/,''),token};
}
async function redis(command){
  const env=config();if(!env)throw failure(503,'Синхронизация ещё не подключена владельцем сайта.');
  const r=await fetch(env.url,{method:'POST',headers:{Authorization:'Bearer '+env.token,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(6000)});
  const value=await r.json();if(!r.ok||value.error)throw failure(503,'Хранилище временно недоступно. Отметки остались в браузере.');
  return value.result;
}
const LIMIT_SCRIPT=`local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end;return n`;
async function limit(key,max,seconds){
  const n=await redis(['EVAL',LIMIT_SCRIPT,1,PREFIX+'limit:'+key,seconds]);
  if(n>max)throw failure(429,'Слишком много попыток. Подожди несколько минут.');
}
function nickname(v){
  if(typeof v!=='string')throw failure(400,'Введи ник.');
  const display=v.trim().normalize('NFKC');
  if(!/^[a-zа-яё0-9][a-zа-яё0-9_.-]{2,31}$/iu.test(display))throw failure(400,'Ник: 3–32 буквы, цифры, точки, дефисы или подчёркивания.');
  return {display,key:hash(display.toLocaleLowerCase('ru'))};
}
function password(v){
  if(typeof v!=='string'||v.length<10||v.length>128)throw failure(400,'Пароль должен содержать от 10 до 128 символов.');
  return v;
}
async function passwordHash(value,salt){
  return (await derive(value,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024})).toString('hex');
}
function equal(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const left=Buffer.from(a),right=Buffer.from(b);if(left.length!==right.length)return false;
  return timingSafeEqual(left,right);
}
function cookieToken(req){
  const v=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  return /^[a-f0-9]{64}$/.test(v||'')?v:null;
}
async function session(req){
  const token=cookieToken(req);if(!token)return null;
  const raw=await redis(['GET',PREFIX+'session:'+hash(token)]);
  if(!raw)return null;
  const value=JSON.parse(raw);return {...value,token};
}
function setCookie(res,token,maxAge=TTL){
  res.setHeader('Set-Cookie',COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+maxAge);
}
async function startSession(res,user){
  const token=random(),csrf=random();
  await redis(['SET',PREFIX+'session:'+hash(token),JSON.stringify({uid:user.uid,nickname:user.nickname,csrf}),'EX',TTL]);
  setCookie(res,token);return {uid:user.uid,nickname:user.nickname,csrf};
}
function emptyProgress(){return {revision:0,records:{}};}
async function getProgress(uid){
  const raw=await redis(['GET',PREFIX+'progress:'+uid]);return raw?JSON.parse(raw):emptyProgress();
}
function checkOrigin(req){
  let origin;try{origin=new URL(req.headers.origin);}catch{throw failure(403,'Открой вход на самом сайте.');}
  if(origin.protocol!=='https:'||origin.host!==req.headers.host||req.headers['sec-fetch-site']==='cross-site')throw failure(403,'Запрос с другого сайта запрещён.');
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw failure(415,'Ожидается JSON.');
}
function validateChanges(changes){
  if(!object(changes)||Object.keys(changes).length>900)throw failure(400,'Неверный формат отметок.');
  const clean={};
  for(const [key,entry] of Object.entries(changes)){
    const colon=key.indexOf(':'),domain=key.slice(0,colon),id=key.slice(colon+1);
    if(!['tasks','topics','cards'].includes(domain)||!safeKey(id)||!ALLOWED[domain]?.has(id)||!object(entry)||!Number.isSafeInteger(entry.at)||entry.at<0||entry.at>Date.now()+120000||!/^[-a-zA-Z0-9]{16,80}$/.test(entry.op||''))throw failure(400,'Неверный формат отметки.');
    let value=entry.value;
    if(value!==null){
      if(domain==='topics'){if(typeof value!=='boolean')throw failure(400,'Неверная отметка раздела.');}
      else if(domain==='cards'){if(!['new','known','repeat'].includes(value))throw failure(400,'Неверная отметка карточки.');}
      else{
        if(!object(value)||typeof value.solved!=='boolean'||typeof value.starred!=='boolean'||!STATUSES.has(value.learningStatus))throw failure(400,'Неверная отметка задачи.');
        if(value.solved!==['solved-self','solved-hint'].includes(value.learningStatus))throw failure(400,'Статус задачи противоречит отметке решения.');
        value={solved:value.solved,starred:value.starred,learningStatus:value.learningStatus};
      }
    }
    clean[key]={value,at:entry.at,op:entry.op};
  }
  return clean;
}
// A single atomic script merges separate records, including explicit resets.
// Retained null records prevent an older device from restoring removed marks.
const MERGE_SCRIPT=`
local raw=redis.call('GET',KEYS[1]);local state
if raw then state=cjson.decode(raw) else state={revision=0,records={}} end
local changes=cjson.decode(ARGV[1]);local changed=false
for key,value in pairs(changes) do
  local old=state.records[key]
  if not old or value.at>old.at or (value.at==old.at and value.op>old.op) then
    state.records[key]=value;changed=true
  end
end
if changed then state.revision=state.revision+1;redis.call('SET',KEYS[1],cjson.encode(state)) end
return cjson.encode(state)`;
async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify({...value,serverTime:Date.now()}));};
  try{
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return send(405,{error:'Метод не поддерживается.'});}
    if(!config())return send(req.method==='GET'?200:503,{configured:false,user:null,error:'Владелец сайта ещё не подключил хранилище для синхронизации.'});
    if(req.method==='GET'){
      const s=await session(req);return send(200,{configured:true,user:s?{id:s.uid,nickname:s.nickname}:null,csrf:s?.csrf,progress:s?await getProgress(s.uid):undefined});
    }
    checkOrigin(req);
    if(Number(req.headers['content-length']||0)>250000)throw failure(413,'Слишком большой запрос.');
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!object(body)||Buffer.byteLength(JSON.stringify(body))>250000)throw failure(400,'Неверный запрос.');
    const action=body.action;
    if(action==='register'||action==='login'){
      const name=nickname(body.nickname),pass=password(body.password);
      const ip=hash(String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0]);
      await limit('auth:'+ip,15,600);await limit('name:'+name.key,20,600);
      const key=PREFIX+'user:'+name.key;
      let user;
      if(action==='register'){
        await limit('register-global',200,86400);
        const salt=randomBytes(16).toString('hex');user={uid:randomBytes(16).toString('hex'),nickname:name.display,salt,passwordHash:await passwordHash(pass,salt)};
        const created=await redis(['SET',key,JSON.stringify(user),'NX']);
        if(!created)throw failure(409,'Этот ник уже занят. Выбери другой или войди.');
      }else{
        const raw=await redis(['GET',key]);user=raw?JSON.parse(raw):null;
        const computed=await passwordHash(pass,user?.salt||'00000000000000000000000000000000');
        if(!user||!equal(computed,user.passwordHash))throw failure(401,'Неверный ник или пароль.');
      }
      const previous=await session(req);if(previous)await redis(['DEL',PREFIX+'session:'+hash(previous.token)]);
      const s=await startSession(res,user);
      return send(200,{configured:true,user:{id:user.uid,nickname:user.nickname},csrf:s.csrf,progress:await getProgress(user.uid)});
    }
    const s=await session(req);if(!s)throw failure(401,'Войди снова. Местные отметки сохранены.');
    if(body.userId!==s.uid)throw failure(409,'В другом окне сменился аккаунт. Обнови страницу перед синхронизацией.');
    if(!equal(req.headers['x-tfkp-csrf'],s.csrf))throw failure(403,'Обнови страницу и повтори действие.');
    if(action==='logout'){await redis(['DEL',PREFIX+'session:'+hash(s.token)]);setCookie(res,'',0);return send(200,{configured:true,user:null});}
    if(action!=='sync')throw failure(400,'Неизвестное действие.');
    await limit('sync:'+s.uid,120,60);
    const changes=validateChanges(body.changes);
    const progress=JSON.parse(await redis(['EVAL',MERGE_SCRIPT,1,PREFIX+'progress:'+s.uid,JSON.stringify(changes)]));
    return send(200,{configured:true,user:{id:s.uid,nickname:s.nickname},progress});
  }catch(e){
    const status=e.status||(e instanceof SyntaxError?400:503);
    // No passwords, tokens, database URLs or raw backend errors enter responses/logs.
    return send(status,{error:e.status?e.message:status===400?'Неверный JSON.':'Синхронизация временно недоступна. Местные отметки сохранены.'});
  }
}
module.exports=handler;
module.exports.validateChanges=validateChanges;
module.exports.MERGE_SCRIPT=MERGE_SCRIPT;
