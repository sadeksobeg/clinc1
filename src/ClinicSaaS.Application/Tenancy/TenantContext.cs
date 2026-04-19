namespace ClinicSaaS.Application.Tenancy;

public sealed class TenantContext : ICurrentTenant
{
    public Guid TenantId { get; set; }
}

