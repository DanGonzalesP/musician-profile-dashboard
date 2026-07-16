-- OBSOLETO: la app ya no sube imágenes ni audio a Supabase Storage — se
-- migró a Cloudflare R2 (ver lib/r2.ts, app/api/upload-url/route.ts) porque
-- el plan Free de Supabase fija un límite global de 50MB no configurable,
-- sin importar el file_size_limit del bucket. Este script queda como
-- referencia histórica del bucket "assets", que ahora solo se usa para
-- archivos subidos antes de la migración (ver supabase/migrate_to_r2.md).
--
-- El error "The object exceeded the maximum allowed size" al subir un .wav
-- no venía del código de la app (components/profile-editor.tsx subía el
-- archivo directo del navegador a Supabase Storage vía supabase.storage
-- .upload(), sin pasar por ninguna API route de Next.js) — venía del
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
