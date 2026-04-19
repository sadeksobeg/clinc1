param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [string]$PostgresConnectionString = "Host=127.0.0.1;Port=5435;Database=clinicsaas_restore_drill;Username=postgres",
    [string]$PgRestorePath = "pg_restore",
    [string]$PsqlPath = "psql"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
    throw "Backup file not found: $BackupFile"
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

$env:PGPASSWORD = $password

& $PsqlPath -h $hostName -p $port -U $username -d postgres -c "DROP DATABASE IF EXISTS $database;"
& $PsqlPath -h $hostName -p $port -U $username -d postgres -c "CREATE DATABASE $database;"

& $PgRestorePath -h $hostName -p $port -U $username -d $database $BackupFile
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed." }

$tenantCount = & $PsqlPath -h $hostName -p $port -U $username -d $database -t -c "SELECT COUNT(*) FROM \"Tenants\";"
Write-Host "Restore drill completed. Tenants rows: $($tenantCount.Trim())"

