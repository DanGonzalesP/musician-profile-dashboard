# Instala material YA provisionado; no crea ni rota credenciales.
# Fija cuenta/Worker y exige que exista antes de descifrar los almacenes.
# JSON por stdin a Wrangler, sin archivo plano ni valores en la salida.
# Uso: powershell -File scripts/instalar-secretos-staging.ps1
#      powershell -File scripts/instalar-secretos-staging.ps1 -SoloVerificar
param([switch]$SoloVerificar)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$vibeRoot = Split-Path $PSScriptRoot -Parent
$vibeConfigPath = Join-Path $vibeRoot 'wrangler.staging.jsonc'
$vibeWrangler = Join-Path $vibeRoot 'node_modules/wrangler/bin/wrangler.js'
$vibeStep = 'destino'
$vibeR2Bytes = $null; $vibeHmacBytes = $null; $vibePayload = $null

function Invoke-VibeWrangler([string]$command, [string]$inputJson = $null) {
  $vibeInfo = New-Object Diagnostics.ProcessStartInfo
  $vibeInfo.FileName = (Get-Command node -ErrorAction Stop).Source
  $vibeInfo.Arguments = '"' + $vibeWrangler + '" secret ' + $command + ' --name vibe-staging --config "' + $vibeConfigPath + '" --profile vibe'
  $vibeInfo.WorkingDirectory = $vibeRoot
  $vibeInfo.UseShellExecute = $false
  $vibeInfo.CreateNoWindow = $true
  $vibeInfo.RedirectStandardInput = $true
  $vibeInfo.RedirectStandardOutput = $true
  $vibeInfo.RedirectStandardError = $true
  # Windows PowerShell 5 no tiene StandardInputEncoding. El JSON de secretos
  # contiene solo ASCII (valores/identificadores restringidos abajo).
  $vibeInfo.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
  $vibeInfo.EnvironmentVariables['WRANGLER_SEND_METRICS'] = 'false'
  $vibeInfo.EnvironmentVariables['WRANGLER_LOG_SANITIZE'] = 'true'
  $vibeInfo.EnvironmentVariables['CI'] = 'true'
  $vibeProcess = New-Object Diagnostics.Process
  $vibeProcess.StartInfo = $vibeInfo
  try {
    $null = $vibeProcess.Start()
    $vibeOut = $vibeProcess.StandardOutput.ReadToEndAsync()
    $vibeErr = $vibeProcess.StandardError.ReadToEndAsync()
    if ($inputJson) {$vibeProcess.StandardInput.Write($inputJson)}
    $vibeProcess.StandardInput.Close()
    if (-not $vibeProcess.WaitForExit(120000)) {$vibeProcess.Kill(); throw 'Wrangler excedio el tiempo maximo'}
    $vibeText = $vibeOut.GetAwaiter().GetResult()
    $null = $vibeErr.GetAwaiter().GetResult()
    if ($vibeProcess.ExitCode -ne 0) {throw ('Wrangler salida ' + $vibeProcess.ExitCode)}
    return $vibeText
  } finally {$vibeProcess.Dispose(); $inputJson = $null}
}

