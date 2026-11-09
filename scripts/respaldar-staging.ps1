# Respaldo logico cifrado del staging fijado. No enlaza ni modifica proyectos.
# Requiere Docker y el cliente PostgreSQL del contenedor local de Vibe activo.
# La contrasena llega al cliente por entorno, nunca por argumentos o archivos.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$vibeRoot = Split-Path $PSScriptRoot -Parent
$vibeCredentialDir = Join-Path $vibeRoot '.wrangler/supabase-empresa'
$vibeRef = 'iyppeurjtbuydhjtraxf'
$vibeToken = $null; $vibePassword = $null; $vibeDumpBytes = $null
$vibeStep = 'credencial de gestion'
try {
  $vibeToken = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes((Join-Path $vibeCredentialDir 'access-token.dpapi')),
    $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $vibeHeaders = @{Authorization = 'Bearer ' + [Text.Encoding]::UTF8.GetString($vibeToken).Trim()}
  $vibeApi = "https://api.supabase.com/v1/projects/$vibeRef"
  $vibeStep = 'identidad del proyecto'
  $vibeProject = Invoke-RestMethod -Uri $vibeApi -Headers $vibeHeaders -TimeoutSec 30
  if ($vibeProject.id -ne $vibeRef -or $vibeProject.name -ne 'Vibe Music Staging' -or
      $vibeProject.organization_id -ne 'gojxsdxguggjmcbkwbhb') {throw 'Destino staging incorrecto'}
  $vibeStep = 'identidad del pooler'
  $vibePoolers = Invoke-RestMethod -Uri "$vibeApi/config/database/pooler" -Headers $vibeHeaders -TimeoutSec 30
  $vibePrimary = @($vibePoolers | Where-Object {$_.database_type -eq 'PRIMARY'})
  if ($vibePrimary.Count -ne 1 -or $vibePrimary[0].db_host -cnotmatch '^aws-[0-9]+-sa-east-1\.pooler\.supabase\.com$' -or
      $vibePrimary[0].db_user -ne "postgres.$vibeRef") {throw 'Pooler staging incompatible'}
  # La API describe el pool transaccional (6543); pg_dump usa la sesion (5432).
  $vibeHost = $vibePrimary[0].db_host
  $vibeUser = $vibePrimary[0].db_user
  $vibeStep = 'credencial de base staging'
  $vibePassword = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes((Join-Path $vibeCredentialDir 'staging-db-password.dpapi')),
    $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $vibeDestination = Join-Path $vibeRoot ('.wrangler/staging-backups/' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ'))
  New-Item -ItemType Directory -Path $vibeDestination | Out-Null
  $vibeSizes = @{}
  foreach ($vibePart in @('database', 'roles')) {
    $vibeStep = 'captura ' + $vibePart
    $vibeInfo = New-Object Diagnostics.ProcessStartInfo
    $vibeInfo.FileName = 'docker'
    $vibeInfo.UseShellExecute = $false
    $vibeInfo.CreateNoWindow = $true
    $vibeInfo.RedirectStandardOutput = $true
    $vibeInfo.RedirectStandardError = $true
    $vibeInfo.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
    $vibeInfo.EnvironmentVariables['PGPASSWORD'] = [Text.Encoding]::UTF8.GetString($vibePassword).Trim()
    $vibeConnection = "--host=$vibeHost --port=5432 --username=$vibeUser --dbname=postgres --no-password"
    $vibePrefix = 'exec -e PGPASSWORD -e PGSSLMODE=require -e PGCONNECT_TIMEOUT=20 supabase_db_vibe '
    if ($vibePart -eq 'database') {
      $vibeInfo.Arguments = $vibePrefix + 'pg_dump ' + $vibeConnection + ' --format=plain --schema=public --schema=private --schema=auth --schema=storage --schema=supabase_migrations'
    } else {
      $vibeInfo.Arguments = $vibePrefix + "pg_dumpall --host=$vibeHost --port=5432 --username=$vibeUser --database=postgres --no-password --roles-only --no-role-passwords"
    }
    $vibeProcess = New-Object Diagnostics.Process
    $vibeProcess.StartInfo = $vibeInfo
    try {
      $null = $vibeProcess.Start()
      $vibeOutputTask = $vibeProcess.StandardOutput.ReadToEndAsync()
      $vibeErrorTask = $vibeProcess.StandardError.ReadToEndAsync()
      if (-not $vibeProcess.WaitForExit(180000)) {$vibeProcess.Kill(); throw 'Respaldo excedio el tiempo maximo'}
      $vibeSql = $vibeOutputTask.GetAwaiter().GetResult()
      $vibeStderr = $vibeErrorTask.GetAwaiter().GetResult()
      if ($vibeProcess.ExitCode -ne 0 -or $vibeSql.Length -lt 100) {
        $vibeStep += ' (salida ' + $vibeProcess.ExitCode + ', autenticacion=' + ($vibeStderr -match 'authentication failed') + ', red=' + ($vibeStderr -match 'could not (translate|connect)|Connection refused|timeout') + ')'
        throw 'Captura incompleta'
      }
      if ($vibePart -eq 'database' -and $vibeSql -notmatch 'PostgreSQL database dump complete') {throw 'Dump sin marca final'}
      $vibeDumpBytes = [Text.Encoding]::UTF8.GetBytes($vibeSql)
      $vibeCipher = [Security.Cryptography.ProtectedData]::Protect($vibeDumpBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
      $vibeFile = [IO.File]::Open((Join-Path $vibeDestination "$vibePart.sql.dpapi"), [IO.FileMode]::CreateNew)
      try {$vibeFile.Write($vibeCipher, 0, $vibeCipher.Length)} finally {$vibeFile.Dispose()}
      $vibeSizes[$vibePart] = $vibeDumpBytes.Length
    } finally {
      if ($vibeDumpBytes) {[Array]::Clear($vibeDumpBytes, 0, $vibeDumpBytes.Length)}
      $vibeSql = $null; $vibeInfo.EnvironmentVariables.Remove('PGPASSWORD'); $vibeProcess.Dispose()
    }
  }
  $vibeSummary = [ordered]@{project=$vibeRef;capturedAt=(Get-Date).ToUniversalTime().ToString('o');bytes=$vibeSizes;encrypted='DPAPI CurrentUser';restoreVerified=$false}
  $vibeSummary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $vibeDestination 'summary.json') -Encoding UTF8
  $vibeSummary | ConvertTo-Json -Compress
} catch {
  # Ni stderr ni respuestas remotas: podrian contener SQL/datos sensibles.
  Write-Output ('Respaldo detenido en ' + $vibeStep + '; tipo ' + $_.Exception.GetType().Name + '. No usar capturas parciales sin summary.json.')
  exit 1
} finally {
  if ($vibeToken) {[Array]::Clear($vibeToken, 0, $vibeToken.Length)}
  if ($vibePassword) {[Array]::Clear($vibePassword, 0, $vibePassword.Length)}
  $vibeHeaders = $null; $vibeSql = $null
}
