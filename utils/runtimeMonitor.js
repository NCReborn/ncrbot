const asyncHooks = require('async_hooks');
const fs = require('fs');
const os = require('os');
const { monitorEventLoopDelay, performance } = require('perf_hooks');

const closeCodeDescriptions = {
  4000: 'Unknown error',
  4001: 'Unknown opcode',
  4002: 'Decode error',
  4003: 'Not authenticated',
  4004: 'Authentication failed',
  4005: 'Already authenticated',
  4007: 'Invalid sequence',
  4008: 'Rate limited',
  4009: 'Session timed out',
  4010: 'Invalid shard',
  4011: 'Sharding required',
  4012: 'Invalid API version',
  4013: 'Invalid intents',
  4014: 'Disallowed intents',
};

const wsStatusNames = {
  0: 'READY',
  1: 'CONNECTING',
  2: 'RECONNECTING',
  3: 'IDLE',
  4: 'NEARLY',
  5: 'DISCONNECTED',
  6: 'WAITING_FOR_GUILDS',
  7: 'IDENTIFYING',
  8: 'RESUMING',
};

let activeDiagnosticsRuntime = null;

function bytesToMb(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function msToSeconds(ms) {
  return Number((ms / 1000).toFixed(1));
}

function nanosecondsToMs(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number((value / 1e6).toFixed(2));
}

function getWsStatusName(client) {
  return wsStatusNames[client.ws.status] || `UNKNOWN(${client.ws.status})`;
}

function describeCloseCode(code) {
  return closeCodeDescriptions[code] || 'Unknown close code';
}

function parseIntegerEnv(name, fallback, minimum) {
  const parsed = parseInt(process.env[name] || `${fallback}`, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(parsed, minimum);
}

function getFdCount() {
  try {
    return fs.readdirSync('/proc/self/fd').length;
  } catch {
    return null;
  }
}

function getActiveHandleCount() {
  try {
    return typeof process._getActiveHandles === 'function' ? process._getActiveHandles().length : null;
  } catch {
    return null;
  }
}

function getActiveRequestCount() {
  try {
    return typeof process._getActiveRequests === 'function' ? process._getActiveRequests().length : null;
  } catch {
    return null;
  }
}

function installTimerTracking() {
  if (global.__ncrbotTimerTrackingState) {
    return global.__ncrbotTimerTrackingState;
  }

  const nativeSetTimeout = global.setTimeout.bind(global);
  const nativeClearTimeout = global.clearTimeout.bind(global);
  const nativeSetInterval = global.setInterval.bind(global);
  const nativeClearInterval = global.clearInterval.bind(global);

  const state = {
    timeouts: new Map(),
    intervals: new Map(),
  };

  global.setTimeout = (callback, delay, ...args) => {
    const createdAt = Date.now();
    let handle;
    const wrappedCallback = (...callbackArgs) => {
      state.timeouts.delete(handle);
      return callback(...callbackArgs);
    };

    handle = nativeSetTimeout(wrappedCallback, delay, ...args);
    state.timeouts.set(handle, {
      createdAt,
      delay: Number(delay) || 0,
    });
    return handle;
  };

  global.clearTimeout = (handle) => {
    state.timeouts.delete(handle);
    return nativeClearTimeout(handle);
  };

  global.setInterval = (callback, delay, ...args) => {
    const handle = nativeSetInterval(callback, delay, ...args);
    state.intervals.set(handle, {
      createdAt: Date.now(),
      delay: Number(delay) || 0,
    });
    return handle;
  };

  global.clearInterval = (handle) => {
    state.intervals.delete(handle);
    return nativeClearInterval(handle);
  };

  global.__ncrbotTimerTrackingState = state;
  return state;
}

function installPromiseTracker() {
  if (process.__ncrbotPromiseTracker) {
    return process.__ncrbotPromiseTracker;
  }

  const promises = new Map();
  const hook = asyncHooks.createHook({
    init(asyncId, type, triggerAsyncId) {
      if (type !== 'PROMISE') return;
      promises.set(asyncId, {
        createdAt: Date.now(),
        triggerAsyncId,
      });
    },
    promiseResolve(asyncId) {
      promises.delete(asyncId);
    },
    destroy(asyncId) {
      promises.delete(asyncId);
    },
  });

  hook.enable();

  const tracker = { promises, hook };
  process.__ncrbotPromiseTracker = tracker;
  return tracker;
}

function buildContext(client, state, sample) {
  const now = Date.now();
  const lastRawAgeMs = state.lastRawAt ? now - state.lastRawAt : null;
  const lastDisconnectAgeMs = state.lastDisconnectAt ? now - state.lastDisconnectAt : null;
  const expectedUptimeSeconds = Number(((now - state.startedAt) / 1000).toFixed(1));

  return {
    pid: process.pid,
    uptimeSeconds: Number(process.uptime().toFixed(1)),
    expectedUptimeSeconds,
    uptimeDeltaSeconds: Number(Math.abs(process.uptime() - expectedUptimeSeconds).toFixed(3)),
    rssMb: bytesToMb(sample.memory.rss),
    heapUsedMb: bytesToMb(sample.memory.heapUsed),
    heapTotalMb: bytesToMb(sample.memory.heapTotal),
    externalMb: bytesToMb(sample.memory.external),
    arrayBuffersMb: bytesToMb(sample.memory.arrayBuffers || 0),
    cpuUserMs: sample.cpuUserMs,
    cpuSystemMs: sample.cpuSystemMs,
    cpuPercent: sample.cpuPercent,
    guildCount: client.guilds.cache.size,
    ready: client.isReady(),
    wsStatus: getWsStatusName(client),
    wsPingMs: client.ws.ping,
    reconnectCount: state.reconnectCount,
    lastRawEvent: state.lastRawEvent || null,
    lastRawEventAgeSeconds: lastRawAgeMs == null ? null : msToSeconds(lastRawAgeMs),
    lastDisconnectAgeSeconds: lastDisconnectAgeMs == null ? null : msToSeconds(lastDisconnectAgeMs),
    lastReadyAt: state.lastReadyAt ? new Date(state.lastReadyAt).toISOString() : null,
  };
}

function createProcessSample(previousSample) {
  const cpu = process.cpuUsage();
  const now = Date.now();
  const memory = process.memoryUsage();

  if (!previousSample) {
    return {
      at: now,
      memory,
      cpuUsageSnapshot: cpu,
      cpuUserMs: 0,
      cpuSystemMs: 0,
      cpuPercent: 0,
    };
  }

  const elapsedMicros = Math.max((now - previousSample.at) * 1000, 1);
  const cpuDiff = process.cpuUsage(previousSample.cpuUsageSnapshot);
  const totalCpuMicros = cpuDiff.user + cpuDiff.system;

  return {
    at: now,
    memory,
    cpuUsageSnapshot: cpu,
    cpuUserMs: Number((cpuDiff.user / 1000).toFixed(2)),
    cpuSystemMs: Number((cpuDiff.system / 1000).toFixed(2)),
    cpuPercent: Number(((totalCpuMicros / elapsedMicros) * 100).toFixed(2)),
  };
}

function summarizeHeapTrend(heapSamples, growthWarnMb) {
  if (heapSamples.length < 2) {
    return {
      direction: 'unknown',
      deltaMb: 0,
      rateMbPerMinute: 0,
      growingTooFast: false,
      windowSeconds: 0,
    };
  }

  const first = heapSamples[0];
  const last = heapSamples[heapSamples.length - 1];
  const deltaMb = Number(((last.heapUsed - first.heapUsed) / 1024 / 1024).toFixed(2));
  const elapsedMinutes = Math.max((last.at - first.at) / 60000, 1 / 60);
  const rateMbPerMinute = Number((deltaMb / elapsedMinutes).toFixed(2));
  let direction = 'stable';

  if (deltaMb > 5) {
    direction = 'growing';
  } else if (deltaMb < -5) {
    direction = 'shrinking';
  }

  return {
    direction,
    deltaMb,
    rateMbPerMinute,
    growingTooFast: deltaMb >= growthWarnMb && rateMbPerMinute > 0,
    windowSeconds: Number(((last.at - first.at) / 1000).toFixed(1)),
  };
}

function captureListenerSummary(client) {
  const counts = {};

  for (const eventName of client.eventNames()) {
    counts[eventName] = client.listenerCount(eventName);
  }

  const sortedCounts = Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  );
  const totalListeners = Object.values(sortedCounts).reduce((sum, count) => sum + count, 0);

  return {
    totalEvents: Object.keys(sortedCounts).length,
    totalListeners,
    counts: sortedCounts,
  };
}

function summarizeListenerGrowth(baseline, current) {
  const increased = {};
  const keys = new Set([...Object.keys(baseline.counts), ...Object.keys(current.counts)]);

  for (const key of keys) {
    const previous = baseline.counts[key] || 0;
    const next = current.counts[key] || 0;
    if (next > previous) {
      increased[key] = {
        baseline: previous,
        current: next,
      };
    }
  }

  return increased;
}

function summarizeTrackedPromises(tracker) {
  const now = Date.now();
  const entries = [...tracker.promises.entries()]
    .map(([asyncId, details]) => ({
      asyncId,
      ageSeconds: msToSeconds(now - details.createdAt),
      triggerAsyncId: details.triggerAsyncId,
    }))
    .sort((left, right) => right.ageSeconds - left.ageSeconds);

  return {
    count: entries.length,
    oldestAgeSeconds: entries[0]?.ageSeconds || 0,
    oldest: entries.slice(0, 5),
  };
}

function summarizeTrackedTimers(timerState) {
  const now = Date.now();
  const summarizeMap = (map) => {
    const entries = [...map.values()]
      .map((details) => ({
        ageSeconds: msToSeconds(now - details.createdAt),
        delayMs: details.delay,
      }))
      .sort((left, right) => right.ageSeconds - left.ageSeconds);

    return {
      count: entries.length,
      oldestAgeSeconds: entries[0]?.ageSeconds || 0,
      oldest: entries.slice(0, 5),
    };
  };

  return {
    timeouts: summarizeMap(timerState.timeouts),
    intervals: summarizeMap(timerState.intervals),
  };
}

function summarizeHandlerMetrics(state) {
  const summary = {};

  for (const [name, metrics] of Object.entries(state.handlerMetrics)) {
    const durations = metrics.recentDurations;
    const averageMs = durations.length > 0
      ? Number((durations.reduce((sum, duration) => sum + duration, 0) / durations.length).toFixed(2))
      : 0;

    summary[name] = {
      totalCount: metrics.totalCount,
      recentAvgMs: averageMs,
      recentMaxMs: durations.length > 0 ? Number(Math.max(...durations).toFixed(2)) : 0,
      lastDurationMs: metrics.lastDurationMs,
      slowCount: metrics.slowCount,
      activeCount: [...state.activeHandlers.values()].filter((entry) => entry.name === name).length,
    };
  }

  return summary;
}

function summarizeActiveHandlers(state) {
  const now = Date.now();
  const handlers = [...state.activeHandlers.values()]
    .map((entry) => ({
      name: entry.name,
      ageSeconds: msToSeconds(now - entry.startedAt),
      details: entry.details,
    }))
    .sort((left, right) => right.ageSeconds - left.ageSeconds);

  return {
    count: handlers.length,
    oldest: handlers[0] || null,
    handlers: handlers.slice(0, 5),
  };
}

function recordHandlerMetric(state, name, durationMs, isSlow) {
  if (!state.handlerMetrics[name]) {
    state.handlerMetrics[name] = {
      totalCount: 0,
      recentDurations: [],
      lastDurationMs: 0,
      slowCount: 0,
    };
  }

  const metrics = state.handlerMetrics[name];
  metrics.totalCount += 1;
  metrics.lastDurationMs = durationMs;
  if (isSlow) {
    metrics.slowCount += 1;
  }
  metrics.recentDurations.push(durationMs);
  if (metrics.recentDurations.length > 20) {
    metrics.recentDurations.shift();
  }
}

function installProcessErrorHandlers(logger) {
  if (process.__ncrbotProcessHandlersInstalled) return;
  process.__ncrbotProcessHandlersInstalled = true;

  process.on('uncaughtExceptionMonitor', (error, origin) => {
    logger.error('[PROCESS] Uncaught exception monitor fired', { origin, error });
  });

  process.on('uncaughtException', (error, origin) => {
    logger.error('[PROCESS] Uncaught exception', { origin, error });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('[PROCESS] Unhandled promise rejection', {
      reason,
      promiseType: promise && promise.constructor ? promise.constructor.name : typeof promise,
    });
  });

  process.on('warning', (warning) => {
    logger.warn('[PROCESS] Runtime warning', { warning });
  });

  process.on('beforeExit', (code) => {
    logger.warn('[PROCESS] beforeExit fired', { code });
  });

  process.on('exit', (code) => {
    logger.warn('[PROCESS] Process exiting', { code });
  });
}

function startRuntimeMonitor(client, logger) {
  if (client.__ncrbotRuntimeMonitorStarted) return;
  client.__ncrbotRuntimeMonitorStarted = true;

  const intervalMs = parseIntegerEnv('HEALTH_LOG_INTERVAL_MS', 30000, 100);
  const staleThresholdMs = parseIntegerEnv('HEALTH_STALE_THRESHOLD_MS', 600000, intervalMs);
  const startupTimeoutMs = parseIntegerEnv('STARTUP_READY_TIMEOUT_MS', 60000, 1000);
  const heapGrowthWarnMb = parseIntegerEnv('HEAP_GROWTH_WARN_MB', 25, 1);
  const eventLoopWarnMs = parseIntegerEnv('EVENT_LOOP_LAG_WARN_MS', 250, 1);
  const handlerWarnMs = parseIntegerEnv('HANDLER_WARN_MS', 1000, 1);
  const longRunningHandlerWarnMs = parseIntegerEnv('HANDLER_PENDING_WARN_MS', 15000, 1);
  const pendingPromiseWarnMs = parseIntegerEnv('PENDING_PROMISE_WARN_MS', 60000, 1);

  const state = {
    startedAt: Date.now(),
    reconnectCount: 0,
    lastRawAt: null,
    lastRawEvent: null,
    lastDisconnectAt: null,
    lastReadyAt: null,
    heapSamples: [],
    handlerMetrics: {},
    activeHandlers: new Map(),
    baselineListeners: { totalEvents: 0, totalListeners: 0, counts: {} },
    eventLoopDelay: monitorEventLoopDelay({ resolution: 20 }),
    lastIntervalTickAt: Date.now(),
  };

  const timerState = installTimerTracking();
  const promiseTracker = installPromiseTracker();

  state.eventLoopDelay.enable();

  let previousSample = createProcessSample();

  activeDiagnosticsRuntime = {
    logger,
    state,
    config: {
      handlerWarnMs,
      longRunningHandlerWarnMs,
    },
  };

  const logDiagnosticsSnapshot = (level = 'info', message = '[DIAGNOSTICS] Health snapshot') => {
    const sample = createProcessSample(previousSample);
    previousSample = sample;

    state.heapSamples.push({
      at: sample.at,
      heapUsed: sample.memory.heapUsed,
    });
    if (state.heapSamples.length > 10) {
      state.heapSamples.shift();
    }

    const now = Date.now();
    const driftMs = Math.max(now - state.lastIntervalTickAt - intervalMs, 0);
    state.lastIntervalTickAt = now;

    const baseContext = buildContext(client, state, sample);
    const heapTrend = summarizeHeapTrend(state.heapSamples, heapGrowthWarnMb);
    const listenerSummary = captureListenerSummary(client);
    const listenerGrowth = summarizeListenerGrowth(state.baselineListeners, listenerSummary);
    const eventLoopLag = {
      meanMs: nanosecondsToMs(state.eventLoopDelay.mean),
      maxMs: nanosecondsToMs(state.eventLoopDelay.max),
      minMs: nanosecondsToMs(state.eventLoopDelay.min),
      p95Ms: nanosecondsToMs(state.eventLoopDelay.percentile(95)),
      p99Ms: nanosecondsToMs(state.eventLoopDelay.percentile(99)),
      driftMs: Number(driftMs.toFixed(2)),
    };
    const pendingPromises = summarizeTrackedPromises(promiseTracker);
    const timers = summarizeTrackedTimers(timerState);
    const activeHandlers = summarizeActiveHandlers(state);
    const resourceUsage = typeof process.resourceUsage === 'function' ? process.resourceUsage() : null;
    const isStale = client.isReady() && state.lastRawAt && now - state.lastRawAt > staleThresholdMs;

    logger[level](message, {
      ...baseContext,
      heapTrend,
      eventLoopLag,
      listeners: listenerSummary,
      listenerGrowth,
      handlerTimings: summarizeHandlerMetrics(state),
      activeHandlers,
      pendingPromises,
      pendingTimers: timers,
      fileDescriptorCount: getFdCount(),
      activeHandleCount: getActiveHandleCount(),
      activeRequestCount: getActiveRequestCount(),
      system: {
        loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
        freeMemoryMb: bytesToMb(os.freemem()),
        totalMemoryMb: bytesToMb(os.totalmem()),
        cpuCount: os.cpus().length,
      },
      resourceUsage: resourceUsage ? {
        maxRssKb: resourceUsage.maxRSS,
        userCpuTimeMicros: resourceUsage.userCPUTime,
        systemCpuTimeMicros: resourceUsage.systemCPUTime,
        fsRead: resourceUsage.fsRead,
        fsWrite: resourceUsage.fsWrite,
        involuntaryContextSwitches: resourceUsage.involuntaryContextSwitches,
        voluntaryContextSwitches: resourceUsage.voluntaryContextSwitches,
      } : null,
    });

    if (heapTrend.growingTooFast) {
      logger.warn('[DIAGNOSTICS] Heap growth is above threshold', heapTrend);
    }

    if (eventLoopLag.maxMs >= eventLoopWarnMs || eventLoopLag.driftMs >= eventLoopWarnMs) {
      logger.warn('[DIAGNOSTICS] Event loop lag detected', eventLoopLag);
    }

    if (Object.keys(listenerGrowth).length > 0) {
      logger.warn('[DIAGNOSTICS] Listener counts increased after startup baseline', listenerGrowth);
    }

    if (pendingPromises.oldestAgeSeconds * 1000 >= pendingPromiseWarnMs) {
      logger.warn('[DIAGNOSTICS] Old pending promises detected', pendingPromises);
    }

    if (activeHandlers.oldest && activeHandlers.oldest.ageSeconds * 1000 >= longRunningHandlerWarnMs) {
      logger.warn('[DIAGNOSTICS] Handler still running past threshold', activeHandlers.oldest);
    }

    if (isStale) {
      logger.warn('[DIAGNOSTICS] No raw Discord events observed within stale threshold', {
        staleThresholdSeconds: msToSeconds(staleThresholdMs),
        lastRawEvent: state.lastRawEvent || null,
        lastRawEventAgeSeconds: baseContext.lastRawEventAgeSeconds,
      });
    }

    state.eventLoopDelay.reset();
  };

  const startupTimer = setTimeout(() => {
    if (!client.isReady()) {
      logDiagnosticsSnapshot('warn', '[DIAGNOSTICS] Client still not ready after startup timeout');
    }
  }, startupTimeoutMs);
  startupTimer.unref();

  client.on('raw', (packet) => {
    state.lastRawAt = Date.now();
    state.lastRawEvent = packet.t || 'UNKNOWN';
  });

  client.on('shardReady', (shardId, unavailableGuilds) => {
    state.lastReadyAt = Date.now();
    logger.info(`[DISCORD] Shard ${shardId} ready`, {
      unavailableGuildCount: unavailableGuilds ? unavailableGuilds.size : 0,
      wsStatus: getWsStatusName(client),
    });
    logDiagnosticsSnapshot('info', '[DIAGNOSTICS] Shard ready snapshot');
  });

  client.on('shardDisconnect', (event, shardId) => {
    state.lastDisconnectAt = Date.now();
    logger.warn(`[DISCORD] Shard ${shardId} disconnected`, {
      code: event.code,
      codeDescription: describeCloseCode(event.code),
      reason: event.reason || null,
      wasClean: event.wasClean,
      wsStatus: getWsStatusName(client),
      pingMs: client.ws.ping,
    });
    logDiagnosticsSnapshot('warn', `[DIAGNOSTICS] Snapshot after shard ${shardId} disconnect`);
  });

  client.on('shardError', (error, shardId) => {
    logger.error(`[DISCORD] Shard ${shardId} error`, {
      error,
      wsStatus: getWsStatusName(client),
      pingMs: client.ws.ping,
    });
  });

  client.on('shardReconnecting', (shardId) => {
    state.reconnectCount += 1;
    logger.warn(`[DISCORD] Shard ${shardId} reconnecting`, {
      reconnectCount: state.reconnectCount,
      lastDisconnectAgeSeconds: state.lastDisconnectAt ? msToSeconds(Date.now() - state.lastDisconnectAt) : null,
      wsStatus: getWsStatusName(client),
    });
  });

  client.on('shardResume', (shardId, replayedEvents) => {
    logger.info(`[DISCORD] Shard ${shardId} resumed`, {
      replayedEvents,
      reconnectCount: state.reconnectCount,
      downtimeSeconds: state.lastDisconnectAt ? msToSeconds(Date.now() - state.lastDisconnectAt) : null,
      wsStatus: getWsStatusName(client),
      pingMs: client.ws.ping,
    });
    logDiagnosticsSnapshot('info', `[DIAGNOSTICS] Snapshot after shard ${shardId} resume`);
  });

  client.on('invalidated', () => {
    logger.error('[DISCORD] Session invalidated; reconnect required', {
      reconnectCount: state.reconnectCount,
      wsStatus: getWsStatusName(client),
    });
    logDiagnosticsSnapshot('error', '[DIAGNOSTICS] Snapshot after session invalidation');
  });

  client.on('error', (error) => {
    logger.error('[DISCORD] Client error', {
      error,
      wsStatus: getWsStatusName(client),
      pingMs: client.ws.ping,
    });
  });

  client.on('warn', (warning) => {
    logger.warn('[DISCORD] Warning', {
      warning,
      wsStatus: getWsStatusName(client),
    });
  });

  if (client.rest && typeof client.rest.on === 'function') {
    client.rest.on('rateLimited', (rateLimitData) => {
      logger.warn('[DISCORD] REST rate limit hit', rateLimitData);
    });
  }

  state.baselineListeners = captureListenerSummary(client);

  const interval = setInterval(() => {
    logDiagnosticsSnapshot();
  }, intervalMs);
  interval.unref();

  logDiagnosticsSnapshot('info', '[DIAGNOSTICS] Startup baseline established');
}

async function trackHandlerExecution(name, details, handler) {
  if (typeof handler !== 'function') {
    throw new TypeError('trackHandlerExecution requires a handler function');
  }

  if (!activeDiagnosticsRuntime) {
    return handler();
  }

  const { logger, state, config } = activeDiagnosticsRuntime;
  const startTime = Date.now();
  const perfStart = performance.now();
  const token = Symbol(name);
  state.activeHandlers.set(token, { name, details, startedAt: startTime });

  const pendingTimer = setTimeout(() => {
    logger.warn(`[DIAGNOSTICS] ${name} handler still running`, {
      durationMs: Number((performance.now() - perfStart).toFixed(2)),
      ...details,
    });
  }, config.longRunningHandlerWarnMs);
  pendingTimer.unref();

  const finalize = (status, error) => {
    clearTimeout(pendingTimer);
    state.activeHandlers.delete(token);

    const durationMs = Number((performance.now() - perfStart).toFixed(2));
    const isSlow = durationMs >= config.handlerWarnMs;
    recordHandlerMetric(state, name, durationMs, isSlow);

    const level = error ? 'error' : isSlow ? 'warn' : 'info';
    logger[level](`[DIAGNOSTICS] ${name} handler ${status}`, {
      durationMs,
      activeHandlerCount: state.activeHandlers.size,
      ...details,
      ...(error ? { error } : {}),
    });
  };

  try {
    const result = await handler();
    finalize('completed');
    return result;
  } catch (error) {
    finalize('failed', error);
    throw error;
  }
}

module.exports = {
  installProcessErrorHandlers,
  startRuntimeMonitor,
  trackHandlerExecution,
};
