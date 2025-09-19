# Nexus Mods Comment Monitor

The Nexus Mods Comment Monitor automatically monitors comments on mods in your tracked collections for potential issues and reports them to Discord.

## Features

- **Automated Monitoring**: Runs daily at 5:00 AM UTC using cron scheduling
- **Issue Detection**: Scans comments for predefined issue keywords (crash, error, freeze, etc.)
- **Multi-Collection Support**: Monitors all configured collections from `config/collections.js`
- **Smart Filtering**: Only processes comments from the last 30 days
- **Deduplication**: Prevents duplicate alerts using persistent comment tracking
- **Discord Integration**: Sends rich embeds with mod details and comment snippets
- **Respectful Rate Limiting**: Configurable concurrency and delays to respect Nexus servers
- **Blacklist Support**: Exclude specific collections or mods from monitoring

## Configuration

### Environment Variables

Add to your `.env` file:

```env
NEXUS_COMMENT_ALERT_CHANNEL_ID=1234567890123456789
```

### Configuration File

Edit `config/nexusCommentBlacklist.js`:

```javascript
module.exports = {
  // Collections to exclude from monitoring
  blacklistedCollections: ['test-collection'],
  
  // Specific mod IDs to exclude
  blacklistedModIds: [12345, 67890],
  
  // Issue keywords to detect (can be customized)
  issueKeywords: [
    'crash', 'error', 'freeze', 'bug', 'broken',
    // ... full list in config file
  ],
  
  // Schedule (cron format)
  schedule: '0 5 * * *', // 5:00 AM UTC daily
  
  // Monitoring settings
  commentSettings: {
    daysSince: 30,           // Only check last 30 days
    maxCommentsPerMod: 100,  // Limit per mod
    concurrencyLimit: 3,     // Parallel requests
    requestDelay: 1000       // Delay between requests (ms)
  }
};
```

## Usage

### Automatic Monitoring

The monitor runs automatically once per day. Check logs for monitoring activity:

```
[NEXUS_MONITOR] Starting Nexus Mods comment monitoring
[NEXUS_MONITOR] Processing collection: NCR (ncr)
[NEXUS_MONITOR] Sent 3 new comment alerts
```

### Manual Testing

Use the `/testnexusmonitor` command to test the system:

```
/testnexusmonitor                    # Test all collections (limited)
/testnexusmonitor collection:ncr     # Test specific collection
```

This command is admin-only and will send test results to the current channel.

## Discord Alerts

When issues are detected, the bot sends Discord embeds containing:

- **Mod Name**: Name of the affected mod
- **Collection**: Which collection the mod belongs to  
- **Comment Details**: Author, date, and content snippet
- **Direct Link**: Link to the mod page on Nexus Mods
- **Grouping**: Multiple comments from the same mod are grouped together

## Data Storage

The monitor stores data in:

- `data/nexus_comment_monitor.json`: Tracks reported comments to prevent duplicates

## How It Works

1. **Collection Scanning**: Fetches mods from each tracked collection using Nexus API
2. **Comment Scraping**: Visits each mod's posts page and scrapes comments
3. **Date Filtering**: Only processes comments from the last 30 days
4. **Keyword Detection**: Checks comment text against configured issue keywords
5. **Deduplication**: Skips comments that have already been reported
6. **Discord Alerts**: Sends grouped alerts to the configured channel

## Troubleshooting

### No Comments Found

- Check that the mod has a posts/comments section
- Verify the mod ID and domain name are correct
- Some mods may not have public comments enabled

### Rate Limiting

If you encounter rate limiting:

- Increase `requestDelay` in the config
- Reduce `concurrencyLimit`
- Check Nexus Mods API status

### Missing Alerts

- Verify `NEXUS_COMMENT_ALERT_CHANNEL_ID` is set correctly
- Check bot permissions in the alert channel
- Review logs for any error messages

### Date Parsing Issues

The monitor supports various date formats:
- Relative: "2 hours ago", "3 days ago"
- Absolute: "12 Jan 2024", "January 12, 2024"
- ISO: "2024-01-12"

If dates aren't parsing correctly, check the logs for parsing warnings.

## Customization

### Adding Keywords

Edit the `issueKeywords` array in `config/nexusCommentBlacklist.js`:

```javascript
issueKeywords: [
  // ... existing keywords
  'custom-keyword',
  'another-issue-term'
]
```

### Changing Schedule

Modify the `schedule` field using cron syntax:

```javascript
schedule: '0 8 * * *',  // 8:00 AM UTC daily
schedule: '0 */6 * * *', // Every 6 hours
```

### Adjusting Monitoring Settings

```javascript
commentSettings: {
  daysSince: 14,          // Check last 14 days instead of 30
  maxCommentsPerMod: 50,  // Limit comments per mod
  concurrencyLimit: 5,    // More parallel requests
  requestDelay: 2000      // Longer delay between requests
}
```