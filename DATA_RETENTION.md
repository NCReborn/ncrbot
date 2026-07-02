# Data Retention & Cleanup Policy

## Overview

The NCReborn Bot implements an automatic 90-day data retention policy for all audit logs and message content data stored in our MySQL database. This ensures compliance with our Privacy Policy and Discord's Developer Requirements.

## Retention Schedule

### Automatic Cleanup
- **Frequency**: Daily at 3:00 AM UTC
- **Deleted Data**: All audit logs older than 90 days
- **Process**: Automatic, no manual intervention required
- **Logging**: All cleanup operations are logged in `audit_cleanup_history` table
- **Discord Messages**: Expired Discord audit log messages are also deleted from `#bot-audit-log` channel

### Data Types Affected

| Data Type | Retention Period | Details |
|-----------|-----------------|---------|
| Audit Logs (Message Content) | 90 days | Message deletions, edits, content |
| Moderation Actions | 90 days | Bans, unbans, timeouts |
| Member Events | 90 days | Joins, leaves, profile changes |
| Command Logs | 30 days | Command usage and debugging |
| Configuration Data | Indefinite | Server settings, preferences |

## Database Schema

### `audit_logs` Table
Stores all audit events with automatic expiration:
- `id` - Unique identifier
- `guild_id` - Discord server ID
- `event_type` - Type of event (ban, message_delete, etc.)
- `user_id` / `user_tag` - User data
- `action_by_id` / `action_by_tag` - Who performed action
- `channel_id` / `channel_name` - Channel information
- `message_id` - Discord message ID (used for cleanup)
- `content` - Message/event content
- `reason` - Action reason/explanation
- `additional_data` - JSON for extra metadata
- `created_at` - Event timestamp
- `expires_at` - Automatic deletion timestamp (created_at + 90 days)

### `audit_cleanup_history` Table
Tracks cleanup operations for monitoring:
- `id` - Cleanup event ID
- `cleaned_at` - When cleanup ran
- `records_deleted` - Number of records deleted
- `duration_ms` - How long cleanup took

## Automatic Discord Message Deletion

When the cleanup runs, it will:

1. **Query expired database records** - Find all entries where `expires_at < NOW()`
2. **Extract Discord message IDs** - Get the Discord message ID from each record
3. **Delete Discord messages** - Remove the corresponding embed from `#bot-audit-log`
4. **Delete database records** - Remove the database entries after Discord cleanup
5. **Log the operation** - Track records deleted in `audit_cleanup_history`

**Result**: Old audit log embeds disappear from the channel automatically, keeping it clean while maintaining a 90-day historical database record.

## User Data Deletion Requests

### Process for Data Subject Access Requests (DSAR)
Users can request deletion of their personal data at any time via the support ticket system (`#contact-the-team`).

**Timeline:**
1. Request received in support channel
2. Moderator verifies identity (Discord user ID)
3. Moderator runs `/auditlog deleteuser` command
4. All user's data deleted from active database within 24 hours
5. Automated backup purge within 30 days

### Command Usage
```
/auditlog deleteuser <user_id>
```

This will delete:
- All audit logs where user is the subject
- All audit logs where user took an action
- All related message content
- Command usage history

## Legal & Compliance Exceptions

The following data may be retained beyond 90 days:

- **Active Investigations**: Data related to ongoing abuse/fraud investigations
- **Active Sanctions**: Data related to users with active bans/timeouts
- **Legal Compliance**: Data required by law or legal process
- **Discord Platform**: Data required for Discord verification/compliance

## Monitoring & Verification

### Check Cleanup Status
View recent cleanup operations:
```
/auditlog cleanupstatus
```

### Manual Cleanup (Admin Only)
Trigger manual cleanup outside of scheduled time:
```
/auditlog cleanup
```

### Backup Strategy
- Daily automated MySQL backups
- Backups encrypted and stored securely
- Backup retention: 30 days minimum, 90 days maximum
- Deleted data purged from backups after 30 days

## Technical Implementation

### Files Involved
- `services/AuditLogDatabase.js` - Database operations and cleanup
- `utils/auditCleanupScheduler.js` - Cron job scheduler
- `utils/auditLogger.js` - Event logging to database

### Initialization (in index.js)
```javascript
// After client is ready, initialize audit database
const auditLogDatabase = require('./services/AuditLogDatabase');
const { scheduleAuditCleanup } = require('./utils/auditCleanupScheduler');

client.once('clientReady', async () => {
  // Initialize audit database
  await auditLogDatabase.initialize();
  
  // Schedule cleanup with Discord bot client and audit channel ID
  scheduleAuditCleanup(client, process.env.AUDIT_CHANNEL_ID);
});
```

### Environment Variables
Ensure the following are set in `.env`:
```
MYSQL_HOST=your_host
MYSQL_PORT=3306
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=ncrbot
AUDIT_CHANNEL_ID=your_audit_channel_id
```

## Privacy Policy Integration

This Data Retention Policy is fully integrated with our Privacy Policy (PRIVACY_POLICY.md), specifically:
- Section 3: Data Retention Policy
- Section 6: User Rights and Data Deletion Requests

For complete privacy information, see `PRIVACY_POLICY.md`.
