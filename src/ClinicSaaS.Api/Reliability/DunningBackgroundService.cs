using ClinicSaaS.Api.Services;

namespace ClinicSaaS.Api.Reliability;

public sealed class DunningBackgroundService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<DunningBackgroundService> _logger;

    public DunningBackgroundService(IServiceProvider services, ILogger<DunningBackgroundService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var dunning = scope.ServiceProvider.GetRequiredService<DunningService>();
                await dunning.RunAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Dunning worker failed");
            }

            await Task.Delay(TimeSpan.FromHours(6), stoppingToken);
        }
    }
}

