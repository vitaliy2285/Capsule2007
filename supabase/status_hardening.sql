-- Capsule2007 Supabase hardening
-- Run manually in Supabase SQL Editor after reading the comments.
-- Goal: make the database agree with the API/frontend status model.
-- Occupied statuses: pending_payment, paid_pending_moderation, published, hidden.
-- Free statuses: expired, rejected, cancelled.

-- 1) Audit duplicate active cells BEFORE creating the unique index.
-- This query must return zero rows. If it returns rows, resolve duplicates manually first.
select
  cell_number,
  count(*) as active_rows,
  array_agg(id order by created_at desc) as capsule_ids,
  array_agg(status order by created_at desc) as statuses
from public.capsules
where status in ('pending_payment', 'paid_pending_moderation', 'published', 'hidden')
group by cell_number
having count(*) > 1
order by cell_number;

-- 2) Expire old pending payments before the index is created.
-- This avoids stale pending_payment rows blocking a cell forever.
update public.capsules
set status = 'expired', updated_at = now()
where status = 'pending_payment'
  and expires_at is not null
  and expires_at < now();

-- 3) Optional audit after expiration. This must also return zero rows.
select
  cell_number,
  count(*) as active_rows,
  array_agg(id order by created_at desc) as capsule_ids,
  array_agg(status order by created_at desc) as statuses
from public.capsules
where status in ('pending_payment', 'paid_pending_moderation', 'published', 'hidden')
group by cell_number
having count(*) > 1
order by cell_number;

-- 4) Drop the old active-cell index if it exists.
-- IMPORTANT: use the real old index name if it differs in your database.
-- You can inspect indexes with:
-- select indexname, indexdef from pg_indexes where schemaname='public' and tablename='capsules';
drop index if exists public.capsules_active_cell_unique;
drop index if exists public.capsules_cell_number_active_unique;
drop index if exists public.idx_capsules_active_cell_unique;

-- 5) Create the production-safe unique index.
-- It does NOT use now() in the predicate.
-- Pending payment rows must be moved to expired by application code / scheduled cleanup.
create unique index if not exists capsules_cell_number_active_status_unique
on public.capsules (cell_number)
where status in ('pending_payment', 'paid_pending_moderation', 'published', 'hidden');

-- 6) Helpful indexes for API routes and admin moderation.
create index if not exists capsules_status_cell_number_idx
on public.capsules (status, cell_number);

create index if not exists capsules_paid_moderation_idx
on public.capsules (paid_at, id)
where status = 'paid_pending_moderation';

create index if not exists capsules_owner_lookup_idx
on public.capsules (cell_number, owner_code_hash);

-- 7) Final status model reference.
-- pending_payment: temporary reservation before payment; occupies the cell until expired.
-- paid_pending_moderation: paid, waiting for moderation; occupies the cell, no public text.
-- published: public capsule; occupies the cell, public text visible.
-- hidden: paid/preserved but text hidden; occupies the cell, no public text.
-- rejected: moderation rejected; does not occupy the cell.
-- expired: old unpaid reservation; does not occupy the cell.
-- cancelled: cancelled flow; does not occupy the cell.
