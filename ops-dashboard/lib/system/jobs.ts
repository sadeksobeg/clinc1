import type { Pool, PoolClient } from "pg";

type Db = Pool | PoolClient;

export type JobStatus = "queued" | "running" | "retrying" | "failed_dead" | "completed" | "cancelled";

export async function enqueueSystemJob(
  db: Db,
  args: {
    clinicId?: number | null;
    jobType: string;
    queueKey?: string;
    priority?: number;
    maxAttempts?: number;
    runAfter?: string;
    idempotencyKey?: string;
    payload?: Record<string, unknown>;
  },
): Promise<{ id: number }> {
  const r = await db.query(
    `INSERT INTO system_jobs
      (clinic_id, job_type, status, priority, queue_key, max_attempts, run_after, idempotency_key, payload, updated_at)
     VALUES ($1, $2, 'queued', $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7, $8::jsonb, NOW())
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
     DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [
      args.clinicId ?? null,
      args.jobType,
      Math.min(100, Math.max(1, Number(args.priority || 50))),
      args.queueKey || "default",
      Math.min(10, Math.max(1, Number(args.maxAttempts || 5))),
      args.runAfter ?? null,
      args.idempotencyKey ?? null,
      JSON.stringify(args.payload ?? {}),
    ],
  );
  return { id: Number(r.rows[0]?.id || 0) };
}

export async function listSystemJobs(
  db: Db,
  args: { clinicId?: number | null; status?: JobStatus | "all"; limit?: number; queueKey?: string },
) {
  const r = await db.query(
    `SELECT id, clinic_id, job_type, status, priority, queue_key, attempts, max_attempts,
            run_after, idempotency_key, payload, last_error, created_at, updated_at, completed_at
     FROM system_jobs
     WHERE ($1::bigint IS NULL OR clinic_id = $1 OR clinic_id IS NULL)
       AND ($2::text = 'all' OR status = $2::text)
       AND ($3::text IS NULL OR queue_key = $3::text)
     ORDER BY
       CASE status WHEN 'failed_dead' THEN 0 WHEN 'retrying' THEN 1 WHEN 'queued' THEN 2 WHEN 'running' THEN 3 ELSE 4 END,
       priority ASC,
       run_after ASC
     LIMIT $4`,
    [args.clinicId ?? null, args.status || "all", args.queueKey ?? null, Math.min(500, Math.max(10, Number(args.limit || 100)))],
  );
  return r.rows;
}

export async function cancelSystemJob(db: Db, jobId: number): Promise<boolean> {
  const r = await db.query(
    `UPDATE system_jobs
     SET status = 'cancelled', updated_at = NOW(), completed_at = NOW()
     WHERE id = $1
       AND status IN ('queued', 'retrying', 'running')
     RETURNING id`,
    [jobId],
  );
  return Boolean(r.rowCount);
}

export async function retrySystemJob(db: Db, jobId: number): Promise<boolean> {
  const r = await db.query(
    `UPDATE system_jobs
     SET status = 'queued',
         run_after = NOW(),
         last_error = NULL,
         updated_at = NOW()
     WHERE id = $1
       AND status IN ('failed_dead', 'retrying')
     RETURNING id`,
    [jobId],
  );
  return Boolean(r.rowCount);
}

function retryDelayMs(attemptNo: number): number {
  const base = Math.min(15 * 60 * 1000, 30_000 * Math.max(1, attemptNo));
  return base;
}

export async function runSingleDueJob(
  db: Db,
  runner: (args: { jobType: string; payload: Record<string, unknown>; clinicId: number | null; jobId: number }) => Promise<{ ok: boolean; output?: Record<string, unknown>; error?: string }>,
): Promise<{ ran: boolean; jobId?: number; status?: JobStatus }> {
  const pick = await db.query(
    `SELECT id, clinic_id, job_type, payload, attempts, max_attempts
     FROM system_jobs
     WHERE status IN ('queued', 'retrying')
       AND run_after <= NOW()
     ORDER BY priority ASC, run_after ASC
     LIMIT 1`,
  );
  const job = pick.rows[0] as
    | {
        id: number;
        clinic_id: number | null;
        job_type: string;
        payload: Record<string, unknown>;
        attempts: number;
        max_attempts: number;
      }
    | undefined;
  if (!job) return { ran: false };

  await db.query(`UPDATE system_jobs SET status = 'running', attempts = attempts + 1, updated_at = NOW() WHERE id = $1`, [job.id]);
  const attemptNo = Number(job.attempts || 0) + 1;
  await db.query(`INSERT INTO system_job_attempts (job_id, attempt_no) VALUES ($1, $2)`, [job.id, attemptNo]);

  const out: { ok: boolean; output?: Record<string, unknown>; error?: string } = await runner({
    jobType: job.job_type,
    payload: (job.payload || {}) as Record<string, unknown>,
    clinicId: job.clinic_id,
    jobId: job.id,
  }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "runner_failed" }));

  if (out.ok) {
    await db.query(
      `UPDATE system_jobs
       SET status = 'completed', completed_at = NOW(), last_error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [job.id],
    );
    await db.query(
      `UPDATE system_job_attempts
       SET ended_at = NOW(), ok = TRUE, output = $2::jsonb
       WHERE job_id = $1 AND attempt_no = $3`,
      [job.id, JSON.stringify(out.output ?? {}), attemptNo],
    );
    return { ran: true, jobId: job.id, status: "completed" };
  }

  const maxAttempts = Number(job.max_attempts || 5);
  const terminal = attemptNo >= maxAttempts;
  const nextStatus: JobStatus = terminal ? "failed_dead" : "retrying";
  await db.query(
    `UPDATE system_jobs
     SET status = $2,
         run_after = CASE WHEN $2 = 'retrying' THEN NOW() + ($3::int || ' milliseconds')::interval ELSE run_after END,
         last_error = $4,
         updated_at = NOW(),
         completed_at = CASE WHEN $2 = 'failed_dead' THEN NOW() ELSE completed_at END
     WHERE id = $1`,
    [job.id, nextStatus, retryDelayMs(attemptNo), out.error || "job_failed"],
  );
  await db.query(
    `UPDATE system_job_attempts
     SET ended_at = NOW(), ok = FALSE, error_text = $2
     WHERE job_id = $1 AND attempt_no = $3`,
    [job.id, out.error || "job_failed", attemptNo],
  );
  return { ran: true, jobId: job.id, status: nextStatus };
}
