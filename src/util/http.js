'use strict';

// HTTP helpers shared by every provider, the media cache and the sync worker.
// Includes timeouts plus exponential backoff with jitter so a flaky upstream
// never takes the whole catalog down.

const config = require('../config');

const DEFAULT_HEADERS = {
  'User-Agent': 'HIPKOP-PLAYER/1.0 ( metadata sync; https://github.com/hipkop-player )',
  Accept: 'application/json,text/plain,*/*'
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const backoffDelay = (attempt, base) =>
  Math.round(base * 2 ** attempt + Math.random() * 150);

async function fetchOnce(url, { timeout = config.httpTimeoutMs, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { ...DEFAULT_HEADERS, ...headers }
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch with retry + exponential backoff.
 * Throws an Error with `.status` (when the upstream answered) or `.code`.
 */
async function fetchWithRetry(url, options = {}) {
  const {
    attempts = config.httpAttempts,
    timeout = config.httpTimeoutMs,
    headers = {},
    backoffMs = 400,
    wait = true
  } = options;

  let lastError;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    try {
      const response = await fetchOnce(url, { timeout, headers });
      if (response.ok) return response;

      const error = new Error(`upstream_http_${response.status}`);
      error.status = response.status;
      error.retryable = RETRYABLE_STATUS.has(response.status);
      lastError = error;
    } catch (cause) {
      const error = new Error(cause.name === 'AbortError' ? 'upstream_timeout' : 'upstream_unreachable');
      error.code = cause.name === 'AbortError' ? 'timeout' : 'network';
      error.retryable = true;
      error.cause = cause;
      lastError = error;
    }

    const isLast = attempt === Math.max(1, attempts) - 1;
    if (isLast || lastError.retryable === false) break;
    if (wait) await sleep(backoffDelay(attempt, backoffMs));
  }
  throw lastError || new Error('upstream_failed');
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithRetry(url, options);
  return response.json();
}

async function fetchBuffer(url, options = {}) {
  const response = await fetchWithRetry(url, options);
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || 'application/octet-stream'
  };
}

module.exports = { fetchWithRetry, fetchJson, fetchBuffer, sleep, backoffDelay };