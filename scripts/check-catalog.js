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
}
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

// Exercise the actual filter/render/progress code with a small DOM stub.
// No browser storage from the user is touched by this in-memory check.
const preservedId = '2008-2009-осень-v81-n1';
const saved = new Map([['tfkp-trainer-progress-v2', JSON.stringify({
  [preservedId]: { solved: true, starred: true }
})]]);
const appNode = { innerHTML: '' };
const input = { addEventListener() {}, focus() {}, setSelectionRange() {}, value: '' };
context.document = {
  activeElement: null,
  getElementById: id => id === 'app' ? appNode : input,
  querySelector: () => input,
};
context.localStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context, { filename: 'app.js' });
assert.equal(vm.runInContext('TASKS.length', context), published.length);
assert.equal(vm.runInContext('STUDY_TASKS.length', context), published.length);
assert.equal(vm.runInContext(`p('${preservedId}').solved`, context), true, 'preserved progress');
assert.equal(vm.runInContext("state.kind='textbook'; filteredTasks().length", context), 33);
vm.runInContext('render(); makeTicket()', context);
assert(appNode.innerHTML.includes('пример 1.9'), 'textbook example label');
assert(appNode.innerHTML.includes('writeText(&quot;'), 'clipboard handler must escape attribute quotes');
assert.equal(vm.runInContext('state.ticket.length', context), 0, 'textbook examples are not a semester');
assert.equal(vm.runInContext("state.kind='semester'; state.year='2008/2009'; filteredTasks().length", context), 28);
assert.equal(vm.runInContext("state.query='вариант 82'; filteredTasks().length", context), 7);
vm.runInContext(`setP('${preservedId}', {starred:false})`, context);
const after = JSON.parse(saved.get('tfkp-trainer-progress-v2'));
assert.equal(after[preservedId].solved, true, 'progress merge preserves solved');
assert.equal(after[preservedId].starred, false);
assert.equal(vm.runInContext("state.kind='oral'; state.query=''; state.year='all'; filteredTasks().length", context), 20);
for (const invalid of ['null','[]','42','{"x":true}','{"x":{"solved":"yes"}}','{bad']) {
  input.value = invalid;
  context.alert = () => {};
  const beforeImport = saved.get('tfkp-trainer-progress-v2');
  vm.runInContext('importProgress()', context);
  assert.equal(saved.get('tfkp-trainer-progress-v2'), beforeImport, 'invalid import must not erase progress');
}
input.value = JSON.stringify({[preservedId]: {solved:true, starred:true}});
vm.runInContext('importProgress()', context);
assert.equal(vm.runInContext(`p('${preservedId}').starred`, context), true, 'valid import');
assert.equal(vm.runInContext('loadProgress()', context)[preservedId].solved, true, 'reload after import');
const previousSet = context.localStorage.setItem;
context.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
vm.runInContext(`setP('${preservedId}', {starred:false})`, context);
assert(appNode.innerHTML.includes('Браузер не сохранил изменения'), 'storage failure is visible');
context.localStorage.setItem = previousSet;
for (const type of ['conformal-arc', 'hyperbolic-region', 'halfplane-disk']) {
  const config = JSON.stringify({type, start:0, end:270, target:'1'});
  assert(vm.runInContext(`renderConformalDiagram(${config})`, context).includes('<svg'));
}
assert(vm.runInContext(`renderBranchDiagram({range:2, segments:[[[-1,0],[1,0]]], points:[{at:[0,1],label:'i'}]})`, context).includes('<svg'));
assert(vm.runInContext(`renderSectorDiagram({caption:'test'})`, context).includes('<svg'));
// Check that export snapshots current marks into a downloadable JSON file.
let exportedBlob, clicked = false, revoked = false;
const exportLink = {click() { clicked = true; }};
context.Blob = class { constructor(parts, options) { this.parts = parts; this.type = options.type; } };
context.URL = {
  createObjectURL(blob) { exportedBlob = blob; return 'blob:test-export'; },
  revokeObjectURL(url) { assert.equal(url, 'blob:test-export'); revoked = true; }
};
context.document.createElement = tag => { assert.equal(tag, 'a'); return exportLink; };
vm.runInContext('exportProgress()', context);
assert.equal(exportedBlob.type, 'application/json');
assert.equal(exportLink.download, 'tfkp-progress.json');
assert.equal(JSON.stringify(JSON.parse(exportedBlob.parts.join(''))), vm.runInContext('JSON.stringify(progress)', context));
assert(clicked && revoked, 'download is triggered and its temporary URL is released');
console.log(`Catalog OK: ${published.length} complete cards from ${all.length} source records; filters, diagrams and progress passed`);
