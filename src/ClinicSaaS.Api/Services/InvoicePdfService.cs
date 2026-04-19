using System.Text;
using ClinicSaaS.Domain.Entities;

namespace ClinicSaaS.Api.Services;

public sealed class InvoicePdfService
{
    public byte[] Render(Invoice invoice)
    {
        // Lightweight placeholder payload to keep API contract ready for PDF integration.
        var content = $"INVOICE {invoice.InvoiceNumber}\nAmount: {invoice.Amount} {invoice.Currency}\nIssued: {invoice.IssuedAtUtc:O}";
        return Encoding.UTF8.GetBytes(content);
    }
}

