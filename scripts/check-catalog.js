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
const published = all.filter(task => task.statementPretty && task.answer && task.solution);
assert(published.length > 0, 'empty catalogue');
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
]) {
  assert.equal(published.filter(task => task.variantId === variantId).length, count, variantId);
}
assert(published.every(task => task.statementPretty.trim() && task.answer.trim() && task.solution.trim()));
const before = context.window.TFKP_TASK_OVERRIDES['2022-2023-osen-v1-n1'];
context.window.TFKP_MERGE_OVERRIDES({ '2022-2023-osen-v1-n1': { notes: 'merge check' } });
assert.equal(context.window.TFKP_TASK_OVERRIDES['2022-2023-osen-v1-n1'].solution, before.solution);

console.log(`Catalog OK: ${published.length} complete cards from ${all.length} source records`);
