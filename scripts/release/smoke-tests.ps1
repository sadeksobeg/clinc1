param(
    [string]$BaseUrl = "http://localhost:5138",
    [string]$SeedTenantId = "11111111-1111-1111-1111-111111111111",
    [string]$PlatformEmail = "platform@acme.dev",
    [string]$PlatformPassword = "admin12345",
    [string]$DoctorEmail = "doctor@acme.dev",
    [string]$DoctorPassword = "admin12345"
)

$ErrorActionPreference = "Stop"
$failed = 0

function Check-Step {
    param(
        [string]$Name,
        [scriptblock]$Block
    )
    try {
        $result = & $Block
        Write-Host "[PASS] $Name -> $result"
    }
    catch {
        $script:failed++
        Write-Host "[FAIL] $Name -> $($_.Exception.Message)"
    }
}

Check-Step "healthz" {
    for ($i = 0; $i -lt 6; $i++) {
        try {
            return (Invoke-RestMethod -Uri ($BaseUrl + "/healthz")).status
        }
        catch {
            if ($i -eq 5) { throw }
            Start-Sleep -Seconds 2
        }
    }
}

$login = Invoke-RestMethod -Uri ($BaseUrl + "/api/auth/login") -Method Post -Headers @{ "X-Tenant-Id" = $SeedTenantId } -ContentType "application/json" -Body (@{
    email = $PlatformEmail
    password = $PlatformPassword
} | ConvertTo-Json)
$platformHeaders = @{
    Authorization = "Bearer $($login.accessToken)"
    "X-Tenant-Id" = $SeedTenantId
}

Check-Step "platform-health" {
    (Invoke-RestMethod -Uri ($BaseUrl + "/api/platform/health/overview") -Headers $platformHeaders).databaseHealthy
}

Check-Step "auth-refresh-rotation" {
    $next = Invoke-RestMethod -Uri ($BaseUrl + "/api/auth/refresh") -Method Post -Headers @{ "X-Tenant-Id" = $SeedTenantId } -ContentType "application/json" -Body (@{
        refreshToken = $login.refreshToken
    } | ConvertTo-Json)
    if ($next.refreshToken -eq $login.refreshToken) { throw "Refresh token did not rotate." }
    "rotated"
}

Check-Step "policy-guard-platform-only" {
    $doctor = Invoke-RestMethod -Uri ($BaseUrl + "/api/auth/login") -Method Post -Headers @{ "X-Tenant-Id" = $SeedTenantId } -ContentType "application/json" -Body (@{
        email = $DoctorEmail
        password = $DoctorPassword
    } | ConvertTo-Json)
    try {
        Invoke-RestMethod -Uri ($BaseUrl + "/api/platform/health/overview") -Headers @{ Authorization = "Bearer $($doctor.accessToken)"; "X-Tenant-Id" = $SeedTenantId } -ErrorAction Stop | Out-Null
        throw "Doctor unexpectedly accessed platform endpoint."
    }
    catch {
        if ($_.Exception.Response.StatusCode.Value__ -ne 403) { throw }
    }
    "blocked"
}

if ($failed -gt 0) {
    throw "Smoke tests failed: $failed"
}

Write-Host "All smoke tests passed."
