-- Profiles (1:1 with auth.users) and role-check helper functions.
-- 4 roles: admin, gestao, financeiro, campo (see plan for access matrix).

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'campo' check (role in ('admin','gestao','financeiro','campo')),
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
-- Defaults to the lowest-privilege role ('campo'); promotion to admin/gestao/financeiro
-- is a deliberate follow-up action (see scripts/create-admin.ts for the first admin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'campo');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- security definer so RLS on `profiles` itself doesn't cause recursion when
-- other tables' policies call this function.
create or replace function public.fn_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;
