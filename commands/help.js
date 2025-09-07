const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

// Classify commands by name
const ADMIN_COMMANDS = [
  'diff', 'clearrevert', 'investigating', 'issues', 'reload', 'stable', 'updating'
];
// Add mod-only commands here if needed in the future
const MOD_COMMANDS = [
  // e.g. 'someModCommand'
];
const USER_COMMANDS = [
  'help', 'version'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and their descriptions'),
  async execute(interaction) {
    const commands = interaction.client.commands;

    // Organize commands into categories
    const adminCmds = [];
    const modCmds = [];
    const userCmds = [];

    for (const cmd of commands.values()) {
      if (ADMIN_COMMANDS.includes(cmd.data.name)) {
        adminCmds.push(cmd);
      } else if (MOD_COMMANDS.includes(cmd.data.name)) {
        modCmds.push(cmd);
      } else {
        userCmds.push(cmd);
      }
    }

    let desc = '';
    if (adminCmds.length) {
      desc += '**Admin Commands:**\n';
      desc += adminCmds
        .map(c => `• **/${c.data.name}** — ${c.data.description}`)
        .join('\n');
      desc += '\n\n';
    }
    if (modCmds.length) {
      desc += '**Mod Commands:**\n';
      desc += modCmds
        .map(c => `• **/${c.data.name}** — ${c.data.description}`)
        .join('\n');
      desc += '\n\n';
    }
    if (userCmds.length) {
      desc += '**User Commands:**\n';
      desc += userCmds
        .map(c => `• **/${c.data.name}** — ${c.data.description}`)
        .join('\n');
    }

    const embed = new EmbedBuilder()
      .setTitle('Available Commands')
      .setColor(5814783)
      .setDescription(desc.trim());

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
