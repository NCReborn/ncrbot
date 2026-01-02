const { SlashCommandBuilder } = require('discord.js');
const { hasModRole } = require('../utils/hasModRole.js');

const PING_BANNED_ROLE_ID = '1456763426159329555';

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
        if (!hasModRole(interaction.member)) {
            return await interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
        }
        const user = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(user.id);

        if (member.roles.cache.has(PING_BANNED_ROLE_ID)) {
            return await interaction.reply({ content: `${user.tag} is already ping-banned.`, ephemeral: true });
        }

        await member.roles.add(PING_BANNED_ROLE_ID, 'Ping-banned from mentioning support role');
        
        // Attempt to DM the user
        try {
            await user.send(
                `You have been banned from mentioning the support role in **${interaction.guild.name}**. Please contact the moderators if you believe this is a mistake.`
            );
        } catch (err) {
            // Ignore if user has DMs blocked
        }

        await interaction.reply({ content: `${user.tag} is now ping-banned from mentioning the support role.`, ephemeral: true });
    },
};
