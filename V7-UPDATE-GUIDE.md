# v7 delta update

Этот архив содержит только изменённые/новые файлы, а не весь сайт.

Состав:

- `app.js` — добавлена поддержка новых задач через `window.TFKP_EXTRA_TASKS`.
- `index.html` — подключён новый пакет `data/batches/v7-2023-2024-2006.js`.
- `data/batches/v7-2023-2024-2006.js` — новые проверенные условия и подробные решения.

Как применить:

1. Распаковать архив.
2. Скопировать содержимое архива в корень репозитория `tfkp-trainer` с заменой файлов.
3. Выполнить:

```powershell
git add .
git commit -m "add v7 solutions delta"
git push
```

Старые файлы `data/tasks.js`, `data/overrides.js`, `data/batches/v5-major.js`, `data/batches/v6-solutions.js` не заменяются и не стираются.
