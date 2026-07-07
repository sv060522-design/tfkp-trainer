# Как выложить тренажёр в интернет через GitHub + Vercel

## 0. Что скачать и где зарегистрироваться

Скачать:

1. Git for Windows: https://git-scm.com/download/win
2. VS Code: https://code.visualstudio.com/
3. Node.js можно не ставить для этой версии, потому что сайт статический. Но Node.js LTS пригодится, если потом перейдём на React/Vite.

Зарегистрироваться:

1. GitHub: https://github.com/
2. Vercel: https://vercel.com/

Лучше входить в Vercel через GitHub.

## 1. Распаковать архив

Распакуй `tfkp-trainer-v2.zip`, например в:

```text
C:\Users\ТВОЙ_ПОЛЬЗОВАТЕЛЬ\Desktop\tfkp-trainer-v2
```

Внутри должны быть файлы:

```text
index.html
styles.css
app.js
data/tasks.js
README.md
DEPLOY.md
```

## 2. Проверить сайт на компьютере

Просто открой `index.html` двойным кликом.

Если хочешь проверить через локальный сервер:

1. Открой папку в VS Code.
2. Открой терминал: Terminal → New Terminal.
3. Напиши:

```bash
python -m http.server 5173
```

4. Открой в браузере:

```text
http://localhost:5173
```

## 3. Создать репозиторий на GitHub

1. Зайди на GitHub.
2. Нажми `+` справа сверху.
3. Выбери `New repository`.
4. Название, например:

```text
tfkp-trainer
```

5. Public — если хочешь, чтобы любой видел сайт и код.
6. Private — если пока хочешь закрыто.
7. Не ставь галочки `Add README`, `.gitignore`, `license`, потому что файлы уже есть.
8. Нажми `Create repository`.

## 4. Загрузить файлы на GitHub через команды

Открой терминал в папке проекта и выполни:

```bash
git init
git add .
git commit -m "initial tfkp trainer"
git branch -M main
git remote add origin https://github.com/ТВОЙ_ЛОГИН/tfkp-trainer.git
git push -u origin main
```

В строке `remote add origin` замени `ТВОЙ_ЛОГИН` на свой логин GitHub.

Если Git попросит имя и почту:

```bash
git config --global user.name "Твоё имя"
git config --global user.email "твоя_почта@example.com"
```

Потом снова:

```bash
git commit -m "initial tfkp trainer"
git push -u origin main
```

## 5. Выложить сайт на Vercel

1. Зайди на Vercel.
2. Нажми `Add New...` → `Project`.
3. Выбери GitHub-репозиторий `tfkp-trainer`.
4. Нажми `Import`.
5. Настройки:
   - Framework Preset: `Other` или `Static`.
   - Build Command: оставить пустым.
   - Output Directory: оставить пустым или поставить `.`.
6. Нажми `Deploy`.

Через минуту Vercel даст ссылку вида:

```text
https://tfkp-trainer.vercel.app
```

## 6. Как добавлять новые задачи потом

1. Открой `data/tasks.js`.
2. Добавь новый объект в массив `window.TFKP_TASKS`.
3. Проверь сайт локально.
4. Выполни:

```bash
git add .
git commit -m "add new tfkp tasks"
git push
```

Vercel сам обновит сайт после `git push`.

## 7. Как не сломать прогресс пользователей

Нельзя менять:

```text
id
```

у уже опубликованных задач.

Можно менять:

```text
statement
hints
algorithm
solution
answer
notes
```

Можно добавлять новые задачи с новыми `id`.

## 8. Как перенести прогресс между браузерами

На сайте внизу есть блок «Прогресс».

На старом браузере:

1. Нажми `Экспорт прогресса`.
2. Скачается `tfkp-progress.json`.

На новом браузере:

1. Открой этот файл блокнотом.
2. Скопируй содержимое.
3. Вставь в поле импорта на сайте.
4. Нажми `Импорт прогресса`.
