namespace ClinicSaaS.Application.WhatsApp;

internal static class VisitTypeIntentMatcher
{
    private static readonly (string[] Tokens, string EnglishSubstring)[] SynonymGroups =
    {
        (new[] { "كشف", "كش", "معاينة", "معاينه" }, "consultation"),
        (new[] { "متابعة", "متابعه" }, "follow"),
        (new[] { "طوارئ" }, "emergency")
    };

    public static Guid? TryMatch(string rawMessage, IReadOnlyList<(Guid Id, string Name)> visitTypes)
    {
        var m = rawMessage.Trim();
        if (m.Length == 0)
            return null;

        foreach (var (id, name) in visitTypes)
        {
            if (name.Length > 0 && m.Contains(name, StringComparison.OrdinalIgnoreCase))
                return id;

            if (name.Length >= 3 && m.Length >= 3 && name.StartsWith(m, StringComparison.OrdinalIgnoreCase))
                return id;
        }

        foreach (var (tokens, englishPart) in SynonymGroups)
        {
            foreach (var token in tokens)
            {
                if (token.Length == 0)
                    continue;

                if (m.Contains(token, StringComparison.Ordinal))
                    return MatchByEnglishPart(visitTypes, englishPart);

                if (token.Length >= 2 && token.StartsWith(m, StringComparison.Ordinal) && m.Length >= 2)
                    return MatchByEnglishPart(visitTypes, englishPart);

                if (m.Length >= 2 && token.StartsWith(m, StringComparison.Ordinal))
                    return MatchByEnglishPart(visitTypes, englishPart);
            }
        }

        return null;
    }

    private static Guid? MatchByEnglishPart(IReadOnlyList<(Guid Id, string Name)> visitTypes, string englishPart)
    {
        foreach (var (id, name) in visitTypes)
        {
            if (name.Contains(englishPart, StringComparison.OrdinalIgnoreCase))
                return id;
        }

        return null;
    }
}
