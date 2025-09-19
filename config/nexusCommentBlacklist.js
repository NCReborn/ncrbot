// Nexus Mods Comment Monitor Configuration
// Configure which mods to exclude from comment monitoring and issue keywords

module.exports = {
  // Collection slugs to exclude from comment monitoring
  blacklistedCollections: [
    // Add collection slugs here to exclude them from monitoring
    // Example: 'problematic-collection-slug'
  ],

  // Mod IDs to exclude from comment monitoring  
  blacklistedModIds: [
    // Add specific mod IDs here to exclude them from monitoring
    // Example: 12345, 67890
  ],

  // Keywords that indicate potential issues in comments
  issueKeywords: [
    'crash',
    'error', 
    'flatline',
    'black screen',
    'compatibility',
    'freeze',
    'freezing',
    'frozen',
    'bug',
    'broken',
    'not working',
    'doesnt work',
    'doesn\'t work',
    'corrupted',
    'glitch',
    'problem',
    'issue',
    'fail',
    'failing',
    'failed',
    'exception',
    'ctd',
    'crash to desktop',
    'infinite loading',
    'stuck',
    'softlock',
    'hardlock',
    'memory leak',
    'performance',
    'fps drop',
    'lag',
    'laggy',
    'slow',
    'timeout',
    'missing',
    'conflict',
    'conflicts',
    'incompatible',
    'save corruption',
    'save corrupted'
  ],

  // Schedule configuration (cron format)
  schedule: '0 5 * * *', // 5:00 AM UTC daily

  // Discord channel ID for comment alerts
  alertChannelId: process.env.NEXUS_COMMENT_ALERT_CHANNEL_ID || null,

  // Comment monitoring settings
  commentSettings: {
    // Only check comments from the last 30 days
    daysSince: 30,
    // Maximum number of comments to process per mod (to avoid overwhelming)
    maxCommentsPerMod: 100,
    // Concurrency limit for Nexus requests
    concurrencyLimit: 3,
    // Delay between requests (ms) to be respectful to Nexus servers
    requestDelay: 1000
  }
};