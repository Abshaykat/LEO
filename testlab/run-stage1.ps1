[CmdletBinding()]
param(
  [string]$CorePath = (Join-Path $PSScriptRoot "..\core")
)

$ErrorActionPreference = "Stop"
Write-Host "=== L.E.O. STAGE 1: PORTABLE VERIFICATION ===" -ForegroundColor Cyan

if (-not (Test-Path $CorePath)) {
  throw "Core path not found: $CorePath"
}

Push-Location $CorePath
try {
  if (Test-Path "package.json") {
    Write-Host "[1/3] npm run typecheck"
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "Typecheck failed." }

    Write-Host "[2/3] npm test"
    npm test
    if ($LASTEXITCODE -ne 0) { throw "npm test failed." }
  } else {
    Write-Host "SKIP: core/package.json not found." -ForegroundColor Yellow
  }

  Write-Host "[3/3] source/security invariant scan"
  $forbidden = @(
    "allowAutonomousExecution.*true",
    "allowAgentCreation.*true"
  )

  $violations = @()
  Get-ChildItem -Recurse -File -Include *.ts,*.json |
    Where-Object { $_.FullName -notmatch "\\node_modules\\" } |
    ForEach-Object {
      $text = Get-Content $_.FullName -Raw
      foreach ($pattern in $forbidden) {
        if ($text -match $pattern) {
          $violations += "$($_.FullName): $pattern"
        }
      }
    }

  if ($violations.Count -gt 0) {
    $violations | ForEach-Object { Write-Host "RED: $_" -ForegroundColor Red }
    throw "Security invariant scan failed."
  }

  Write-Host "GREEN: Stage 1 completed." -ForegroundColor Green
}
finally {
  Pop-Location
}
