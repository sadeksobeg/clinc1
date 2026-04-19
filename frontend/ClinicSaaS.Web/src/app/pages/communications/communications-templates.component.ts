import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { McPanelComponent } from '../../core/mc-panel.component';
import { I18nService } from '../../core/i18n.service';
import { ToastService } from '../../core/toast.service';
import { EmptyStateComponent } from '../../core/empty-state.component';

type TemplateDto = { id: string; code: string; name: string; channel: string; body: string; isActive: boolean };

@Component({
  selector: 'app-communications-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent, McPanelComponent],
  template: `
    <section class="mc-surface">
      <div class="mc-shell">
      <mc-panel [title]="i18n.t('templates')" class="mc-enter">
        <div class="flex items-center justify-between gap-2">
          <h1 class="text-2xl font-semibold">{{ i18n.t('templates') }}</h1>
          <span class="ui-status ui-status-neutral">{{ items().length }}</span>
        </div>
        <div class="ui-toolbar mt-3 grid gap-2 md:grid-cols-2">
          <input class="ui-input" [(ngModel)]="code" placeholder="Code" (keydown.escape)="resetForm()" />
          <input class="ui-input" [(ngModel)]="name" [placeholder]="i18n.t('name')" (keydown.escape)="resetForm()" />
          <textarea class="ui-input md:col-span-2 h-24 py-2" [(ngModel)]="body" [placeholder]="i18n.t('notes')" (keydown.control.enter)="save()" (keydown.escape)="resetForm()"></textarea>
        </div>
        <button class="ui-button ui-button-primary mc-button-primary mt-3" (click)="save()">{{ i18n.t('create') }}</button>
        <div class="mt-4 grid gap-2">
          @for (t of items(); track t.id) {
            <div class="mc-hover-lift rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">{{ t.name }} ({{ t.code }})</div>
                <span class="ui-status" [class.ui-status-success]="t.isActive" [class.ui-status-neutral]="!t.isActive">{{ t.isActive ? 'Active' : 'Inactive' }}</span>
              </div>
              <div class="mt-1 text-slate-400">{{ t.body }}</div>
            </div>
          } @empty {
            <app-empty-state
              icon="🧩"
              [title]="i18n.t('templatesEmptyTitle')"
              [description]="i18n.t('templatesEmptyDesc')"
            />
          }
        </div>
      </mc-panel>
      </div>
    </section>
  `,
})
export class CommunicationsTemplatesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  items = signal<TemplateDto[]>([]);
  code = '';
  name = '';
  body = '';

  ngOnInit(): void { this.load(); }
  load(): void {
    this.http.get<TemplateDto[]>('/api/communications/templates').subscribe({ next: (x) => this.items.set(x ?? []) });
  }
  save(): void {
    this.http.post('/api/communications/templates', {
      code: this.code,
      name: this.name,
      channel: 'WhatsApp',
      body: this.body,
      isActive: true,
    }).subscribe({
      next: () => { this.toast.show(this.i18n.t('requestSent'), 'success'); this.body = ''; this.load(); },
      error: () => this.toast.show(this.i18n.t('requestFailed'), 'error'),
    });
  }

  resetForm(): void {
    this.code = '';
    this.name = '';
    this.body = '';
  }
}

