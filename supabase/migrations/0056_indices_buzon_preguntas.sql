-- Soporta la paginación estable de recibidas y enviadas sin recorrer todo el
-- historial de preguntas. No altera permisos, contenido ni estados de lectura.
create index profile_questions_sender_cursor_idx
  on public.profile_questions (asker_user_id, created_at desc, id desc);

create index profile_questions_recipient_cursor_idx
  on public.profile_questions (profile_id, created_at desc, id desc);

-- Se conserva el índice anterior: los índices aplicados no se eliminan en esta
-- fase. Evaluar su redundancia sólo después de verificar los planes reales.
