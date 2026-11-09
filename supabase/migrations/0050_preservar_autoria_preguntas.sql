-- Preparada SIN APLICAR. No modifica0004 ni reescribe preguntas históricas.
-- La lectura sólo cambia status, nunca la autoría ni el mensaje recibido.
begin;
create or replace function public.set_question_asker_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    if row(new.id,new.profile_id,new.asker_user_id,new.block_type,new.block_label,new.message,new.created_at)
       is distinct from
       row(old.id,old.profile_id,old.asker_user_id,old.block_type,old.block_label,old.message,old.created_at) then
      raise exception 'No se puede cambiar el contenido de una pregunta enviada' using errcode='42501';
    end if;
    new.asker_display_name := old.asker_display_name;
  else
    new.asker_display_name := (
      select p.display_name from public.profiles p
      where p.user_id=auth.uid() and p.profile_type='artist'
      limit 1
    );
  end if;
  return new;
end;
$$;
revoke execute on function public.set_question_asker_name() from public,anon,authenticated;
commit;
