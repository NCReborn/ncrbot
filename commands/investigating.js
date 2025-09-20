const { SlashCommandBuilder } = require('discord.js');
const { handleStatusUpdate } = require('../utils/handleStatusUpdate');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('investigating')
    .setDescription('Set the status channel to "Issues Reported (Latest)" (Admin only)'),
  async execute(interaction) {
    await handleStatusUpdate(interaction, 'investigating');
  }
};
