-- Corte de clientes heredados. Aplicar junto a las rutas de reserva/retirada
-- verificadas, después de respaldar y reconciliar el inventario remoto.
-- No altera ni elimina filas históricas: siguen contando para la cuota.
begin;

-- Los RPC SECURITY DEFINER mantienen su validación de JWT/recibo y sus bloqueos
-- de cuenta. El cliente sólo consulta sus filas bajo RLS; no crea, modifica,
-- borra ni trunca inventario por PostgREST, incluso con una key propia válida.
revoke all on table public.media_assets from public, anon, authenticated;
grant select on table public.media_assets to authenticated;

-- Segunda barrera: un grant accidental posterior no reabre las escrituras.
-- Se conserva la política restrictiva de namespace y la lectura por propietario.
drop policy media_assets_insert_own on public.media_assets;
drop policy media_assets_delete_own on public.media_assets;

notify pgrst, 'reload schema';
commit;
