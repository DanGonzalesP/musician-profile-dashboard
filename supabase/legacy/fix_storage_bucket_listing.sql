-- El bucket "assets" es público: las URLs que genera getPublicUrl() sirven
-- los archivos vía /storage/v1/object/public/... que NO pasa por RLS (por
-- eso las imágenes/audio ya funcionan). La política de SELECT sobre
-- storage.objects ("Public access 1bqp9qb_0") es entonces redundante para
-- ese uso, pero además permite LISTAR todos los archivos del bucket (nombre
-- de cada imagen/audio subido de cualquier artista) vía la API de Storage.
--
-- El código de la app solo usa .upload() y getPublicUrl() (revisado en
-- components/profile-editor.tsx) — nunca .list() — así que quitar esta
-- política no rompe nada, solo cierra la posibilidad de enumerar archivos.

drop policy if exists "Public access 1bqp9qb_0" on storage.objects;
