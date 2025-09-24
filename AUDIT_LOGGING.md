# Audit Logging System

This comprehensive audit logging system monitors and logs all moderation and message events in the Discord server using rich embeds that match Probot audit log styling.

## Features

- **Comprehensive Event Monitoring**: Tracks bans, kicks, timeouts, message edits/deletions, member changes, channel modifications, and thread events
- **Rich Embeds**: Color-coded embeds with author avatars, timestamps, and detailed information
- **Configurable Events**: Toggle individual event types on/off through slash commands
- **Persistent Configuration**: Settings stored in `config/auditConfig.json`
- **Anti-Loop Protection**: Prevents logging events from the audit channel itself

## Setup

1. **Set Audit Channel**:
   ```
   /auditlog channel #audit-logs
   ```

2. **Configure Events**:
   ```
   /auditlog toggle <event-name> <true/false>
   ```

3. **Check Status**:
   ```
   /auditlog status
   ```

## Monitored Events

### Moderation Events
- **Member Banned** (`guildBanAdd`) - 🔨 Red
- **Member Unbanned** (`guildBanRemove`) - 🔓 Green  
- **Member Timeout** (`guildMemberTimeout`) - ⏰ Orange

### Member Events
- **Member Joined** (`guildMemberAdd`) - 📥 Green
- **Member Left/Kicked** (`guildMemberRemove`) - 📤 Pink
- **Member Updated** (`guildMemberUpdate`) - ✏️ Blue (nickname/roles)

### Message Events
- **Message Deleted** (`messageDelete`) - 🗑️ Red
- **Message Edited** (`messageUpdate`) - ✏️ Orange

### Channel Events
- **Channel Created** (`channelCreate`) - 📝 Green
- **Channel Deleted** (`channelDelete`) - 🗑️ Red
- **Channel Updated** (`channelUpdate`) - ✏️ Blue

### Thread Events
- **Thread Created** (`threadCreate`) - 🧵 Green
- **Thread Deleted** (`threadDelete`) - 🗑️ Red
- **Thread Updated** (`threadUpdate`) - ✏️ Blue

## Embed Information

Each audit log includes:
- **Author**: User avatar and tag
- **Event Details**: Specific information based on event type
- **Context**: Channel mentions, message links, timestamps
- **Footer**: User ID and guild name
- **Color Coding**: Visual distinction for different event types

## Configuration

Events are configured in `config/auditConfig.json`:

```json
{
  "auditChannelId": "channel_id_here",
  "events": {
    "eventName": {
      "enabled": true,
      "name": "Display Name",
      "color": 16729943,
      "emoji": "🔨"
    }
  }
}
```

## Permissions Required

The bot needs the following intents and permissions:
- **Intents**: `GuildMembers`, `GuildModeration`, `GuildMessages`, `MessageContent`
- **Permissions**: `Send Messages`, `Embed Links` in the audit channel

## Administration

Only users with Administrator permissions can configure audit logging settings using the `/auditlog` command.