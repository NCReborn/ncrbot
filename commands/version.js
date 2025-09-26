const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const VERSION_FILE = path.join(__dirname, '../data/versionInfo.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Show the bot version and recent changes.'),
  async execute(interaction) {
    // Load latest version info
    let versionObj = { version: 'N/A', changes: 'No changes recorded yet.' };
    try {
      if (fs.existsSync(VERSION_FILE)) {
        versionObj = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
      }
    } catch (err) {
      // ignore, fallback to default
    }

    const versionEmbed = new EmbedBuilder()
      .setTitle('NCReborn Utilities Bot Version')
      .setDescription(`**Version:** ${versionObj.version}\n**Changes:** ${versionObj.changes}`)
      .setColor(5814783);

    await interaction.reply({ embeds: [versionEmbed], ephemeral: true });
  }
};
