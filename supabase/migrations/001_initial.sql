-- GL Family Financi | initial secure schema
-- Execute in a NEW Supabase project, never in sistema-alter.
create extension if not exists pgcrypto;

create table public.financial_accounts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 120),
 kind text not null default 'checking' check (kind in ('checking','savings','cash','investment')),
 opening_balance numeric(14,2) not null default 0,
 created_at timestamptz not null default now()
);
create table public.categories (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 80),
 kind text not null check (kind in ('income','expense')),
 created_at timestamptz not null default now(),
 unique(owner_id,name,kind)
);
create table public.transactions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 account_id uuid not null references public.financial_accounts(id) on delete restrict,
 category_id uuid references public.categories(id) on delete set null,
 description text not null check (char_length(description) between 1 and 250),
 amount numeric(14,2) not null check (amount > 0),
 kind text not null check (kind in ('income','expense')),
 status text not null default 'planned' check (status in ('planned','paid','canceled')),
 due_date date not null,
 paid_at timestamptz,
 created_at timestamptz not null default now(),
 constraint paid_status_consistent check (status <> 'paid' or paid_at is not null)
);
create table public.recurring_rules (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 account_id uuid not null references public.financial_accounts(id) on delete restrict,
 description text not null,
 amount numeric(14,2) not null check (amount > 0),
 kind text not null check (kind in ('income','expense')),
 due_day integer not null check (due_day between 1 and 31),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
-- Enforce references cannot target another user's rows, even when UUIDs are known.
create or replace function public.assert_own_financial_refs()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from public.financial_accounts a where a.id=new.account_id and a.owner_id=new.owner_id) then
  raise exception 'Account does not belong to user';
 end if;
 if tg_table_name='transactions' and new.category_id is not null and
  not exists(select 1 from public.categories c where c.id=new.category_id and c.owner_id=new.owner_id and c.kind=new.kind) then
  raise exception 'Category does not belong to user or has wrong kind';
 end if;
 return new;
end $$;
create trigger transactions_own_refs before insert or update on public.transactions
for each row execute function public.assert_own_financial_refs();
create trigger recurring_own_refs before insert or update on public.recurring_rules
for each row execute function public.assert_own_financial_refs();

do $$ declare tab text; begin
 foreach tab in array array['financial_accounts','categories','transactions','recurring_rules'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('create policy own_select on public.%I for select to authenticated using (owner_id = (select auth.uid()))',tab);
  execute format('create policy own_insert on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))',tab);
  execute format('create policy own_update on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',tab);
  execute format('create policy own_delete on public.%I for delete to authenticated using (owner_id = (select auth.uid()))',tab);
 end loop;
end $$;
-- No anonymous access or public shares. Household sharing should be added explicitly later.
