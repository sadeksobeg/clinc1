using System.Text.Json;
using ClinicSaaS.Application.Appointments;
using ClinicSaaS.Application.Patients;
using ClinicSaaS.Application.Scheduling;
using ClinicSaaS.Domain.Entities;
using Microsoft.Extensions.Logging;
using TimeZoneConverter;

namespace ClinicSaaS.Application.WhatsApp;

public sealed class WhatsAppConversationService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan SlotHoldDuration = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan ConversationIdleTimeout = TimeSpan.FromMinutes(10);

    private readonly IConversationStateRepository _conversations;
    private readonly IAppointmentSchedulerData _schedulerData;
    private readonly AppointmentScheduler _scheduler;
    private readonly AppointmentBookingService _booking;
    private readonly IPatientRepository _patients;
    private readonly IAppointmentRepository _appointments;
    private readonly ILogger<WhatsAppConversationService> _logger;

    public WhatsAppConversationService(
        IConversationStateRepository conversations,
        IAppointmentSchedulerData schedulerData,
        AppointmentScheduler scheduler,
        AppointmentBookingService booking,
        IPatientRepository patients,
        IAppointmentRepository appointments,
        ILogger<WhatsAppConversationService> logger)
    {
        _conversations = conversations;
        _schedulerData = schedulerData;
        _scheduler = scheduler;
        _booking = booking;
        _patients = patients;
        _appointments = appointments;
        _logger = logger;
    }

    public async Task<WhatsAppIncomingResponse> HandleIncomingAsync(
        WhatsAppIncomingRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Phone))
            return new WhatsAppIncomingResponse("رقم الهاتف مطلوب.", "idle", null);

        var message = (request.Message ?? string.Empty).Trim();
        var row = await _conversations.GetOrCreateAsync(request.Phone, cancellationToken);
        var visitTypes = await _schedulerData.ListVisitTypesAsync(cancellationToken);
        var timeZoneId = await _schedulerData.GetTenantTimeZoneIdAsync(cancellationToken);
        var tz = ResolveTimeZone(timeZoneId);

        // If user returns after a long pause, reset stale state.
        if (row.State != "idle" && (DateTimeOffset.UtcNow - row.UpdatedAt) > ConversationIdleTimeout)
        {
            ResetFlow(row);
            await _conversations.SaveChangesAsync(cancellationToken);
            return new WhatsAppIncomingResponse(
                "تم إلغاء العملية بسبب عدم الرد.\nلنبدأ من جديد 👇\nاكتب: حجز",
                "idle",
                null);
        }

        // "إلغاء" during an active booking flow → reset without cancel logic.
        if (IsBookingCancel(message) && row.State != "idle" && row.State != "awaiting_cancel_confirm")
        {
            row.State = "idle";
            row.Data = "{}";
            row.UpdatedAt = DateTimeOffset.UtcNow;
            await _conversations.SaveChangesAsync(cancellationToken);
            return new WhatsAppIncomingResponse("تم الإلغاء. اكتب «حجز» عندما تريد البدء من جديد.", "idle", null);
        }

        switch (row.State)
        {
            case "idle":
                return await HandleIdleAsync(row, message, visitTypes, tz, cancellationToken);

            case "choose_visit_type":
                return await HandleChooseVisitTypeAsync(row, message, visitTypes, tz, cancellationToken);

            case "choose_slot":
                return await HandleChooseSlotAsync(row, message, tz, cancellationToken);

            case "awaiting_confirm":
                return await HandleAwaitingConfirmAsync(row, message, visitTypes, tz, cancellationToken);

            case "awaiting_name":
                return await HandleAwaitingNameAsync(row, message, tz, cancellationToken);

            case "awaiting_cancel_confirm":
                return await HandleAwaitingCancelConfirmAsync(row, message, tz, cancellationToken);

            default:
                row.State = "idle";
                row.Data = "{}";
                row.UpdatedAt = DateTimeOffset.UtcNow;
                await _conversations.SaveChangesAsync(cancellationToken);
                return new WhatsAppIncomingResponse("تم إعادة ضبط المحادثة. اكتب «حجز» للبدء.", "idle", null);
        }
    }

    // ─── idle ────────────────────────────────────────────────────────────────

    private async Task<WhatsAppIncomingResponse> HandleIdleAsync(
        ConversationState row,
        string message,
        IReadOnlyList<(Guid Id, string Name)> visitTypes,
        TimeZoneInfo tz,
        CancellationToken cancellationToken)
    {
        if (IsModificationIntent(message))
        {
            return new WhatsAppIncomingResponse(
                "لتعديل موعدك يرجى التواصل مع الاستقبال. يمكنك أيضًا كتابة «حجز» لموعد جديد.",
                "idle",
                null);
        }

        // Cancel intent from idle → show upcoming appointments.
        if (IsBookingCancel(message))
            return await StartCancelFlowAsync(row, message, tz, cancellationToken);

        if (!StartsBookingIntent(message))
        {
            var list = FormatVisitTypeList(visitTypes);
            return new WhatsAppIncomingResponse(
                "لم أفهم طلبك 🤔\n" +
                "اكتب «حجز» للبدء.\n" +
                $"الأنواع المتاحة: {list}",
                "idle",
                null);
        }

        row.State = "choose_visit_type";
        row.Data = "{}";
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await _conversations.SaveChangesAsync(cancellationToken);

        return new WhatsAppIncomingResponse(
            $"اختر نوع الزيارة بكتابة اسمه (مثال: كشف):\n{FormatVisitTypeList(visitTypes)}",
            "choose_visit_type",
            null);
    }

    // ─── choose_visit_type ───────────────────────────────────────────────────

    private async Task<WhatsAppIncomingResponse> HandleChooseVisitTypeAsync(
        ConversationState row,
        string message,
        IReadOnlyList<(Guid Id, string Name)> visitTypes,
        TimeZoneInfo tz,
        CancellationToken cancellationToken)
    {
        var match = VisitTypeIntentMatcher.TryMatch(message, visitTypes);
        if (match is null)
        {
            return new WhatsAppIncomingResponse(
                $"لم نتعرف على النوع. جرّب أحد الخيارات:\n{FormatVisitTypeList(visitTypes)}",
                "choose_visit_type",
                null);
        }

        var visitTypeName = visitTypes.First(v => v.Id == match.Value).Name;

        var slots = await TryBuildSlotChoicesAsync(match.Value, row.Phone, cancellationToken);
        if (slots is null || slots.Count == 0)
            return new WhatsAppIncomingResponse(
                "لا توجد أوقات متاحة لهذا النوع خلال الفترة القريبة. جرّب لاحقًا أو اتصل بالعيادة.",
                "choose_visit_type",
                null);

        var data = new ConversationFlowData
        {
            VisitTypeId = match.Value,
            VisitTypeName = visitTypeName,
            Slots = slots
        };

        row.State = "choose_slot";
        row.Data = JsonSerializer.Serialize(data, JsonOptions);
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await _conversations.SaveChangesAsync(cancellationToken);

        var lines = string.Join("\n", slots.Select(s =>
            $"{s.N}) {FormatSlotLine(s, tz)}"));

        return new WhatsAppIncomingResponse(
            $"اختر الوقت بإرسال الرقم:\n{lines}",
            "choose_slot",
            null);
    }

    // ─── choose_slot ─────────────────────────────────────────────────────────

    private async Task<WhatsAppIncomingResponse> HandleChooseSlotAsync(
        ConversationState row,
        string message,
        TimeZoneInfo tz,
        CancellationToken cancellationToken)
    {
        ConversationFlowData? data = TryDeserialize(row.Data);
        var slots = data?.Slots;

        if (!TryParseChoice(message, out var choice))
        {
            return new WhatsAppIncomingResponse(
                "الرجاء اختيار رقم من القائمة (مثال: 1) أو اكتب «إلغاء».\n" +
                FormatSlotChoices(slots, tz),
                "choose_slot",
                null);
        }

        if (slots is null || slots.Count == 0)
        {
            ResetFlow(row);
            await _conversations.SaveChangesAsync(cancellationToken);
            return new WhatsAppIncomingResponse("انتهت صلاحية الجلسة. اكتب «حجز» من جديد.", "idle", null);
        }

        var picked = slots.FirstOrDefault(s => s.N == choice);
        if (picked is null)
        {
            return new WhatsAppIncomingResponse(
                "الرقم غير موجود في القائمة. الرجاء اختيار رقم من القائمة:\n" +
                FormatSlotChoices(slots, tz),
                "choose_slot",
                null);
        }

        // Lock the slot for 2 minutes.
        data!.PickedDoctorId = picked.DoctorId;
        data.PickedDoctorName = picked.DoctorName;
        data.PickedStartUtc = picked.Start;
        data.Slots = null;                                      // free memory in JSON
        data.HeldUntilUtc = DateTimeOffset.UtcNow.Add(SlotHoldDuration);

        row.State = "awaiting_confirm";
        row.Data = JsonSerializer.Serialize(data, JsonOptions);
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await _conversations.SaveChangesAsync(cancellationToken);

        var slotLabel = FormatSlotLine(picked, tz);
        var visitTypeName = data.VisitTypeName ?? "زيارة";
        return new WhatsAppIncomingResponse(
            $"اخترت:\n{visitTypeName} — {slotLabel}\n\nاكتب:\n1) تأكيد ✅\n2) اختيار وقت آخر 🔄",
            "awaiting_confirm",
            null);
    }

    // ─── awaiting_confirm ────────────────────────────────────────────────────

    private async Task<WhatsAppIncomingResponse> HandleAwaitingConfirmAsync(
        ConversationState row,
        string message,
        IReadOnlyList<(Guid Id, string Name)> visitTypes,
        TimeZoneInfo tz,
        CancellationToken cancellationToken)
    {
        if (!TryParseChoice(message, out var choice) || choice is < 1 or > 2)
        {
            return new WhatsAppIncomingResponse(
                "اكتب 1 للتأكيد أو 2 لاختيار وقت آخر.",
                "awaiting_confirm",
                null);
        }

        ConversationFlowData? data = TryDeserialize(row.Data);
        if (data is null)
        {
            ResetFlow(row);
            await _conversations.SaveChangesAsync(cancellationToken);
            return new WhatsAppIncomingResponse("انتهت صلاحية الجلسة. اكتب «حجز» من جديد.", "idle", null);
        }

        if (choice == 2)
        {
            // Go back to choose_slot — re-fetch slots.
            if (data.VisitTypeId is not Guid visitTypeId)
            {
                ResetFlow(row);
                await _conversations.SaveChangesAsync(cancellationToken);
                return new WhatsAppIncomingResponse("انتهت صلاحية الجلسة. اكتب «حجز» من جديد.", "idle", null);
            }

            var newSlots = await TryBuildSlotChoicesAsync(visitTypeId, row.Phone, cancellationToken);
            if (newSlots is null || newSlots.Count == 0)
            {
                ResetFlow(row);
                await _conversations.SaveChangesAsync(cancellationToken);
                return new WhatsAppIncomingResponse(
                    "لا توجد أوقات متاحة. جرّب لاحقًا أو اتصل بالعيادة.", "idle", null);
            }

            data.Slots = newSlots;
            data.PickedDoctorId = null;
            data.PickedDoctorName = null;
            data.PickedStartUtc = null;
            data.HeldUntilUtc = null;

            row.State = "choose_slot";
            row.Data = JsonSerializer.Serialize(data, JsonOptions);
            row.UpdatedAt = DateTimeOffset.UtcNow;
            await _conversations.SaveChangesAsync(cancellationToken);

            var lines = string.Join("\n", newSlots.Select(s => $"{s.N}) {FormatSlotLine(s, tz)}"));
            return new WhatsAppIncomingResponse(
                $"اختر الوقت بإرسال الرقم:\n{lines}", "choose_slot", null);
        }

        // choice == 1  →  confirmed, ask for name.
        data.HeldUntilUtc = DateTimeOffset.UtcNow.Add(SlotHoldDuration); // refresh hold
        row.State = "awaiting_name";
        row.Data = JsonSerializer.Serialize(data, JsonOptions);
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await _conversations.SaveChangesAsync(cancellationToken);

        return new WhatsAppIncomingResponse("ما اسمك الكامل؟", "awaiting_name", null);
    }

    // ─── awaiting_name ───────────────────────────────────────────────────────

    private async Task<WhatsAppIncomingResponse> HandleAwaitingNameAsync(
        ConversationState row,
        string message,
        TimeZoneInfo tz,
        CancellationToken cancellationToken)
    {
        var name = message.Trim();
        if (!IsPlausiblePatientName(name))
            return new WhatsAppIncomingResponse(
                "الرجاء إدخال الاسم الكامل (مثال: أحمد محمد).",
                "awaiting_name",
                null);

        ConversationFlowData? data = TryDeserialize(row.Data);

        if (data?.VisitTypeId is not Guid visitTypeId)
        {
            ResetFlow(row);
            await _conversations.SaveChangesAsync(cancellationToken);
            return new WhatsAppIncomingResponse("انتهت صلاحية الجلسة. اكتب «حجز» من جديد.", "idle", null);
        }

        if (data.PickedDoctorId is not Guid doctorId || data.PickedStartUtc is not DateTimeOffset startUtc)
        {
            ResetFlow(row);
            await _conversations.SaveChangesAsync(cancellationToken);
            return new WhatsAppIncomingResponse("انتهت صلاحية الجلسة. اكتب «حجز» من جديد.", "idle", null);
        }

        try
        {
            var patient = new Patient
            {
                Name = name,
                PhoneNumber = row.Phone,
                Notes = "WhatsApp"
            };

            var createdPatient = await _patients.CreateAsync(patient, cancellationToken);

            try
            {
                var created = await _booking.CreateAppointmentAsync(
                    new CreateAppointmentRequest(
                        doctorId,
                        createdPatient.Id,
                        visitTypeId,
                        startUtc),
                    cancellationToken);

                ResetFlow(row);
                await _conversations.SaveChangesAsync(cancellationToken);

                var localTime = FormatLocalTime(created.StartTime, tz);
                var doctorName = data.PickedDoctorName ?? "الطبيب";

                var reply =
                    "تم الحجز ✅\n\n" +
                    $"📅 الموعد: {localTime}\n" +
                    $"👨‍⚕️ الدكتور: {doctorName}\n\n" +
                    "للتعديل اكتب: تعديل\n" +
                    "للإلغاء اكتب: إلغاء";

                return new WhatsAppIncomingResponse(reply, "idle", created.Id);
            }
            catch (AppointmentSlotConflictException)
            {
                await _patients.DeleteAsync(createdPatient.Id, cancellationToken);

                var alternatives = await TryBuildSlotChoicesAsync(visitTypeId, row.Phone, cancellationToken);
                if (alternatives is null || alternatives.Count == 0)
                {
                    ResetFlow(row);
                    await _conversations.SaveChangesAsync(cancellationToken);
                    return new WhatsAppIncomingResponse(
                        "عذراً، هذا الوقت تم حجزه للتو ولا توجد أوقات بديلة قريبة. اكتب «حجز» لاحقًا أو اتصل بالعيادة.",
                        "idle",
                        null);
                }

                data.Slots = alternatives;
                data.PickedDoctorId = null;
                data.PickedDoctorName = null;
                data.PickedStartUtc = null;
                data.HeldUntilUtc = null;

                row.State = "choose_slot";
                row.Data = JsonSerializer.Serialize(data, JsonOptions);
                row.UpdatedAt = DateTimeOffset.UtcNow;
                await _conversations.SaveChangesAsync(cancellationToken);

                var lines = string.Join("\n", alternatives.Select(s => $"{s.N}) {FormatSlotLine(s, tz)}"));
                return new WhatsAppIncomingResponse(
                    $"عذراً، هذا الوقت تم حجزه للتو. اختر وقتًا آخر بإرسال الرقم:\n{lines}",
                    "choose_slot",
                    null);
            }
        }
        catch (ArgumentException ex)
        {
            ResetFlow(row);
            await _conversations.SaveChangesAsync(cancellationToken);
            return new WhatsAppIncomingResponse(ex.Message, "idle", null);
        }
    }

    // ─── cancel flow ─────────────────────────────────────────────────────────

    private async Task<WhatsAppIncomingResponse> StartCancelFlowAsync(
        ConversationState row,
        string message,
        TimeZoneInfo tz,
        CancellationToken cancellationToken)
    {
        var upcoming = await _appointments.GetUpcomingByPhoneAsync(row.Phone, cancellationToken);

        if (upcoming.Count == 0)
        {
            return new WhatsAppIncomingResponse(
                "لا توجد لديك مواعيد قادمة. اكتب «حجز» لحجز موعد جديد.",
                "idle", null);
        }

        if (upcoming.Count == 1)
        {
            var (appt, doctorName, visitTypeName) = upcoming[0];
            var localTime = FormatLocalTime(appt.StartTime, tz);

            var data = new ConversationFlowData { CancelAppointmentId = appt.Id };
            row.State = "awaiting_cancel_confirm";
            row.Data = JsonSerializer.Serialize(data, JsonOptions);
            row.UpdatedAt = DateTimeOffset.UtcNow;
            await _conversations.SaveChangesAsync(cancellationToken);

            return new WhatsAppIncomingResponse(
                $"موعدك القادم:\n{visitTypeName} — {localTime} — {doctorName}\n\n" +
                "هل تريد إلغاءه؟\n1) نعم، إلغاء ❌\n2) لا، احتفظ بالموعد ✅",
                "awaiting_cancel_confirm", null);
        }

        // Multiple appointments → list them; user picks, then confirms before cancel.
        var lines = string.Join("\n", upcoming.Select((u, i) =>
        {
            var localTime = FormatLocalTime(u.Appointment.StartTime, tz);
            return $"{i + 1}) {u.VisitTypeName} — {localTime} — {u.DoctorName}";
        }));

        var cancelData = new ConversationFlowData
        {
            Slots = upcoming.Select((u, i) => new SlotOptionJson
            {
                N = i + 1,
                DoctorId = u.Appointment.Id,
                DoctorName = u.DoctorName,
                VisitTypeName = u.VisitTypeName,
                Start = u.Appointment.StartTime,
                End = u.Appointment.EndTime
            }).ToList()
        };

        row.State = "awaiting_cancel_confirm";
        row.Data = JsonSerializer.Serialize(cancelData, JsonOptions);
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await _conversations.SaveChangesAsync(cancellationToken);

        return new WhatsAppIncomingResponse(
            $"مواعيدك القادمة:\n{lines}\n\nأرسل رقم الموعد الذي تريد إلغاءه، ثم أكّد في الخطوة التالية. «لا» للرجوع.",
            "awaiting_cancel_confirm", null);
    }

    private async Task<WhatsAppIncomingResponse> HandleAwaitingCancelConfirmAsync(
        ConversationState row,
        string message,
        TimeZoneInfo tz,
        CancellationToken cancellationToken)
    {
        var data = TryDeserialize(row.Data);

        if (IsNo(message))
        {
            ResetFlow(row);
            await _conversations.SaveChangesAsync(cancellationToken);
            return new WhatsAppIncomingResponse(
                "تم الاحتفاظ بالمواعيد. اكتب «حجز» لموعد جديد أو «إلغاء» لإلغاء لاحقًا.",
                "idle", null);
        }

        if (data?.Slots is { Count: > 0 } pickSlots)
        {
            if (!TryParseChoice(message, out var choice))
            {
                return new WhatsAppIncomingResponse(
                    "أرسل رقم الموعد من القائمة أو «لا» للرجوع.",
                    "awaiting_cancel_confirm", null);
            }

            var picked = pickSlots.FirstOrDefault(s => s.N == choice);
            if (picked is null)
            {
                return new WhatsAppIncomingResponse(
                    "الرقم غير موجود. جرّب رقمًا آخر أو اكتب «لا».",
                    "awaiting_cancel_confirm", null);
            }

            var summary = $"{picked.VisitTypeName ?? "زيارة"} — {FormatLocalTime(picked.Start, tz)} — {picked.DoctorName}";
            data.CancelAppointmentId = picked.DoctorId;
            data.Slots = null;
            data.PendingCancelSummary = summary;

            row.Data = JsonSerializer.Serialize(data, JsonOptions);
            row.UpdatedAt = DateTimeOffset.UtcNow;
            await _conversations.SaveChangesAsync(cancellationToken);

            return new WhatsAppIncomingResponse(
                $"أنت على وشك إلغاء:\n{summary}\n\n1) نعم، تأكيد الإلغاء ❌\n2) لا، احتفظ بالموعد ✅",
                "awaiting_cancel_confirm", null);
        }

        if (data?.CancelAppointmentId is Guid appointmentId)
        {
            if (IsYes(message) || message.Trim() == "1")
            {
                try
                {
                    await _booking.CancelAppointmentAsync(appointmentId, cancellationToken);
                    ResetFlow(row);
                    await _conversations.SaveChangesAsync(cancellationToken);
                    return new WhatsAppIncomingResponse(
                        "تم إلغاء الموعد بنجاح ❌\nاكتب «حجز» لحجز موعد جديد.",
                        "idle", null);
                }
                catch (KeyNotFoundException)
                {
                    ResetFlow(row);
                    await _conversations.SaveChangesAsync(cancellationToken);
                    return new WhatsAppIncomingResponse(
                        "لم يُعثر على الموعد. ربما تم إلغاؤه مسبقًا.",
                        "idle", null);
                }
            }

            return new WhatsAppIncomingResponse(
                "اكتب 1 لتأكيد الإلغاء أو 2 للاحتفاظ بالموعد.",
                "awaiting_cancel_confirm", null);
        }

        ResetFlow(row);
        await _conversations.SaveChangesAsync(cancellationToken);
        return new WhatsAppIncomingResponse("انتهت صلاحية الجلسة. اكتب «إلغاء» مجدداً.", "idle", null);
    }

    // ─── Formatting helpers ───────────────────────────────────────────────────

    /// <summary>Formats a slot as "اليوم 01:15 م — د. أحمد" based on local time.</summary>
    private static string FormatSlotLine(SlotOptionJson s, TimeZoneInfo tz)
    {
        var localStart = TimeZoneInfo.ConvertTimeFromUtc(s.Start.UtcDateTime, tz);
        var todayLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz).Date;
        var slotDate = localStart.Date;

        string dayLabel;
        if (slotDate == todayLocal)
            dayLabel = "اليوم";
        else if (slotDate == todayLocal.AddDays(1))
            dayLabel = "غداً";
        else
            dayLabel = GetArabicDayName(slotDate.DayOfWeek);

        var timeLabel = FormatArabicTime(localStart);
        return $"{dayLabel} {timeLabel} — {s.DoctorName}";
    }

    private static string FormatLocalTime(DateTimeOffset utcTime, TimeZoneInfo tz)
    {
        var local = TimeZoneInfo.ConvertTimeFromUtc(utcTime.UtcDateTime, tz);
        var todayLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz).Date;
        var slotDate = local.Date;

        string dayLabel;
        if (slotDate == todayLocal)
            dayLabel = "اليوم";
        else if (slotDate == todayLocal.AddDays(1))
            dayLabel = "غداً";
        else
            dayLabel = $"{GetArabicDayName(slotDate.DayOfWeek)} {local:dd/MM}";

        return $"{dayLabel} {FormatArabicTime(local)}";
    }

    private static string FormatArabicTime(DateTime dt)
    {
        var hour12 = dt.Hour % 12;
        if (hour12 == 0) hour12 = 12;
        var amPm = dt.Hour < 12 ? "صباحًا" : "مساءً";
        return $"{hour12}:{dt.Minute:D2} {amPm}";
    }

    private static string GetArabicDayName(DayOfWeek dow) => dow switch
    {
        DayOfWeek.Saturday => "السبت",
        DayOfWeek.Sunday => "الأحد",
        DayOfWeek.Monday => "الاثنين",
        DayOfWeek.Tuesday => "الثلاثاء",
        DayOfWeek.Wednesday => "الأربعاء",
        DayOfWeek.Thursday => "الخميس",
        DayOfWeek.Friday => "الجمعة",
        _ => dow.ToString()
    };

    // ─── Hold‑slot helpers ────────────────────────────────────────────────────

    private async Task<IReadOnlyList<(Guid DoctorId, DateTimeOffset Start)>> GetHeldSlotsAsync(
        string excludePhone, CancellationToken cancellationToken)
    {
        var holds = await _conversations.GetActiveHoldsAsync(excludePhone, cancellationToken);
        var result = new List<(Guid, DateTimeOffset)>();
        foreach (var h in holds)
        {
            var d = TryDeserialize(h.Data);
            if (d?.PickedDoctorId is Guid did && d.PickedStartUtc is DateTimeOffset start)
                result.Add((did, start));
        }
        return result;
    }

    // ─── Intent helpers ───────────────────────────────────────────────────────

    private static bool IsBookingCancel(string message)
    {
        var m = message.Trim();
        return m.Equals("إلغاء", StringComparison.OrdinalIgnoreCase)
               || m.Equals("الغاء", StringComparison.OrdinalIgnoreCase)
               || m.Equals("cancel", StringComparison.OrdinalIgnoreCase)
               || m.StartsWith("الغ", StringComparison.Ordinal);
    }

    private static bool IsModificationIntent(string message)
    {
        var m = message.Trim();
        return m.Contains("تعديل", StringComparison.Ordinal)
               || m.Contains("modify", StringComparison.OrdinalIgnoreCase)
               || m.Contains("change", StringComparison.OrdinalIgnoreCase);
    }

    private static bool StartsBookingIntent(string message)
    {
        if (message.Contains("حجز", StringComparison.Ordinal)) return true;
        return message.Contains("book", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsYes(string message)
    {
        var m = message.Trim();
        return m.Equals("نعم", StringComparison.OrdinalIgnoreCase)
               || m.Equals("yes", StringComparison.OrdinalIgnoreCase)
               || m == "1";
    }

    private static bool IsNo(string message)
    {
        var m = message.Trim();
        return m.Equals("لا", StringComparison.OrdinalIgnoreCase)
               || m.Equals("no", StringComparison.OrdinalIgnoreCase)
               || m == "2";
    }

    private static string FormatVisitTypeList(IReadOnlyList<(Guid Id, string Name)> visitTypes)
    {
        if (visitTypes.Count == 0) return "(لا توجد أنواع زيارة مُعرّفة)";
        return string.Join("، ", visitTypes.Select(v => v.Name));
    }

    private static bool TryParseChoice(string message, out int choice)
    {
        choice = 0;
        var normalized = NormalizeDigits(message.Trim());
        return int.TryParse(normalized, out choice) && choice > 0;
    }

    private static string NormalizeDigits(string s)
    {
        Span<char> buffer = stackalloc char[s.Length];
        for (var i = 0; i < s.Length; i++)
        {
            buffer[i] = s[i] switch
            {
                '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
                '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
                _ => s[i]
            };
        }
        return new string(buffer);
    }

    private static ConversationFlowData? TryDeserialize(string json)
    {
        try { return JsonSerializer.Deserialize<ConversationFlowData>(json, JsonOptions); }
        catch (JsonException) { return null; }
    }

    private static string FormatSlotChoices(IReadOnlyList<SlotOptionJson>? slots, TimeZoneInfo tz)
    {
        if (slots is null || slots.Count == 0)
            return "اكتب «حجز» لعرض أوقات جديدة.";

        var lines = string.Join("\n", slots.Select(s => $"{s.N}) {FormatSlotLine(s, tz)}"));
        return $"اختر الوقت بإرسال الرقم:\n{lines}";
    }

    private async Task<List<SlotOptionJson>?> TryBuildSlotChoicesAsync(
        Guid visitTypeId,
        string excludePhone,
        CancellationToken cancellationToken)
    {
        var heldSlots = await GetHeldSlotsAsync(excludePhone, cancellationToken);
        var options = await _scheduler.GetNextBookableSlotsAcrossDoctors(
            DateTimeOffset.UtcNow,
            visitTypeId,
            maxSlots: 12,
            maxDaysAhead: 14,
            cancellationToken);

        var filtered = options
            .Where(o => !heldSlots.Any(h => h.DoctorId == o.DoctorId && h.Start == o.StartTime))
            .Take(8)
            .ToList();

        if (filtered.Count == 0)
            return null;

        var slots = new List<SlotOptionJson>(filtered.Count);
        for (var i = 0; i < filtered.Count; i++)
        {
            var o = filtered[i];
            slots.Add(new SlotOptionJson
            {
                N = i + 1,
                DoctorId = o.DoctorId,
                DoctorName = o.DoctorName,
                Start = o.StartTime,
                End = o.EndTime
            });
        }

        return slots;
    }

    private static bool IsPlausiblePatientName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return false;

        var n = name.Trim();
        if (n.Length < 3)
            return false;

        var lower = n.ToLowerInvariant();
        var blocked = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "نعم", "لا", "تم", "حجز", "إلغاء", "الغاء", "تأكيد", "تاكيد",
            "ok", "okay", "yes", "no", "cancel", "book", "confirm"
        };
        if (blocked.Contains(lower))
            return false;

        // Reject numeric-only input.
        if (n.All(char.IsDigit))
            return false;

        return true;
    }

    private static void ResetFlow(ConversationState row)
    {
        row.State = "idle";
        row.Data = "{}";
        row.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private TimeZoneInfo ResolveTimeZone(string? timeZoneId)
    {
        var id = string.IsNullOrWhiteSpace(timeZoneId) ? "Asia/Baghdad" : timeZoneId.Trim();
        try
        {
            return TZConvert.GetTimeZoneInfo(id);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unknown TimeZoneId '{TzId}'; using UTC for WhatsApp formatting.", id);
            return TimeZoneInfo.Utc;
        }
    }
}
