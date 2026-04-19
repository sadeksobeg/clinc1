namespace ClinicSaaS.Api.Middleware;

public sealed class TraceContextMiddleware
{
    private const string TraceHeader = "X-Trace-Id";
    private readonly RequestDelegate _next;

    public TraceContextMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task Invoke(HttpContext context)
    {
        var traceId = context.Request.Headers[TraceHeader].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(traceId))
            traceId = context.TraceIdentifier;

        context.Items[TraceHeader] = traceId;
        context.Response.Headers[TraceHeader] = traceId;
        await _next(context);
    }
}
