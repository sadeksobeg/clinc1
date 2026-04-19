import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { I18nService } from './i18n.service';

type NotificationItemDto = { id: string; severity: string; message: string; createdAt: string };

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative">
      <button type="button" class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10" (click)="open.set(!open())">
        {{ i18n.t('operationalNotifications') }} ({{ items().length }})
      </button>
      @if (open()) {
        <div class="absolute end-0 mt-2 w-80 rounded-2xl border border-white/10 bg-slate-950 p-3 shadow-xl">
          <div class="mb-2 text-xs text-slate-400">{{ i18n.t('latestStatus') }}</div>
          <div class="grid max-h-72 gap-2 overflow-auto">
            @for (n of items(); track n.id) {
              <div class="rounded-xl border border-white/10 bg-black/20 p-2 text-xs">
                <div class="font-medium">{{ n.message }}</div>
                <div class="mt-1 text-slate-500">{{ toDate(n.createdAt) }}</div>
              </div>
            } @empty {
              <div class="text-xs text-slate-400">{{ i18n.t('noNotifications') }}</div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class NotificationCenterComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly i18n = inject(I18nService);

  open = signal(false);
  items = signal<NotificationItemDto[]>([]);

  ngOnInit(): void {
    this.http.get<NotificationItemDto[]>('/api/operations/notifications').subscribe({
      next: (x) => this.items.set(x ?? []),
      error: () => this.items.set([]),
    });
  }

  toDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }
}

