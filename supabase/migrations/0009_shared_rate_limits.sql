-- Contador compartido para las rutas autenticadas que pueden consumir
-- almacenamiento o créditos. A diferencia de un Map en memoria, sobrevive a
-- instancias serverless paralelas y a reinicios.

create table if not exists public.rate_limit_windows (
  bucket text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (bucket, user_id)
);

alter table public.rate_limit_windows enable row level security;

create or replace function public.consume_authenticated_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (is_allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  now_at timestamptz := now();
  v_started_at timestamptz;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_bucket !~ '^[a-z0-9_-]{1,64}$' or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters';
  end if;

  -- Un único UPSERT atómico hace las tres cosas —crear la ventana, reiniciarla
  -- si venció, o sumar una petición— sin condiciones de carrera. La versión
  -- anterior hacía SELECT ... FOR UPDATE y luego INSERT en una rama aparte: dos
  -- primeras peticiones simultáneas del MISMO usuario entraban ambas al INSERT
  -- y una reventaba con unique_violation. FOR UPDATE no cubre filas que aún no
  -- existen; ON CONFLICT sí, y además cuenta ambas peticiones como corresponde.
  --
  -- Se cuenta también la petición que supera el límite (request_count + 1): es
  -- inofensivo —retry_after depende de started_at, no del conteo— y evita una
  -- rama extra. El techo real de crecimiento es la tasa de peticiones dentro de
  -- una sola ventana.
  insert into public.rate_limit_windows as w (bucket, user_id, started_at, request_count)
  values (p_bucket, v_uid, now_at, 1)
  on conflict (bucket, user_id) do update
    set started_at = case
          when w.started_at <= now_at - make_interval(secs => p_window_seconds) then now_at
          else w.started_at
        end,
        request_count = case
          when w.started_at <= now_at - make_interval(secs => p_window_seconds) then 1
          else w.request_count + 1
        end
  returning w.started_at, w.request_count into v_started_at, v_count;

  if v_count <= p_limit then
    return query select true, 0;
  else
    return query select false, greatest(1, ceil(extract(epoch from (v_started_at + make_interval(secs => p_window_seconds) - now_at)))::integer);
  end if;
end;
$$;

revoke all on function public.consume_authenticated_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_authenticated_rate_limit(text, integer, integer) to authenticated;
