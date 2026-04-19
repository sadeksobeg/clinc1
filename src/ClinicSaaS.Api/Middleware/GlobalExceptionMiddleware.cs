using System.Net;
using System.Text.Json;
using ClinicSaaS.Application.Appointments;

namespace ClinicSaaS.Api.Middleware;

public sealed class GlobalExceptionMiddleware
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const string TraceHeader = "X-Trace-Id";
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task Invoke(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (AppointmentSlotConflictException ex)
        {
            await WriteErrorAsync(context, HttpStatusCode.Conflict, "appointment_conflict", ex.Message);
        }
        catch (UnauthorizedAccessException ex)
        {
            await WriteErrorAsync(context, HttpStatusCode.Forbidden, "forbidden", ex.Message);
        }
        catch (ArgumentException ex)
        {
            await WriteErrorAsync(context, HttpStatusCode.BadRequest, "bad_request", ex.Message);
        }
        catch (KeyNotFoundException ex)
        {
            await WriteErrorAsync(context, HttpStatusCode.NotFound, "not_found", ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception while processing request.");
            await WriteErrorAsync(context, HttpStatusCode.InternalServerError, "internal_error", "Internal server error.");
        }
    }

    private static async Task WriteErrorAsync(HttpContext context, HttpStatusCode status, string code, string message)
    {
        if (context.Response.HasStarted)
            return;

        context.Response.StatusCode = (int)status;
        context.Response.ContentType = "application/json";
        var traceId = context.Items[TraceHeader]?.ToString() ?? context.TraceIdentifier;
        var payload = JsonSerializer.Serialize(new { code, message, traceId }, JsonOptions);
        await context.Response.WriteAsync(payload);
    }
}
