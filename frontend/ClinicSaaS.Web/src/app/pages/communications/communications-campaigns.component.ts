import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { McPanelComponent } from '../../core/mc-panel.component';
import { I18nService } from '../../core/i18n.service';
import { ToastService } from '../../core/toast.service';
import { EmptyStateComponent } from '../../core/empty-state.component';

type CampaignDto = { id: string; name: string; channel: string; templateCode: string; status: string; estimatedRecipients: number; createdAtUtc: string };

@Component({
  selector: 'app-communications-campaigns',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent, McPanelComponent],
  template: `
    <section class="mc-surface">
      <div class="mc-shell">
      <mc-panel [title]="i18n.t('campaigns')" class="mc-enter">
        <div class="flex items-center justify-between gap-2">
          <h1 class="text-2xl font-semibold">{{ i18n.t('campaigns') }}</h1>
          <span class="ui-status ui-status-neutral">{{ items().length }}</span>
        </div>
        <div class="ui-toolbar mt-3 grid gap-2 md:grid-cols-3">
          <input class="ui-input" [(ngModel)]="name" [placeholder]="i18n.t('name')" (keydown.escape)="resetForm()" />
          <input class="ui-input" [(ngModel)]="templateCode" [placeholder]="i18n.t('templates')" (keydown.escape)="resetForm()" />
          <input class="ui-input" type="number" [(ngModel)]="estimatedRecipients" [placeholder]="i18n.t('patients')" (keydown.enter)="create()" (keydown.escape)="resetForm()" />
        </div>
        <button class="ui-button ui-button-primary mc-button-primary mt-3" (click)="create()">{{ i18n.t('create') }}</button>
        <div class="mt-4 grid gap-2">
          @for (c of items(); track c.id) {
            <div class="mc-hover-lift rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">{{ c.name }}</div>
                <span class="ui-status" [class.ui-status-warning]="c.status==='Draft'" [class.ui-status-success]="c.status!=='Draft'">{{ c.status }}</span>
              </div>
              <div class="mt-1 text-slate-400">{{ c.templateCode }} · {{ c.estimatedRecipients }}</div>
            </div>
          } @empty {
            <app-empty-state
              icon="📣"
              [title]="i18n.t('campaignsEmptyTitle')"
              [description]="i18n.t('campaignsEmptyDesc')"
            />
          }
        </div>
      </mc-panel>
      </div>
    </section>
  `,
})
export class CommunicationsCampaignsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  items = signal<CampaignDto[]>([]);
  name = '';
  templateCode = '';
  estimatedRecipients = 100;

  ngOnInit(): void { this.load(); }
  load(): void {
    this.http.get<CampaignDto[]>('/api/communications/campaigns').subscribe({ next: (x) => this.items.set(x ?? []) });
  }
  create(): void {
    this.http.post('/api/communications/campaigns', {
      name: this.name,
      channel: 'WhatsApp',
      templateCode: this.templateCode,
      targetSegment: 'AllPatients',
      estimatedRecipients: Number(this.estimatedRecipients || 0),
    }).subscribe({
      next: () => { this.toast.show(this.i18n.t('requestSent'), 'success'); this.name = ''; this.load(); },
      error: () => this.toast.show(this.i18n.t('requestFailed'), 'error'),
    });
  }

  resetForm(): void {
    this.name = '';
    this.templateCode = '';
    this.estimatedRecipients = 100;
  }
}

