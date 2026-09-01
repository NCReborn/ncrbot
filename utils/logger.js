const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.errors({ stack: true }),
    format.splat(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf((info) => {
      const { timestamp, level, message, stack, ...meta } = info;
      let line = `[${timestamp}] [${level.toUpperCase()}] ${stack || message}`;
      if (Object.keys(meta).length > 0) {
        line += ` ${JSON.stringify(meta)}`;
      }
      return line;
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
