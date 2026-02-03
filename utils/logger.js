const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: 'info', // <-- Enable debug logs!
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => `[${timestamp}] [${level.toUpperCase()}] ${message}`)
  ),
  transports: [
    new transports.Console(),
    // Enable file logging for persistent audit/history:
    new transports.File({ filename: 'ncrbot.log' })
  ],
});

module.exports = logger;
