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

function bytesToMb(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function msToSeconds(ms) {
  return Number((ms / 1000).toFixed(1));
}

function getWsStatusName(client) {
  return wsStatusNames[client.ws.status] || `UNKNOWN(${client.ws.status})`;
}

function describeCloseCode(code) {
  return closeCodeDescriptions[code] || 'Unknown close code';
}

function buildContext(client, state, sample) {
  const now = Date.now();
  const lastRawAgeMs = state.lastRawAt ? now - state.lastRawAt : null;
  const lastDisconnectAgeMs = state.lastDisconnectAt ? now - state.lastDisconnectAt : null;

  return {
    pid: process.pid,
    uptimeSeconds: Number(process.uptime().toFixed(1)),
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
  // This snapshot must always be captured via process.cpuUsage() with no baseline.
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
  const intervalMs = Math.max(parseInt(process.env.HEALTH_LOG_INTERVAL_MS || '300000', 10), 30000);
  const staleThresholdMs = Math.max(parseInt(process.env.HEALTH_STALE_THRESHOLD_MS || '600000', 10), intervalMs * 2);
  const startupTimeoutMs = Math.max(parseInt(process.env.STARTUP_READY_TIMEOUT_MS || '60000', 10), 10000);

  const state = {
    reconnectCount: 0,
    lastRawAt: null,
    lastRawEvent: null,
    lastDisconnectAt: null,
    lastReadyAt: null,
  };

  let previousSample = createProcessSample();

  const logHealth = (level = 'info', message = '[HEALTH] Runtime snapshot') => {
    const sample = createProcessSample(previousSample);
    previousSample = sample;
    const context = buildContext(client, state, sample);
    logger[level](message, context);
    return context;
  };

  const startupTimer = setTimeout(() => {
    if (!client.isReady()) {
      logHealth('warn', '[HEALTH] Client still not ready after startup timeout');
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
  });

  client.on('invalidated', () => {
    logger.error('[DISCORD] Session invalidated; reconnect required', {
      reconnectCount: state.reconnectCount,
      wsStatus: getWsStatusName(client),
    });
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

  const interval = setInterval(() => {
    const isStale = client.isReady() && state.lastRawAt && Date.now() - state.lastRawAt > staleThresholdMs;
    if (isStale) {
      logHealth('warn', '[HEALTH] No raw Discord events observed within stale threshold');
    }
  }, intervalMs);
  interval.unref();
}

module.exports = {
  installProcessErrorHandlers,
  startRuntimeMonitor,
};
