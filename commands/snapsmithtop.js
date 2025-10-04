const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const snapsmithRoles = require('../modules/snapsmith/Roles');
const snapsmithTracker = require('../modules/snapsmith/tracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snapsmithtop')
        .setDescription('Show top Snapsmith role holders by unique reactions')
        .addIntegerOption(opt =>
            opt.setName('count')
                .setDescription('Number of top users to show')
                .setRequired(false)
        ),
    async execute(interaction) {
        try {
            const count = interaction.options.getInteger('count') ?? 10;

            // Get all user IDs with active Snapsmith role
            const userData = require('../modules/snapsmith/storage').loadUserData();
            const currentSnapsmithIds = Object.entries(userData)
                .filter(([userId, meta]) => snapsmithRoles.getSnapsmithStatus(userId).isActive)
                .map(([userId]) => userId);

            // Get reaction counts for current snapsmiths
            const reactionCounts = currentSnapsmithIds.map(userId => ({
                userId,
                total: snapsmithTracker.getUserReactionStats(userId).total
            }));

            // Sort and slice top N
            reactionCounts.sort((a, b) => b.total - a.total);
            const top = reactionCounts.slice(0, count);

            let desc = '';
            for (let i = 0; i < top.length; i++) {
                desc += `**${i + 1}. <@${top[i].userId}>** — ${top[i].total} reactions\n`;
            }

            const embed = new EmbedBuilder()
                .setColor(0xFAA61A)
                .setTitle(`Snapsmith Top ${count}`)
                .setDescription(desc.length > 0 ? desc : "No current Snapsmith role holders found.");

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error("Error in /snapsmithtop command:", err);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: "There was an error executing this command!", flags: 64 });
            } else {
                await interaction.editReply({ content: "There was an error executing this command!", flags: 64 });
            }
        }
    }
};
