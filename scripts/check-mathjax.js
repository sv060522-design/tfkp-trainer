// Run with mathjax-full 3.2.2 available in NODE_PATH (matches the site's CDN).
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {mathjax}=require('mathjax-full/js/mathjax.js');
const {TeX}=require('mathjax-full/js/input/tex.js');
const {SVG}=require('mathjax-full/js/output/svg.js');
const {liteAdaptor}=require('mathjax-full/js/adaptors/liteAdaptor.js');
const {RegisterHTMLHandler}=require('mathjax-full/js/handlers/html.js');
const {AllPackages}=require('mathjax-full/js/input/tex/AllPackages.js');
const root=path.resolve(__dirname,'..'), ctx={window:{}};vm.createContext(ctx);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const [,file] of html.matchAll(/<script src="\.\/(data\/[^\"]+)"/g))vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const tasks=[...ctx.window.TFKP_TASKS,...ctx.window.TFKP_EXTRA_TASKS].map(t=>({...t,...ctx.window.TFKP_TASK_OVERRIDES[t.id]})).filter(t=>t.status!=='raw-memory');
RegisterHTMLHandler(liteAdaptor());let where,errors=[],count=0;
const tex=new TeX({packages:AllPackages,formatError:(jax,error)=>{errors.push({...where,error:error.message});return jax.formatError(error);}});
const doc=mathjax.document('',{InputJax:tex,OutputJax:new SVG({fontCache:'none'})});
for(const t of tasks)for(const field of ['statementPretty','solution','answer','hints','algorithm','idea','shortSolution','prerequisites']) {
 const value=Array.isArray(t[field])?t[field].join('\n'):t[field]||'';
 for(const m of value.matchAll(/\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)|(?<!\\)\$([^$]*?)\$/g)) {
  where={id:t.id,field,formula:m[1]??m[2]??m[3]};doc.convert(where.formula,{display:Boolean(m[1])});count++;
 }
}
for(const [id,m] of Object.entries(ctx.window.TFKP_METHODS)) {
 for(const match of m.body.matchAll(/\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)|(?<!\\)\$([^$]*?)\$/g)) {
  where={id:'method:'+id,field:'body',formula:match[1]??match[2]??match[3]};doc.convert(where.formula,{display:Boolean(match[1])});count++;
 }
}
if(errors.length){console.error(JSON.stringify(errors,null,2));process.exit(1);}
console.log(`MathJax OK: ${count} formulas across ${tasks.length} tasks`);
