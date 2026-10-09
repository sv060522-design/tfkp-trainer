// Integration tests use Node's real password hashing and execute the production Lua.
const assert=require('node:assert/strict');
const handler=require('../api/account.js'),ids=require('../data/progress-ids.js');
const redis=require('./test-redis.cjs')();
const originalFetch=global.fetch;
global.fetch=async(url,options)=>{assert.equal(url,'https://test-store.upstash.io');assert.equal(options.headers.Authorization,'Bearer test-only-token');return new Response(JSON.stringify({result:redis.run(JSON.parse(options.body))}),{status:200});};
const env={url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN};
process.env.UPSTASH_REDIS_REST_URL='https://test-store.upstash.io';process.env.UPSTASH_REDIS_REST_TOKEN='test-only-token';
async function call(action,body={},auth={},headers={}){
 const req={method:action?'POST':'GET',headers:{host:'tfkp.test',origin:'https://tfkp.test','content-type':'application/json','x-forwarded-for':'192.0.2.1',cookie:auth.cookie||'','x-tfkp-csrf':auth.csrf||'',...headers},body:{action,userId:auth.id,...body}};
 let result;const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(text){result={status:this.statusCode,body:JSON.parse(text),headers:this.headers};}};
 await handler(req,res);return result;
}
function session(r){return {id:r.body.user.id,csrf:r.body.csrf,cookie:r.headers['Set-Cookie'].split(';')[0]};}
const stamp=(value,at,op='test-operation-00000001')=>({value,at,op});
const taskA='tasks:'+ids.tasks[0],taskB='tasks:'+ids.tasks[1],card='cards:theorem-11-2';
const solved={solved:true,starred:true,learningStatus:'solved-self'};
(async()=>{
 delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;
 assert.equal((await call()).body.configured,false);
 assert.equal((await call('register',{nickname:'tester',password:'test-password-only'})).status,503);
 process.env.UPSTASH_REDIS_REST_URL='https://test-store.upstash.io';process.env.UPSTASH_REDIS_REST_TOKEN='test-only-token';
 const reg=await call('register',{nickname:'Студент_1',password:'test-password-only'});assert.equal(reg.status,200);
 assert.match(reg.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);assert.match(reg.headers['Cache-Control'],/no-store/);
 const a=session(reg);
 const user=JSON.parse([...redis.store.entries()].find(([k])=>k.startsWith('tfkp:v1:user:'))[1]);
 assert(!JSON.stringify(user).includes('test-password-only'));assert.equal(user.salt.length,32);assert.equal(user.passwordHash.length,128);
 assert.equal((await call('login',{nickname:'студент_1',password:'incorrect-test-pass'})).status,401);
 const login=await call('login',{nickname:'студент_1',password:'test-password-only'});assert.equal(login.status,200);const b=session(login);assert.equal(a.id,b.id);assert.notEqual(a.cookie,b.cookie);
 const t=Date.now()-1000;
 assert.equal((await call('sync',{changes:{[taskA]:stamp(solved,t)}},a)).status,200);
 assert.equal((await call('sync',{changes:{[card]:stamp('known',t+10)}},b)).status,200);
 let state=(await call(null,{},a)).body.progress;assert.deepEqual(state.records[taskA].value,solved);assert.equal(state.records[card].value,'known');
 await call('sync',{changes:{[taskA]:stamp(null,t+20),[taskB]:stamp({...solved,starred:false},t+20)}},a);
 await call('sync',{changes:{[taskA]:stamp(solved,t+5)}},b);
 state=(await call(null,{},b)).body.progress;assert.equal(state.records[taskA].value,null,'old device cannot undo reset');assert(state.records[taskB].value.solved);assert.equal(state.records[card].value,'known');
 const revision=state.revision;await call('sync',{changes:{[taskA]:stamp(null,t+20)}},a);assert.equal((await call(null,{},a)).body.progress.revision,revision,'retry is idempotent');
 assert.equal((await call('sync',{changes:{}},{...a,csrf:'wrong-csrf-token'})).status,403);
 assert.equal((await call('sync',{changes:{}},{...a,csrf:'я'.repeat(64)})).status,403);
 assert.equal((await call('sync',{changes:{}},a,{origin:'https://evil.test'})).status,403);
 assert.equal((await call('sync',{changes:{}})).status,401);
 assert.equal((await call('sync',{changes:{},userId:'another-account'},a)).status,409);
 assert.equal((await call('sync',{changes:{'tasks:unknown':stamp(solved,t)}},a)).status,400);
 assert.equal((await call('sync',{changes:{[taskA]:stamp({...solved,solved:false},t)}},a)).status,400);
 assert.equal((await call('sync',{changes:{[card]:stamp('known',Date.now()+600000)}},a)).status,400);
 const second=await call('register',{nickname:'other_student',password:'different-test-pass'});const other=session(second);
 assert.deepEqual((await call(null,{},other)).body.progress.records,{},'separate users have separate progress');
 assert.equal((await call('sync',{changes:{},userId:a.id},other)).status,409,'old tab cannot upload to a different account');
 assert.equal((await call('logout',{},a)).status,200);assert.equal((await call(null,{},a)).body.user,null);assert((await call(null,{},b)).body.user,'logging out one device preserves the other session');
 const duplicate=await call('register',{nickname:'студент_1',password:'test-password-only'});assert.equal(duplicate.status,409);
 for(let i=0;i<16;i++)await call('login',{nickname:'missing-user',password:'missing-test-password'},{},{'x-forwarded-for':'192.0.2.2'});
 assert.equal((await call('login',{nickname:'missing-user',password:'missing-test-password'},{},{'x-forwarded-for':'192.0.2.2'})).status,429,'persistent rate limit');
 assert.equal(JSON.stringify(reg.body).includes('passwordHash'),false);
 console.log('Account API OK: two sessions, password hashing, atomic Lua merge, stale reset protection, retries, separate users, CSRF/origin/session checks, input validation, logout and rate limits. Live storage is a separate deployment check.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;if(env.url===undefined)delete process.env.UPSTASH_REDIS_REST_URL;else process.env.UPSTASH_REDIS_REST_URL=env.url;if(env.token===undefined)delete process.env.UPSTASH_REDIS_REST_TOKEN;else process.env.UPSTASH_REDIS_REST_TOKEN=env.token;});
