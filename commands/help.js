const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and their descriptions'),
  async execute(interaction) {
    const helpEmbed = new EmbedBuilder()
      .setTitle('Available Commands')
      .setDescription(
`**Admin Commands:**
• /clearrevert – Clears the scheduled status revert 
• /diff – Show mod differences between collection revisions 
• /investigating – Set the status channel to "Issues Reported (Latest)" 
• /issues – Set the status channel to "Issues Detected (Latest)" 
• /stable – Set the status channel to "Stable (Latest)" 
• /updating – Set the status channel to "Updating soon (Latest)" 
• /auditlog – Configure audit logging settings (Admin only)
• /botcontrol – Post the bot control panel in this channel (Admin only)
• /ncrbotmsg – Post a multi-line message as NCRBot (Admin only)
• /pending – Set the status channel to "Pending (Core Mods)" (Admin only)
• /setversion – Update the bot version and changelog (Admin only)
• /convertembed – Fetches embeds from one or more messages and converts them to Nexus-ready Markdown
• /addimageonly – Add a channel to image-only enforcement. (Moderator/Admin)
• /removeimageonly – Remove a channel from image-only enforcement. 
• /listmediachannels – List all image-only and file-only channels

**Moderator Commands:**
• /autoresponder – Manage auto-responses for mods
• /addcommand – Open a popup to manually add mod commands to the database (Moderator/Admin)

**User Commands:**
• /findcommand – Search for mod commands by keyword (mod name, item, etc.)
• /help – Show available commands and their descriptions
• /version – Show the bot version and recent changes`
      )
      .setColor(5814783);

    await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
  }
};
