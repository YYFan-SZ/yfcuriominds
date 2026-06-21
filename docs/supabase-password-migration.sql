alter table public.users
  add column if not exists password_hash text;

create index if not exists users_nickname_idx on public.users(nickname);

notify pgrst, 'reload schema';
