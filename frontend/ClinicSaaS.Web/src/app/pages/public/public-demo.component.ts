import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../core/i18n.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-public-demo',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="ui-shell page-enter">
      <div class="ui-card max-w-2xl">
        <h1 class="text-2xl font-semibold">{{ i18n.t('requestDemo') }}</h1>
        <p class="mt-2 text-sm text-slate-300">{{ i18n.t('demoSubtitle') }}</p>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <input class="ui-input" [(ngModel)]="clinicName" [placeholder]="i18n.t('clinicName')" />
          <input class="ui-input" [(ngModel)]="contactName" [placeholder]="i18n.t('contactName')" />
          <input class="ui-input" [(ngModel)]="contactEmail" [placeholder]="i18n.t('contactEmail')" />
          <input class="ui-input" [(ngModel)]="contactPhone" [placeholder]="i18n.t('phone')" />
          <textarea class="ui-input md:col-span-2 h-24 py-2" [(ngModel)]="notes" [placeholder]="i18n.t('notes')"></textarea>
        </div>
        <button type="button" class="ui-button ui-button-primary mt-3" (click)="submit()">{{ i18n.t('sendRequest') }}</button>
      </div>
    </section>
  `,
})
export class PublicDemoComponent {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);

  clinicName = '';
  contactName = '';
  contactEmail = '';
  contactPhone = '';
  notes = '';

  submit(): void {
    if (!this.clinicName.trim() || !this.contactName.trim() || !this.contactEmail.trim()) return;
    this.http.post('/api/operations/leads', {
      clinicName: this.clinicName.trim(),
      contactName: this.contactName.trim(),
      contactEmail: this.contactEmail.trim(),
      contactPhone: this.contactPhone.trim(),
      preferredChannel: 'WhatsApp',
      notes: this.notes.trim(),
    }).subscribe({
      next: () => {
        this.toast.show(this.i18n.t('requestSent'), 'success');
        this.notes = '';
      },
      error: () => this.toast.show(this.i18n.t('requestFailed'), 'error'),
    });
  }
}

