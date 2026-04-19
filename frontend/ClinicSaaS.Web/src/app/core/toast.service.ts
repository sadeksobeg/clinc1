import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<{ text: string; kind: ToastKind } | null>(null);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  show(text: string, kind: ToastKind = 'info', ms = 4200): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.message.set({ text, kind });
    this.hideTimer = setTimeout(() => this.message.set(null), ms);
  }

  dismiss(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.message.set(null);
  }
}
