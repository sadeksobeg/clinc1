using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicSaaS.Infrastructure.Webhooks;

public sealed class N8nWebhookClient
{
    private readonly HttpClient _httpClient;
    private readonly N8nOptions _options;
    private readonly ILogger<N8nWebhookClient> _logger;

    public N8nWebhookClient(HttpClient httpClient, IOptions<N8nOptions> options, ILogger<N8nWebhookClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task SendAsync(string path, object payload, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.BaseUrl))
            throw new InvalidOperationException("N8n:BaseUrl is not configured.");

        var url = $"{_options.BaseUrl.TrimEnd('/')}/{path.TrimStart('/')}";

        var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = content
        };

        if (!string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            // Generic header; adjust if your n8n webhook uses a different auth scheme.
            request.Headers.Add("X-N8N-API-KEY", _options.ApiKey);
        }

        var response = await _httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException($"n8n webhook failed: {(int)response.StatusCode}. Body: {body}");
        }
    }
}

