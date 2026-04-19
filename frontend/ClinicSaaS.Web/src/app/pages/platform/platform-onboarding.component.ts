import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Clinic = { id: string; name: string };
type SubscriptionItem = { id: string; tenantId: string; clinicName: string; status: string };

@Component({
  selector: 'app-platform-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="ui-layout-console">
      <div class="ui-card max-w-4xl">
        <h1 class="ui-page-title">Clinic Onboarding Wizard</h1>
        <p class="ui-page-subtitle">Create clinic, provision team, then activate subscription.</p>

        <div class="mt-4 flex flex-wrap gap-2 text-xs">
          <span class="ui-chip" [class.ui-chip-active]="step()===1">1) Clinic</span>
          <span class="ui-chip" [class.ui-chip-active]="step()===2">2) Team</span>
          <span class="ui-chip" [class.ui-chip-active]="step()===3">3) Subscription</span>
          <span class="ui-chip" [class.ui-chip-active]="step()===4">4) Done</span>
        </div>

        @if (step() === 1) {
          <div class="mt-4 grid gap-2 md:grid-cols-2">
            <input class="ui-input" [(ngModel)]="clinicName" placeholder="Clinic name" />
            <input class="ui-input" [(ngModel)]="timezone" placeholder="Time zone (IANA)" />
            <select class="ui-input" [(ngModel)]="planTier">
              <option value="Starter">Starter</option>
              <option value="Growth">Growth</option>
              <option value="Pro">Pro</option>
            </select>
            <select class="ui-input" [(ngModel)]="channel">
              <option value="WhatsApp">WhatsApp</option>
              <option value="Telegram">Telegram</option>
            </select>
            <button class="ui-button ui-button-primary md:col-span-2" (click)="createClinic()">Create clinic</button>
          </div>
        }

        @if (step() === 2) {
          <div class="mt-4 grid gap-2 md:grid-cols-2">
            <input class="ui-input" [(ngModel)]="doctorName" placeholder="Doctor name" />
            <input class="ui-input" [(ngModel)]="doctorEmail" placeholder="Doctor email" />
            <input class="ui-input md:col-span-2" [(ngModel)]="specialty" placeholder="Specialty" />
            <button class="ui-button ui-button-primary md:col-span-2" (click)="createTeam()">Create doctor + reception</button>
          </div>
        }

        @if (step() === 3) {
          <div class="mt-4 space-y-2">
            <button class="ui-button ui-button-secondary" (click)="loadSubscriptions()">Refresh requests</button>
            @for (s of subscriptions(); track s.id) {
              <div class="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
                <div class="font-semibold">{{ s.clinicName }}</div>
                <div class="mt-1 text-xs text-slate-400">{{ s.status }}</div>
                @if (s.tenantId === createdTenantId()) {
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button class="ui-button ui-button-secondary h-8 px-3" (click)="approve(s.id)">Approve</button>
                    <button class="ui-button ui-button-secondary h-8 px-3" (click)="confirmPayment(s.id)">Confirm payment</button>
                    <button class="ui-button ui-button-primary h-8 px-3" (click)="activate(s.id)">Activate</button>
                  </div>
                }
              </div>
            } @empty {
              <div class="ui-empty">No subscription requests found for this tenant yet.</div>
            }
          </div>
        }

        @if (step() === 4) {
          <div class="mt-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
            Onboarding completed. Clinic is ready for daily operations.
          </div>
        }
      </div>
    </section>
  `,
})
export class PlatformOnboardingComponent {
  private readonly http = inject(HttpClient);
  step = signal(1);
  createdTenantId = signal<string | null>(null);
  subscriptions = signal<SubscriptionItem[]>([]);

  clinicName = '';
  timezone = 'Asia/Baghdad';
  planTier = 'Growth';
  channel = 'WhatsApp';

  doctorName = '';
  doctorEmail = '';
  specialty = 'General';
  requestCreated = false;

  createClinic(): void {
    if (!this.clinicName.trim()) return;
    this.http.post<Clinic>('/api/platform/clinics', {
      name: this.clinicName.trim(),
      country: '',
      timeZoneId: this.timezone.trim(),
      subscriptionPlan: this.planTier,
      channel: this.channel,
      cycle: 'Monthly',
    }).subscribe({
      next: (x) => {
        this.createdTenantId.set(x.id);
        this.step.set(2);
      },
    });
  }

  createTeam(): void {
    const tenantId = this.createdTenantId();
    if (!tenantId || !this.doctorName.trim() || !this.doctorEmail.trim()) return;
    this.http.post(`/api/platform/clinics/${tenantId}/doctors`, {
      doctorName: this.doctorName.trim(),
      doctorEmail: this.doctorEmail.trim(),
      specialty: this.specialty.trim(),
      workingHours: null,
    }).subscribe({
      next: () => {
        this.bootstrapSubscription();
        this.step.set(3);
      },
    });
  }

  bootstrapSubscription(): void {
    const tenantId = this.createdTenantId();
    if (!tenantId || this.requestCreated) return;
    this.http.post(`/api/platform/clinics/${tenantId}/subscription-request`, {
      planTier: this.planTier,
      channel: this.channel,
      cycle: 'Monthly',
      annualDiscountPercent: 15,
      requestedByDoctorName: this.doctorName.trim(),
      requestedByDoctorEmail: this.doctorEmail.trim(),
      requestedByPhone: '',
    }).subscribe({
      next: () => {
        this.requestCreated = true;
        this.loadSubscriptions();
      },
    });
  }

  loadSubscriptions(): void {
    this.http.get<SubscriptionItem[]>('/api/platform/subscriptions').subscribe({
      next: (x) => this.subscriptions.set((x ?? []).filter((r) => r.tenantId === this.createdTenantId())),
    });
  }

  approve(id: string): void {
    this.http.post(`/api/platform/subscriptions/${id}/approve`, { note: 'Approved from onboarding wizard' }).subscribe({
      next: () => this.loadSubscriptions(),
    });
  }

  confirmPayment(id: string): void {
    this.http.post(`/api/platform/subscriptions/${id}/confirm-payment`, {
      paymentMethod: 'Cash',
      paymentReference: 'wizard-confirmed',
      note: 'Payment confirmed from onboarding wizard',
    }).subscribe({
      next: () => this.loadSubscriptions(),
    });
  }

  activate(id: string): void {
    this.http.post(`/api/platform/subscriptions/${id}/activate`, { note: 'Activated from onboarding wizard' }).subscribe({
      next: () => this.step.set(4),
    });
  }
}
