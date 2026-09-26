// Apply successive editorial batches field by field. Object.assign on the
// override map replaces a whole task record and silently loses older fields.
window.TFKP_MERGE_OVERRIDES = function (batch) {
  const target = window.TFKP_TASK_OVERRIDES || (window.TFKP_TASK_OVERRIDES = {});
  for (const [id, patch] of Object.entries(batch)) {
    const previous = target[id] || {};
    target[id] = { ...previous, ...patch };
    if (previous.tags || patch.tags) {
      target[id].tags = [...new Set([...(previous.tags || []), ...(patch.tags || [])])];
    }
  }
  return target;
};
