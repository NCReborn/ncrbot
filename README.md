# NCRBot

<p align="center">
  <img src="https://imgur.com/kvdRbJq.png" alt="NCR Collection Banner" style="max-width: 100%; height: auto;">
</p>

A custom Discord bot for the **Night City Reborn** modding community, providing automated revision tracking, crash log analysis, comprehensive moderation tools, anti-spam protection, audit logging, forum management, and interactive user log scanning.

---

## 🚀 Quickstart

```sh
# Clone and install
git clone https://github.com/NCReborn/ncrbot.git
cd ncrbot
npm install

# Copy and edit environment config
cp .env.example .env
# (edit .env with your secrets)

# Run the bot
npm start
```

---

## 📁 Directory Structure

```
ncrbot/
  commands/                       # Slash command handlers (one per command)
  config/                         # Static config (constants, spam config, collections, etc.)
  data/                           # Persistent data files (warnings, spam stats, user activity, etc.)
  events/                         # Discord event handlers (messageCreate, interactionCreate, audit events, etc.)
  handlers/                       # Interaction routing (buttons, modals, commands)
  services/                       # High-level logic/services
    ├── changelog/                # Changelog generation with templates (NCR, E33)
    ├── spam/                     # Anti-spam system (SpamDetector, SpamActionHandler, UserActivityTracker)
    ├── ForumManager.js           # Bugs & issues forum megathread management
    ├── MediaChannelService.js    # Media-only channel enforcement
    ├── ModerationService.js      # Warning system persistence
    └── RevisionMonitor.js        # NexusMods revision polling
  utils/                          # Helpers and low-level utilities (logger, cooldowns, permissions, etc.)
  .github/workflows/              # CI/CD workflows (GitHub Actions)
  index.js                        # Bot entry point
  deploy-commands.js              # Slash command registration
  package.json                    # Node.js manifest
  README.md                       # Project documentation
  AUDIT_LOGGING.md                # Audit logging system documentation
  .env.example                    # Environment variable template
```

---

## ✨ Features

### 📊 Revision Tracking & Changelogs
- Polls NexusMods every 15 minutes for collection updates and automatically updates Discord voice channels with the latest revision numbers and statuses
- Automatically generates detailed changelogs between revisions showing mod additions, removals, and version updates
- Supports multiple collection groups with templated changelog output (NCR, E33 templates)
- Converts changelog embeds to NexusMods-ready Markdown format for easy cross-posting
- Automatically schedules status reverts after updates

### 🔍 Crash Log Analysis
- Automated error pattern detection for uploaded `.log` or `.txt` files in the crash log channel
- Optional AI-powered summaries via OpenAI for deeper analysis
- Interactive "Scan a Log File" button and modal for users to submit logs directly
- Visual indicators: ❌ for errors detected, ✅ for clean logs

### 🛡️ Anti-Spam System
- Multi-rule spam detection engine with configurable rules:
  - Multi-channel spam detection
  - Duplicate content detection
  - Image spam detection
  - New account risk scoring
- Automatic timeout of detected spammers with message cleanup
- Mod alert embeds with action buttons (Confirm, False Positive, Ban, Adjust Timeout)
- Persistent user activity tracking across sessions
- Configurable whitelist for users and roles (moderators auto-whitelisted)
- Toggle and configure via `/antispam` command

### ⚖️ Moderation Tools
- **Warning System:** `/warn` to issue warnings with DM notifications, `/warnings` to view history, `/clearwarnings` to reset (persistent JSON storage)
- **Timeout:** `/timeout` with preset durations (1 min to 1 week) and reason tracking
- **Slowmode:** `/slowmode` to set channel rate limits (0–6 hours)
- **Support Mention Blocking:** `/blocksupportmention` and `/unblocksupportmention` to manage ping-banned users, with `/listsupportblocked` to list them
- **Autoresponder:** `/autoresponder` to create, edit, delete, and list trigger-based auto-responses (mod only, supports wildcard matching)

### 📋 Audit Logging
- Comprehensive event monitoring with rich colour-coded embeds matching Probot styling
- Tracks: bans, unbans, kicks, joins, leaves, timeouts, role/nickname changes, message edits/deletions, channel CRUD, thread CRUD
- Configurable per-event toggles via `/auditlog toggle`
- Set audit channel via `/auditlog channel`
- Anti-loop protection to prevent logging events in the audit channel itself
- Persistent configuration stored in `config/auditConfig.json`

