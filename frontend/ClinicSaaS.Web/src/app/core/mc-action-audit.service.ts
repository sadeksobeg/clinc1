import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { McActionType, McPolicyKey, PolicyContext } from './mc-action.types';

@Injectable({ providedIn: 'root' })
export class McActionAuditService {
  private readonly queue: any[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly http: HttpClient) {}

  log(action: McActionType, entityId: string | null | undefined, policy: McPolicyKey | null, allowed: boolean, context: PolicyContext): void {
    const correlationId = crypto?.randomUUID?.() ?? `mc-${Date.now()}`;
    console.info(
      '[mc-action] action=%s entity=%s policy=%s allowed=%s correlation=%s ctx=%o',
      action,
      entityId ?? 'n/a',
      policy ?? 'n/a',
      allowed,
      correlationId,
      context,
    );
    this.queue.push({
      predictionId: '',
      decisionId: '',
      actionId: action,
      outcome: allowed ? 'succeeded' : 'failed',
      timestampUtc: new Date().toISOString(),
      correlationId,
      metadataJson: JSON.stringify({ policy, entityId, context }),
    });
    this.scheduleFlush();
  }

  logDecision(predictionId: string, decisionId: string, actionId: string, outcome: 'applied' | 'ignored' | 'succeeded' | 'failed', metadata?: unknown): void {
    this.queue.push({
      predictionId,
      decisionId,
      actionId,
      outcome,
      timestampUtc: new Date().toISOString(),
      correlationId: crypto?.randomUUID?.() ?? `mc-${Date.now()}`,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
    });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 1200);
  }

  private flush(): void {
    if (this.queue.length === 0) return;
    const payload = this.queue.splice(0, this.queue.length);
    this.http.post('/api/platform/intelligence/events', payload).subscribe({
      error: () => {
        // Best effort; keep local log intact if backend unreachable.
      },
    });
  }
}

