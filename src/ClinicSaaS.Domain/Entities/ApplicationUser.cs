using ClinicSaaS.Domain.Enums;
using Microsoft.AspNetCore.Identity;

namespace ClinicSaaS.Domain.Entities;

public sealed class ApplicationUser : IdentityUser<Guid>
{
    public Guid? TenantId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public RoleType RoleType { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
}
