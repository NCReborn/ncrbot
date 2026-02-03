const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { PermissionChecker } = require('../utils/permissions');
const CONSTANTS = require('../config/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listsupportblocked')
        .setDescription('List users who are ping-banned from mentioning the support role.'),
    async execute(interaction) {
        if (!PermissionChecker.hasModRole(interaction.member)) {
            return interaction.reply({ content: "You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
        }

        const role = interaction.guild.roles.cache.get(CONSTANTS.ROLES.PING_BANNED);
        if (!role) {
            return interaction.reply({ content: "The ping-banned role does not exist.", flags: MessageFlags.Ephemeral });
        }

        const members = role.members.map(m => `<@${m.id}>`);
        if (!members.length) {
            await interaction.reply({ content: "No users are currently ping-banned.", flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: `Ping-banned users: ${members.join(', ')}`, flags: MessageFlags.Ephemeral });
        }
    },
};
