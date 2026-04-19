import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmptyStateComponent } from '../../core/empty-state.component';
import { I18nService } from '../../core/i18n.service';
import { McPanelComponent } from '../../core/mc-panel.component';

type AuditDto = { id: string; action: string; entityType: string; entityId: string; timestamp: string };

@Component({
  selector: 'app-platform-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, McPanelComponent, EmptyStateComponent],
  template: `
    <section class="mc-surface page-enter">
      <div class="mc-shell">
      <mc-panel [title]="i18n.t('auditLog')" [data]="audit()">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <h1 class="text-2xl font-semibold">{{ i18n.t('auditLog') }}</h1>
            <p class="mt-1 text-xs text-slate-400">{{ i18n.t('auditHint') }}</p>
          </div>
          <button class="ui-button ui-button-secondary" (click)="loadAudit()">{{ i18n.t('refresh') }}</button>
        </div>
        <div class="mt-4 grid gap-2">
          @for (item of audit(); track item.id) {
            <div class="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
              <div class="font-medium">{{ item.action }}</div>
              <div class="mt-1 text-xs text-slate-400">{{ item.entityType }} · {{ item.entityId }}</div>
              <div class="mt-1 text-[11px] text-slate-500">{{ formatDate(item.timestamp) }}</div>
            </div>
          } @empty {
            <mc-empty icon="🧭" [title]="i18n.t('noData')" [description]="i18n.t('noData')" />
          }
        </div>
      </mc-panel>
      </div>
    </section>
  `,
})
export class PlatformAuditComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly i18n = inject(I18nService);

  audit = signal<AuditDto[]>([]);

  ngOnInit(): void {
    this.loadAudit();
  }

  loadAudit(): void {
    this.http.get<AuditDto[]>('/api/platform/activity').subscribe({
      next: (x) => this.audit.set(x ?? []),
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }
}

