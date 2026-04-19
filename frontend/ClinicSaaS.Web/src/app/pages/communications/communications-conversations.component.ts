import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../core/i18n.service';
import { McPanelComponent } from '../../core/mc-panel.component';
import { McSignalComponent } from '../../core/mc-signal.component';
import { ToastService } from '../../core/toast.service';
import { EmptyStateComponent } from '../../core/empty-state.component';

type ConversationDto = { id: string; channel: string; contactName: string; contactPhone: string; direction: string; messagePreview: string; status: string; updatedAtUtc: string };

@Component({
  selector: 'app-communications-conversations',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent, McPanelComponent, McSignalComponent],
  template: `
    <section class="mc-surface">
      <div class="mc-shell">
      <mc-panel [title]="i18n.t('conversations')">
        <div class="ui-page-header">
          <div>
            <h1 class="ui-page-title">{{ i18n.t('conversations') }}</h1>
            <p class="ui-page-subtitle">{{ i18n.t('conversationsHint') }}</p>
          </div>
          <div class="ui-page-actions">
            <span class="ui-context-badge">Inbox Workspace</span>
            <span class="ui-status ui-status-neutral">{{ filteredItems().length }}</span>
          </div>
        </div>
        @if (!loading() && filteredItems().length === 0) {
          <div class="mt-3">
            <mc-signal
              type="info"
              [title]="i18n.t('signalNoConversationsTitle')"
              [description]="i18n.t('signalNoConversationsCopy')"
            />
          </div>
        }
        <div class="ui-toolbar-workspace mt-3 grid gap-2 md:grid-cols-4">
          <input class="ui-search md:col-span-2" [(ngModel)]="query" [placeholder]="i18n.t('searchPatientDoctor')" />
          <button type="button" class="ui-chip" [class.ui-chip-active]="statusFilter==='All'" (click)="statusFilter='All'">All</button>
          <button type="button" class="ui-chip" [class.ui-chip-active]="statusFilter==='Open'" (click)="statusFilter='Open'">Open</button>
        </div>

        <div class="mt-3 grid gap-3 xl:grid-cols-4">
          <div class="xl:col-span-2">
            @if (loading()) {
              <div class="grid gap-2">
                @for (_ of [1,2,3,4]; track _) {
                  <div class="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div class="ui-skeleton h-3 w-2/3"></div>
                    <div class="ui-skeleton mt-2 h-3 w-4/5"></div>
                  </div>
                }
              </div>
            } @else {
              <div class="grid gap-2">
                @for (c of filteredItems(); track c.id) {
                  <button
                    type="button"
                    class="mc-hover-lift w-full rounded-xl border p-3 text-start text-xs transition-colors"
                    [class]="selectedId() === c.id ? 'border-blue-400/50 bg-blue-500/10' : 'border-white/10 bg-black/20 hover:bg-black/30'"
                    (click)="selectedId.set(c.id)"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="font-medium">{{ c.contactName || c.contactPhone }} · {{ c.channel }}</div>
                      <span class="ui-status" [class.ui-status-warning]="c.status==='Open'" [class.ui-status-success]="c.status!=='Open'">{{ c.status }}</span>
                    </div>
                    <div class="mt-1 text-slate-400">{{ c.messagePreview }}</div>
                    <div class="mt-1 text-[11px] text-slate-500">{{ toDate(c.updatedAtUtc) }}</div>
                  </button>
                } @empty {
                  <app-empty-state
                    icon="✉"
                    [title]="i18n.t('communicationsEmptyTitle')"
                    [description]="i18n.t('communicationsEmptyDesc')"
                  />
                }
              </div>
            }
          </div>
          <div class="rounded-2xl border border-white/10 bg-black/20 p-3 xl:col-span-1">
            <div class="text-sm font-semibold">{{ i18n.t('messageTimeline') }}</div>
            @if (selectedConversation(); as selected) {
              <div class="mt-3 space-y-2">
                <div class="rounded-lg border border-white/10 bg-black/30 p-2 text-xs">
                  <div class="text-slate-400">{{ i18n.t('latestStatus') }}</div>
                  <div class="mt-1">{{ selected.status }} · {{ toDate(selected.updatedAtUtc) }}</div>
                </div>
                <div class="rounded-lg border border-white/10 bg-black/30 p-2 text-xs">
                  <div class="text-slate-400">Preview</div>
                  <div class="mt-1">{{ selected.messagePreview }}</div>
                </div>
              </div>
            } @else {
              <div class="mt-3">
                <app-empty-state
                  icon="💬"
                  [title]="i18n.t('communicationsSelectTitle')"
                  [description]="i18n.t('selectConversationHint')"
                />
              </div>
            }
          </div>
          <div class="rounded-2xl border border-white/10 bg-black/20 p-3 xl:col-span-1">
            <div class="text-sm font-semibold">{{ i18n.t('quickActions') }}</div>
            <div class="mt-3 grid gap-4">
              <input class="ui-input" [(ngModel)]="contactName" [placeholder]="i18n.t('contactName')" (keydown.escape)="resetComposer()" />
              <input class="ui-input" [(ngModel)]="contactPhone" [placeholder]="i18n.t('phone')" (keydown.escape)="resetComposer()" />
              <textarea class="ui-input h-24 py-2" [(ngModel)]="messagePreview" [placeholder]="i18n.t('notes')" (keydown.escape)="resetComposer()" (keydown.control.enter)="send()"></textarea>
              <button class="ui-button ui-button-primary mc-button-primary" (click)="send()">{{ i18n.t('sendRequest') }}</button>
            </div>
          </div>
        </div>
      </mc-panel>
      </div>
    </section>
  `,
})
export class CommunicationsConversationsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  items = signal<ConversationDto[]>([]);
  selectedId = signal<string | null>(null);
  contactName = '';
  contactPhone = '';
  messagePreview = '';
  query = '';
  loading = signal(false);
  private loadStartedAt = 0;
  statusFilter: 'All' | 'Open' = 'All';
  filteredItems = () =>
    this.items().filter((x) => {
      const statusOk = this.statusFilter === 'All' || x.status === this.statusFilter;
      const q = this.query.trim().toLowerCase();
      const qOk = !q || `${x.contactName} ${x.contactPhone} ${x.messagePreview}`.toLowerCase().includes(q);
      return statusOk && qOk;
    });
  selectedConversation = () => this.items().find((x) => x.id === this.selectedId()) ?? null;

  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading.set(true);
    this.loadStartedAt = Date.now();
    this.http.get<ConversationDto[]>('/api/communications/conversations').subscribe({
      next: (x) => {
        this.items.set(x ?? []);
        this.finishLoading();
      },
      error: () => this.finishLoading(),
    });
  }
  send(): void {
    this.http.post('/api/communications/conversations', {
      channel: 'WhatsApp',
      contactName: this.contactName,
      contactPhone: this.contactPhone,
      messagePreview: this.messagePreview,
    }).subscribe({
      next: () => { this.toast.show(this.i18n.t('requestSent'), 'success'); this.messagePreview = ''; this.load(); },
      error: () => this.toast.show(this.i18n.t('requestFailed'), 'error'),
    });
  }

  toDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  resetComposer(): void {
    this.contactName = '';
    this.contactPhone = '';
    this.messagePreview = '';
  }

  private finishLoading(): void {
    const elapsed = Date.now() - this.loadStartedAt;
    const delay = Math.max(0, 300 - elapsed);
    setTimeout(() => this.loading.set(false), delay);
  }
}

