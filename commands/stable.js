const { SlashCommandBuilder } = require('discord.js');
const { handleStatusUpdate } = require('../utils/handleStatusUpdate');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stable')
    .setDescription('Set the status channel to "Stable (Latest)" (Admin only)'),
  async execute(interaction) {
    await handleStatusUpdate(interaction, 'stable');
  }
};
