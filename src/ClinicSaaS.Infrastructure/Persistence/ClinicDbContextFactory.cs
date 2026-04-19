using ClinicSaaS.Application.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace ClinicSaaS.Infrastructure.Persistence;

public sealed class ClinicDbContextFactory : IDesignTimeDbContextFactory<ClinicDbContext>
{
    public ClinicDbContext CreateDbContext(string[] args)
    {
        var connectionString = ResolveConnectionString();

        var optionsBuilder = new DbContextOptionsBuilder<ClinicDbContext>()
            .UseNpgsql(connectionString, b => b.MigrationsAssembly(typeof(ClinicDbContextFactory).Assembly.FullName));

        var tenantContext = new TenantContext { TenantId = Guid.Empty };
        return new ClinicDbContext(optionsBuilder.Options, tenantContext);
    }

    private static string ResolveConnectionString()
    {
        var fromEnv = Environment.GetEnvironmentVariable("POSTGRES_CONNECTION_STRING")
            ?? Environment.GetEnvironmentVariable("Postgres__ConnectionString");
        if (!string.IsNullOrWhiteSpace(fromEnv))
            return fromEnv;

        var apiRoot = ResolveApiProjectDirectory();
        if (Directory.Exists(apiRoot))
        {
            var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
                ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
                ?? "Development";

            var config = new ConfigurationBuilder()
                .SetBasePath(apiRoot)
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: false)
                .AddJsonFile($"appsettings.{env}.json", optional: true, reloadOnChange: false)
                .AddEnvironmentVariables()
                .Build();

            var cs = config["Postgres:ConnectionString"];
            if (!string.IsNullOrWhiteSpace(cs) && !cs.TrimStart().StartsWith("${", StringComparison.Ordinal))
                return cs;
        }

        return "Host=127.0.0.1;Port=5432;Database=clinicsaas;Username=postgres;Password=postgres";
    }

    /// <summary>
    /// Design-time entrypoint runs with BaseDirectory under Infrastructure/bin/{Configuration}/{tfm}/.
    /// </summary>
    private static string ResolveApiProjectDirectory()
    {
        var infraProjectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", ".."));
        return Path.GetFullPath(Path.Combine(infraProjectRoot, "..", "ClinicSaaS.Api"));
    }
}
