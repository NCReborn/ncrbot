const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const snapmaster = require("../utils/snapmaster");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-stats")
        .setDescription("Shows who is currently eligible for SnapMaster this month"),

    async execute(interaction) {
        const eligible = snapmaster.getEligible(5);

        // Sort descending
        eligible.sort((a, b) => b.count - a.count);

        const embed = new EmbedBuilder()
            .setTitle("📸 SnapMaster Eligibility")
            .setDescription("Users with **≥ 5 submissions** this month")
            .setColor(0x00aaff)
            .setTimestamp();

        if (eligible.length === 0) {
            embed.addFields({
                name: "No eligible users",
                value: "_Nobody has reached 5 submissions yet._"
            });
        } else {
            embed.addFields({
                name: "Eligible Members",
                value: eligible
                    .map(e => `• <@${e.userId}> — **${e.count}** submissions`)
                    .join("\n")
            });
        }

        await interaction.reply({
            embeds: [embed],
            allowedMentions: { parse: [] } // prevents pings
        });
    }
};
