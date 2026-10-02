// Keep equivalent archived exercises under the same topic filters.
(() => {
  const years = new Set(['1996-1997','1997-1998','1998-1999','1999-2000','2000-2001','2001-2002','2002-2003','2005-2006','2009-2010']);
  const topics = ['','Ряды Лорана и Тейлора','Особые точки','Контурные интегралы и вычеты','Интегралы по вещественной оси','Интегралы с алгебраической ветвью','Регулярные ветви и разрезы'];
  const patches = {'kolesnikova-2016-example-1-14': {topic:topics[1]}};
  for (const id of Object.keys(window.TFKP_TASK_OVERRIDES)) {
    const m = id.match(/^(\d{4}-\d{4})-(осень|весна)-v\d+-n(\d+|all)$/);
    if (m && years.has(m[1])) {
      const n = m[3] === 'all' ? 1 : Number(m[3]);
      if (topics[n]) patches[id] = {topic:topics[n]};
    }
  }
  window.TFKP_MERGE_OVERRIDES(patches);
})();
