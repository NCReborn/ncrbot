# Multi-guild setup

This bot now supports guild-scoped channel mapping for messageCreate features and guild-scoped autoresponder storage.

## Required config keys for multi-guild behavior

- `GUILD_IDS` (preferred): comma-separated guild IDs used for slash command sync.
- `SHOWCASE_CHANNEL_IDS`: per-guild map for SnapMaster showcase tracking.
- `BOT_SPAM_CHANNEL_IDS`: per-guild map for StreetCred announcement channel.

Map format for channel keys:

```env
SHOWCASE_CHANNEL_IDS=guildId1:channelId1,guildId2:channelId2
BOT_SPAM_CHANNEL_IDS=guildId1:channelId1,guildId2:channelId2
```

## Example (two guilds)

```env
GUILD_IDS=1285796904160202752,222222222222222222
SHOWCASE_CHANNEL_IDS=1285796904160202752:1285797205927792782,222222222222222222:333333333333333333
BOT_SPAM_CHANNEL_IDS=1285796904160202752:1406269920211374080,222222222222222222:444444444444444444
```

## Backward compatibility notes

- If only one guild is configured (`GUILD_IDS` has a single ID or only `GUILD_ID` is set), legacy `constants.CHANNELS.SHOWCASE` and `constants.CHANNELS.BOT_SPAM` continue to be used as fallback for that guild.
- Autoresponder data is now stored per guild. Existing legacy/global `data/autoResponses.json` array data is automatically migrated to the first guild that accesses autoresponder data, then saved under a guild-specific partition.

## Missing mapping visibility

On startup, the bot logs warnings for any configured guild IDs missing:

- showcase mapping
- bot spam mapping

Warnings include the exact guild IDs missing mappings and the env key to set.
