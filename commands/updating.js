const { SlashCommandBuilder } = require('discord.js');
const { handleStatusUpdate } = require('../utils/handleStatusUpdate');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updating')
    .setDescription('Set the status channel to "Updating soon (Latest)" (Admin only)'),
  async execute(interaction) {
    await handleStatusUpdate(interaction, 'updating');
  }
};
