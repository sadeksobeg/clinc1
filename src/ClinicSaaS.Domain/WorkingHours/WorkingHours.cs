using System.Text.Json.Serialization;

namespace ClinicSaaS.Domain.WorkingHours;

public sealed class WorkingHours
{
    // Weekly schedule: each day can contain multiple availability windows.
    public List<WorkingHoursDay> Days { get; set; } = new();
}

public sealed class WorkingHoursDay
{
    // 0 = Sunday ... 6 = Saturday (System.DayOfWeek).
    public int DayOfWeek { get; set; }

    public List<WorkingHoursWindow> Windows { get; set; } = new();
}

public sealed class WorkingHoursWindow
{
    [JsonConverter(typeof(JsonTimeOnlyConverter))]
    public TimeOnly Start { get; set; }

    [JsonConverter(typeof(JsonTimeOnlyConverter))]
    public TimeOnly End { get; set; }
}

// Ensures TimeOnly serializes consistently as "HH:mm" when stored in jsonb.
internal sealed class JsonTimeOnlyConverter : System.Text.Json.Serialization.JsonConverter<TimeOnly>
{
    private const string Format = "HH:mm";

    public override TimeOnly Read(ref System.Text.Json.Utf8JsonReader reader, Type typeToConvert, System.Text.Json.JsonSerializerOptions options)
    {
        var s = reader.GetString();
        if (string.IsNullOrWhiteSpace(s))
            throw new System.Text.Json.JsonException("TimeOnly value is required.");

        return TimeOnly.ParseExact(s, Format);
    }

    public override void Write(System.Text.Json.Utf8JsonWriter writer, TimeOnly value, System.Text.Json.JsonSerializerOptions options)
        => writer.WriteStringValue(value.ToString(Format));
}

