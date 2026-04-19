using System.Security.Cryptography;

namespace ClinicSaaS.Api.Auth;

public static class PasswordHasher
{
    // Format: iterations.saltBase64.hashBase64
    public static string HashPassword(string password, int iterations = 120_000)
    {
        if (password.Length < 8)
            throw new ArgumentException("Password must be at least 8 characters long.");

        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            32);

        return $"{iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string storedHash)
    {
        var parts = storedHash.Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 3)
            return false;

        if (!int.TryParse(parts[0], out var iterations))
            return false;

        var salt = Convert.FromBase64String(parts[1]);
        var expectedHash = Convert.FromBase64String(parts[2]);

        var actualHash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            expectedHash.Length);

        // Constant-time compare.
        return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
    }
}

