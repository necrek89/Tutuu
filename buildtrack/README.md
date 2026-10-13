# BuildTrack — MVP

Сервис отслеживания строительства и ремонта.
Три роли: Прораб · Рабочий · Заказчик.

## Быстрый старт

```bash
npm install
npm run dev
```

Откроется http://localhost:5173 — приложение работает на локальных данных.

## Структура проекта

```
src/
  store/
    useStore.js      # Zustand store — весь стейт, CRUD операции
  components/
    UI.jsx           # Переиспользуемые компоненты (Button, Badge, StatCard...)
    TaskList.jsx     # Список задач с edit/delete
    TaskModal.jsx    # Модалка добавления/редактирования задачи
    ConfirmModal.jsx # Подтверждение удаления
  pages/
    index.jsx        # Все страницы: Dashboard, Tasks, Tools, Team...
  lib/
    supabase.js      # Клиент Supabase (пока заглушка)
  App.jsx            # Роутинг, topbar, sidebar
  main.jsx           # Entry point
  index.css          # Все стили
```

## Подключение Supabase

1. Создай проект на https://supabase.com
2. Скопируй `.env.example` → `.env`
3. Вставь `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`
4. Создай таблицы в Supabase SQL Editor:

```sql
create table tasks (
  id          bigint primary key generated always as identity,
  text        text not null,
  done        boolean default false,
  who         text,
  stage       text,
  priority    text default 'normal',
  project_id  bigint,
  created_at  timestamptz default now()
);

create table tools (
  id      bigint primary key generated always as identity,
  name    text not null,
  loc     text,
  status  text default 'active'
);

create table projects (
  id       bigint primary key generated always as identity,
  name     text not null,
  progress int default 0,
  stage    text,
  client   text
);
```

5. Замени локальные данные в `useStore.js` на вызовы Supabase:

```js
// Пример: загрузка задач
const { data } = await supabase.from('tasks').select('*')
```

## Деплой на Vercel

```bash
npm install -g vercel
vercel
```

Добавь переменные окружения в настройках проекта на vercel.com.

## Публичный сайт и SEO (предварительная сборка)

Лендинг и публичные страницы собираются в обычный HTML на этапе сборки, чтобы их
видели поисковики, ИИ-боты и превью ссылок (раньше отдавался пустой `<div id="root">`).

`npm run build` делает три шага: `vite build` (клиент) → `vite build --ssr src/entry-server.jsx`
(серверный бандл в `dist-ssr`) → `node scripts/prerender.mjs`. Результат в `dist/`:

| URL | Файл | Что это |
|---|---|---|
| `/` | `index.html` | лендинг на английском |
| `/en`, `/ru`, `/es`, … (9 языков) | `<код>/index.html` | лендинг на языке, свои `title`, `description`, `og:*`, `hreflang`, `canonical` |
| `/pricing`, `/install`, `/terms`, `/privacy`, `/refund` | `<имя>/index.html` | публичные страницы (английский) |
| `/app` и всё остальное | `app/index.html` | оболочка одностраничного приложения, `noindex` |
| `/sitemap.xml` | `sitemap.xml` | создаётся автоматически (все языки + hreflang) |

- Тексты для тегов: `src/seo/siteMeta.js`. Тексты лендинга: `translations.js` (`landing`).
- Лендинг и публичные страницы не должны импортировать `useStore`/Supabase на уровне модуля
  и обращаться к `window`/`localStorage` во время рендера (иначе упадёт предварительная сборка).
- `scripts/check-seo.mjs` проверяет результат и входит в `npm run build` (запуск отдельно: `npm run check:seo`).
- `npm run build:spa` — прежняя обычная сборка (только приложение), если понадобится.
- Маршрутизация на Vercel: `vercel.json` (`/app*` и неизвестные адреса → оболочка приложения).
- Возврат после входа Google и письма сброса пароля приходит на `/`: `main.jsx` перенаправляет
  такие переходы (по токену в адресе) на `/app`, сохраняя адрес.
- Paddle подгружается только на странице аккаунта (`loadPaddle` в `src/lib/paddle.js`).
