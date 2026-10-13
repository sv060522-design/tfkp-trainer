'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'dist');
const publicFiles=['index.html','app.js','theory.js','sync.js','styles.css','theory.css','sync.css','legacy-progress.html'];
const publicDirectories=['data','sources','vendor'];
const asset=/\.(?:js|mjs|json|css|pdf|png|jpe?g|webp|gif|svg|woff2?|ttf|otf|txt)$/i;
function publicAsset(source){
  const stat=fs.lstatSync(source);
  if(stat.isSymbolicLink())throw Error('Public assets cannot contain symlinks');
  return stat.isDirectory()||asset.test(source)||path.basename(source)==='LICENSE';
}
fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(output,{recursive:true});
for(const file of publicFiles)fs.copyFileSync(path.join(root,file),path.join(output,file));
for(const directory of publicDirectories)fs.cpSync(path.join(root,directory),path.join(output,directory),{recursive:true,filter:publicAsset});
const mathjax=path.dirname(require.resolve('mathjax/package.json'));
const mathsOutput=path.join(output,'vendor','mathjax');
fs.cpSync(path.join(mathjax,'es5'),mathsOutput,{recursive:true,filter:publicAsset});
fs.copyFileSync(path.join(mathjax,'LICENSE'),path.join(mathsOutput,'LICENSE'));
const indexPath=path.join(output,'index.html');
const html=fs.readFileSync(indexPath,'utf8');
const cdn='https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js';
if(!html.includes(cdn))throw Error('Expected MathJax 3.2.2 script was not found');
fs.writeFileSync(indexPath,html.replace(cdn,'./vendor/mathjax/tex-svg.js'));
console.log('Portable build ready: website, 500-task catalog, theory PDFs and local MathJax.');
