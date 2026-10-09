const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="(\.\/data\/[^\"]+)"/g)]
  .map(match => match[1].slice(2));
const context = { window: {} };
vm.createContext(context);
for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const raw = [...context.window.TFKP_TASKS, ...context.window.TFKP_EXTRA_TASKS];
assert.equal(new Set(raw.map(task => task.id)).size, raw.length, 'duplicate task ID');
const all = raw.map(task => ({ ...task, ...(context.window.TFKP_TASK_OVERRIDES[task.id] || {}) }));
const sourceNotes = all.filter(task => task.status === 'raw-memory');
const exercises = all.filter(task => task.status !== 'raw-memory');
const published = exercises.filter(task => task.statementPretty && task.answer && task.solution);
assert(published.length >= 500, 'catalogue must contain at least 500 solved tasks');
assert.equal(published.length, exercises.length, 'an exercise is missing its statement, answer or solution');
assert.equal(sourceNotes.length, 72, 'incomplete exam recollections are source notes');
assert(published.every(task => task.sourceLabel && task.solution.length >= 150));
assert.equal(all.filter(task => task.variantId === '2022-2023-osen-v1').length, 6);
assert.equal(published.filter(task => task.variantId === '2022-2023-osen-v1').length, 6);
for (const [variantId, count] of [
  ['2002-2003-осень-v1', 6], ['2002-2003-осень-v2', 6],
  ['2002-2003-осень-v3', 6], ['2002-2003-осень-v4', 6],
  ['2003-2004-осень-v1', 6], ['2003-2004-осень-v2', 6],
  ['2003-2004-осень-v3', 6], ['2003-2004-осень-v4', 6],
  ['2006-2007-весна-ФИВТ-v71', 6], ['2014-2015-осень-v41', 7],
  ['2006-2007-весна-ФИВТ-v72', 6],
  ['2006-2007-весна-ФИВТ-v73', 6], ['2006-2007-весна-ФИВТ-v74', 6],
  ['2014-2015-осень-v42', 7], ['2014-2015-осень-v43', 7],
  ['2014-2015-осень-v44', 7],
  ['2006-2007-осень-v51', 6], ['2006-2007-осень-v52', 6],
  ['2006-2007-осень-v53', 6], ['2006-2007-осень-v54', 6],
  ['2007-2008-осень-v71', 7], ['2007-2008-осень-v72', 7],
  ['2007-2008-осень-v73', 7], ['2007-2008-осень-v74', 7],
  ['2008-2009-осень-v81', 7], ['2008-2009-осень-v82', 7],
  ['2008-2009-осень-v83', 7], ['2008-2009-осень-v84', 7],
]) {
  assert.equal(published.filter(task => task.variantId === variantId).length, count, variantId);
}
assert(published.every(task => task.statementPretty.trim() && task.answer.trim() && task.solution.trim()));
const textbook = all.filter(task => task.type === 'textbook');
assert.equal(textbook.length, 33, 'textbook practice count');
assert.equal(published.filter(task => task.type === 'oral').length, 20, 'oral task count');
for (let v=1; v<=4; v++) {
  const tasks = published.filter(task => task.variantId === `2001-2002-осень-v${v}`);
  assert.equal(tasks.length, 6, 'split autumn 2001 variant');
  assert.deepEqual(tasks.map(task => String(task.taskNo)).sort(), ['1','2','3','4','5','6']);
  assert.equal(tasks.find(task => task.taskNo === '3').topic, 'Интегралы по вещественной оси');
  assert.equal(tasks.find(task => task.taskNo === '4').topic, 'Контурные интегралы и вычеты');
}
for (const [id, topic] of [
  ['1998-1999-осень-v4-n3', 'Контурные интегралы и вычеты'],
  ['2002-2003-осень-v2-n5', 'Интегралы с алгебраической ветвью'],
  ['kolesnikova-2016-example-1-14', 'Ряды Лорана и Тейлора'],
]) assert.equal(published.find(task => task.id === id).topic, topic);
assert(textbook.every(task => task.statementPretty && task.answer && task.solution && task.sourceLabel));
assert(textbook.every(task => task.hints.length >= 2 && task.algorithm.length >= 3));
assert.equal(new Set(textbook.map(task => task.variantId)).size, textbook.length,
  'textbook examples must not be combined into a semester variant');
