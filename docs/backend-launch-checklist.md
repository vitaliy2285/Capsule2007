# Capsule2007 backend launch checklist

## 1. Supabase before code rollout

Run a backup first. Then check duplicates:

```sql
SELECT cell_number, COUNT(*)
FROM public.capsules
WHERE status IN ('pending_payment','paid_pending_moderation','published','hidden','paid_expired_manual_review')
GROUP BY cell_number
HAVING COUNT(*) > 1;
```

If this query returns rows, stop and clean the data manually before running the migration.

Apply `migration_supabase.sql` in Supabase SQL Editor only after the duplicate check is clean.

## 2. VPS rollout

```bash
cd /var/www/capsule2007
git fetch origin
git checkout feature/capsule2007-backend-api
cp .env.example .env
nano .env
npm install
pm2 start ecosystem.config.js
pm2 save
curl http://127.0.0.1:3000/api/health
```

## 3. Nginx API proxy

Add this inside the existing `server { ... }` block, keeping the current static root unchanged:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

Then run:

```bash
nginx -t
systemctl reload nginx
curl https://www.capsule2007.ru/api/health
curl https://www.capsule2007.ru/api/list-cells
```

## 4. Cleanup expired reservations

Call the protected endpoint every 10 minutes after `ADMIN_TOKEN` is set:

```bash
*/10 * * * * curl -s -X POST -H "x-admin-token: YOUR_ADMIN_TOKEN" http://127.0.0.1:3000/api/cleanup-expired > /dev/null
```

Do not commit the real token.

## 5. Do not enable real payments until

- `/api/health` works locally and publicly.
- `/api/list-cells` returns sane counters.
- Supabase migration is applied.
- Test YooKassa flow is checked.
- Admin moderation endpoint requires `x-admin-token`.
- Visual frontend, Winamp, QIP, grid, sounds and HTTPS are still working.
