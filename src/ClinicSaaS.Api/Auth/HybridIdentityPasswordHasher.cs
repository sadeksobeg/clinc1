using ClinicSaaS.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace ClinicSaaS.Api.Auth;

public sealed class HybridIdentityPasswordHasher : IPasswordHasher<ApplicationUser>
{
    private readonly PasswordHasher<ApplicationUser> _identity = new();

    public string HashPassword(ApplicationUser user, string password)
        => _identity.HashPassword(user, password);

    public PasswordVerificationResult VerifyHashedPassword(ApplicationUser user, string hashedPassword, string providedPassword)
    {
        if (LooksLegacyHash(hashedPassword))
            return PasswordHasher.Verify(providedPassword, hashedPassword)
                ? PasswordVerificationResult.SuccessRehashNeeded
                : PasswordVerificationResult.Failed;

        return _identity.VerifyHashedPassword(user, hashedPassword, providedPassword);
    }

    private static bool LooksLegacyHash(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var parts = value.Split('.', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length == 3 && int.TryParse(parts[0], out _);
    }
}