// An unescaped TeX command in a JS string can become a control character
// (for example, the first two characters of the varphi command).
for (const task of published) {
  for (const field of ['statementPretty', 'answer', 'solution', 'hints', 'algorithm']) {
    assert(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(String(task[field] || '')),
      `${task.id}: invalid control character in ${field}`);
    assert(!/\b(?:NaN|nan|False|zoo)\b|\\n\\n/.test(String(task[field] || '')),
      `${task.id}: broken generated text in ${field}`);
  }
}
const before = context.window.TFKP_TASK_OVERRIDES['2022-2023-osen-v1-n1'];
context.window.TFKP_MERGE_OVERRIDES({ '2022-2023-osen-v1-n1': { notes: 'merge check' } });
assert.equal(context.window.TFKP_TASK_OVERRIDES['2022-2023-osen-v1-n1'].solution, before.solution);

const reviewed = require('./load-catalog').loadCatalog().tasks;
assert.equal(reviewed.length, 500);
for (const t of reviewed) {
  assert(t.primaryTopic && t.topics.includes(t.primaryTopic) && t.subtopics.length, t.id + ': taxonomy');
  assert(Number.isInteger(t.difficulty) && t.difficulty >= 1 && t.difficulty <= 5, t.id + ': difficulty');
  assert(t.sourceFile && t.sourceLabel && t.sourceTask && Number.isInteger(t.sourcePage) && t.sourcePage > 0, t.id + ': source');
  assert.match(t.verificationEvidence.sourcePageSha256, /^[a-f0-9]{64}$/);
  for (const [field, hash] of [['statementPretty','statementSha256'],['answer','answerSha256'],['solution','solutionSha256']]) {
    assert.equal(require('node:crypto').createHash('sha256').update(t[field]).digest('hex'), t.verificationEvidence[hash], t.id + ': reviewed text changed');
  }
  assert.equal(t.solutionVerification, 'reviewed', t.id + ': solution not reviewed');
  assert(t.solution.length > 300 && t.verificationEvidence.answerReview.checks.length >= 2, t.id + ': evidence');
  assert(t.idea && t.hints.length >= 2 && t.algorithm.length >= 3 && t.shortSolution && t.prerequisites.length, t.id + ': learning content');
  assert(t.methodRefs.length && t.methodRefs.every(key => context.window.TFKP_METHODS[key]), t.id + ': missing method');
  assert(!/TODO|PLACEHOLDER|решение неполное|по рукописной сверке|далее очевидно/i.test(t.solution), t.id + ': placeholder');
  if (t.primaryTopic === 'Ряды Лорана и Тейлора') assert(t.laurentAudit && Number.isFinite(t.laurentAudit.maxRelativeError), t.id + ': Laurent check');
}
assert.equal(reviewed.filter(t => t.primaryTopic === 'Ряды Лорана и Тейлора').length, 80);
assert.equal(reviewed.filter(t => t.statementVerification === 'needs-review').length, 1);
assert.equal(reviewed.find(t => t.id === 'kolesnikova-2016-example-2-3').answer.includes('frac13'), true);

