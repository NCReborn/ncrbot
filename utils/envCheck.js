const logger = (() => {
  try {
    return require('./logger');
  } catch {
    return null;
  }
})();

function checkEnv(requiredExtra = []) {
  const required = [
    'DISCORD_TOKEN',
    'CLIENT_ID',
    'CRASH_LOG_CHANNEL_ID',
    'LOG_SCAN_CHANNEL_ID',
    ...requiredExtra
  ];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    if (logger && logger.error) logger.error(msg);
    else console.error('[ERROR]', msg);
    // Hard exit
    process.exit(1);
  }
}
module.exports = { checkEnv };
