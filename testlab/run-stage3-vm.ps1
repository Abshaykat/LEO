[CmdletBinding()]
param(
  [ValidateSet("Hyper-V","VirtualBox","None")]
  [string]$Hypervisor = "None",
  [switch]$Execute
)

$ErrorActionPreference = "Stop"
Write-Host "=== L.E.O. STAGE 3: WINDOWS VM TEST LAB ===" -ForegroundColor Cyan

if ($Hypervisor -eq "None" -or -not $Execute) {
  Write-Host "YELLOW: VM execution not requested or no hypervisor selected." -ForegroundColor Yellow
  Write-Host "Planned VM contract:"
  Write-Host "  1. Create disposable Windows VM."
  Write-Host "  2. Install Node.js, Git and project dependencies."
  Write-Host "  3. Copy L.E.O. repository into isolated workspace."
  Write-Host "  4. Run Stage 1 tests."
  Write-Host "  5. Run real PowerShell/filesystem/browser/GUI integration tests."
  Write-Host "  6. Capture logs/screenshots."
  Write-Host "  7. Destroy/revert VM snapshot."
  exit 0
}

if ($Hypervisor -eq "Hyper-V") {
  if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) {
    throw "Hyper-V cmdlets are unavailable on this host."
  }
  Write-Host "YELLOW: Hyper-V detected. VM provisioning requires an owner-supplied Windows ISO/image and explicit VM configuration."
  exit 0
}

if ($Hypervisor -eq "VirtualBox") {
  if (-not (Get-Command VBoxManage -ErrorAction SilentlyContinue)) {
    throw "VBoxManage is unavailable on this host."
  }
  Write-Host "YELLOW: VirtualBox detected. VM provisioning requires an owner-supplied Windows ISO/image and explicit VM configuration."
  exit 0
}
