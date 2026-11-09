# Provisiona sólo las claves HMAC del staging conocido, nunca las de producción.
# No imprime secretos ni despliega un Worker. Reejecutar conserva las claves.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$vibeRoot = Split-Path $PSScriptRoot -Parent
$vibeCredentialDir = Join-Path $vibeRoot '.wrangler/supabase-empresa'
$vibeKeyPath = Join-Path $vibeCredentialDir 'staging-hmac.dpapi'
$vibeRef = 'iyppeurjtbuydhjtraxf'
$vibeApi = "https://api.supabase.com/v1/projects/$vibeRef"
$vibeTokenBytes = $null
$vibeKeyBytes = $null
$vibeHeaders = $null
$vibeKeys = $null
try {
  $vibeTokenBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes((Join-Path $vibeCredentialDir 'access-token.dpapi')),
    $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $vibeHeaders = @{ Authorization = 'Bearer ' + [Text.Encoding]::UTF8.GetString($vibeTokenBytes).Trim() }
  $vibeProject = Invoke-RestMethod -Uri $vibeApi -Headers $vibeHeaders -TimeoutSec 30
  if ($vibeProject.id -ne $vibeRef -or $vibeProject.name -ne 'Vibe Music Staging' -or
      $vibeProject.organization_id -ne 'gojxsdxguggjmcbkwbhb') {
    throw 'Destino staging incorrecto'
  }
  if (Test-Path -LiteralPath $vibeKeyPath) {
    $vibeKeyBytes = [Security.Cryptography.ProtectedData]::Unprotect(
      [IO.File]::ReadAllBytes($vibeKeyPath), $null,
      [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $vibeKeys = [Text.Encoding]::UTF8.GetString($vibeKeyBytes) | ConvertFrom-Json
  } else {
    $vibeRandom = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Fill($vibeRandom)
    $vibeMedia = [Convert]::ToHexString($vibeRandom).ToLowerInvariant()
    [Security.Cryptography.RandomNumberGenerator]::Fill($vibeRandom)
    $vibeAnonymous = [Convert]::ToHexString($vibeRandom).ToLowerInvariant()
    [Array]::Clear($vibeRandom, 0, $vibeRandom.Length)
    $vibeKeys = [pscustomobject]@{
      project = $vibeRef
      MEDIA_RECEIPT_KEY = $vibeMedia
      MEDIA_RECEIPT_KEY_ID = 'staging_media_' + [guid]::NewGuid().ToString('N')
      ANONYMOUS_RATE_LIMIT_KEY = $vibeAnonymous
      ANONYMOUS_RATE_LIMIT_KEY_ID = 'staging_anon_' + [guid]::NewGuid().ToString('N')
    }
    $vibeKeyBytes = [Text.Encoding]::UTF8.GetBytes(($vibeKeys | ConvertTo-Json -Compress))
    $vibeEncrypted = [Security.Cryptography.ProtectedData]::Protect($vibeKeyBytes,
      $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    # CreateNew evita sobrescribir una clave guardada por otra ejecución.
    $vibeFile = [IO.File]::Open($vibeKeyPath, [IO.FileMode]::CreateNew)
    try { $vibeFile.Write($vibeEncrypted, 0, $vibeEncrypted.Length) } finally { $vibeFile.Dispose() }
  }
  if ($vibeKeys.project -ne $vibeRef -or
      $vibeKeys.MEDIA_RECEIPT_KEY -cnotmatch '^[0-9a-f]{64}$' -or
      $vibeKeys.ANONYMOUS_RATE_LIMIT_KEY -cnotmatch '^[0-9a-f]{64}$' -or
      $vibeKeys.MEDIA_RECEIPT_KEY -eq $vibeKeys.ANONYMOUS_RATE_LIMIT_KEY -or
      $vibeKeys.MEDIA_RECEIPT_KEY_ID -cnotmatch '^staging_media_[0-9a-f]{32}$' -or
      $vibeKeys.ANONYMOUS_RATE_LIMIT_KEY_ID -cnotmatch '^staging_anon_[0-9a-f]{32}$') {
    throw 'Material staging inválido'
  }
  # Los valores interpolados están restringidos a hex/identificadores anteriores.
  # Una clave existente distinta aborta la transacción; nunca se rota por accidente.
  $vibeSql = @"
begin;
insert into private.media_runtime_keys(key_id, secret_hex)
values ('$($vibeKeys.MEDIA_RECEIPT_KEY_ID)', '$($vibeKeys.MEDIA_RECEIPT_KEY)') on conflict do nothing;
insert into private.anonymous_gateway_keys(key_id, secret_hex)
values ('$($vibeKeys.ANONYMOUS_RATE_LIMIT_KEY_ID)', '$($vibeKeys.ANONYMOUS_RATE_LIMIT_KEY)') on conflict do nothing;
do `$guard`$ begin
  if not exists (select 1 from private.media_runtime_keys where key_id='$($vibeKeys.MEDIA_RECEIPT_KEY_ID)' and secret_hex='$($vibeKeys.MEDIA_RECEIPT_KEY)')
    or not exists (select 1 from private.anonymous_gateway_keys where key_id='$($vibeKeys.ANONYMOUS_RATE_LIMIT_KEY_ID)' and secret_hex='$($vibeKeys.ANONYMOUS_RATE_LIMIT_KEY)') then
    raise exception 'Claves staging incompatibles';
  end if;
end `$guard`$;
commit;
"@
  $null = Invoke-RestMethod -Uri "$vibeApi/database/query" -Method Post -Headers $vibeHeaders -ContentType 'application/json' -Body (@{ query = $vibeSql } | ConvertTo-Json -Compress) -TimeoutSec 45
  Write-Output 'Claves independientes registradas en staging; material local cifrado. Worker pendiente.'
} catch {
  # El cuerpo de error remoto puede contener SQL y secretos: no imprimirlo.
  Write-Output ('Preparación detenida; tipo ' + $_.Exception.GetType().Name + '. Revisar el estado antes de reintentar.')
  exit 1
} finally {
  if ($vibeTokenBytes) { [Array]::Clear($vibeTokenBytes, 0, $vibeTokenBytes.Length) }
  if ($vibeKeyBytes) { [Array]::Clear($vibeKeyBytes, 0, $vibeKeyBytes.Length) }
  $vibeHeaders = $null; $vibeKeys = $null; $vibeSql = $null
  $vibeMedia = $null; $vibeAnonymous = $null
}
