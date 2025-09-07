# NCR Utilities Bot

A Discord bot for NCR/ADR communities.  
It automates collection revision tracking, provides crash log scanning and analysis (with AI diagnostics), and allows staff to update status channels for users.

---

## Features

- **Collection Revision Polling:**  
  Automatically monitors NexusMods collection revisions and updates Discord channels accordingly.

- **Crash Log Scanning:**  
  Users can upload `.log` or `.txt` files for automated error detection and receive AI-powered troubleshooting tips.

- **Slash Commands:**  
  - `/diff` - Compare modlists between revisions/collections
  - `/version` - Show bot version and changelog
  - `/investigating`, `/issues`, `/stable`, `/updating` - Admin-only commands to update status channels

- **Admin Utilities:**  
  Staff can update status indicators for the community with built-in cooldowns to prevent spam.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A Discord bot token ([guide](https://discord.com/developers/applications))
- Nexus Mods API key (for revision polling)
- (Optional) OpenAI API key for AI log explanations

### Installation

1. Clone the repo:
   ```sh
   git clone https://github.com/mquiny/ncrbot.git
   cd ncrbot
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

3. Configure your environment:
   - Copy the example env and fill in your values:
     ```sh
     cp .env.example .env
     ```
   - Edit `.env` and provide your Discord/Nexus/OpenAI keys.

### Running the Bot

```sh
npm start
```

The bot will log in and begin polling collections and listening for log uploads and commands.

---

## Environment Variables

See `.env.example` for all available options.

| Variable              | Description                          |
|-----------------------|--------------------------------------|
| DISCORD_TOKEN         | Your Discord bot token (required)    |
| NEXUS_API_KEY         | NexusMods API key (required)         |
| APP_NAME              | App name for Nexus API (optional)    |
| APP_VERSION           | App version for Nexus API (optional) |
| CRASH_LOG_CHANNEL_ID  | Channel for log uploads              |
| LOG_SCAN_CHANNEL_ID   | Channel for scan button              |
| OPENAI_API_KEY        | OpenAI API key (optional, for AI)    |

---

## Usage

- Users:  
  - Upload crash logs in the configured channel or use the scan button for quick analysis.
- Staff:  
  - Use the slash commands to update status channels or get changelogs.

---

## Contributing

Pull requests are welcome! For major changes, open an issue first to discuss.

---

## License

MIT

---

## Help & Community

- For help, ping `@mquiny` on Discord or open an issue in this repo.
