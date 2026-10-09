// Test-only Redis command adapter. EVAL executes the actual Lua scripts in Fengari.
// This is not a production datastore and is never imported by api/account.js.
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');
const NULL={};
function push(L,v){
 if(v===null||v===undefined)lua.lua_pushlightuserdata(L,NULL);
 else if(typeof v==='string')lua.lua_pushstring(L,to_luastring(v));
 else if(typeof v==='number')lua.lua_pushnumber(L,v);
 else if(typeof v==='boolean')lua.lua_pushboolean(L,v);
 else{lua.lua_newtable(L);for(const [k,value]of Object.entries(v)){push(L,value);if(Array.isArray(v))lua.lua_rawseti(L,-2,Number(k)+1);else lua.lua_setfield(L,-2,to_luastring(k));}}
}
function value(L,index){
 const type=lua.lua_type(L,index);
 if(type===lua.LUA_TNIL||type===lua.LUA_TLIGHTUSERDATA)return null;
 if(type===lua.LUA_TSTRING)return to_jsstring(lua.lua_tolstring(L,index));
 if(type===lua.LUA_TBOOLEAN)return lua.lua_toboolean(L,index);
 if(type===lua.LUA_TNUMBER)return lua.lua_tonumber(L,index);
 if(type!==lua.LUA_TTABLE)throw Error('Unsupported Lua result');
 const absolute=lua.lua_absindex(L,index),result={};lua.lua_pushnil(L);
 while(lua.lua_next(L,absolute)){const key=value(L,-2);result[key]=value(L,-1);lua.lua_pop(L,1);}return result;
}
module.exports=function createRedis(){
 const store=new Map(),expires=new Map();
 function exists(key){if(expires.get(key)<=Date.now()){store.delete(key);expires.delete(key);}return store.has(key);}
 function run(command){
  const [name,...args]=command,op=String(name).toUpperCase();
  if(op==='GET')return exists(args[0])?store.get(args[0]):null;
  if(op==='SET'){
   const [key,data,...opts]=args;if(opts.map(x=>String(x).toUpperCase()).includes('NX')&&exists(key))return null;
   store.set(key,String(data));expires.delete(key);
   const ex=opts.findIndex(x=>String(x).toUpperCase()==='EX');if(ex>=0)expires.set(key,Date.now()+Number(opts[ex+1])*1000);return 'OK';
  }
  if(op==='INCR'){const v=Number(run(['GET',args[0]])||0)+1;store.set(args[0],String(v));return v;}
  if(op==='EXPIRE'){if(!exists(args[0]))return 0;expires.set(args[0],Date.now()+Number(args[1])*1000);return 1;}
  if(op==='DEL'){let n=0;for(const k of args){if(store.delete(k))n++;expires.delete(k);}return n;}
  if(op!=='EVAL')throw Error('Unexpected Redis command '+op);
  const [script,n,...params]=args,L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  push(L,params.slice(0,Number(n)));lua.lua_setglobal(L,to_luastring('KEYS'));
  push(L,params.slice(Number(n)).map(String));lua.lua_setglobal(L,to_luastring('ARGV'));
  lua.lua_newtable(L);
  lua.lua_pushcfunction(L,L=>{push(L,JSON.parse(value(L,1)));return 1;});lua.lua_setfield(L,-2,to_luastring('decode'));
  lua.lua_pushcfunction(L,L=>{push(L,JSON.stringify(value(L,1)));return 1;});lua.lua_setfield(L,-2,to_luastring('encode'));lua.lua_setglobal(L,to_luastring('cjson'));
  lua.lua_newtable(L);lua.lua_pushcfunction(L,L=>{const args=[];for(let i=1;i<=lua.lua_gettop(L);i++)args.push(value(L,i));const result=run(args);if(result===null)lua.lua_pushboolean(L,false);else push(L,result);return 1;});lua.lua_setfield(L,-2,to_luastring('call'));lua.lua_setglobal(L,to_luastring('redis'));
  if(lauxlib.luaL_loadstring(L,to_luastring(script))!==lua.LUA_OK||lua.lua_pcall(L,0,1,0)!==lua.LUA_OK)throw Error(value(L,-1));
  const result=value(L,-1);lua.lua_close(L);return result;
 }
 return {run,store,expires};
};
