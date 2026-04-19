import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DoctorApiService, AppointmentDto, DoctorMeDto } from './doctor-api.service';
import { I18nService } from '../../core/i18n.service';
import { McPanelComponent } from '../../core/mc-panel.component';
import { McSignalComponent } from '../../core/mc-signal.component';
import { StartupGuideComponent } from '../../core/startup-guide.component';
import { ToastService } from '../../core/toast.service';
import { EmptyStateComponent } from '../../core/empty-state.component';

@Component({
  selector: 'app-doctor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, EmptyStateComponent, McPanelComponent, McSignalComponent, StartupGuideComponent],
  template: `
    <section class="mc-surface">
      <div class="mc-shell">
        <div class="mc-hero mc-enter">
          <div class="mc-hero-grid">
            <div>
              <div class="mc-eyebrow mc-text-micro">Doctor Mission Control</div>
              <h1 class="mt-2 mc-text-h1 tracking-tight text-slate-50">
                {{ greeting() }} {{ me()?.name || i18n.t('doctorPage') }} 👋
              </h1>
              <p class="mc-caption mc-text-body">
                {{ clinicStatusLine() }}
              </p>
            </div>
            <div>
              <div class="mc-text-micro uppercase tracking-[0.2em] text-blue-100/65">Live queue</div>
              <div class="mc-display mc-text-hero mt-1">{{ animatedWaiting() }}</div>
              <div class="mt-1 mc-text-small text-slate-300">Patients waiting now</div>
            </div>
            <a routerLink="/clinic/doctor/billing" class="mc-glow-button">
              Start Consultation
            </a>
          </div>
          @if (scheduledCount() === 0) {
            <div class="mt-4">
              <mc-signal
                type="info"
                [title]="i18n.t('signalNoQueueTitle')"
                [description]="i18n.t('signalNoQueueCopy')"
              />
            </div>
          }
        </div>

        <div class="mc-stack-panel">
          <app-startup-guide
            guideId="doctor"
            [title]="i18n.t('startupGuideDoctorTitle')"
            [description]="i18n.t('startupGuideDoctorDesc')"
            [steps]="[
              i18n.t('startupGuideDoctorStep1'),
              i18n.t('startupGuideDoctorStep2'),
              i18n.t('startupGuideDoctorStep3')
            ]"
            [ctaLabel]="i18n.t('startupGuideDoctorCta')"
            ctaRoute="/clinic/doctor/billing"
            [dismissLabel]="i18n.t('startupGuideHide')"
          />
        </div>

        <div class="mc-stack-panel grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
            <mc-panel
              title="Today timeline"
              [state]="loading() ? 'loading' : (scheduledAppointments().length === 0 ? 'empty' : 'ready')"
              emptyIcon="🗓"
              [emptyTitle]="i18n.t('doctorNoAppointmentsTitle')"
              [emptyDescription]="i18n.t('doctorNoAppointmentsDesc')"
            >
              <div panel-actions class="mc-text-small text-slate-400">{{ i18n.t('today') }}: {{ dateIso }}</div>
              <div class="mt-1 mc-timeline mc-enter-stagger">
              @for (a of scheduledAppointments(); track a.id) {
                <div class="mc-timeline-row">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <div class="mc-text-body font-semibold text-slate-100">
                        {{ formatTime(a.startTime) }} - {{ formatTime(a.endTime) }}
                      </div>
                      <div class="mt-1 mc-text-small text-slate-400">{{ i18n.t('patientName') }}: {{ a.patientId }}</div>
                      <div class="mt-1 mc-text-small text-slate-500">{{ i18n.t('queue') }}: {{ a.queueNumber > 0 ? ('#' + a.queueNumber) : '—' }}</div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="rounded-xl px-3 py-1 text-xs font-medium" [class]="statusBadgeClass(a.status)">
                        {{ appointmentStatusLabel(a.status) }}
                      </span>
                      @if (a.status === 0) {
                        <button type="button" class="ui-button ui-button-secondary h-8 px-3" (click)="setStatus(a.id, 'Completed')">
                          {{ i18n.t('completed') }}
                        </button>
                        <button type="button" class="ui-button ui-button-secondary h-8 px-3" (click)="setStatus(a.id, 'NoShow')">
                          {{ i18n.t('noShow') }}
                        </button>
                      }
                    </div>
                  </div>
                </div>
              }
              </div>
            </mc-panel>

            <div class="mc-queue" [class.mc-queue-pulse]="scheduledCount() > 0">
              <div class="mc-text-micro uppercase tracking-[0.2em] text-blue-100/60">Live queue</div>
              <h2 class="mt-2 mc-text-h3 text-slate-50">{{ i18n.t('nextPatient') }}</h2>
              @if (nextScheduled()) {
                <div class="mt-4 flex items-center gap-3">
                  <div class="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm font-semibold text-slate-100">
                    {{ initials(nextScheduled()!.patientId) }}
                  </div>
                  <div>
                    <div class="mc-text-body font-semibold text-slate-100">{{ nextScheduled()!.patientId }}</div>
                    <div class="mc-text-small text-slate-400">{{ waitLine(nextScheduled()!) }}</div>
                  </div>
                </div>
                <div class="mt-4 grid gap-2">
                  <button type="button" class="mc-glow-button !h-10 !w-full">
                    Call Patient →
                  </button>
                  <a routerLink="/clinic/doctor/billing" class="ui-button ui-button-secondary inline-flex items-center justify-center">
                    {{ i18n.t('openBillingWorkspace') }}
                  </a>
                </div>
              } @else {
                <div class="mt-3">
                  <app-empty-state
                    icon="⏳"
                    [title]="i18n.t('doctorQueueEmptyTitle')"
                    [description]="i18n.t('doctorQueueEmptyDesc')"
                  />
                </div>
              }
            </div>
          <div class="mc-insight-strip mc-enter-stagger mc-stack-panel">
            <div class="mc-mini-kpi mc-space-panel">
              <div class="mc-text-small text-slate-400">{{ i18n.t('scheduled') }}</div>
              <div class="mt-1 mc-text-h3 text-slate-100">{{ scheduledCount() }}</div>
            </div>
            <div class="mc-mini-kpi mc-space-panel">
              <div class="mc-text-small text-slate-400">No-show risk</div>
              <div class="mt-1 mc-text-h3 text-slate-100">{{ noShowRate() }}%</div>
            </div>
            <div class="mc-mini-kpi mc-space-panel">
              <div class="mc-text-small text-slate-400">Clinic load</div>
              <div class="mt-1 mc-text-h3 text-slate-100">{{ clinicLoadLabel() }}</div>
            </div>
            <div class="mc-mini-kpi mc-space-panel">
              <div class="mc-text-small text-slate-400">Revenue focus</div>
              <div class="mt-1 mc-text-h3 text-slate-100">{{ i18n.t('doctorBillingTitle') }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class DoctorDashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(DoctorApiService);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  private timer: ReturnType<typeof setInterval> | null = null;
  private waitingTimer: ReturnType<typeof setInterval> | null = null;
  private loadStartedAt = 0;

  dateIso = new Date().toISOString().slice(0, 10);
  loading = signal(false);
  me = signal<DoctorMeDto | null>(null);
  appointments = signal<AppointmentDto[]>([]);
  now = signal(Date.now());
  animatedWaiting = signal(0);

  scheduledCount = computed(() => this.appointments().filter((a) => a.status === 0).length);
  scheduledAppointments = computed(() =>
    this.appointments()
      .filter((a) => a.status === 0)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
  );
  nextScheduled = computed(() => this.scheduledAppointments()[0] ?? null);
  noShowRate = computed(() => {
    const items = this.appointments();
    if (items.length === 0) return 0;
    const noShow = items.filter((a) => a.status === 3).length;
    return Math.round((noShow / items.length) * 100);
  });
  clinicLoadLabel = computed(() => {
    const count = this.scheduledCount();
    if (count === 0) return 'Light';
    if (count <= 3) return 'Balanced';
    return 'Busy';
  });

  ngOnInit(): void {
    this.timer = setInterval(() => this.now.set(Date.now()), 60_000);
    this.loading.set(true);
    this.loadStartedAt = Date.now();
    this.api.me().subscribe({
      next: (me) => {
        this.me.set(me);
        this.api.appointmentsByDate(this.dateIso, me.id).subscribe({
          next: (appts) => {
            this.appointments.set(appts);
            this.animateWaitingTo(this.scheduledCount());
            this.finishLoading();
          },
          error: () => this.finishLoading(),
        });
      },
      error: () => this.finishLoading(),
    });
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.waitingTimer) clearInterval(this.waitingTimer);
  }

  setStatus(appointmentId: string, status: 'Completed' | 'NoShow'): void {
    this.api.setAppointmentStatus(appointmentId, status).subscribe({
      next: () => {
        this.toast.show(this.i18n.t('appointmentUpdated'), 'success');
        const me = this.me();
        if (!me) return;
        this.api.appointmentsByDate(this.dateIso, me.id).subscribe({
          next: (appts) => {
            this.appointments.set(appts);
            this.animateWaitingTo(this.scheduledCount());
          },
        });
      },
    });
  }

  greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning,';
    if (hour < 18) return 'Good afternoon,';
    return 'Good evening,';
  }

  clinicStatusLine(): string {
    const active = this.scheduledCount();
    if (active === 0) return 'Your clinic is calm right now.';
    if (active <= 3) return 'Your clinic is running smoothly.';
    return 'Your clinic is in peak mode now.';
  }

  waitLine(a: AppointmentDto): string {
    const minutes = Math.max(0, Math.floor((this.now() - new Date(a.startTime).getTime()) / 60_000));
    if (minutes === 0) return `Starts at ${this.formatTime(a.startTime)}`;
    return `Waiting ${minutes} min`;
  }

  initials(value: string): string {
    const cleaned = value.trim();
    if (!cleaned) return 'P';
    const parts = cleaned.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  private animateWaitingTo(target: number): void {
    if (this.waitingTimer) clearInterval(this.waitingTimer);
    const start = this.animatedWaiting();
    const steps = 12;
    const delta = target - start;
    let tick = 0;
    this.waitingTimer = setInterval(() => {
      tick += 1;
      const next = Math.round(start + (delta * tick) / steps);
      this.animatedWaiting.set(next);
      if (tick >= steps && this.waitingTimer) {
        clearInterval(this.waitingTimer);
        this.waitingTimer = null;
      }
    }, 26);
  }

  private finishLoading(): void {
    const elapsed = Date.now() - this.loadStartedAt;
    const delay = Math.max(0, 300 - elapsed);
    setTimeout(() => this.loading.set(false), delay);
  }

  formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  appointmentStatusLabel(status: number): string {
    switch (status) {
      case 0:
        return this.i18n.t('scheduled');
      case 1:
        return this.i18n.t('completed');
      case 2:
        return this.i18n.t('cancelled');
      case 3:
        return this.i18n.t('noShow');
      default:
        return `#${status}`;
    }
  }

  statusBadgeClass(status: number): string {
    switch (status) {
      case 0:
        return 'bg-blue-500/10 text-blue-100 border border-blue-500/30';
      case 1:
        return 'bg-emerald-500/10 text-emerald-100 border border-emerald-500/30';
      case 2:
        return 'bg-slate-500/10 text-slate-100 border border-slate-500/30';
      case 3:
        return 'bg-amber-500/10 text-amber-100 border border-amber-500/30';
      default:
        return 'bg-white/10 text-slate-100 border border-white/10';
    }
  }
}

