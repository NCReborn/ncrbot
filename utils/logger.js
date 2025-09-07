// If you already have a logger, augment it instead of replacing.
// Example wrapper adding context capability.
const base = require('pino')({ level: process.env.LOG_LEVEL || 'info' });
// Or if you use a custom logger, adapt this pattern.

function withContext(ctx = {}) {
  return {
    info: (msg, extra) => base.info({ ...ctx, ...extra }, msg),
    warn: (msg, extra) => base.warn({ ...ctx, ...extra }, msg),
    error: (msg, extra) => base.error({ ...ctx, ...extra }, msg),
    debug: (msg, extra) => base.debug({ ...ctx, ...extra }, msg),
    child: (more) => withContext({ ...ctx, ...more })
  };
}

module.exports = {
  logger: withContext(),
  withContext
};
