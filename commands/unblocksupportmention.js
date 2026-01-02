import { SlashCommandBuilder } from 'discord.js';
import { hasModRole } from '../utils/hasModRole.js';

const PING_BANNED_ROLE_ID = '1456763426159329555';

export default {
    data: new SlashCommandBuilder()
        .setName('unblocksupportmention')
        .setDescription('Allow a user to mention the support role again by removing the Ping Banned role')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to un-ping-ban')
                .setRequired(true)
        ),
    async execute(interaction) {
        if (!hasModRole(interaction.member)) {
            return await interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
        }
        const user = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(user.id);

        if (!member.roles.cache.has(PING_BANNED_ROLE_ID)) {
            return await interaction.reply({ content: `${user.tag} is not ping-banned.`, ephemeral: true });
        }

        await member.roles.remove(PING_BANNED_ROLE_ID, 'Unblocked from mentioning support role');
        await interaction.reply({ content: `${user.tag} can now mention the support role again.`, ephemeral: true });
    }
};
