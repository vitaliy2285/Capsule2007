-- Capsule2007 Supabase migration
-- Run in Supabase SQL Editor after backup and duplicate checks.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_capsules_cell_number ON public.capsules (cell_number);
CREATE INDEX IF NOT EXISTS idx_capsules_status ON public.capsules (status);
CREATE INDEX IF NOT EXISTS idx_capsules_payment_id ON public.capsules (payment_id);
CREATE INDEX IF NOT EXISTS idx_capsules_claim_token ON public.capsules (claim_token);
CREATE INDEX IF NOT EXISTS idx_capsules_status_paid_at ON public.capsules (status, paid_at);
CREATE INDEX IF NOT EXISTS idx_capsules_expires_at ON public.capsules (expires_at);

-- One final database-level lock for all statuses that must block a cell.
CREATE UNIQUE INDEX IF NOT EXISTS capsule_cell_locked_unique
ON public.capsules (cell_number)
WHERE status IN (
  'pending_payment',
  'paid_pending_moderation',
  'published',
  'hidden',
  'paid_expired_manual_review'
);

-- Optional hard protection: a YooKassa payment_id must not be attached twice.
CREATE UNIQUE INDEX IF NOT EXISTS capsule_payment_id_unique
ON public.capsules (payment_id)
WHERE payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reserve_capsule(
  in_cell_number integer,
  in_nickname text,
  in_year text,
  in_message text,
  OUT reservation_id integer,
  OUT owner_code text,
  OUT claim_token text
)
RETURNS record
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_code text;
  v_owner_hash text;
  v_claim_token text;
BEGIN
  IF in_cell_number IS NULL OR in_cell_number < 1 OR in_cell_number > 20007 THEN
    RAISE EXCEPTION 'Invalid cell number';
  END IF;

  UPDATE public.capsules
  SET status = 'expired'
  WHERE status = 'pending_payment'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  IF EXISTS (
    SELECT 1
    FROM public.capsules
    WHERE cell_number = in_cell_number
      AND status IN (
        'pending_payment',
        'paid_pending_moderation',
        'published',
        'hidden',
        'paid_expired_manual_review'
      )
  ) THEN
    RAISE EXCEPTION 'Cell % is already reserved or taken', in_cell_number;
  END IF;

  v_owner_code := upper(encode(gen_random_bytes(3), 'hex')) || '-' || upper(encode(gen_random_bytes(3), 'hex'));
  v_owner_hash := encode(digest(upper(trim(v_owner_code)), 'sha256'), 'hex');
  v_claim_token := encode(gen_random_bytes(18), 'hex');

  INSERT INTO public.capsules (
    cell_number,
    nickname,
    memory_year,
    message,
    status,
    amount_rub,
    owner_code_hash,
    claim_token,
    expires_at
  )
  VALUES (
    in_cell_number,
    coalesce(nullif(trim(in_nickname), ''), 'Аноним'),
    coalesce(nullif(trim(in_year), ''), '2007'),
    in_message,
    'pending_payment',
    107,
    v_owner_hash,
    v_claim_token,
    now() + interval '15 minutes'
  )
  RETURNING id INTO reservation_id;

  owner_code := v_owner_code;
  claim_token := v_claim_token;
END;
$$;

COMMIT;
