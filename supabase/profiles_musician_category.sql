-- Categoría profesional del músico — alimenta el filtro del feed principal.
-- 5 categorías de una sola palabra (el detalle de cada una vive en la UI):
--   autores       → compositores musicales y letristas
--   productores   → directores de obra, beatmakers y topliners
--   directores    → arreglistas y directores de orquesta/banda
--   interpretes   → vocalistas, músicos de sesión y coristas
--   tecnicos      → ingenieros de grabación, mezcla y mastering
--
-- Nullable a propósito: los perfiles existentes no tienen categoría todavía
-- y el feed los muestra siempre (solo se ocultan al filtrar por una
-- categoría específica distinta a la suya).

alter table profiles add column if not exists musician_category text;

alter table profiles drop constraint if exists profiles_musician_category_check;
alter table profiles add constraint profiles_musician_category_check
  check (
    musician_category is null
    or musician_category in ('autores', 'productores', 'directores', 'interpretes', 'tecnicos')
  );
