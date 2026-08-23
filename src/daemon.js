import { EventEmitter } from 'node:events';
import os from 'node:os';
import { isIdle } from './idle.js';
import { runCommand } from './runner.js';
import { appendResult } from './logger.js';

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_IDLE_THRESHOLD = 0.5;

/**
 * Background loop that reruns a configured test command on an interval,
 * skipping runs while the system is busy, and appends a pass/fail JSON
 * record to a log file after each run.
 *
 * Events:
 *   'run'  (record) - a run finished and was logged
 *   'skip' (info)    - a tick was skipped because the system was busy
 *   'error'(err)     - a tick failed unexpectedly
 *   'stop' ()        - the daemon stopped (maxRuns reached or stop() called)
 */
export class Daemon extends EventEmitter {
  constructor(config = {}) {
    super();
    if (!Array.isArray(config.command) || config.command.length === 0) {
      throw new TypeError('config.command must be a non-empty argv array');
    }
    if (!config.logPath) {
      throw new TypeError('config.logPath is required');
    }

    this.command = config.command;
    this.interval = config.interval ?? DEFAULT_INTERVAL_MS;
    this.idleThreshold = config.idleThreshold ?? DEFAULT_IDLE_THRESHOLD;
    this.logPath = config.logPath;
    this.cwd = config.cwd ?? process.cwd();
    this.maxRuns = config.maxRuns ?? 0;
    this.checkIdle = config.checkIdle ?? true;
    this.timeoutMs = config.timeoutMs;

    this._timer = null;
    this._running = false;
    this._runCount = 0;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._scheduleNext();
  }

  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    const wasRunning = this._running;
    this._running = false;
    if (wasRunning) {
      this.emit('stop');
    }
  }

  get runCount() {
    return this._runCount;
  }

  _scheduleNext() {
    if (!this._running) return;
    this._timer = setTimeout(() => {
      this._tick();
    }, this.interval);
  }

  async _tick() {
    if (!this._running) return;

    try {
      if (this.checkIdle && !this._systemIsIdle()) {
        this.emit('skip', { reason: 'busy', loadavg: os.loadavg()[0] });
      } else {
        const result = await runCommand(this.command, {
          cwd: this.cwd,
          timeoutMs: this.timeoutMs,
        });
        const record = await appendResult(this.logPath, result);
        this._runCount += 1;
        this.emit('run', record);

        if (this.maxRuns > 0 && this._runCount >= this.maxRuns) {
          this.stop();
          return;
        }
      }
    } catch (err) {
      this.emit('error', err);
    }

    this._scheduleNext();
  }

  _systemIsIdle() {
    const cpuCount = os.cpus().length || 1;
    const load1 = os.loadavg()[0];
    return isIdle(load1, cpuCount, this.idleThreshold);
  }
}
