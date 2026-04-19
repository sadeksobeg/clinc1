param(
    [int]$Port = 5138
)

$ErrorActionPreference = "Stop"

$listeners = netstat -ano | Select-String (":" + $Port + " ")
if (-not $listeners) {
    Write-Host "No process found listening on port $Port."
    exit 0
}

$pids = @()
foreach ($line in $listeners) {
    $parts = ($line.ToString() -replace "\s+", " ").Trim().Split(" ")
    $procId = $parts[-1]
    if ($procId -match "^\d+$") {
        $pids += [int]$procId
    }
}

$pids = $pids | Sort-Object -Unique
foreach ($procId in $pids) {
    try {
        Stop-Process -Id $procId -Force
        Write-Host "Stopped process $procId."
    }
    catch {
        Write-Host "Could not stop process ${procId}: $($_.Exception.Message)"
    }
}

Write-Host "Rollback stop step complete. Switch reverse proxy to previous stable version."
