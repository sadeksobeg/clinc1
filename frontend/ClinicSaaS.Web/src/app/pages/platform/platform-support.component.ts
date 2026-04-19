import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmptyStateComponent } from '../../core/empty-state.component';
import { I18nService } from '../../core/i18n.service';
import { McActionComponent } from '../../core/mc-action.component';
import { McPanelComponent } from '../../core/mc-panel.component';
import { StartupGuideComponent } from '../../core/startup-guide.component';

type SupportConversation = {
  id: string;
  tenantId: string;
  tenantName: string;
  subject: string;
  status: string;
  priority: string;
  assignedUserId: string | null;
  unreadCount: number;
  updatedAtUtc: string;
};

type SupportMessage = {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  senderType: string;
  body: string;
  isInternalNote: boolean;
  createdAtUtc: string;
};

@Component({
  selector: 'app-platform-support',
  standalone: true,
  imports: [CommonModule, FormsModule, McPanelComponent, EmptyStateComponent, McActionComponent, StartupGuideComponent],
  template: `
    <section class="mc-surface">
      <div class="mc-shell">
        <div class="mc-hero mc-enter">
          <div class="mc-hero-grid !lg:grid-cols-[1.2fr_0.8fr_auto]">
            <div>
              <div class="mc-eyebrow mc-text-micro">Support Operations</div>
              <h1 class="mt-2 mc-text-h1 text-slate-50">{{ i18n.t('supportInboxTitle') }}</h1>
              <p class="mc-caption mc-text-body">{{ i18n.t('supportInboxSubtitle') }}</p>
            </div>
            <div>
              <div class="mc-text-small text-slate-300">{{ i18n.t('openConversationsLabel') }}</div>
              <div class="mt-1 mc-text-h3 text-slate-100">{{ openCount() }}</div>
            </div>
            <button class="ui-button ui-button-secondary" (click)="loadConversations()">{{ i18n.t('refresh') }}</button>
          </div>
        </div>

        <div class="mc-stack-panel">
          <app-startup-guide
            guideId="support"
            [title]="i18n.t('startupGuideSupportTitle')"
            [description]="i18n.t('startupGuideSupportDesc')"
            [steps]="[
              i18n.t('startupGuideSupportStep1'),
              i18n.t('startupGuideSupportStep2'),
              i18n.t('startupGuideSupportStep3')
            ]"
            [dismissLabel]="i18n.t('startupGuideHide')"
          />
        </div>

        <div class="mc-stack-panel grid gap-6 xl:grid-cols-[0.95fr_1.4fr_0.9fr]">
          <mc-panel [title]="i18n.t('supportInboxTitle')">
            <input class="ui-input h-10 w-full" [(ngModel)]="query" [placeholder]="i18n.t('searchTenantOrSubject')" />
            <div class="mt-4 max-h-[44rem] overflow-auto space-y-2">
              @for (c of filteredConversations(); track c.id) {
                <button
                  type="button"
                  class="mc-hover-lift w-full rounded-2xl border p-3 text-left"
                  [class]="selectedId() === c.id ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 bg-black/20'"
                  (click)="select(c.id)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="mc-text-body font-semibold">{{ c.tenantName || c.tenantId }}</div>
                    <span class="ui-status" [class]="priorityBadgeClass(c.priority)">{{ c.priority }}</span>
                  </div>
                  <div class="mt-1 mc-text-small text-slate-200">{{ c.subject }}</div>
                  <div class="mt-2 flex items-center justify-between mc-text-micro text-slate-400">
                    <span>{{ i18n.t('unreadLabel') }}: {{ c.unreadCount }}</span>
                    <span [class]="slaClass(c.updatedAtUtc, c.priority)">{{ slaLabel(c.updatedAtUtc, c.priority) }}</span>
                  </div>
                </button>
              } @empty {
                <mc-empty icon="✉" [title]="i18n.t('supportNoConversations')" [description]="i18n.t('supportNoConversations')" />
              }
            </div>
          </mc-panel>

          <mc-panel [title]="i18n.t('messageTimeline')">
            @if (selectedConversation(); as selected) {
              <div class="flex items-center justify-between">
                <div>
                  <div class="mc-text-h3">{{ selected.subject }}</div>
                  <div class="mc-text-small text-slate-400">{{ selected.tenantName || selected.tenantId }} · {{ toDate(selected.updatedAtUtc) }}</div>
                </div>
                <mc-action
                  type="close-conversation"
                  [entity]="selected"
                  [labelOverride]="i18n.t('close')"
                  (done)="loadConversations()"
                />
              </div>
              <div class="mt-4 max-h-[30rem] space-y-3 overflow-auto rounded-2xl border border-white/10 bg-black/20 p-3">
                @for (m of messages(); track m.id) {
                  <div class="max-w-[86%] rounded-2xl px-3 py-2 mc-text-small"
                    [class]="messageBubbleClass(m)">
                    <div class="mc-text-micro text-slate-400">{{ messageSenderLabel(m.senderType, m.isInternalNote) }} · {{ toDate(m.createdAtUtc) }}</div>
                    <div class="mt-1 whitespace-pre-wrap text-slate-100">{{ m.body }}</div>
                  </div>
                } @empty {
                  <mc-empty icon="💬" [title]="i18n.t('supportNoMessages')" [description]="i18n.t('supportNoMessages')" />
                }
              </div>
              <div class="mt-4 grid gap-3">
                <textarea class="ui-input h-28 py-2" [(ngModel)]="replyBody" [placeholder]="i18n.t('supportReplyPlaceholder')"></textarea>
                <label class="mc-text-small text-slate-400"><input type="checkbox" [(ngModel)]="internalNote" /> {{ i18n.t('internalNoteLabel') }}</label>
                <div class="grid gap-2 md:grid-cols-2">
                  <button class="ui-button ui-button-primary mc-button-primary" (click)="reply()">{{ i18n.t('sendRequest') }}</button>
                  <mc-action
                    type="close-conversation"
                    [entity]="selected"
                    [labelOverride]="i18n.t('supportResolveAndClose')"
                    (done)="loadConversations()"
                  />
                </div>
              </div>
            } @else {
              <mc-empty icon="◎" [title]="i18n.t('selectConversationHint')" [description]="i18n.t('selectConversationHint')" />
            }
          </mc-panel>

          <mc-panel [title]="i18n.t('supportContextTitle')">
            @if (selectedConversation(); as selected) {
              <div class="mt-4 grid gap-3">
                <div class="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div class="mc-text-small text-slate-400">{{ i18n.t('clinicName') }}</div>
                  <div class="mt-1 mc-text-body font-semibold">{{ selected.tenantName || selected.tenantId }}</div>
                </div>
                <div class="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div class="mc-text-small text-slate-400">{{ i18n.t('status') }}</div>
                  <div class="mt-1 mc-text-body font-semibold">{{ selected.status }}</div>
                </div>
                <div class="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div class="mc-text-small text-slate-400">{{ i18n.t('priority') }}</div>
                  <div class="mt-1 mc-text-body font-semibold">{{ selected.priority }}</div>
                </div>
                <div class="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div class="mc-text-small text-slate-400">{{ i18n.t('assignedToLabel') }}</div>
                  <div class="mt-1 mc-text-small text-slate-300">{{ ownershipLabel(selected.assignedUserId) }}</div>
                </div>
                <input class="ui-input" [(ngModel)]="assignedUserId" [placeholder]="i18n.t('assignedUserPlaceholder')" />
                <select class="ui-input" [(ngModel)]="priority">
                  <option value="Low">Low</option>
                  <option value="Normal">Normal</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
                <mc-action
                  type="assign-conversation"
                  [entity]="selected"
                  [payload]="{ assignedUserId: assignedUserId.trim() || null, priority }"
                  [labelOverride]="i18n.t('applyAssignment')"
                  (done)="loadConversations()"
                />
                <button class="ui-button ui-button-secondary" (click)="activateAndResolve(selected)">{{ i18n.t('supportResolveActivate') }}</button>
              </div>
            } @else {
              <div class="mt-4">
                <mc-empty icon="ℹ" [title]="i18n.t('supportNoContext')" [description]="i18n.t('supportNoContext')" />
              </div>
            }
          </mc-panel>
        </div>
      </div>
    </section>
  `,
})
export class PlatformSupportComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly i18n = inject(I18nService);
  conversations = signal<SupportConversation[]>([]);
  selectedId = signal<string | null>(null);
  messages = signal<SupportMessage[]>([]);
  query = '';
  replyBody = '';
  internalNote = false;
  assignedUserId = '';
  priority = 'Normal';

  readonly filteredConversations = computed(() => {
    const q = this.query.trim().toLowerCase();
    const rows = this.conversations().filter((x) => !q || `${x.tenantName} ${x.subject}`.toLowerCase().includes(q));
    return [...rows].sort((a, b) => this.conversationPriorityScore(b) - this.conversationPriorityScore(a));
  });

  readonly selectedConversation = computed(() => this.conversations().find((x) => x.id === this.selectedId()) ?? null);
  readonly openCount = computed(() => this.conversations().filter((x) => x.status.toLowerCase() === 'open').length);

  ngOnInit(): void {
    this.loadConversations();
  }

  loadConversations(): void {
    this.http.get<SupportConversation[]>('/api/platform/support/conversations').subscribe({
      next: (rows) => {
        this.conversations.set(rows ?? []);
        if (!this.selectedId() && rows?.length) {
          this.select(rows[0].id);
        }
      },
    });
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.http.get<SupportMessage[]>(`/api/platform/support/conversations/${id}/messages`).subscribe({
      next: (rows) => this.messages.set(rows ?? []),
    });
  }

  reply(): void {
    const id = this.selectedId();
    if (!id || !this.replyBody.trim()) return;
    this.http.post('/api/platform/support/reply', { conversationId: id, body: this.replyBody.trim(), isInternalNote: this.internalNote }).subscribe({
      next: () => {
        this.replyBody = '';
        this.internalNote = false;
        this.select(id);
        this.loadConversations();
      },
    });
  }

  close(conversationId: string): void {
    this.http.post('/api/platform/support/close', { conversationId }).subscribe({
      next: () => this.loadConversations(),
    });
  }

  activateAndResolve(selected: SupportConversation): void {
    this.http.post(`/api/platform/clinics/${selected.tenantId}/reactivate`, {}).subscribe({
      next: () => this.close(selected.id),
    });
  }

  toDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  priorityBadgeClass(priority: string): string {
    const p = priority.toLowerCase();
    if (p === 'urgent') return 'mc-priority-urgent';
    if (p === 'high') return 'mc-priority-high';
    if (p === 'low') return 'mc-priority-low';
    return 'mc-priority-normal';
  }

  messageBubbleClass(m: SupportMessage): string {
    if (m.isInternalNote) return 'ms-auto border border-amber-500/30 bg-amber-500/10';
    if ((m.senderType || '').toLowerCase().includes('agent')) return 'ms-auto border border-blue-500/30 bg-blue-500/10';
    if ((m.senderType || '').toLowerCase().includes('system')) return 'me-auto border border-purple-500/30 bg-purple-500/10';
    return 'me-auto border border-white/10 bg-white/5';
  }

  messageSenderLabel(senderType: string, isInternal: boolean): string {
    if (isInternal) return this.i18n.t('internalNoteLabel');
    if ((senderType || '').toLowerCase().includes('agent')) return this.i18n.t('agentLabel');
    if ((senderType || '').toLowerCase().includes('system')) return this.i18n.t('systemLabel');
    return this.i18n.t('tenantLabel');
  }

  slaLabel(updatedAt: string, priority: string): string {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000));
    const remaining = this.slaTarget(priority) - minutes;
    return `${this.i18n.t('slaLabel')} ${remaining > 0 ? remaining : 0}m`;
  }

  slaClass(updatedAt: string, priority: string): string {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000));
    const remaining = this.slaTarget(priority) - minutes;
    if (remaining <= 5) return 'text-red-300';
    if (remaining <= 15) return 'text-amber-300';
    return 'text-emerald-300';
  }

  ownershipLabel(assignedUserId: string | null): string {
    if (!assignedUserId) return this.i18n.t('unassignedLabel');
    if (assignedUserId.toLowerCase() === 'you') return this.i18n.t('assignedToYouLabel');
    return assignedUserId;
  }

  private conversationPriorityScore(c: SupportConversation): number {
    const unreadWeight = c.unreadCount > 0 ? 100 : 0;
    const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(c.updatedAtUtc).getTime()) / 60000));
    return this.priorityWeight(c.priority) + unreadWeight + ageMinutes;
  }

  private priorityWeight(priority: string): number {
    const p = priority.toLowerCase();
    if (p === 'urgent') return 400;
    if (p === 'high') return 300;
    if (p === 'normal') return 200;
    return 100;
  }

  private slaTarget(priority: string): number {
    const p = priority.toLowerCase();
    if (p === 'urgent') return 30;
    if (p === 'high') return 60;
    if (p === 'normal') return 120;
    return 240;
  }
}
