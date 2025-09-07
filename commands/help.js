const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and their descriptions'),
  async execute(interaction) {
    const commands = interaction.client.commands;
    const embed = new EmbedBuilder()
      .setTitle('Available Commands')
      .setColor(5814783)
      .setDescription(commands.map(cmd => `• **/${cmd.data.name}** — ${cmd.data.description}`).join('\n'));
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
