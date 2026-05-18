-- Capsule2007 V5 Production Logic
-- Supabase SQL schema

create extension if not exists pgcrypto;

create table if not exists public.capsules (
  id uuid primary key default gen_random_uuid(),

  cell_number integer not null check (cell_number between 1 and 20007),

  nickname text not null default 'Аноним',
  memory_year text not null default '2007',
  message text not null check (char_length(message) between 1 and 160),

  status text not null default 'pending_payment'
    check (status in (
      'pending_payment',
      'paid_pending_moderation',
      'published',
      'rejected',
      'expired',
      'hidden'
    )),

  amount_rub integer not null default 107,

  payment_id text,
  owner_code_hash text,
  owner_code_plain_demo text, -- MVP helper. Later replace with encrypted storage / email delivery.
  claim_token text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  paid_at timestamptz,
  published_at timestamptz
);

-- Одна реально активная ячейка на номер.
-- expired/rejected/hidden не блокируют номер.
create unique index if not exists capsules_active_cell_unique
on public.capsules(cell_number)
where status in ('pending_payment','paid_pending_moderation','published');

create index if not exists capsules_cell_number_idx on public.capsules(cell_number);
create index if not exists capsules_status_idx on public.capsules(status);
create index if not exists capsules_payment_id_idx on public.capsules(payment_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_capsules_updated_at on public.capsules;
create trigger trg_capsules_updated_at
before update on public.capsules
for each row execute function public.set_updated_at();

-- Рекомендуется НЕ включать публичный доступ к таблице напрямую.
-- Все операции идут через Netlify Functions с service-role key.
alter table public.capsules enable row level security;