try {
  $vibeConfigText = [IO.File]::ReadAllText($vibeConfigPath) -replace '(?m)^\s*//[^\r\n]*', ''
  $vibeConfig = $vibeConfigText | ConvertFrom-Json
  if ($vibeConfig.name -ne 'vibe-staging' -or
      $vibeConfig.account_id -ne '5b647e532f3d4996206529d5595295f3' -or
      $vibeConfig.workers_dev -ne $false -or $vibeConfig.preview_urls -ne $false -or
      @($vibeConfig.routes | Where-Object {$_}).Count -ne 0 -or
      $vibeConfig.vars.NEXT_PUBLIC_SUPABASE_URL -ne 'https://iyppeurjtbuydhjtraxf.supabase.co' -or
      $vibeConfig.vars.R2_BUCKET_NAME -ne 'vibe-staging-artist-media') {throw 'Configuracion staging incompatible'}

  # Un Worker inexistente debe fallar aqui, antes de secret bulk (que podria
  # ofrecer crear un Worker de borrador). No imprimir respuestas del proveedor.
  $vibeStep = 'existencia del Worker staging'
  $null = (Invoke-VibeWrangler 'list --format json') | ConvertFrom-Json
  $vibeNames = @('R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','MEDIA_RECEIPT_KEY',
    'MEDIA_RECEIPT_KEY_ID','ANONYMOUS_RATE_LIMIT_KEY','ANONYMOUS_RATE_LIMIT_KEY_ID')

  if (-not $SoloVerificar) {
    $vibeStep = 'almacenes cifrados'
    $vibeR2Bytes = [Security.Cryptography.ProtectedData]::Unprotect(
      [IO.File]::ReadAllBytes((Join-Path $vibeRoot '.wrangler/credenciales-empresa/r2-staging-runtime.dpapi')),
      $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $vibeHmacBytes = [Security.Cryptography.ProtectedData]::Unprotect(
      [IO.File]::ReadAllBytes((Join-Path $vibeRoot '.wrangler/supabase-empresa/staging-hmac.dpapi')),
      $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $vibeR2 = [Text.Encoding]::UTF8.GetString($vibeR2Bytes) | ConvertFrom-Json
    $vibeHmac = [Text.Encoding]::UTF8.GetString($vibeHmacBytes) | ConvertFrom-Json
    if ($vibeR2.bucket -ne 'vibe-staging-artist-media' -or
        $vibeR2.accessKeyId -cnotmatch '^[a-zA-Z0-9]{16,128}$' -or
        $vibeR2.secretAccessKey -cnotmatch '^[a-zA-Z0-9/+=_-]{32,256}$' -or
        $vibeHmac.project -ne 'iyppeurjtbuydhjtraxf' -or
        $vibeHmac.MEDIA_RECEIPT_KEY -cnotmatch '^[0-9a-f]{64}$' -or
        $vibeHmac.ANONYMOUS_RATE_LIMIT_KEY -cnotmatch '^[0-9a-f]{64}$' -or
        $vibeHmac.MEDIA_RECEIPT_KEY -eq $vibeHmac.ANONYMOUS_RATE_LIMIT_KEY -or
        $vibeHmac.MEDIA_RECEIPT_KEY_ID -cnotmatch '^staging_media_[0-9a-f]{32}$' -or
        $vibeHmac.ANONYMOUS_RATE_LIMIT_KEY_ID -cnotmatch '^staging_anon_[0-9a-f]{32}$') {throw 'Material staging incompatible'}
    $vibeValues = @{
      R2_ACCESS_KEY_ID=$vibeR2.accessKeyId; R2_SECRET_ACCESS_KEY=$vibeR2.secretAccessKey
      MEDIA_RECEIPT_KEY=$vibeHmac.MEDIA_RECEIPT_KEY; MEDIA_RECEIPT_KEY_ID=$vibeHmac.MEDIA_RECEIPT_KEY_ID
      ANONYMOUS_RATE_LIMIT_KEY=$vibeHmac.ANONYMOUS_RATE_LIMIT_KEY; ANONYMOUS_RATE_LIMIT_KEY_ID=$vibeHmac.ANONYMOUS_RATE_LIMIT_KEY_ID
    }
    $vibePayload = $vibeValues | ConvertTo-Json -Compress
    $vibeStep = 'instalacion en Worker staging'
    $null = Invoke-VibeWrangler 'bulk' $vibePayload
  }
  $vibeStep = 'presencia de secretos staging'
  $vibeInstalled = (Invoke-VibeWrangler 'list --format json') | ConvertFrom-Json
  foreach ($vibeName in $vibeNames) {
    if ($vibeName -notin @($vibeInstalled.name)) {throw 'Falta un secreto esperado'}
  }
  [ordered]@{worker='vibe-staging';account=$vibeConfig.account_id;secretNames=$vibeNames;
    presenceVerified=$true;valuesVerified=$false;publicRouteEnabled=$false} | ConvertTo-Json -Compress
} catch {
  Write-Output ('Secretos detenidos en ' + $vibeStep + '; tipo ' + $_.Exception.GetType().Name + '. Sin valores en la salida.')
  exit 1
} finally {
  if ($vibeR2Bytes) {[Array]::Clear($vibeR2Bytes,0,$vibeR2Bytes.Length)}
  if ($vibeHmacBytes) {[Array]::Clear($vibeHmacBytes,0,$vibeHmacBytes.Length)}
  $vibeR2 = $null; $vibeHmac = $null; $vibeValues = $null; $vibePayload = $null
}
