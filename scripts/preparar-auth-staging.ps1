# Prepara solamente los retornos del staging conocido. Nunca abre el registro,
# cambia SMTP ni confirma usuarios. Sin -Aplicar consulta y muestra la propuesta.
param([switch]$Aplicar)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$vibeRoot = Split-Path $PSScriptRoot -Parent
$vibeRef = 'iyppeurjtbuydhjtraxf'
$vibeOrigin = 'https://vibe-staging.vibemusicprofile.workers.dev'
$vibeCallbacks = @("$vibeOrigin/login", "$vibeOrigin/nueva-contrasena")
$vibeApi = "https://api.supabase.com/v1/projects/$vibeRef"
$vibeBytes = $null
$vibeHeaders = $null
$vibeStep = 'identidad'
function Assert-VibeAuthClosed($configuration) {
  if ($configuration.disable_signup -ne $true -or
      $configuration.mailer_autoconfirm -ne $false -or
      $configuration.external_anonymous_users_enabled -ne $false) {
    throw 'Auth staging no esta cerrado como exige la preparacion'
  }
}
try {
  $vibeBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes((Join-Path $vibeRoot '.wrangler/supabase-empresa/access-token.dpapi')),
    $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $vibeHeaders = @{Authorization='Bearer ' + [Text.Encoding]::UTF8.GetString($vibeBytes).Trim()}
  $vibeProject = Invoke-RestMethod -Uri $vibeApi -Headers $vibeHeaders -TimeoutSec 30
  if ($vibeProject.id -ne $vibeRef -or $vibeProject.name -ne 'Vibe Music Staging' -or
      $vibeProject.organization_id -ne 'gojxsdxguggjmcbkwbhb') {throw 'Destino staging incorrecto'}
  $vibeStep = 'estado de Auth'
  $vibeBefore = Invoke-RestMethod -Uri "$vibeApi/config/auth" -Headers $vibeHeaders -TimeoutSec 30
  Assert-VibeAuthClosed $vibeBefore
  if ($Aplicar) {
    # El PATCH contiene solo URLs. Nunca reenviar la respuesta completa, que
    # puede incluir configuracion sensible del proveedor de correo.
    $vibeStep = 'retornos exactos'
    $vibeBody = @{site_url=$vibeOrigin;uri_allow_list=($vibeCallbacks -join ',')} | ConvertTo-Json -Compress
    $null = Invoke-RestMethod -Method Patch -Uri "$vibeApi/config/auth" -Headers $vibeHeaders -ContentType 'application/json' -Body $vibeBody -TimeoutSec 30
  }
  $vibeStep = 'confirmacion'
  $vibeAfter = Invoke-RestMethod -Uri "$vibeApi/config/auth" -Headers $vibeHeaders -TimeoutSec 30
  Assert-VibeAuthClosed $vibeAfter
  $vibeExact = $vibeAfter.site_url -ceq $vibeOrigin -and
    $vibeAfter.uri_allow_list -ceq ($vibeCallbacks -join ',')
  if ($Aplicar -and -not $vibeExact) {throw 'El proveedor no confirmo los retornos exactos'}
  [ordered]@{project=$vibeRef;applied=[bool]$Aplicar;siteUrl=$vibeAfter.site_url;
    callbacks=@($vibeAfter.uri_allow_list -split ',' | Where-Object {$_});
    proposedSiteUrl=$vibeOrigin;proposedCallbacks=$vibeCallbacks;exactMatch=$vibeExact;
    registrationClosed=$true;emailConfirmationRequired=$true;anonymousDisabled=$true;
    deliveryVerified=$false} | ConvertTo-Json -Depth 4
} catch {
  Write-Output ('Auth detenido en ' + $vibeStep + '; tipo ' + $_.Exception.GetType().Name + '. Sin respuesta sensible en la salida.')
  exit 1
} finally {
  if ($vibeBytes) {[Array]::Clear($vibeBytes,0,$vibeBytes.Length)}
  $vibeHeaders = $null; $vibeBefore = $null; $vibeAfter = $null
}
