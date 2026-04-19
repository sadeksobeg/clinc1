using ClinicSaaS.Domain.Abstractions;
using ClinicSaaS.Domain.Enums;

namespace ClinicSaaS.Domain.Entities;

public sealed class User : Entity, ITenantEntity
{
    public string Name { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; }
    public bool IsOnline { get; set; }
    public bool IsDisabled { get; set; }
    public DateTime? LastSeenAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Guid? CreatedByPlatformAdminId { get; set; }
    public Guid? LinkedToDoctorId { get; set; }

    // PlatformAdmin can use Guid.Empty as a non-tenant user.
    public Guid TenantId { get; set; }
}

