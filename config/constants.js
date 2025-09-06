module.exports = {
  BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  API_KEY: process.env.NEXUS_API_KEY,
  API_URL: 'https://api-router.nexusmods.com/graphql',
  APP_NAME: process.env.APP_NAME || 'CollectionDiffBot',
  APP_VERSION: process.env.APP_VERSION || '1.0.0',
  VERSION_INFO: {
    version: "1.0.2",
    changes: "Added !version support + Fixed some bugs"
  },
  VERSION_COOLDOWN_TIME: 60 * 60 * 1000, // 60 minutes
};