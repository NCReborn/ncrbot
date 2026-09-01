const util = require('util');
const { createLogger, format, transports } = require('winston');

const SPLAT = Symbol.for('splat');

function normalizeValue(value) {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeValue(nestedValue)])
    );
  }

  return value;
}

function formatValue(value) {
  return util.inspect(normalizeValue(value), {
    depth: 6,
    colors: false,
    compact: true,
    breakLength: Infinity,
  });
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.errors({ stack: true }),
    format.splat(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf((info) => {
      const { timestamp, level, message, stack, ...meta } = info;
      const extras = [];
      const splat = Array.isArray(info[SPLAT]) ? info[SPLAT] : [];
      const metaEntries = Object.entries(meta).filter(([key]) => !key.startsWith('Symbol('));

      if (stack && stack !== message) {
        extras.push(stack);
      }

      if (metaEntries.length > 0) {
        extras.push(formatValue(Object.fromEntries(metaEntries)));
      } else {
        for (const value of splat) {
          extras.push(formatValue(value));
        }
      }

      const suffix = extras.length > 0 ? ` ${extras.join(' ')}` : '';
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${suffix}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ 
      filename: 'ncrbot.log',
      maxsize: 5242880,  // 5MB per file
      maxFiles: 3        // Keep 3 rotated files (ncrbot.log, ncrbot1.log, ncrbot2.log)
    })
  ],
});

module.exports = logger;
