const { Events } = require('discord.js');
const CONSTANTS = require('../config/constants');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        const member = message.member;
        if (!member || !member.roles.cache.has(CONSTANTS.ROLES.PING_BANNED)) return;

        // If the message mentions the support role and sender is ping-banned, delete message
        if (message.mentions.roles.has(CONSTANTS.ROLES.SUPPORT)) {
            try {
                await message.delete();            

                // Attempt to DM the user as a reminder
                try {
                    await message.author.send(
                        `You attempted to mention the support role in **${message.guild.name}**, but you are currently banned from doing so. If you believe this is an error, please contact the staff team.`
                    );
                } catch (err) {
                    // Ignore if user has DMs blocked
                }

            } catch (err) {
                console.error("Could not delete blocked ping message:", err);
            }
        }
    }
};
