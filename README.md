# ClinicSaaS (Multi-tenant Clinic Management)

Production-oriented MVP for multi-tenant appointment automation with WhatsApp-ready booking and n8n webhooks.

## Tech stack
- Backend: **.NET 8**, ASP.NET Core Web API, **Clean Architecture (modular monolith)**, **EF Core**, **PostgreSQL**, JWT + role-based auth
- Frontend: **Angular** (role-based dashboards, JWT storage)
- Automation: **n8n** via backend webhooks + queued background delivery

## Prerequisites
- PostgreSQL 14+
- .NET SDK (net8 target)
- Node.js + npm (for building the Angular app)

## Configuration (required env vars)

### Backend
Set these environment variables before running the API:
- `POSTGRES_CONNECTION_STRING` (example):
  - `Host=localhost;Port=5432;Database=clinicsaas;Username=postgres;Password=postgres`
- `JWT_SIGNING_KEY` (a long random string)
- `N8N_BASE_URL` (example: `http://localhost:5678`)
- `N8N_API_KEY` (optional; if set, sent as `X-N8N-API-KEY`)

The API also reads:
- `Tenancy:TenantHeader` (defaults to `X-Tenant-Id`)
- `Tenancy:SubdomainSeparator` (defaults to `.`)

### Seed data (dev)
The backend includes a migration that seeds:
- One tenant
- Admin / Receptionist / Doctor users (same password for all)
- One doctor with weekly working hours
- Three visit types

Seed tenant id:
- `11111111-1111-1111-1111-111111111111`

Seed users:
- Admin: `admin@acme.dev` / `admin12345`
- Receptionist: `reception@acme.dev` / `admin12345`
- Doctor: `doctor@acme.dev` / `admin12345`

All login/register and API calls must include header `X-Tenant-Id: <seedTenantId>` (or use a matching subdomain once you provision tenants by name).

## Database migrations

From the repository root (uses `appsettings.Development.json` when `ASPNETCORE_ENVIRONMENT` is `Development`):

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet ef database update `
  --context ClinicSaaS.Infrastructure.Persistence.ClinicDbContext `
  --project src/ClinicSaaS.Infrastructure/ClinicSaaS.Infrastructure.csproj `
  --startup-project src/ClinicSaaS.Api/ClinicSaaS.Api.csproj
```

### `Failed to connect … actively refused` (Windows)

PostgreSQL is not listening on the host/port in your connection string.

1. **Start PostgreSQL** (Services → `postgresql-x64-…` → Start), or start your Docker container if you use Docker.
2. **Match the port**: dev config uses **`localhost:5432`** by default. If your install uses another port (e.g. **5434**), edit `src/ClinicSaaS.Api/appsettings.Development.json` → `Postgres:ConnectionString` → `Port=…`.
3. **Create the database** if needed: `createdb -U postgres clinicsaas` (or via pgAdmin).
4. **Check username/password** in the same connection string (`postgres` / your real password).

This applies:
- Initial schema migration (tables + json mapping + tenant filters snapshot)
- Appointment overlap exclusion constraint
- Dev seed data migration

## Run the backend

```powershell
dotnet run --project src/ClinicSaaS.Api/ClinicSaaS.Api.csproj
```

Swagger is available at `/swagger`.

## Run the frontend

In `frontend/ClinicSaaS.Web`:

```powershell
npm install
npm start
```

The Angular app proxies `/api/*` to the backend. By default this targets **`http://localhost:5137`** (see `launchSettings.json`). If your API listens on another URL/port:

```powershell
$env:API_PROXY_TARGET = "http://localhost:7297"   # example: HTTPS profile
npm start
```

The Angular app expects the backend to be reachable at relative `/api/*` routes via that proxy.

## n8n webhook integration

The backend enqueues webhooks on:
- Appointment created -> `N8n:Paths:AppointmentCreatedPath` (default `/webhooks/appointment-created`)
- Appointment updated (cancel) -> `N8n:Paths:AppointmentUpdatedPath` (default `/webhooks/appointment-updated`)
- Doctor status set to `Delayed` -> `N8n:Paths:DoctorDelayedPath` (default `/webhooks/doctor-delayed`)

Payload shape (appointments):
```json
{
  "patientName": "",
  "phone": "",
  "time": "2026-03-26T10:00:00Z",
  "doctor": ""
}
```

Doctor delayed payload includes:
```json
{
  "patientName": "",
  "phone": "",
  "time": "",
  "doctor": "",
  "message": "Doctor is delayed by X minutes"
}
```

## WorkingHours JSON (doctor schedule)
Stored in PostgreSQL as `jsonb` and used by slot calculation.

Schema (weekly):
```json
{
  "days": [
    {
      "dayOfWeek": 1,
      "windows": [
        { "start": "09:00", "end": "17:00" }
      ]
    }
  ]
}
```
Where `dayOfWeek` is `0..6` for `Sunday..Saturday`.

