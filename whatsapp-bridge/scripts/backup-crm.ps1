# Backup CRM database (PostgreSQL). Requires pg_dump in PATH.
# Example:
#   $env:PGPASSWORD='yourpass'; .\scripts\backup-crm.ps1
param(
  [string]$Host = "127.0.0.1",
  [int]$Port = 5435,
  [string]$Database = "clinicsaas",
  [string]$User = "postgres",
  [string]$OutDir = ".\backups"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$file = Join-Path $OutDir "crm_$stamp.dump"
& pg_dump -h $Host -p $Port -U $User -Fc -f $file $Database
Write-Host "Wrote $file"
