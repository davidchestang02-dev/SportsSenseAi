param(
    [string]$File = ".dev.vars",
    [switch]$SkipDefault,
    [switch]$SkipStaging,
    [switch]$SkipProduction
)

$secretKeys = @(
    "AUTH_SECRET",
    "SSA_CF_AIG_TOKEN",
    "CF_AIG_TOKEN",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET"
)

$resolvedPath = Join-Path $PSScriptRoot "..\\$File"
$resolvedPath = [System.IO.Path]::GetFullPath($resolvedPath)

if (-not (Test-Path $resolvedPath)) {
    throw "Secret file not found: $resolvedPath"
}

$content = Get-Content $resolvedPath | Where-Object {
    $_ -and -not $_.Trim().StartsWith("#")
}

$values = @{}
foreach ($line in $content) {
    $parts = $line -split "=", 2
    if ($parts.Length -ne 2) {
        continue
    }
    $values[$parts[0].Trim()] = $parts[1]
}

$available = @()
$missing = @()
foreach ($key in $secretKeys) {
    if ($values.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($values[$key])) {
        $available += $key
    }
    else {
        $missing += $key
    }
}

if ($available.Count -eq 0) {
    throw "No non-empty secret values found in ${resolvedPath}."
}

if ($missing.Count -gt 0) {
    Write-Warning "Skipping empty secrets in ${resolvedPath}: $($missing -join ', ')"
}

$tempFile = [System.IO.Path]::GetTempFileName()
try {
    $secretKeys | ForEach-Object {
        if ($available -contains $_) {
            "$_=$($values[$_])"
        }
    } | Set-Content -Path $tempFile -Encoding UTF8

    Push-Location (Join-Path $PSScriptRoot "..")
    try {
        if (-not $SkipDefault) {
            cmd /c npx wrangler secret bulk $tempFile
        }
        if (-not $SkipStaging) {
            cmd /c npx wrangler secret bulk $tempFile --env staging
        }
        if (-not $SkipProduction) {
            cmd /c npx wrangler secret bulk $tempFile --env production
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item $tempFile -ErrorAction SilentlyContinue
}
