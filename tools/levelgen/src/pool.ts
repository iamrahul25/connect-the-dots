import os from 'node:os';
import { Worker } from 'node:worker_threads';
import type { Candidate, GenParams, RejectReason } from '@ctd/core';

export interface AttemptTask {
  id: number;
  params: GenParams;
  seeds: number[];
}

export interface AttemptResult {
  candidate: Candidate | null;
  reject: RejectReason | null;
  /** Worker compute time of this attempt. */
  ms: number;
}

/** Returns true to stop the run. */
export type Consume = (result: AttemptResult, attempt: number) => boolean;

interface Run {
  params: GenParams;
  seedOf: (attempt: number) => number;
  max: number;
  /** Next attempt index to hand to a worker. */
  next: number;
  /** Next attempt index to hand to `consume`. */
  consumed: number;
  /** Finished chunks keyed by their first attempt index, waiting for earlier chunks. */
  ready: Map<number, AttemptResult[]>;
  consume: Consume;
  resolve: () => void;
  reject: (e: unknown) => void;
}

export const defaultWorkerCount = () => os.availableParallelism();

/**
 * Runs `generateAttempt` on worker threads. Results are consumed strictly in
 * attempt order, so dedupe, early stopping and stats match a sequential loop.
 */
export class AttemptPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly tasks = new Map<number, { run: Run; start: number }>();
  private current: Run | null = null;
  private nextTaskId = 0;
  private error: unknown = null;

  constructor(
    readonly size = defaultWorkerCount(),
    private readonly chunk = 1,
  ) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./attempt-worker.ts', import.meta.url));
      w.on('message', (m: { id: number; results: AttemptResult[] }) => this.onResult(w, m));
      w.on('error', (e) => this.fail(e));
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  run(params: GenParams, seedOf: (attempt: number) => number, max: number, consume: Consume): Promise<void> {
    if (this.current) throw new Error('AttemptPool.run: a run is already in progress');
    if (this.error) return Promise.reject(this.error);
    if (max <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.current = { params, seedOf, max, next: 0, consumed: 0, ready: new Map(), consume, resolve, reject };
      this.pump();
    });
  }

  close(): Promise<number[]> {
    return Promise.all(this.workers.map((w) => w.terminate()));
  }

  private pump(): void {
    const run = this.current;
    while (run && this.idle.length && run.next < run.max) {
      const start = run.next;
      const end = Math.min(run.max, start + this.chunk);
      run.next = end;
      const id = this.nextTaskId++;
      this.tasks.set(id, { run, start });
      const seeds = Array.from({ length: end - start }, (_, i) => run.seedOf(start + i));
      this.idle.pop()!.postMessage({ id, params: run.params, seeds } satisfies AttemptTask);
    }
  }

  private onResult(w: Worker, { id, results }: { id: number; results: AttemptResult[] }): void {
    const task = this.tasks.get(id)!;
    this.tasks.delete(id);
    this.idle.push(w);
    // Results from a run that already stopped early are dropped.
    if (task.run === this.current) {
      task.run.ready.set(task.start, results);
      this.drain(task.run);
    }
    this.pump();
  }

  private drain(run: Run): void {
    try {
      while (run.ready.has(run.consumed)) {
        const results = run.ready.get(run.consumed)!;
        run.ready.delete(run.consumed);
        for (const r of results) {
          if (run.consume(r, run.consumed++)) return this.finish(run);
        }
      }
      if (run.consumed >= run.max) this.finish(run);
    } catch (e) {
      this.current = null;
      run.reject(e);
    }
  }

  private finish(run: Run): void {
    this.current = null;
    run.resolve();
  }

  private fail(e: unknown): void {
    this.error = e;
    const run = this.current;
    this.current = null;
    run?.reject(e);
  }
}
