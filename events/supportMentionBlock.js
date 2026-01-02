import { Events } from 'discord.js';

const SUPPORT_ROLE_ID = '1456751771841204295';
const PING_BANNED_ROLE_ID = '1456763426159329555';

export default {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        const member = message.member;
        if (!member || !member.roles.cache.has(PING_BANNED_ROLE_ID)) return;

        // If the message mentions the support role and sender is ping-banned, delete message
        if (message.mentions.roles.has(SUPPORT_ROLE_ID)) {
            try {
                await message.delete();
                await message.channel.send({
                    content: `${message.author}, you are banned from mentioning <@&${SUPPORT_ROLE_ID}>.`,
                    allowedMentions: { users: [message.author.id] },
                    deleteAfter: 5
                });
            } catch (err) {
                console.error("Could not delete blocked ping message:", err);
            }
        }
    }
};
