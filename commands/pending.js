const { SlashCommandBuilder } = require('discord.js');
const { handleStatusUpdate } = require('../utils/handleStatusUpdate');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pending')
    .setDescription('Set the status channel to "Pending (Core Mods)" (Admin only)'),
  async execute(interaction) {
    await handleStatusUpdate(interaction, 'pending');
  }
};
