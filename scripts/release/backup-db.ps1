param(
    [string]$BackupDir = "C:\deploy\clinicsaas-backups",
    [string]$PostgresConnectionString = "Host=127.0.0.1;Port=5435;Database=clinicsaas;Username=postgres",
    [string]$PgDumpPath = "pg_dump"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

if ($PostgresConnectionString -match "Host=([^;]+);Port=([^;]+);Database=([^;]+);Username=([^;]+);Password=([^;]+)") {
    $hostName = $Matches[1]
    $port = $Matches[2]
    $database = $Matches[3]
    $username = $Matches[4]
    $password = $Matches[5]
} else {
    throw "Unable to parse Postgres connection string."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $BackupDir "clinicsaas-$timestamp.dump"
$env:PGPASSWORD = $password

& $PgDumpPath -h $hostName -p $port -U $username -Fc -f $backupFile $database
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }

$size = (Get-Item $backupFile).Length
Write-Host "Backup created: $backupFile ($size bytes)"

