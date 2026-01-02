import { SlashCommandBuilder } from 'discord.js';
import { hasModRole } from '../../utils/hasModRole.js';

const PING_BANNED_ROLE_ID = '1456763426159329555';

export default {
    data: new SlashCommandBuilder()
        .setName('listsupportblocked')
        .setDescription('List users who are ping-banned from mentioning the support role.'),
    async execute(interaction) {
        if (!hasModRole(interaction.member)) {
            return await interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
        }

        const role = interaction.guild.roles.cache.get(PING_BANNED_ROLE_ID);
        if (!role) {
            return await interaction.reply({ content: "The ping-banned role does not exist.", ephemeral: true });
        }

        const members = role.members.map(m => `<@${m.id}>`);
        if (!members.length) {
            await interaction.reply({ content: "No users are currently ping-banned.", ephemeral: true });
        } else {
            await interaction.reply({ content: `Ping-banned users: ${members.join(', ')}`, ephemeral: true });
        }
    },
};
