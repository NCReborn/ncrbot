const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

const REACTION_DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmithreactions.json');
const SHOWCASE_CHANNEL_ID = '1285797205927792782';
const MAX_ENTRIES = 10; // Number of top users to display

function getCurrentMonth() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function loadReactions() {
    if (fs.existsSync(REACTION_DATA_PATH)) {
        return JSON.parse(fs.readFileSync(REACTION_DATA_PATH, 'utf8'));
    }
    return {};
}

function getLeaderboard(reactions, month) {
    const leaderboard = [];
    for (const [userId, months] of Object.entries(reactions)) {
        const userMonthData = months[month];
        if (!userMonthData) continue;
        let totalReactions = 0;
        for (const reactorsArr of Object.values(userMonthData)) {
            totalReactions += reactorsArr.length;
        }
        leaderboard.push({ userId, totalReactions });
    }
    // Sort by most reactions
    leaderboard.sort((a, b) => b.totalReactions - a.totalReactions);
    return leaderboard.slice(0, MAX_ENTRIES);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snapsmithtop')
        .setDescription('Show the Snapsmith leaderboard for most unique reactions this month'),
    async execute(interaction) {
        const reactions = loadReactions();
        const month = getCurrentMonth();
        const leaderboard = getLeaderboard(reactions, month);

        if (leaderboard.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFAA61A)
                .setTitle('Snapsmith Leaderboard')
                .setDescription('No leaderboard data found for this month. Submit your photos in <#' + SHOWCASE_CHANNEL_ID + '> to get started!')
                .setFooter({ text: 'Leaderboard resets monthly. Keep posting amazing shots in #showcase!' });
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        const userStrings = await Promise.all(leaderboard.map(async (entry, idx) => {
            try {
                const user = await interaction.client.users.fetch(entry.userId);
                return `**${idx + 1}.** <@${entry.userId}> (${user.username}) - **${entry.totalReactions}** unique reactions`;
            } catch {
                return `**${idx + 1}.** <@${entry.userId}> - **${entry.totalReactions}** unique reactions`;
            }
        }));

        const embed = new EmbedBuilder()
            .setColor(0xFAA61A)
            .setTitle('Snapsmith Leaderboard')
            .setDescription(`Top ${userStrings.length} chooms with the most unique photo reactions this month:\n\n${userStrings.join('\n')}`)
            .setFooter({ text: 'Leaderboard resets monthly. Keep posting amazing shots in #showcase!' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
