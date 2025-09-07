const logger = require('./utils/logger');
require('dotenv').config();
require('./utils/envCheck').checkEnv();

const { syncSlashCommands } = require('./utils/commandSync');

(async () => {
  try {
    await syncSlashCommands();
    logger.info('Successfully reloaded application (/) commands for guild.');
  } catch (error) {
    logger.error('Failed to register slash commands:', error);
    process.exit(1);
  }
})();
