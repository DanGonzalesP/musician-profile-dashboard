# Guarda la credencial S3 exclusiva de staging (bucket vibe-staging-artist-media)
# cifrada con DPAPI del usuario actual y la verifica. Nunca la imprime ni la
# escribe en texto plano. Uso, desde la raíz del repositorio:
#   powershell -File scripts/guardar-credencial-r2-staging.ps1              # guardar y verificar
#   powershell -File scripts/guardar-credencial-r2-staging.ps1 -SoloVerificar
# -Reemplazar sólo para una rotación deliberada: no regenera claves válidas.
param([switch]$SoloVerificar, [switch]$Reemplazar)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$vibeRoot = Split-Path $PSScriptRoot -Parent
$vibeDir = Join-Path $vibeRoot '.wrangler/credenciales-empresa'
$vibePath = Join-Path $vibeDir 'r2-staging-runtime.dpapi'
$vibeBytes = $null
$vibePlain = $null
$vibeBeforeAccess = $env:R2_ACCESS_KEY_ID
$vibeBeforeSecret = $env:R2_SECRET_ACCESS_KEY
function ConvertFrom-VibeSecure([Security.SecureString]$value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($value)
  try { [Runtime.InteropServices.Marshal]::PtrToStringUni($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($pointer) }
}
try {
  if (-not $SoloVerificar) {
    if ((Test-Path -LiteralPath $vibePath) -and -not $Reemplazar) {
      throw 'Ya existe una credencial de staging guardada. Usa -SoloVerificar, o -Reemplazar para una rotación deliberada.'
    }
    New-Item -ItemType Directory -Force -Path $vibeDir | Out-Null
    $vibeAccess = ConvertFrom-VibeSecure (Read-Host 'Access Key ID de vibe-staging-artistas-runtime' -AsSecureString)
    $vibeSecret = ConvertFrom-VibeSecure (Read-Host 'Secret Access Key (no se mostrará)' -AsSecureString)
    if ($vibeAccess.Trim().Length -lt 16 -or $vibeSecret.Trim().Length -lt 32) { throw 'Valores incompletos: no se guardó nada.' }
    $vibePlain = [Text.Encoding]::UTF8.GetBytes((@{ accessKeyId = $vibeAccess.Trim(); secretAccessKey = $vibeSecret.Trim(); bucket = 'vibe-staging-artist-media' } | ConvertTo-Json -Compress))
    $vibeAccess = $null; $vibeSecret = $null
    [IO.File]::WriteAllBytes($vibePath, [Security.Cryptography.ProtectedData]::Protect($vibePlain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))
    [Array]::Clear($vibePlain, 0, $vibePlain.Length)
    Write-Output 'Credencial de staging guardada cifrada (DPAPI).'
  }
  $vibeBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($vibePath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $vibeCredential = [Text.Encoding]::UTF8.GetString($vibeBytes) | ConvertFrom-Json
  if ($vibeCredential.bucket -ne 'vibe-staging-artist-media') { throw 'La credencial guardada no es la de staging.' }
  $env:R2_ACCESS_KEY_ID = $vibeCredential.accessKeyId
  $env:R2_SECRET_ACCESS_KEY = $vibeCredential.secretAccessKey
  Push-Location $vibeRoot
  try { & node (Join-Path $PSScriptRoot 'verificar-r2-staging.mjs'); $vibeExit = $LASTEXITCODE } finally { Pop-Location }
} finally {
  $env:R2_ACCESS_KEY_ID = $vibeBeforeAccess
  $env:R2_SECRET_ACCESS_KEY = $vibeBeforeSecret
  if ($vibeBytes) { [Array]::Clear($vibeBytes, 0, $vibeBytes.Length) }
  $vibeCredential = $null
}
exit $vibeExit