### 📌 Forum Management (Bugs & Issues)
- Automatic "Investigating" tag application to new forum posts
- Bot alert notifications for new threads pinging support team
- Dynamic megathread management that auto-updates when thread tags change
- Manual refresh via `/refreshmegathread` (supports per-tag or all tags)
- Initialize megathread with `/initmegathread`

### 🖼️ Media Channel Enforcement
- Designate channels as image-only via `/mediachannels`
- Automatically removes non-media messages in enforced channels

### 🤖 Bot Control Panel
- Interactive embed with Reload, Mute, Unmute, and Restart buttons
- Mute/unmute prevents bot from responding to events
- Restart triggers a full bot process restart (admin only)
- Persistent mute state across restarts

### 🔧 Status Channel Management
- Admin-only slash commands to set the collection status:
  - `/stable` — Stable (Latest)
  - `/updating` — Updating Soon (Latest)
  - `/issues` — Issues Detected (Latest)
  - `/investigating` — Issues Reported (Latest)
  - `/pending` — Pending (Core Mods)
  - `/clearrevert` — Clear scheduled status revert

### 📦 Mod Command Database
- `/addcommand` — Add mod commands via popup modal (Moderator+)
- `/findcommand` — Search mod commands by keyword (all users)
- `/removecommand` — Remove commands from the database (Admin)

### 📝 Additional Utilities
- `/version` — Show bot version and recent changes (dynamically loaded from `data/versionInfo.json`)
- `/setversion` — Update the bot version and changelog (Admin)
- `/ncrbotmsg` — Post multi-line messages as NCRBot via modal (Admin)
- `/convertembed` — Convert Discord changelog embeds to NexusMods Markdown format (Admin)
- `/help` — Show all available commands grouped by permission level

---

## 🛠 Getting Started

### Prerequisites

