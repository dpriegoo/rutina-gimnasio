-- Límite diario de llamadas del entrenador IA (supabase/coach.sql)
-- Ejecútalo UNA vez en Supabase > SQL Editor. Cada llamada a Gemini (incluidas las vueltas de herramientas de una
-- misma pregunta) cuenta 1. La tabla no es legible desde la app: solo se toca a través de la función coach_use.

create table if not exists public.coach_usage (
  user_id uuid not null,
  day     date not null,
  calls   int  not null default 0,
  primary key (user_id, day)
);
alter table public.coach_usage enable row level security;   -- sin políticas: nadie puede leerla ni escribirla directamente

create or replace function public.coach_use(max_calls int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c int;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  insert into public.coach_usage (user_id, day, calls)
  values (auth.uid(), (now() at time zone 'Europe/Madrid')::date, 1)
  on conflict (user_id, day) do update set calls = public.coach_usage.calls + 1
  returning calls into c;
  if c > max_calls then return -1; end if;
  return max_calls - c;       -- llamadas que quedan hoy
end;
$$;

revoke all on function public.coach_use(int) from public, anon;
grant execute on function public.coach_use(int) to authenticated;
