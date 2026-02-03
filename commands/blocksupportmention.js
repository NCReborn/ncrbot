const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { PermissionChecker } = require('../utils/permissions');
const CONSTANTS = require('../config/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blocksupportmention')
        .setDescription('Ban a user from mentioning the support role by assigning the Ping Banned role.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to ping-ban')
                .setRequired(true)
        ),
    async execute(interaction) {
        if (!PermissionChecker.hasModRole(interaction.member)) {
            return await interaction.reply({ content: "You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
        }
        const user = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(user.id);

        if (member.roles.cache.has(CONSTANTS.ROLES.PING_BANNED)) {
            return await interaction.reply({ content: `${user.tag} is already ping-banned.`, flags: MessageFlags.Ephemeral });
        }

        await member.roles.add(CONSTANTS.ROLES.PING_BANNED, 'Ping-banned from mentioning support role');
        
        // Attempt to DM the user
        try {
            await user.send(
                `You have been banned from mentioning the support role in **${interaction.guild.name}**. Please contact the moderators if you believe this is a mistake.`
            );
        } catch (err) {
            // Ignore if user has DMs blocked
        }

        await interaction.reply({ content: `${user.tag} is now ping-banned from mentioning the support role.`, flags: MessageFlags.Ephemeral });
    },
};
