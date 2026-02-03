const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { PermissionChecker } = require('../utils/permissions');
const CONSTANTS = require('../config/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unblocksupportmention')
        .setDescription('Allow a user to mention the support role again by removing the Ping Banned role')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to un-ping-ban')
                .setRequired(true)
        ),
    async execute(interaction) {
        if (!PermissionChecker.hasModRole(interaction.member)) {
            return interaction.reply({ content: "You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
        }
        const user = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(user.id);

        if (!member.roles.cache.has(CONSTANTS.ROLES.PING_BANNED)) {
            return interaction.reply({ content: `${user.tag} is not ping-banned.`, flags: MessageFlags.Ephemeral });
        }

        await member.roles.remove(CONSTANTS.ROLES.PING_BANNED, 'Unblocked from mentioning support role');

        // Attempt to DM the user
        try {
            await user.send(
                `You have been unbanned from mentioning the support role in **${interaction.guild.name}**. Please use this responsibly!`
            );
        } catch (err) { /* ignore if user has DMs blocked */ }

        await interaction.reply({ content: `${user.tag} can now mention the support role again.`, flags: MessageFlags.Ephemeral });
    },
};
