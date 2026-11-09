param()

$ErrorActionPreference = 'Stop'
$vibeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$vibeOutputDir = Join-Path $vibeRoot '.wrangler/traspaso'
$vibeOutput = Join-Path $vibeOutputDir 'vibe-astra-2026-10-03.zip'
if (Test-Path -LiteralPath $vibeOutput) { throw 'Ya existe el ZIP; no se sobrescribe.' }

Push-Location $vibeRoot
try {
    $vibeTracked = @(git -c core.quotepath=false ls-files)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo obtener el inventario Git.' }
    $vibeHead = (git rev-parse HEAD).Trim()
    $vibeBranch = (git branch --show-current).Trim()
    $vibeStatus = @(git status --short)
    $vibeExtra = @(
        'app/ffmpeg/[asset]/route.ts',
        'app/ffmpeg/[asset]/route.test.ts',
        'public/.assetsignore',
        'docs/traspaso-astra-2026-10-03/LEEME.txt',
        'docs/traspaso-astra-2026-10-03/01-IMPLEMENTAR.txt',
        'docs/traspaso-astra-2026-10-03/02-AUDITAR.txt',
        'scripts/exportar-traspaso-astra.ps1'
    )
    $vibePaths = @($vibeTracked + $vibeExtra | Sort-Object -Unique)
    $vibeExcluded = [Collections.Generic.List[string]]::new()
    $vibeEntries = [Collections.Generic.List[object]]::new()
    $vibeRedacted = [Collections.Generic.List[string]]::new()
    $vibeUtf8 = [Text.UTF8Encoding]::new($false, $true)
    $vibeEmailPattern = '[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo)\.[A-Za-z]{2,}'
    # Patrones de alta confianza: solo se reportan rutas, nunca coincidencias.
    $vibeSecretPattern = '(?im)(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:R2_SECRET_ACCESS_KEY|TOGETHER_API_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*[=:]\s*["'']?([A-Za-z0-9_./+\-=]{24,})["'']?\s*$|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}|\bAKIA[A-Z0-9]{16}\b)'
    New-Item -ItemType Directory -Path $vibeOutputDir -Force | Out-Null
    $vibeStream = [IO.File]::Open($vibeOutput, [IO.FileMode]::CreateNew)
    $vibeZip = [IO.Compression.ZipArchive]::new($vibeStream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($vibeRelative in $vibePaths) {
            if ($vibeRelative -match '(^|/)(\.git|node_modules|\.next|\.open-next|\.wrangler|\.pnpm-store|\.vercel|\.playwright|test-results|playwright-report)(/|$)' -or
                $vibeRelative -match '(^|/)\.env' -and $vibeRelative -ne '.env.example' -or
                $vibeRelative -match '^supabase/\.temp/' -or
                $vibeRelative -match '(?i)\.(pem|p12|pfx|key)$') {
                $vibeExcluded.Add($vibeRelative)
                continue
            }
            $vibeAbsolute = [IO.Path]::GetFullPath((Join-Path $vibeRoot $vibeRelative))
            if (-not $vibeAbsolute.StartsWith($vibeRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Ruta fuera del repositorio en inventario.'
            }
            $vibeItem = Get-Item -LiteralPath $vibeAbsolute
            if (($vibeItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Enlace inesperado en exportación: $vibeRelative"
            }
            $vibeBytes = [IO.File]::ReadAllBytes($vibeAbsolute)
            if ($vibeRelative -match '(?i)\.(ts|tsx|js|mjs|cjs|json|jsonc|md|txt|sql|toml|yaml|yml|css|svg|html|ps1)$' -or
                $vibeRelative -eq '.env.example' -or [IO.Path]::GetFileName($vibeRelative).StartsWith('.')) {
                $vibeText = $vibeUtf8.GetString($vibeBytes)
                if ([regex]::IsMatch($vibeText, $vibeSecretPattern)) {
                    throw "Posible secreto en archivo elegible; exportación bloqueada: $vibeRelative"
                }
                if ([regex]::IsMatch($vibeText, $vibeEmailPattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
                    $vibeText = [regex]::Replace($vibeText, $vibeEmailPattern, 'contacto@example.invalid', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
                    $vibeBytes = $vibeUtf8.GetBytes($vibeText)
                    $vibeRedacted.Add($vibeRelative)
                }
            }
            $vibeEntry = $vibeZip.CreateEntry($vibeRelative.Replace('\', '/'), [IO.Compression.CompressionLevel]::Optimal)
            $vibeEntryStream = $vibeEntry.Open()
            try { $vibeEntryStream.Write($vibeBytes, 0, $vibeBytes.Length) }
            finally { $vibeEntryStream.Dispose() }
            $vibeEntries.Add([ordered]@{
                path = $vibeRelative
                bytes = $vibeBytes.Length
                sha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($vibeBytes)).ToLowerInvariant()
            })
        }
        $vibeManifest = [ordered]@{
            snapshotDate = '2026-10-03'
            head = $vibeHead
            branch = $vibeBranch
            gitStatus = $vibeStatus
            source = 'working tree; includes listed local untracked changes'
            excludesLocalSecretsAndGeneratedFolders = $true
            scanLimit = 'High-confidence secret patterns and personal-provider emails; not a certification of absence of all PII or secrets.'
            redactedPersonalEmailPaths = @($vibeRedacted)
            excludedTrackedPaths = @($vibeExcluded)
            omittedLocalPaths = @('.env.local', '.pnpm-store/', '.git/', 'node_modules/', '.next/', '.open-next/', '.wrangler/', 'supabase/.temp/')
            files = @($vibeEntries)
        } | ConvertTo-Json -Depth 8
        $vibeManifestEntry = $vibeZip.CreateEntry('EXPORTACION_ASTRA.json')
        $vibeManifestStream = $vibeManifestEntry.Open()
        try {
            $vibeManifestBytes = $vibeUtf8.GetBytes($vibeManifest)
            $vibeManifestStream.Write($vibeManifestBytes, 0, $vibeManifestBytes.Length)
        } finally { $vibeManifestStream.Dispose() }
    } finally {
        $vibeZip.Dispose()
        $vibeStream.Dispose()
    }
    [pscustomobject]@{
        Path = $vibeOutput
        Files = $vibeEntries.Count
        SizeMiB = [math]::Round((Get-Item -LiteralPath $vibeOutput).Length / 1MB, 2)
        PersonalEmailFilesRedacted = $vibeRedacted.Count
        ExcludedTrackedFiles = $vibeExcluded.Count
    }
} finally { Pop-Location }
