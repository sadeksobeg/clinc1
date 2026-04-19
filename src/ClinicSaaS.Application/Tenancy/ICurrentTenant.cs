namespace ClinicSaaS.Application.Tenancy;

public interface ICurrentTenant
{
    Guid TenantId { get; }
}

