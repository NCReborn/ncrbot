# NCRBot
<img src="https://imgur.com/5FAEzSA.png" alt="NCR Collection Logo" width="128"/>

A Discord bot for the NCR/ADR modding communities, providing revision tracking, crash log analysis, status channel management, and advanced utilities for Cyberpunk 2077 collection maintainers.

---

## Quickstart

```sh
# Clone and install
git clone https://github.com/mquiny/ncrbot.git
cd ncrbot
npm install

# Copy and edit environment config
cp .env.example .env
# (edit .env with your secrets)

# Run the bot
npm start
```

---

## Directory Structure

```
ncrbot/
  commands/         # Slash command handlers (one per command)
  config/           # Static config (constants, mappings, etc)
  data/             # Persistent data files (e.g. collection_state.json)
  services/         # High-level logic/services (e.g. changelogService.js)
  utils/            # Helpers and low-level utilities (logger, cooldowns, etc)
  .github/workflows/ # CI/CD workflows (GitHub Actions)
  index.js          # Bot entry point
  deploy-commands.js # Slash command registration
  package.json      # Node.js manifest
  README.md         # Project documentation
  .env.example      # Environment variable template
```

---

## Features

- **Revision Tracking:**  
  Polls NexusMods for collection updates and updates Discord voice channels with the latest revision numbers and statuses.
- **Crash Log Analysis:**  
  Automated error pattern detection and optional AI-powered summaries for uploaded `.log` or `.txt` files.
- **Status Channel Management:**  
  Admin-only slash commands to set the status channel to "Stable", "Updating soon", "Issues Reported", etc.
- **Mod Diff Changelogs:**  
  Generate changelogs between collection revisions, optionally comparing two collections at once.
- **User Log Scan Ticket:**  
  Interactive button and modal for users to submit logs for automated scanning and advice.

---

## Getting Started

### Prerequisites

- Node.js **v18+** (required by discord.js v14)
- A Discord bot application and its token
- (Optional) [NexusMods API key](https://www.nexusmods.com/users/myaccount?tab=api%20access) for revision polling
- (Optional) [OpenAI API key](https://platform.openai.com/) for AI log analysis

### Installation

1. **Clone the repo:**
   ```sh
   git clone https://github.com/mquiny/ncrbot.git
   cd ncrbot
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

3. **Configure environment variables:**

   Copy the example file and fill in your secrets:
   ```sh
   cp .env.example .env
   ```

   Edit `.env` in your favorite editor.  
   See below for the required variables.

---

## Environment Variables

All configuration is managed through `.env`.  
**Never commit your real `.env` file—use `.env.example` as a template!**

| Variable              | Description                                     |
|-----------------------|-------------------------------------------------|
| DISCORD_TOKEN         | Your Discord bot token (required)               |
| CLIENT_ID             | Discord Application Client ID (for deploy-commands.js) |
| NEXUS_API_KEY         | NexusMods API key (for revision polling)        |
| APP_NAME              | Application name for Nexus API (optional)       |
| APP_VERSION           | Application version for Nexus API (optional)    |
| CRASH_LOG_CHANNEL_ID  | Channel ID for crash log uploads                |
| LOG_SCAN_CHANNEL_ID   | Channel ID for scan button/modal submissions    |
| OPENAI_API_KEY        | (Optional) OpenAI API key for AI log analysis   |

See `.env.example` for a complete template.

---

## Usage

### Running the Bot

```sh
npm start
```

The bot will log in and begin polling NexusMods for collection status changes, updating voice channels, and listening for commands.

### Slash Commands

- `/version` — Show bot version and recent changes.
- `/diff` — Show mod differences between collection revisions (admin only).
- `/stable` — Set status channel to "Stable (Latest)" (admin only).
- `/issues` — Set status channel to "Issues Detected (Latest)" (admin only).
- `/investigating` — Set status channel to "Issues Reported (Latest)" (admin only).
- `/updating` — Set status channel to "Updating soon (Latest)" (admin only).
- `/help` — Show all available commands.
- `/reload` — Reload all slash commands (admin only).

### Log Analysis

- Upload a `.log` or `.txt` file to the crash log channel to trigger automated analysis.
- Use the "Scan a Log File" button in the log scan channel to paste log content and receive analysis via modal.

---

## Admin & Maintenance Tips

- Use `/reload` to reload slash commands after adding or updating commands.
- Use `/help` to list all available commands.
- To update environment variables, restart the bot process.

---

## Running Tests

Install dependencies (including dev dependencies):

```sh
npm install
```

Run all tests:

```sh
npm test
```

Test files are located in the `tests/` directory.  
Add new tests for utilities and commands as you extend the bot.

---

## Deployment

- **Deploy Slash Commands:**  
  Run `node deploy-commands.js` to register or update slash commands for your guild.
- **Automated Restarts:**  
  The provided GitHub Actions workflow triggers a server restart on push (see `.github/workflows/main.yml`).  
  Requires `PTERODACTYL_API_KEY` and `SERVER_ID` as GitHub secrets/variables.

---

## FAQ / Troubleshooting

**Q: My slash commands don't show up!**  
A: Make sure you ran `node deploy-commands.js` and that your bot has the `applications.commands` scope and correct permissions.

**Q: I get errors about missing environment variables.**  
A: Check `.env` and make sure all required values are present.

**Q: The bot doesn't update channels or reply to commands.**  
A: Verify your bot token, channel IDs, and that your bot user has permission to manage channels and post in the target channels.

**Q: How do I update dependencies?**  
A: Run `npm install` to update as per `package.json`.

---

## Security Notes

- **Never commit your real `.env` file or any secrets to version control!**
- Use `.env.example` as a template only.
- Only grant your bot the minimum Discord permissions required.
- Keep your dependencies up to date (`npm audit`).
- Make sure you do not log or echo API keys or secrets in public channels.

---

## Contributing

Pull requests and issues are welcome!  
If you have suggestions, bug reports, or want to help improve the bot:

- Fork and clone the repo
- Create a feature branch
- Make changes and add tests in `tests/`
- Run `npm test` before pushing
- Submit a pull request!

---

## Support

For questions or support, open a GitHub issue or [join our Discord](https://discord.gg/YOUR_INVITE) (if applicable).

---

## License

MIT

---

## Credits

- [discord.js](https://discord.js.org/)
- [NexusMods API](https://www.nexusmods.com/)
- [OpenAI API](https://platform.openai.com/)
- mquiny and contributors
