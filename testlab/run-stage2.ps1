[CmdletBinding()]
param(
  [string]$LabPath = $PSScriptRoot
)

$ErrorActionPreference = "Stop"
Write-Host "=== L.E.O. STAGE 2: WINDOWS SIMULATION ===" -ForegroundColor Cyan

$contract = Get-Content (Join-Path $LabPath "windows-sim\simulator-contract.json") -Raw | ConvertFrom-Json

$checks = @(
  @{ Name = "approval-boundary"; Pass = ($contract.security.ownerApproval -eq $true) },
  @{ Name = "parameter-binding"; Pass = ($contract.security.parameterBinding -eq $true) },
  @{ Name = "audit"; Pass = ($contract.security.audit -eq $true) },
  @{ Name = "post-condition"; Pass = ($contract.security.postConditionVerification -eq $true) },
  @{ Name = "powershell-provider"; Pass = ($contract.providers -contains "powershell") },
  @{ Name = "gui-provider"; Pass = (($contract.providers -contains "keyboard") -and ($contract.providers -contains "mouse") -and ($contract.providers -contains "window")) },
  @{ Name = "browser-provider"; Pass = ($contract.providers -contains "browser") },
  @{ Name = "office-provider"; Pass = ($contract.providers -contains "office") },
  @{ Name = "pdf-provider"; Pass = ($contract.providers -contains "pdf") }
)

$failed = $checks | Where-Object { -not $_.Pass }
foreach ($check in $checks) {
  if ($check.Pass) {
    Write-Host "GREEN: $($check.Name)"
  } else {
    Write-Host "RED: $($check.Name)" -ForegroundColor Red
  }
}

if ($failed.Count -gt 0) {
  throw "Stage 2 simulation contract failed."
}

Write-Host "ORANGE: Stage 2 passed as a simulation contract only; no real Windows desktop was touched." -ForegroundColor Yellow
