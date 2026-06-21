create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  credits integer not null check (credits > 0),
  role text not null default 'teacher' check (role in ('teacher', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  used_by uuid,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  invite_code_id uuid references public.invite_codes(id),
  invite_code text,
  role text not null default 'teacher' check (role in ('teacher', 'admin')),
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now()
);

alter table public.invite_codes
  drop constraint if exists invite_codes_used_by_fkey;

alter table public.invite_codes
  add constraint invite_codes_used_by_fkey foreign key (used_by) references public.users(id);

create table if not exists public.credit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount integer not null,
  type text not null check (type in ('redeem', 'spend', 'adjust')),
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  student_id text not null,
  content text not null,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists credit_logs_user_id_created_at_idx on public.credit_logs(user_id, created_at desc);
create index if not exists comments_user_id_created_at_idx on public.comments(user_id, created_at desc);

insert into public.invite_codes (code, credits, role)
values
  ('TEACHER100', 100, 'teacher'),
  ('CLASS300', 300, 'teacher'),
  ('ADMIN999', 999, 'admin')
on conflict (code) do nothing;