- Node.js **v18+** (recommended: Node.js 22 LTS or 24 LTS)
- A Discord bot application and its token
- [NexusMods API key](https://www.nexusmods.com/users/myaccount?tab=api%20access) for revision polling
- (Optional) [OpenAI API key](https://platform.openai.com/) for AI log analysis

### Installation

1. **Clone the repo:**
   ```sh
   git clone https://github.com/NCReborn/ncrbot.git
   cd ncrbot
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Configure environment variables:**
   ```sh
   cp .env.example .env
   ```
   Edit `.env` with your secrets and config.

---

## ⚙️ Environment Variables

All configuration is managed through `.env`.  
**Never commit your real `.env` file—use `.env.example` as a template!**

| Variable              | Required | Description                                          |
|-----------------------|----------|------------------------------------------------------|
| `DISCORD_TOKEN`       | ✅       | Your Discord bot token                               |
| `CLIENT_ID`           | ✅       | Discord Application Client ID (for deploy-commands)  |
| `NEXUS_API_KEY`       | ✅       | NexusMods API key for revision polling               |
| `APP_NAME`            | ❌       | Application name for Nexus API headers               |
| `APP_VERSION`         | ❌       | Application version for Nexus API headers            |
| `CRASH_LOG_CHANNEL_ID`| ✅       | Channel ID for crash log uploads                     |
| `LOG_SCAN_CHANNEL_ID` | ✅       | Channel ID for scan button/modal submissions         |
| `OPENAI_API_KEY`      | ❌       | OpenAI API key for AI-powered log analysis           |
| `AUTO_SYNC_COMMANDS`  | ❌       | Auto-sync slash commands on startup (default: false)  |
| `GUILD_ID`            | ❌       | Guild ID for command sync                            |
| `LOG_LEVEL`           | ❌       | Winston log level (default: info)                    |

See `.env.example` for a complete template.

---

## 💻 Usage

### Running the Bot

```sh
npm start
```

The bot will log in, begin polling NexusMods for collection updates, set up the log scan button, and listen for commands and events.

### Slash Commands

#### Admin Commands
| Command | Description |
|---------|-------------|
| `/stable` | Set status channel to "Stable (Latest)" |
| `/updating` | Set status channel to "Updating soon (Latest)" |
| `/issues` | Set status channel to "Issues Detected (Latest)" |
| `/investigating` | Set status channel to "Issues Reported (Latest)" |
| `/pending` | Set status channel to "Pending (Core Mods)" |
| `/clearrevert` | Clear the scheduled status revert |
| `/diff` | Show mod differences between collection revisions |
| `/convertembed` | Convert changelog embeds to NexusMods Markdown |
| `/auditlog` | Configure audit logging (toggle, channel, status) |
| `/botcontrol` | Post the bot control panel |
| `/ncrbotmsg` | Post a multi-line message as NCRBot |
| `/setversion` | Update the bot version and changelog |
| `/mediachannels` | Manage media-only channel enforcement |
| `/removecommand` | Remove a mod command from the database |
| `/antispam` | Manage anti-spam system (status, toggle, whitelist) |
| `/clearwarnings` | Clear all warnings for a user |
| `/initmegathread` | Initialize the bugs & issues megathread |
| `/refreshmegathread` | Manually refresh megathread sections |

#### Moderator Commands
| Command | Description |
|---------|-------------|
| `/autoresponder` | Manage auto-responses (add, edit, delete, list) |
| `/addcommand` | Add mod commands via popup modal |
| `/warn` | Warn a user for rule violations |
| `/warnings` | View all warnings for a user |
| `/timeout` | Timeout a user with preset durations |
| `/slowmode` | Set channel slowmode (0 to disable) |
| `/blocksupportmention` | Ban a user from mentioning the support role |
| `/unblocksupportmention` | Unban a user from support role mentions |
| `/listsupportblocked` | List all ping-banned users |

#### User Commands
| Command | Description |
|---------|-------------|
| `/findcommand` | Search for mod commands by keyword |
| `/help` | Show all available commands |
| `/version` | Show bot version and recent changes |

### Log Analysis

- Upload a `.log` or `.txt` file to the crash log channel to trigger automated analysis
- Use the "Scan a Log File" button in the log scan channel to paste log content via modal

---

## 🧑‍💼 Admin & Maintenance Tips

- Use `/botcontrol` to post an interactive control panel for quick mute/unmute/reload/restart
- Use `/auditlog status` to check which audit events are being logged
- Use `/antispam status` to review anti-spam configuration and detection stats
- Use `/refreshmegathread` to manually refresh forum megathread sections
- Use `/reload` (via bot control panel) to reload commands after updates
- To update environment variables, restart the bot process

---

## 🚀 Deployment

- **Deploy Slash Commands:**  
  Run `node deploy-commands.js` to register or update slash commands for your guild.
- **Automated Restarts:**  
  The provided GitHub Actions workflow triggers a server restart on push (see `.github/workflows/main.yml`).  
  Requires `PTERODACTYL_API_KEY` and `SERVER_ID` as GitHub secrets/variables.
- **Cybrancee Hosting:**  
  The bot is designed to run on Cybrancee with auto-update enabled, pulling from the `main` branch on restart.

---

## ❓ FAQ / Troubleshooting

**Q: My slash commands don't show up!**  
A: Make sure you ran `node deploy-commands.js` and that your bot has the `applications.commands` scope and correct permissions.

**Q: I get errors about missing environment variables.**  
A: Check `.env` and make sure all required values are present.

**Q: The bot doesn't update channels or reply to commands.**  
A: Verify your bot token, channel IDs, and that your bot user has permission to manage channels and post in the target channels.

**Q: How do I update dependencies?**  
A: Run `npm audit` to check for vulnerabilities, then `npm audit fix` to patch what's safe. For breaking changes, use `npm audit fix --force` with caution.

**Q: Anti-spam is flagging legitimate users!**  
A: Use the "False Positive" button on the mod alert, or add the user to the whitelist via `/antispam whitelist`.

---

## 🔒 Security Notes

- **Never commit your real `.env` file or any secrets to version control!**
- Use `.env.example` as a template only.
- Only grant your bot the minimum Discord permissions required.
- Keep your dependencies up to date (`npm audit`).
- Make sure you do not log or echo API keys or secrets in public channels.
- Log rotation is configured (5MB per file, 3 rotated files max) to prevent disk filling.

---

## 🤝 Contributing

Pull requests and issues are welcome!  
If you have suggestions, bug reports, or want to help improve the bot:

- Fork and clone the repo
- Create a feature branch
- Make changes and add tests in `tests/`
- Run `npm test` before pushing
- Submit a pull request!

---

## 💬 Support

For questions or support, open a [GitHub issue](https://github.com/NCReborn/ncrbot/issues) or join the [Night City Reborn Discord](https://discord.gg/nightcityreborn).

---

## 📝 License

MIT

---

## 🙌 Credits

- [discord.js](https://discord.js.org/)
- [NexusMods API](https://www.nexusmods.com/)
- [OpenAI API](https://platform.openai.com/)
- [Winston Logger](https://github.com/winstonjs/winston)
- mquiny and contributors
