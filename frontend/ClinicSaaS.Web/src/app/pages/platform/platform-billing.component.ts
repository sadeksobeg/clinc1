import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { EmptyStateComponent } from '../../core/empty-state.component';
import { I18nService } from '../../core/i18n.service';
import { McActionComponent } from '../../core/mc-action.component';
import { McPanelComponent } from '../../core/mc-panel.component';

type InvoiceDto = { id: string; tenantId: string; tenantName: string; invoiceNumber: string; status: string; totalUsd: number; issuedAtUtc: string; paidAtUtc: string | null };

@Component({
  selector: 'app-platform-billing',
  standalone: true,
  imports: [CommonModule, McPanelComponent, EmptyStateComponent, McActionComponent],
  template: `
    <section class="mc-surface page-enter">
      <div class="mc-shell">
      <mc-panel [title]="i18n.t('billingInvoices')" [data]="invoices()">
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-2xl font-semibold">{{ i18n.t('billingInvoices') }}</h1>
          <button class="ui-button ui-button-secondary" (click)="load()">{{ i18n.t('refresh') }}</button>
        </div>
        <div class="mt-4 overflow-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-slate-400">
                <th class="px-3 py-2">{{ i18n.t('invoiceNumber') }}</th>
                <th class="px-3 py-2">Tenant</th>
                <th class="px-3 py-2">{{ i18n.t('status') }}</th>
                <th class="px-3 py-2">USD</th>
                <th class="px-3 py-2">{{ i18n.t('date') }}</th>
                <th class="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (row of invoices(); track row.id) {
                <tr class="border-t border-white/10">
                  <td class="px-3 py-2">{{ row.invoiceNumber }}</td>
                  <td class="px-3 py-2">{{ row.tenantName }}</td>
                  <td class="px-3 py-2">{{ row.status }}</td>
                  <td class="px-3 py-2">{{ row.totalUsd }}</td>
                  <td class="px-3 py-2">{{ formatDate(row.issuedAtUtc) }}</td>
                  <td class="px-3 py-2">
                    @if (row.status !== 'Paid') {
                      <mc-action type="mark-invoice-paid" [entity]="row" labelOverride="Mark paid" (done)="load()" />
                    } @else {
                      <span class="text-xs text-emerald-300">{{ formatDate(row.paidAtUtc || row.issuedAtUtc) }}</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="px-3 py-4"><mc-empty icon="🧾" [title]="i18n.t('noData')" [description]="i18n.t('noData')" /></td></tr>
              }
            </tbody>
          </table>
        </div>
      </mc-panel>
      </div>
    </section>
  `,
})
export class PlatformBillingComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly i18n = inject(I18nService);
  invoices = signal<InvoiceDto[]>([]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.http.get<InvoiceDto[]>('/api/platform/billing/invoices').subscribe({
      next: (x) => this.invoices.set(x ?? []),
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }
}

