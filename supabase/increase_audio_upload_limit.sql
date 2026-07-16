-- El error "The object exceeded the maximum allowed size" al subir un .wav
-- no viene del código de la app (components/profile-editor.tsx sube el
-- archivo directo del navegador a Supabase Storage vía supabase.storage
-- .upload(), sin pasar por ninguna API route de Next.js) — viene del
-- file_size_limit configurado en el bucket "assets" de Supabase Storage.
-- Por defecto Supabase deja ese límite bajo (a veces 50MB o menos según el
-- plan), insuficiente para un .wav sin comprimir.
--
-- Este script sube el límite del bucket a 100MB. Se debe correr en el SQL
-- Editor del dashboard de Supabase (Project > SQL Editor), con una sesión
-- que tenga privilegios sobre storage.buckets (el SQL Editor del dashboard
-- corre como postgres, así que alcanza).
--
-- Alternativa equivalente sin SQL: Dashboard > Storage > bucket "assets" >
-- Edit bucket > "File size limit" > 100 MB.
--
-- Nota: si el proyecto está en el plan Free de Supabase, también existe un
-- límite global de subida a nivel de proyecto (Project Settings > Storage >
-- "Upload file size limit") que puede necesitar subirse por separado si
-- sigue rechazando archivos grandes después de este cambio.

update storage.buckets
set file_size_limit = 104857600 -- 100 MB en bytes
where id = 'assets';
