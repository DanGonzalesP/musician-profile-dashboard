begin;

-- Filtrar antes de limitar evita descargar todos los bloques al navegador.
create function public.buscar_canciones_publicadas(
  p_consulta text, p_excluir_perfil uuid default null
)
returns table (song_key text, title text, album_title text,
  owner_profile_id uuid, owner_display_name text)
language sql stable security invoker set search_path = public
as $$
  select b.id::text || ':' || coalesce(a.album->>'id', 'album') || ':' || (t.pos - 1)::text,
    btrim(t.track->>'title'), coalesce(a.album->>'title', ''),
    p.id, coalesce(nullif(p.display_name, ''), 'Artista desconocido')
  from public.profile_blocks b
  join public.profiles p on p.id = b.profile_id
  cross join lateral jsonb_array_elements(case
    when jsonb_typeof(b.content->'albums') = 'array' then b.content->'albums'
    else '[]'::jsonb end) with ordinality as a(album, pos)
  cross join lateral jsonb_array_elements(case
    when jsonb_typeof(a.album->'tracks') = 'array' then a.album->'tracks'
    else '[]'::jsonb end) with ordinality as t(track, pos)
  where b.block_type = 'tracks' and b.is_visible is true
    and p.is_suspended is false
    and (p_excluir_perfil is null or p.id <> p_excluir_perfil)
    and char_length(btrim(p_consulta)) between 2 and 200
    and jsonb_typeof(t.track->'title') = 'string'
    and strpos(lower(btrim(t.track->>'title')), lower(btrim(p_consulta))) > 0
  order by lower(btrim(t.track->>'title')), b.id, a.pos, t.pos
  limit 20;
$$;

revoke all on function public.buscar_canciones_publicadas(text, uuid) from public;
grant execute on function public.buscar_canciones_publicadas(text, uuid) to anon, authenticated;
comment on function public.buscar_canciones_publicadas(text, uuid) is
  'Búsqueda literal por título publicado, RLS invoker, excluye suspendidos, máximo20 coincidencias ordenadas. Conserva songKey bloque:álbum:índice.';
notify pgrst, 'reload schema';
commit;
