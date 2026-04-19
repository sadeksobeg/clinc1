-- Financial verification checks after migration rollout
-- 1) ensure paid invoices have matching payments
select i."Id" as "InvoiceId"
from "Invoices" i
left join "Payments" p on p."InvoiceId" = i."Id"
where i."Status" = 'Paid'
group by i."Id"
having count(p."Id") = 0;

-- 2) ensure ledger double-entry parity per reference
select "ReferenceType", "ReferenceId",
       sum(case when "EntryType" = 'Debit' then "Amount" else 0 end) as debit_total,
       sum(case when "EntryType" = 'Credit' then "Amount" else 0 end) as credit_total
from "LedgerEntries"
group by "ReferenceType", "ReferenceId"
having sum(case when "EntryType" = 'Debit' then "Amount" else 0 end) <>
       sum(case when "EntryType" = 'Credit' then "Amount" else 0 end);

