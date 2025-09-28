const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

const REACTION_DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmithreactions.json');
const META_DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmith.json');

function loadReactions() {
    if (fs.existsSync(REACTION_DATA_PATH)) {
        return JSON.parse(fs.readFileSync(REACTION_DATA_PATH, 'utf8'));
    }
    return {};
}

function loadMeta() {
    if (fs.existsSync(META_DATA_PATH)) {
        return JSON.parse(fs.readFileSync(META_DATA_PATH, 'utf8'));
    }
    return {};
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snapsmithtop')
        .setDescription('Show top users by unique reactions')
        .addIntegerOption(opt =>
            opt.setName('count')
                .setDescription('Number of top users to show')
                .setRequired(false)
        ),
    async execute(interaction) {
        try {
            const reactions = loadReactions();
            const meta = loadMeta();
            const count = interaction.options.getInteger('count') ?? 10;

            // Build a map of userId -> totalUniqueReactions
            const totals = {};
            for (const userId of Object.keys(reactions)) {
                let totalUniqueReactions = 0;
                const userReactions = reactions[userId] || {};
                for (const monthObj of Object.values(userReactions)) {
                    for (const reactorsArr of Object.values(monthObj)) {
                        totalUniqueReactions += reactorsArr.length;
                    }
                }
                totals[userId] = totalUniqueReactions;
            }

            // Sort by totalUniqueReactions
            const sorted = Object.entries(totals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, count);

            if (sorted.length === 0) {
                await interaction.reply({ content: "No Snapsmith data found.", ephemeral: true });
                return;
            }

            let desc = '';
            for (let i = 0; i < sorted.length; i++) {
                const [userId, total] = sorted[i];
                desc += `**${i + 1}. <@${userId}>** — ${total} reactions\n`;
            }

            const embed = new EmbedBuilder()
                .setColor(0xFAA61A)
                .setTitle(`Snapsmith Top ${count}`)
                .setDescription(desc);

            await interaction.reply({ embeds: [embed], ephemeral: false });
        } catch (err) {
            console.error("Error in /snapsmithtop command:", err);
            await interaction.reply({ content: "There was an error executing this command!", ephemeral: true });
        }
    }
};
