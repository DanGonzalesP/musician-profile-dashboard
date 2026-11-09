# Aplica UNA migración forward-only al Supabase de STAGING mediante la API de
# gestión (la CLI está bloqueada por Smart App Control en esta laptop).
# Nunca apunta a producción: el ref, nombre y organización están fijados y se
# comprueban antes de tocar nada. Exige que la versión sea exactamente la
# siguiente del historial remoto y la registra en schema_migrations.
# Uso: powershell -File scripts/aplicar-migracion-staging.ps1 -Version 0071
param([Parameter(Mandatory = $true)][ValidatePattern('^\d{4}$')][string]$Version)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$vibeRoot = Split-Path $PSScriptRoot -Parent
$vibeRef = 'iyppeurjtbuydhjtraxf'
$vibeApi = "https://api.supabase.com/v1/projects/$vibeRef"
$vibePrepared = & node (Join-Path $PSScriptRoot 'preparar-migracion-staging.mjs') $Version
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar una migración transaccional segura' }
$vibeQuery = $vibePrepared -join "`n"
$vibeTokenBytes = $null
try {
  $vibeTokenBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes((Join-Path $vibeRoot '.wrangler/supabase-empresa/access-token.dpapi')),
    $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $vibeHeaders = @{ Authorization = 'Bearer ' + [Text.Encoding]::UTF8.GetString($vibeTokenBytes).Trim() }
  $vibeProject = Invoke-RestMethod -Uri $vibeApi -Headers $vibeHeaders -TimeoutSec 30
  if ($vibeProject.id -ne $vibeRef -or $vibeProject.name -ne 'Vibe Music Staging' -or
      $vibeProject.organization_id -ne 'gojxsdxguggjmcbkwbhb') { throw 'Destino staging incorrecto' }
  function Invoke-VibeSql([string]$query) {
    $body = @{ query = $query } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri "$vibeApi/database/query" -Headers $vibeHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
  }
  $vibeLatest = (Invoke-VibeSql 'select max(version) as v from supabase_migrations.schema_migrations')[0].v
  $vibeExpected = '{0:D4}' -f ([int]$Version - 1)
  if ($vibeLatest -eq $Version) { Write-Output "Staging ya tiene $Version; no se repite."; exit 0 }
  if ($vibeLatest -ne $vibeExpected) { throw "Historial remoto en $vibeLatest; se esperaba $vibeExpected antes de $Version" }
  # Una sola petición y transacción: ningún fallo puede dejar DDL aplicado sin
  # historial. La guarda interna vuelve a comprobar la versión tras tomar el
  # bloqueo; dos ejecuciones concurrentes no aplican la misma migración.
  Invoke-VibeSql $vibeQuery | Out-Null
  $vibeAfter = (Invoke-VibeSql 'select max(version) as v, count(*) as n from supabase_migrations.schema_migrations')[0]
  Write-Output (@{ project = $vibeRef; applied = $Version; latest = $vibeAfter.v; migrations = $vibeAfter.n } | ConvertTo-Json -Compress)
} finally {
  if ($vibeTokenBytes) { [Array]::Clear($vibeTokenBytes, 0, $vibeTokenBytes.Length) }
  $vibeHeaders = $null
}
