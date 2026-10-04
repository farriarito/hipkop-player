'use strict';

// Minimal interval scheduler: wakes up once a minute to drain due sync jobs.
// The jobs themselves carry next_run_at/backoff, so restarts are safe.

const config = require('./config');
const sync = require('./sync');
const log = require('./util/logger')('scheduler');

let timer = null;
let kickoff = null;
let running = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const result = await sync.processDueJobs(5);
    if (result.processed) log.info(`processed ${result.processed} job(s)`);
  } catch (error) {
    log.warn(`job processing failed: ${error.message}`);
  } finally {
    running = false;
  }
};

function start() {
  if (!config.schedulerEnabled) {
    log.info('scheduler disabled (HIPKOP_SCHEDULER=0)');
    return;
  }
  sync.registerSources();
  sync.bootstrapSchedule();
  timer = setInterval(tick, 60 * 1000);
  if (timer.unref) timer.unref();
  kickoff = setTimeout(tick, 2500);
  if (kickoff.unref) kickoff.unref();
  log.info('scheduler started (releases daily, charts weekly, artist refresh daily)');
}

function stop() {
  if (timer) clearInterval(timer);
  if (kickoff) clearTimeout(kickoff);
  timer = null;
  kickoff = null;
}

module.exports = { start, stop, tick };