const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => `[${timestamp}] [${level.toUpperCase()}] ${message}`)
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
