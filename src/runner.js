import { spawn } from 'node:child_process';

const OUTPUT_TAIL_LIMIT = 4000;

/**
 * Runs a test command as a subprocess and reports whether it passed.
 * Always spawns with shell: false so argv entries are passed directly to
 * the OS, never re-interpreted by a shell.
 *
 * @param {string[]} argv - command and args, e.g. ['npm', 'test']
 * @param {{cwd?: string, timeoutMs?: number}} [options]
 * @returns {Promise<object>} result record (not yet timestamped)
 */
export function runCommand(argv, options = {}) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new TypeError('argv must be a non-empty array');
  }

  const [cmd, ...args] = argv;
  const cwd = options.cwd || process.cwd();
  const timeoutMs = options.timeoutMs;

  return new Promise((resolve) => {
    const start = Date.now();
    let timedOut = false;
    let timer = null;
    let child;

    try {
      child = spawn(cmd, args, { cwd, shell: false });
    } catch (err) {
      resolve({
        command: argv.join(' '),
        exitCode: null,
        passed: false,
        durationMs: Date.now() - start,
        timedOut: false,
        error: err.message,
      });
      return;
    }

    let stdout = '';
    let stderr = '';

    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
    }

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve({
        command: argv.join(' '),
        exitCode: null,
        passed: false,
        durationMs: Date.now() - start,
        timedOut: false,
        error: err.message,
      });
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        command: argv.join(' '),
        exitCode: code,
        passed: code === 0 && !timedOut,
        durationMs: Date.now() - start,
        timedOut,
        stdoutTail: stdout.slice(-OUTPUT_TAIL_LIMIT),
        stderrTail: stderr.slice(-OUTPUT_TAIL_LIMIT),
      });
    });
  });
}
