param(
    [string]$RepoRoot = "D:\Sadek Company\Mid Auto",
    [string]$PublishRoot = "C:\deploy\clinicsaas-api",
    [string]$ApiUrls = "http://localhost:5138",
    [string]$PostgresConnectionString = "Host=127.0.0.1;Port=5435;Database=clinicsaas;Username=postgres",
    [string]$JwtSigningKey = "CHANGE_ME_IN_DEV_TO_A_LONG_RANDOM_SECRET",
    [string]$JwtIssuer = "ClinicSaaS",
    [string]$JwtAudience = "ClinicSaaS"
)

$ErrorActionPreference = "Stop"

$apiProj = Join-Path $RepoRoot "src\ClinicSaaS.Api\ClinicSaaS.Api.csproj"
$infraProj = Join-Path $RepoRoot "src\ClinicSaaS.Infrastructure\ClinicSaaS.Infrastructure.csproj"
$releaseTag = "release-$(Get-Date -Format yyyyMMdd-HHmmss)"
$publishPath = Join-Path $PublishRoot $releaseTag

Write-Host "== Release tag: $releaseTag =="
Set-Location $RepoRoot

Write-Host "== Build (Release) =="
dotnet restore
dotnet build -c Release
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

Write-Host "== Applying migrations =="
$env:Postgres__ConnectionString = $PostgresConnectionString
$env:Jwt__SigningKey = $JwtSigningKey
$env:Jwt__Issuer = $JwtIssuer
$env:Jwt__Audience = $JwtAudience
dotnet ef database update --project $infraProj --startup-project $apiProj --context ClinicDbContext
if ($LASTEXITCODE -ne 0) { throw "Migration failed." }

Write-Host "== Publishing API =="
dotnet publish $apiProj -c Release -o $publishPath
if ($LASTEXITCODE -ne 0) { throw "Publish failed." }

Write-Host "== Starting candidate version =="
$startCommand = @"
`$env:ASPNETCORE_URLS='$ApiUrls';
`$env:Postgres__ConnectionString='$PostgresConnectionString';
`$env:Jwt__SigningKey='$JwtSigningKey';
`$env:Jwt__Issuer='$JwtIssuer';
`$env:Jwt__Audience='$JwtAudience';
dotnet 'ClinicSaaS.Api.dll'
"@
Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -Command $startCommand" -WorkingDirectory $publishPath | Out-Null

Write-Host "== Running smoke checks =="
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "smoke-tests.ps1") -BaseUrl $ApiUrls
if ($LASTEXITCODE -ne 0) { throw "Smoke tests failed." }

Write-Host ""
Write-Host "Deployment candidate is up at $ApiUrls"
Write-Host "Published folder: $publishPath"
Write-Host "If smoke checks pass, switch reverse proxy to this port."
