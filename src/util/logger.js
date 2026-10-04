'use strict';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[process.env.HIPKOP_LOG_LEVEL || 'info'] ?? LEVELS.info;

const stamp = () => new Date().toISOString();

const emit = (level, scope, args) => {
  if (LEVELS[level] > threshold) return;
  const line = `[${stamp()}] ${level.toUpperCase()} ${scope}`;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(line, ...args);
};

module.exports = (scope) => ({
  error: (...args) => emit('error', scope, args),
  warn: (...args) => emit('warn', scope, args),
  info: (...args) => emit('info', scope, args),
  debug: (...args) => emit('debug', scope, args)
});