// Execute the application itself with isolated DOM and storage; never touch user browser data.
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const saved = new Map();
const oldId = '2008-2009-осень-v81-n1';
saved.set('tfkp-trainer-progress-v2', JSON.stringify({[oldId]: {solved: true, starred: true}}));
function boot({mobile = false, hash = '', search = '', extraTask = false} = {}) {
  const {context: ctx} = require('./load-catalog').loadCatalog();
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {id, value: '', innerHTML: '', dataset: {}, addEventListener() {}, focus() {}, setSelectionRange() {}});
    return nodes.get(id);
  };
  if (extraTask) ctx.window.TFKP_EXTRA_TASKS.push({...reviewed[0], id: 'qa-501-pagination', title: 'QA 501'});
  ctx.window.matchMedia = () => ({matches: mobile});
  ctx.window.addEventListener = () => {};
  ctx.document = {activeElement: null, getElementById: node, querySelector: sel => node(sel.slice(1)), querySelectorAll: () => [], createElement: () => ({click() {}})};
  ctx.localStorage = {getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key)};
  ctx.location = {pathname: '/', search, hash, href: 'https://example.test/' + search + hash};
  ctx.history = {replaceState: (_a, _b, url) => {ctx.location.hash = url.slice(url.indexOf('#'));}};
  ctx.URLSearchParams = URLSearchParams;
  ctx.URL = {createObjectURL: () => 'blob:qa', revokeObjectURL() {}};
  ctx.Blob = Blob;
  ctx.setTimeout = cb => {cb(); return 0;};
  ctx.alert = () => {};
  ctx.navigator = {clipboard: {writeText() {}}};
  vm.runInContext(appCode, ctx, {filename: 'app.js'});
  node('importBox');
  return {ctx, nodes, run: code => vm.runInContext(code, ctx)};
}
const {ctx, nodes, run} = boot();
assert.equal(run('TASKS.length'), 500);
assert.equal(run(`learningStatus('${oldId}')`), 'solved-self');
assert.equal(run(`p('${oldId}').starred`), true);
assert.equal(run('TASKS.filter(isVerified).length'), 499);
assert.equal(run('isVerified({statementPretty:"pretty"})'), false, 'pretty statement is not proof');
for (const field of ['statementVerification', 'answerVerification', 'solutionVerification']) {
  assert.equal(run(`isVerified({...TASKS.find(isVerified),${field}:'needs-review'})`), false);
}
for (const [filter, value, count] of [['kind','textbook',33],['kind','oral',20],['kind','semester',447],['quality','verified',499],['quality','statement',1],['quality','answer',0],['quality','solution',0]]) {
  run('resetFilters()');
  assert.equal(run(`state.${filter}=${JSON.stringify(value)};filteredTasks().length`), count, filter + value);
}
for (const name of ['year','source','subtopic','difficulty']) {
  run('resetFilters()');
  const value = run(`TASKS.find(t=>t.id==='${oldId}')[${JSON.stringify(name === 'source' ? 'sourceFile' : name === 'subtopic' ? 'subtopics' : name)}]`);
  const chosen = Array.isArray(value) ? value[0] : value;
  assert(run(`state.${name}=${JSON.stringify(chosen)};filteredTasks().every(t=>${name === 'source' ? 't.sourceFile' : name === 'subtopic' ? 't.subtopics.includes(state.subtopic)' : `t.${name}`} ${name === 'subtopic' ? '' : `===state.${name}`})`));
  assert(run('filteredTasks().length') > 0);
}
run('resetFilters();state.topics=["Ряды Лорана и Тейлора","Особые точки"]');
assert(run('filteredTasks().length') > 0);
assert(run('filteredTasks().every(t=>state.topics.every(x=>taskTopics(t).includes(x)))'), 'topics use AND');
run('state.trainingCount=10;makeTraining()');
assert.equal(run('state.ticket.length'), 10);
assert.equal(run('new Set(state.ticket.map(t=>t.id)).size'), 10);
assert(run('state.ticket.every(t=>state.topics.every(x=>taskTopics(t).includes(x)))'));
run('makeTicket()');
assert.equal(run('state.ticket.length'), run('TASKS.filter(t=>t.variantId===state.ticket[0].variantId).length'), 'full historical variant');
assert(run('state.ticket.length>=5'));
run('resetFilters();state.kind="textbook";state.ticket=[];makeTicket()');
assert.equal(run('state.ticket.length'), 0);
run('resetFilters();state.query="no-such-qa-task";makeTraining();randomTask()');
assert.equal(run('state.ticket.length'), 0);
run('resetFilters();state.source="устные задачи.pdf";randomTask()');
assert.equal(run('TASKS.find(t=>t.id===state.activeId).type'), 'oral');
for (const status of ['not-started','in-progress','solved-self','solved-hint','viewed','unclear']) {
  run(`setLearningStatus('${oldId}','${status}')`);
  assert.equal(run(`learningStatus('${oldId}')`), status);
  assert.equal(run(`p('${oldId}').solved`), ['solved-self','solved-hint'].includes(status));
  assert.equal(run(`p('${oldId}').starred`), true, 'status preserves repeat');
}
run(`setLearningStatus('${oldId}','solved-hint')`);
const second = boot();
assert.equal(second.run(`learningStatus('${oldId}')`), 'solved-hint', 'reload');
assert.equal(second.run(`p('${oldId}').starred`), true);
run('exportProgress()');
for (const invalid of ['null','[]','42','{"x":true}','{"x":{"solved":"yes"}}','{"x":{"learningStatus":"wrong"}}','{"__proto__":{}}','{bad']) {
  nodes.get('importBox').value = invalid;
  const old = saved.get('tfkp-trainer-progress-v2');run('importProgress()');
  assert.equal(saved.get('tfkp-trainer-progress-v2'), old, 'invalid import is atomic');
}
nodes.get('importBox').value = JSON.stringify({[oldId]: {solved:true,starred:false,learningStatus:'solved-self'}});
run('importProgress()');
assert.equal(run(`p('${oldId}').starred`), false);
assert.equal(boot().run(`p('${oldId}').solved`), true);
const set = ctx.localStorage.setItem;ctx.localStorage.setItem = () => {throw new Error('quota');};
run(`setP('${oldId}',{starred:true})`);
assert(nodes.get('app').innerHTML.includes('Браузер не сохранил изменения'));
ctx.localStorage.setItem = set;
const linkedId = '2014-2015-осень-v41-n7';
const linked = boot({hash:'#task='+encodeURIComponent(linkedId)});
assert.equal(linked.run('state.activeId'), linkedId);
assert(!/<details[^>]*class="learning-block"[^>]*\sopen(?:\s|>)/.test(linked.nodes.get('app').innerHTML), 'answers hidden by default');
linked.run(`revealAll('${linkedId}')`);
assert(linked.nodes.get('app').innerHTML.includes('data-part="answer" open'));
assert.equal(linked.run(`learningStatus('${linkedId}')`), 'viewed');
assert.match(run('mdish("**bold** <img src=x onerror=alert(1)>")'), /<strong>bold<\/strong> &lt;img/);
assert(!run('mdish("**<script>bad</script>**")').includes('<script>'));
const mobile = boot({mobile:true});
assert.equal(mobile.run('state.filtersOpen || state.listOpen'), false);
const extended = boot({extraTask:true});
assert.equal(extended.run('TASKS.length'), 501);
extended.run('state.visibleLimit=550;render()');
assert(extended.nodes.get('app').innerHTML.includes('QA 501'), '501st task remains accessible');
for (const t of reviewed.filter(t=>t.diagram)) {
  const output = run(`renderTaskDiagram(TASKS.find(t=>t.id===${JSON.stringify(t.id)}))`);
  assert(output.includes('<svg'), t.id + ': missing SVG');
  assert(!/NaN|undefined/.test(output), t.id + ': invalid SVG');
}
assert.equal(nodes.get('app').dataset.build, '2026-10-08-v36');
// A disclosed solution must update the displayed status immediately, including
// the short solution; a manually closed block stays closed after a rerender.
const reading=boot({hash:'#task='+encodeURIComponent(linkedId)});
reading.run(`setLearningStatus('${linkedId}','not-started');onDisclosureToggle({dataset:{task:'${linkedId}',part:'short'},open:true})`);
assert.equal(reading.run(`learningStatus('${linkedId}')`),'viewed');
// A manual choice also wins if the previous genuine opening event is still
// queued when the user changes the status.
const manual=boot({hash:'#task='+encodeURIComponent(linkedId)});
manual.ctx.document.querySelectorAll=()=>[{dataset:{task:linkedId,part:'short'},open:true,addEventListener(){}}];
manual.run(`setLearningStatus('${linkedId}','not-started');onDisclosureToggle({dataset:{task:'${linkedId}',part:'short'},open:true});setP('${linkedId}',{starred:true})`);
assert.equal(manual.run(`learningStatus('${linkedId}')`),'not-started');
assert.match(reading.nodes.get('app').innerHTML,/<option value="viewed" selected>/);
reading.run(`revealAll('${linkedId}');onDisclosureToggle({dataset:{task:'${linkedId}',part:'answer'},open:false});render()`);
assert(!reading.nodes.get('app').innerHTML.includes('data-part="answer" open'));
assert(reading.nodes.get('app').innerHTML.includes('Свернуть всё'));
reading.run(`hideAll('${linkedId}')`);
assert(!/<details[^>]*class="learning-block"[^>]*\sopen(?:\s|>)/.test(reading.nodes.get('app').innerHTML));
reading.run(`onDisclosureToggle({dataset:{task:'${linkedId}',part:'answer'},open:true,isConnected:false})`);
assert(!reading.run(`state.reveals['${linkedId}'].answer`));
reading.nodes.get('importBox').value='draft survives filtering';
reading.run('changeFilter("query","1997")');
assert.equal(reading.nodes.get('importBox').value,'draft survives filtering');
// Explicit learning status takes precedence over conflicting legacy solved.
reading.nodes.get('importBox').value=JSON.stringify({[linkedId]:{solved:true,starred:true,learningStatus:'viewed'},'old-unavailable-id':{solved:true,starred:true}});
reading.run('importProgress()');
assert.equal(reading.run(`p('${linkedId}').solved`),false);
assert.equal(boot().run(`learningStatus('${linkedId}')`),'viewed');
assert.equal(reading.run('p("old-unavailable-id").starred'),true);
reading.run('exportProgress()');
const textBackup=JSON.parse(reading.nodes.get('importBox').value);
assert.equal(textBackup[linkedId].learningStatus,'viewed');
assert.equal(textBackup['old-unavailable-id'].starred,true);
reading.run('render()');
assert.deepEqual(JSON.parse(reading.nodes.get('importBox').value),textBackup);
assert.equal(reading.run('state.quality="needs-review";state.query="";filteredTasks().length'),1);
// A close followed immediately by another render can precede the native toggle
// event. The DOM state must still win over the last observed open state.
const queued=boot({hash:'#task='+encodeURIComponent(linkedId)});
queued.run(`revealAll('${linkedId}')`);
queued.ctx.document.querySelectorAll=()=>[{dataset:{task:linkedId,part:'answer'},open:false,addEventListener(){}}];
queued.run(`setLearningStatus('${linkedId}','solved-self')`);
assert(!queued.nodes.get('app').innerHTML.includes('data-part="answer" open'));
queued.run(`revealAll('${linkedId}')`);
assert(queued.nodes.get('app').innerHTML.includes('data-part="answer" open'));
queued.run(`hideAll('${linkedId}')`);
assert(!/<details[^>]*class="learning-block"[^>]*\sopen(?:\s|>)/.test(queued.nodes.get('app').innerHTML));
// Recreating an already open solution after a manual status change is not a
// new viewing action. A later genuine close/open is a new viewing action.
reading.run(`revealAll('${linkedId}');setLearningStatus('${linkedId}','not-started');onDisclosureToggle({dataset:{task:'${linkedId}',part:'short'},open:true})`);
assert.equal(reading.run(`learningStatus('${linkedId}')`),'not-started');
reading.run(`onDisclosureToggle({dataset:{task:'${linkedId}',part:'short'},open:false});onDisclosureToggle({dataset:{task:'${linkedId}',part:'short'},open:true})`);
assert.equal(reading.run(`learningStatus('${linkedId}')`),'viewed');
console.log('Catalog and app OK: 500 solved tasks, quality/taxonomy/all filters, full variants, training, 501 pagination, deep links, safe rendering, migration/export/import/reload, SVGs');


