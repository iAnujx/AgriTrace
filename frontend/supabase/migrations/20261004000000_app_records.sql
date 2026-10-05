-- AgriTrace off-chain extras (photos, bids, crop needs, warehouse/quality notes).
-- Money and stock ownership stay on the blockchain; this table only holds convenience data.
-- Run once in the Supabase SQL editor (or let Lovable apply it). Safe to run again.
create table if not exists public.app_records (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('listing','bid','need','stock','profile')),
  owner text not null default '',
  ref text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_records_size check (pg_column_size(data) < 600000)
);
create index if not exists app_records_kind_idx on public.app_records (kind, owner, ref);
alter table public.app_records enable row level security;
grant select, insert, update, delete on public.app_records to anon, authenticated;
grant all on public.app_records to service_role;

-- Login is wallet-based (no Supabase account), so rows cannot be tied to a signed-in user here.
-- Everyone may read; writes are allowed but size-limited. Treat these rows as untrusted hints,
-- never as proof of ownership: ownership and payments are verified on the blockchain.
drop policy if exists "app_records read" on public.app_records;
create policy "app_records read" on public.app_records for select to anon, authenticated using (true);
drop policy if exists "app_records insert" on public.app_records;
create policy "app_records insert" on public.app_records for insert to anon, authenticated with check (true);
drop policy if exists "app_records update" on public.app_records;
create policy "app_records update" on public.app_records for update to anon, authenticated using (true) with check (true);
drop policy if exists "app_records delete" on public.app_records;
create policy "app_records delete" on public.app_records for delete to anon, authenticated using (true);

-- Upgrading from an earlier copy of this file? Run this once to allow wallet role records:
alter table public.app_records drop constraint if exists app_records_kind_check;
alter table public.app_records add constraint app_records_kind_check check (kind in ('listing','bid','need','stock','profile'));
