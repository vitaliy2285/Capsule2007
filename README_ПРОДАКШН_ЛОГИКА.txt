# Capsule2007 — СИЛЬНО V5 Production Logic

Эта сборка НЕ меняет атмосферу “СИЛЬНО”.  
Она добавляет правильную production-логику вокруг оплаты, владения ячейкой и backend.

## Главная исправленная логика

До оплаты ячейка НЕ становится занятой.

Правильная цепочка:

1. Пользователь выбирает свободную ячейку.
2. Вводит ник, год и сообщение до 160 символов.
3. Жмёт “Оплатить 107 ₽”.
4. Netlify Function создаёт запись `pending_payment` в Supabase.
5. Пользователь уходит на платёж.
6. Только webhook успешной оплаты переводит запись в `paid_pending_moderation`.
7. После модерации админ переводит запись в `published`.
8. Только `paid_pending_moderation` и `published` отображаются как занятые публично.

## Структура

```text
index.html
css/style.css
js/app.js
js/production-api.js
assets/
netlify/functions/
supabase/schema.sql
netlify.toml
.env.example
```

## Что заливать на Netlify

Распакуй ZIP и перетащи папку `Capsule2007_SILNO_V5_PRODUCTION_LOGIC` целиком в Netlify Deploy.

## Что нужно настроить для настоящей базы

1. Создай проект Supabase.
2. Открой SQL Editor.
3. Выполни `supabase/schema.sql`.
4. В Netlify → Site configuration → Environment variables добавь:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SITE_URL
ADMIN_TOKEN
```

## Что нужно настроить для реальной оплаты

Добавь в Netlify Environment Variables:

```text
YOOKASSA_SHOP_ID
YOOKASSA_SECRET_KEY
```

Webhook URL в платёжке:

```text
https://YOUR_SITE.netlify.app/.netlify/functions/yookassa-webhook
```

Пока эти ключи не заполнены, сайт работает в безопасном demo-mode:
- заявка создаётся;
- payment_url не выдаётся;
- ячейка НЕ считается занятой;
- архив не загрязняется неоплаченными капсулами.

## Статусы

```text
pending_payment             создана заявка, оплаты ещё нет
paid_pending_moderation     оплачено, ждёт модерации
published                   опубликовано
rejected                    отклонено
expired                     неоплаченная заявка истекла
hidden                      скрыто администрацией
```

## Важное

Фронтенд больше не решает, оплачено или нет.  
Оплата подтверждается только webhook-ом на сервере.

Это главный P0-фикс перед реальным запуском.