// Global notation and exact-power collection are final-catalogue guarantees.
assert(published.every(t=>!JSON.stringify(t).includes('\\binom')), 'C notation in every visible task field');
assert(!JSON.stringify(context.window.TFKP_METHODS).includes('\\binom'), 'C notation in methods');
assert.equal(published.filter(t=>t.seriesReview).length,76);
assert.equal(published.reduce((n,t)=>n+(t.seriesReview?.rings.length||0),0),81);
assert(published.every(t=>!/далее очевидно|TODO|PLACEHOLDER|решение неполное/i.test(t.solution)));

saved.clear();
const collections=boot();
collections.run(`setLearningStatus('${oldId}','solved-self');setP('${oldId}',{starred:true});setLearningStatus('${linkedId}','viewed');state.query='no result';state.topics=['Особые точки'];showCollection('solved')`);
assert.equal(collections.run('filteredTasks().length'),1,'solved counter clears unrelated filters');
assert.equal(collections.run('filteredTasks()[0].id'),oldId);
assert(collections.nodes.get('app').innerHTML.includes('id="stat-solved"'));
assert.equal(collections.run('state.listOpen'),true);
collections.run(`showCollection('unsolved')`);
assert.equal(collections.run('filteredTasks().length'),499);
assert(collections.run(`filteredTasks().some(t=>t.id==='${linkedId}')`),'viewed task is still unsolved');
collections.run(`showCollection('all');state.groupBy='completion'`);
assert.equal(collections.run(`taskGroups(filteredTasks())[0].key`),'Решённые');
assert.equal(collections.run(`taskGroups(filteredTasks())[0].tasks.length`),1);
assert.equal(collections.run(`taskGroups(filteredTasks())[1].tasks.length`),499);
collections.run(`state.visibleLimit=500;render()`);
assert.equal((collections.nodes.get('app').innerHTML.match(/class="task-row /g)||[]).length,500,'grouping retains every task');
for(const mode of ['learning','topic','none']){
 collections.run(`state.groupBy='${mode}'`);
 assert.equal(collections.run(`taskGroups(filteredTasks()).flatMap(g=>g.tasks).length`),500);
 assert.equal(collections.run(`new Set(taskGroups(filteredTasks()).flatMap(g=>g.tasks.map(t=>t.id))).size`),500);
}
collections.run(`resetSolvedProgress()`);
assert.equal(collections.run(`TASKS.filter(t=>p(t.id).solved).length`),0);
assert.equal(collections.run(`p('${oldId}').starred`),true,'solved reset preserves stars');
assert.equal(collections.run(`learningStatus('${linkedId}')`),'viewed','solved reset preserves other learning statuses');
assert.equal(boot().run(`learningStatus('${oldId}')`),'not-started','reset survives reload');
assert(collections.run(`resetBackup().entries['${oldId}'].solved`),'recoverable reset backup');
collections.run(`undoSolvedReset()`);
assert.equal(collections.run(`learningStatus('${oldId}')`),'solved-self');
assert.equal(collections.run(`p('${oldId}').starred`),true);
assert.equal(collections.run('resetBackup()'),null);

const requested=boot({search:'?reset-solved=20261008'});
assert.equal(requested.run(`p('${oldId}').solved`),false,'authorized reset link');
requested.run(`setLearningStatus('${oldId}','solved-hint')`);
assert.equal(boot({search:'?reset-solved=20261008'}).run(`learningStatus('${oldId}')`),'solved-hint','reset link is one-time, future progress survives');
// A storage failure cannot silently discard the old progress or recovery copy.
const failure=boot();
const beforeFailedReset=saved.get('tfkp-trainer-progress-v2');
const backupBeforeFailure=saved.get('tfkp-trainer-progress-v2-solved-reset-backup');
failure.ctx.localStorage.setItem=(key,value)=>{if(key==='tfkp-trainer-progress-v2'&&value!==beforeFailedReset)throw Error('quota');saved.set(key,value);};
assert.equal(failure.run(`resetSolvedProgress('qa-failure')`),false);
assert.equal(saved.get('tfkp-trainer-progress-v2'),beforeFailedReset);
assert.equal(saved.get('tfkp-trainer-progress-v2-solved-reset-backup'),backupBeforeFailure);
assert.equal(failure.run(`learningStatus('${oldId}')`),'solved-hint');
console.log('Progress collections OK: counters, solved/unsolved, status/topic grouping, reload, reversible one-time reset, storage failure recovery');

// Returning a card to unsolved closes disclosed answers without losing its star.
saved.clear();
const unsolve=boot({hash:'#task='+encodeURIComponent(linkedId)});
unsolve.run(`setP('${linkedId}',{starred:true});revealAll('${linkedId}');setLearningStatus('${linkedId}','solved-self');markUnsolved('${linkedId}')`);
assert.equal(unsolve.run(`p('${linkedId}').solved`),false);
assert.equal(unsolve.run(`learningStatus('${linkedId}')`),'not-started');
assert.equal(unsolve.run(`p('${linkedId}').starred`),true);
assert(!/<details[^>]*class="learning-block"[^>]*\sopen(?:\s|>)/.test(unsolve.nodes.get('app').innerHTML));
assert.equal(boot().run(`learningStatus('${linkedId}')`),'not-started');
unsolve.run(`showCollection('ambiguous')`);
assert.equal(unsolve.run('filteredTasks().length'),1);
assert.equal(unsolve.run('filteredTasks()[0].id'),'2008-2009-осень-v82-n5');
assert.match(unsolve.nodes.get('app').innerHTML,/499 полностью проверенных \+ 1 с разобранной неоднозначностью = 500/);
assert.match(unsolve.nodes.get('app').innerHTML,/Оба непрерывных выбора полностью разобраны/);
console.log('New status and quality UI OK: explicit unsolved action, hidden answers, retained star, reload, 499 + 1 = 500');

