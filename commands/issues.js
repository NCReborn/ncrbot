const { SlashCommandBuilder } = require('discord.js');
const { handleStatusUpdate } = require('../utils/handleStatusUpdate');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('issues')
    .setDescription('Set the status channel to "Issues Detected (Latest)" (Admin only)'),
  async execute(interaction) {
    await handleStatusUpdate(interaction, 'issues');
  }
};
