# Capsule2007 admin API (Vercel)

## Admin moderation endpoint
- `GET /api/admin-moderate` — list `paid_pending_moderation` capsules.
- `POST /api/admin-moderate` with `{"id":"<capsule_uuid>","action":"publish|reject|hide"}`.
- Header for both: `x-admin-token: $ADMIN_TOKEN`.

### cURL examples
```bash
curl -sS 'https://capsule2007.vercel.app/api/admin-moderate' \
  -H 'x-admin-token: YOUR_ADMIN_TOKEN'

curl -sS 'https://capsule2007.vercel.app/api/admin-moderate' \
  -H 'Content-Type: application/json' \
  -H 'x-admin-token: YOUR_ADMIN_TOKEN' \
  --data '{"id":"CAPSULE_UUID","action":"publish"}'
```

## Foundation capsules

Capsule2007 includes official foundation capsules as starter archive fragments for atmosphere.
They are **not** fake paid users and do not represent real purchases.
