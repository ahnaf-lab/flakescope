// Splits a shell-style command string into an argv array without ever
// invoking a shell. Supports single- and double-quoted segments so that
// commands like `node -e "console.log(1)"` split as intended. This is what
// lets the runner call child_process.spawn(cmd, args, { shell: false }),
// which avoids shell metacharacter injection entirely.

/**
 * @param {string} command
 * @returns {string[]} argv, e.g. ['npm', 'test']
 */
export function tokenizeCommand(command) {
  if (typeof command !== 'string') {
    throw new TypeError('command must be a string');
  }
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error('command must not be empty');
  }

  const tokens = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }

  if (quote) {
    throw new Error(`unterminated quote in command: ${command}`);
  }
  if (current) {
    tokens.push(current);
  }
  if (tokens.length === 0) {
    throw new Error('command must not be empty');
  }

  return tokens;
}
