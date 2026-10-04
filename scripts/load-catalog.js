const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function loadCatalog() {
  const context = {window: {}};
  vm.createContext(context);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [, file] of html.matchAll(/<script src="\.\/(data\/[^\"]+)"/g)) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
  }
  const raw = [...context.window.TFKP_TASKS, ...context.window.TFKP_EXTRA_TASKS];
  const all = raw.map(t => {
    const patch = context.window.TFKP_TASK_OVERRIDES[t.id] || {};
    return {...t, ...patch, tags: [...new Set([...(t.tags || []), ...(patch.tags || [])])]};
  });
  return {context, all, tasks: all.filter(t => t.status !== 'raw-memory'), root};
}
module.exports = {loadCatalog};
