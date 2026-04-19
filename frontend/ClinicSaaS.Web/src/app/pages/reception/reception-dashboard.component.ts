import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AppointmentDto,
  DoctorDto,
  DoctorStatusLatestDto,
  ReceptionApiService,
  VisitTypeDto,
} from './reception-api.service';
import { I18nService } from '../../core/i18n.service';
import { McPanelComponent } from '../../core/mc-panel.component';
import { McSignalComponent } from '../../core/mc-signal.component';
import { StartupGuideComponent } from '../../core/startup-guide.component';
import { ToastService } from '../../core/toast.service';
import { EmptyStateComponent } from '../../core/empty-state.component';

@Component({
  selector: 'app-reception-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent, McPanelComponent, McSignalComponent, StartupGuideComponent],
  template: `
    <section class="mc-surface">
      <div class="mc-shell">
      <div class="mc-hero mc-enter">
        <div class="mc-hero-grid !lg:grid-cols-[1.2fr_0.8fr_auto]">
          <div>
            <div class="mc-eyebrow mc-text-micro">Reception Mission Control</div>
            <h1 class="mt-2 mc-text-h1 text-slate-50">{{ i18n.t('reception') }}</h1>
            <p class="mc-caption mc-text-body">{{ i18n.t('receptionSubtitle') }}</p>
          </div>
          <div>
            <div class="mc-text-micro uppercase tracking-[0.2em] text-blue-100/65">Today load</div>
            <div class="mc-display mc-text-hero mt-1">{{ scheduledCount() }}</div>
            <div class="mc-text-small text-slate-300">{{ i18n.t('scheduled') }}</div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <label class="ui-label">
              {{ i18n.t('date') }}
              <input
                class="ui-input"
                type="date"
                [(ngModel)]="dateIso"
                (change)="refresh()"
              />
            </label>
            <button
              type="button"
              class="ui-button ui-button-secondary"
              (click)="refresh()"
              [disabled]="loading()"
            >
              {{ i18n.t('refresh') }}
            </button>
          </div>
        </div>
        @if (scheduledCount() === 0) {
          <div class="mt-4">
            <mc-signal
              type="info"
              [title]="i18n.t('signalNoAppointmentsTitle')"
              [description]="i18n.t('signalNoAppointmentsCopy')"
            />
          </div>
        }
      </div>

      <div class="mc-stack-panel">
        <app-startup-guide
          guideId="reception"
          [title]="i18n.t('startupGuideReceptionTitle')"
          [description]="i18n.t('startupGuideReceptionDesc')"
          [steps]="[
            i18n.t('startupGuideReceptionStep1'),
            i18n.t('startupGuideReceptionStep2'),
            i18n.t('startupGuideReceptionStep3')
          ]"
          [dismissLabel]="i18n.t('startupGuideHide')"
        />
      </div>

      <mc-panel [title]="i18n.t('doctorsStatus')">
        <div class="ui-page-header !mb-0">
        <div>
          <h2 class="mc-text-h3">{{ i18n.t('doctorsStatus') }}</h2>
          <p class="ui-page-subtitle">{{ i18n.t('latestStatus') }}</p>
        </div>
        <div class="ui-page-actions">
          <span class="ui-context-badge">Operations Desk</span>
        </div>
        </div>

      @if (error()) {
        <div class="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {{ error() }}
        </div>
      }

        <div class="mt-4 flex flex-wrap gap-2">
          @for (s of doctorStatuses(); track s.doctorId) {
            <div
              class="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm"
              [class]="statusPillClass(s)"
            >
              <span class="font-medium">{{ s.doctorName }}</span>
              <span class="text-xs opacity-80">{{ statusLabel(s) }}</span>
            </div>
          } @empty {
            <div class="text-sm text-slate-300">{{ i18n.t('noDoctors') }}</div>
          }
        </div>
      </mc-panel>

      <div class="mc-stack-panel grid gap-8 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <mc-panel [title]="i18n.t('schedule')">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-sm font-semibold">{{ i18n.t('schedule') }}</h2>
              <div class="flex items-center gap-2">
                <input
                  class="ui-input h-9"
                  [ngModel]="searchTerm()"
                  (ngModelChange)="searchTerm.set($event)"
                  [placeholder]="i18n.t('searchPatientDoctor')"
                  aria-label="Search appointments"
                />
                <select
                  class="ui-input h-9"
                  [ngModel]="statusFilter()"
                  (ngModelChange)="statusFilter.set($event)"
                  aria-label="Filter appointments"
                >
                  <option value="all">{{ i18n.t('all') }}</option>
                  <option value="scheduled">{{ i18n.t('scheduled') }}</option>
                  <option value="completed">{{ i18n.t('completed') }}</option>
                  <option value="cancelled">{{ i18n.t('cancelled') }}</option>
                  <option value="noshow">{{ i18n.t('noShow') }}</option>
                </select>
                <button type="button" class="ui-button ui-button-secondary h-9" (click)="exportVisibleAsCsv()">
                  {{ i18n.t('exportCsv') }}
                </button>
              </div>
              <div class="text-xs text-slate-400">{{ visibleAppointments().length }} {{ i18n.t('shown') }}</div>
            </div>

            @if (loading()) {
              <div class="mt-4 grid gap-3">
                @for (_ of [1, 2, 3, 4]; track _) {
                  <div class="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div class="h-4 w-1/2 animate-pulse rounded bg-white/10"></div>
                    <div class="mt-3 h-3 w-2/3 animate-pulse rounded bg-white/10"></div>
                  </div>
                }
              </div>
            } @else {
              <div class="mt-4 grid gap-3">
                @for (a of visibleAppointments(); track a.id) {
                  <div class="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div class="flex flex-wrap items-center gap-2">
                          <div class="text-sm font-semibold">{{ formatTime(a.startTime) }}</div>
                          <div class="text-xs text-slate-400">{{ doctorName(a.doctorId) }}</div>
                        </div>
                        <div class="mt-1 text-sm text-slate-100">{{ patientName(a.patientId) }}</div>
                        <div class="mt-1 text-xs text-slate-400">{{ queueLabel(a) }}</div>
                      </div>

                      <div class="flex items-center gap-2">
                        <span class="rounded-xl px-3 py-1 text-xs font-medium" [class]="statusBadgeClass(a.status)">
                          {{ appointmentStatusLabel(a.status) }}
                        </span>

                        @if (a.status === 0) {
                          <button
                            type="button"
                            class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                            (click)="setStatus(a.id, 'Completed')"
                          >
                            {{ i18n.t('completed') }}
                          </button>
                          <button
                            type="button"
                            class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                            (click)="setStatus(a.id, 'NoShow')"
                          >
                            {{ i18n.t('noShow') }}
                          </button>
                        }
                      </div>
                    </div>
                  </div>
                } @empty {
                  <app-empty-state
                    icon="📅"
                    [title]="i18n.t('receptionNoAppointmentsTitle')"
                    [description]="i18n.t('noAppointmentsForDate')"
                  />
                }
              </div>
            }
          </mc-panel>
        </div>

        <div class="grid gap-4">
          <mc-panel [title]="i18n.t('walkIn')">
            <h2 class="mc-text-h3">{{ i18n.t('walkIn') }}</h2>
            <p class="mt-1 mc-text-small text-slate-400">{{ i18n.t('walkInSubtitle') }}</p>

            <div class="mt-4 grid gap-3">
              <input
                class="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none focus:border-blue-500/60"
                [(ngModel)]="walkIn.patientName"
                [placeholder]="i18n.t('patientName')"
              />
              <input
                class="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none focus:border-blue-500/60"
                [(ngModel)]="walkIn.phoneNumber"
                [placeholder]="i18n.t('phone')"
              />
              <select
                class="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none focus:border-blue-500/60"
                [(ngModel)]="walkIn.visitTypeId"
              >
                <option value="">{{ i18n.t('visitType') }}…</option>
                @for (v of visitTypes(); track v.id) {
                  <option [value]="v.id">{{ v.name }} ({{ v.durationMinutes }}m)</option>
                }
              </select>
              <select
                class="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none focus:border-blue-500/60"
                [(ngModel)]="walkIn.doctorId"
              >
                <option value="">{{ i18n.t('autoNearest') }}</option>
                @for (d of doctors(); track d.id) {
                  <option [value]="d.id">{{ d.name }}</option>
                }
              </select>
              <input
                class="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none focus:border-blue-500/60"
                [(ngModel)]="walkIn.notes"
                [placeholder]="i18n.t('notes')"
              />
              <button
                type="button"
                class="mc-button-primary h-10 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                (click)="submitWalkIn()"
                [disabled]="walkInBusy()"
              >
                {{ i18n.t('bookWalkIn') }}
              </button>
            </div>
          </mc-panel>

          <mc-panel [title]="i18n.t('doctorDelay')">
            <h2 class="mc-text-h3">{{ i18n.t('doctorDelay') }}</h2>
            <p class="mt-1 mc-text-small text-slate-400">{{ i18n.t('doctorDelaySubtitle') }}</p>
            <div class="mt-4 grid gap-3">
              <select
                class="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none focus:border-blue-500/60"
                [(ngModel)]="delay.doctorId"
              >
                <option value="">{{ i18n.t('doctor') }}…</option>
                @for (d of doctors(); track d.id) {
                  <option [value]="d.id">{{ d.name }}</option>
                }
              </select>
              <input
                class="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none focus:border-blue-500/60"
                type="number"
                min="1"
                [(ngModel)]="delay.delayMinutes"
              />
              <button
                type="button"
                class="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm hover:bg-white/10 disabled:opacity-50"
                (click)="submitDelay()"
                [disabled]="delayBusy()"
              >
                {{ i18n.t('setDelayed') }}
              </button>
            </div>
          </mc-panel>
        </div>
      </div>
      </div>
    </section>
  `,
})
export class ReceptionDashboardComponent implements OnInit {
  private readonly api = inject(ReceptionApiService);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);

  dateIso = new Date().toISOString().slice(0, 10);

  appointments = signal<AppointmentDto[]>([]);
  doctors = signal<DoctorDto[]>([]);
  doctorStatuses = signal<DoctorStatusLatestDto[]>([]);
  visitTypes = signal<VisitTypeDto[]>([]);
  private patientNames = signal<Record<string, string>>({});

  loading = signal(false);
  error = signal<string | null>(null);
  searchTerm = signal('');
  statusFilter = signal<'all' | 'scheduled' | 'completed' | 'cancelled' | 'noshow'>('all');

  scheduledCount = computed(() => this.appointments().filter((a) => a.status === 0).length);
  visibleAppointments = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const f = this.statusFilter();
    return this.appointments().filter((a) => {
      if (f === 'scheduled' && a.status !== 0) return false;
      if (f === 'completed' && a.status !== 1) return false;
      if (f === 'cancelled' && a.status !== 2) return false;
      if (f === 'noshow' && a.status !== 3) return false;
      if (!term) return true;
      return this.patientName(a.patientId).toLowerCase().includes(term) || this.doctorName(a.doctorId).toLowerCase().includes(term);
    });
  });

  walkInBusy = signal(false);
  walkIn = { patientName: '', phoneNumber: '', notes: '', visitTypeId: '', doctorId: '' };

  delayBusy = signal(false);
  delay = { doctorId: '', delayMinutes: 15 };

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.loadDashboard(this.dateIso).subscribe({
      next: (data) => {
        this.appointments.set(data.appointments);
        this.doctors.set(data.doctors);
        this.doctorStatuses.set(data.doctorStatuses);
        this.visitTypes.set(data.visitTypes);
        const map: Record<string, string> = {};
        for (const p of data.patients) map[p.id] = p.name;
        this.patientNames.set(map);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.i18n.t('loadDataFailed'));
        this.loading.set(false);
      },
    });
  }

  patientName(id: string): string {
    return this.patientNames()[id] ?? id.slice(0, 8);
  }

  doctorName(id: string): string {
    const d = this.doctors().find((x) => x.id === id);
    return d?.name ?? id.slice(0, 8);
  }

  queueLabel(a: AppointmentDto): string {
    if (a.status !== 0) return '—';
    return a.queueNumber > 0 ? `${this.i18n.t('queue')} #${a.queueNumber}` : '—';
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

  statusLabel(s: DoctorStatusLatestDto): string {
    if (s.status === 1) return `${this.i18n.t('delayed')} (${s.delayMinutes ?? 0}${this.i18n.t('mUnit')})`;
    if (s.status === 2) return this.i18n.t('absent');
    return this.i18n.t('available');
  }

  statusPillClass(s: DoctorStatusLatestDto): string {
    if (s.status === 1) return 'border-amber-500/30 bg-amber-500/10 text-amber-50';
    if (s.status === 2) return 'border-red-500/30 bg-red-500/10 text-red-50';
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50';
  }

  setStatus(appointmentId: string, status: 'Completed' | 'NoShow'): void {
    this.api.setAppointmentStatus(appointmentId, status).subscribe({
      next: () => {
        this.toast.show(this.i18n.t('appointmentUpdated'), 'success');
        this.refresh();
      },
    });
  }

  submitWalkIn(): void {
    if (!this.walkIn.patientName.trim() || !this.walkIn.phoneNumber.trim() || !this.walkIn.visitTypeId) {
      this.toast.show(this.i18n.t('namePhoneVisitRequired'), 'error');
      return;
    }
    this.walkInBusy.set(true);
    const doctorId = this.walkIn.doctorId === '' ? null : this.walkIn.doctorId;
    this.api
      .walkIn({
        doctorId,
        visitTypeId: this.walkIn.visitTypeId,
        patientName: this.walkIn.patientName.trim(),
        phoneNumber: this.walkIn.phoneNumber.trim(),
        notes: this.walkIn.notes.trim(),
        fromDateTimeUtc: null,
      })
      .subscribe({
        next: () => {
          this.walkInBusy.set(false);
          this.toast.show(this.i18n.t('walkInBooked'), 'success');
          this.walkIn = { patientName: '', phoneNumber: '', notes: '', visitTypeId: '', doctorId: '' };
          this.refresh();
        },
        error: () => this.walkInBusy.set(false),
      });
  }

  submitDelay(): void {
    if (!this.delay.doctorId) {
      this.toast.show(this.i18n.t('chooseDoctor'), 'error');
      return;
    }
    this.delayBusy.set(true);
    this.api.setDoctorDelayed(this.delay.doctorId, this.delay.delayMinutes).subscribe({
      next: () => {
        this.delayBusy.set(false);
        this.toast.show(this.i18n.t('delayRecorded'), 'success');
        this.refresh();
      },
      error: () => this.delayBusy.set(false),
    });
  }

  exportVisibleAsCsv(): void {
    const items = this.visibleAppointments();
    if (items.length === 0) return;
    const rows = [
      [this.i18n.t('date'), this.i18n.t('doctor'), this.i18n.t('patientName'), this.i18n.t('status'), this.i18n.t('queue')],
      ...items.map((a) => [
        this.formatTime(a.startTime),
        this.doctorName(a.doctorId),
        this.patientName(a.patientId),
        this.appointmentStatusLabel(a.status),
        String(a.queueNumber),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `appointments-${this.dateIso}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

}

