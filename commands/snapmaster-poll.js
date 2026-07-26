const { SlashCommandBuilder } = require("discord.js");
const snapmaster = require("../utils/snapmaster");
const { PermissionChecker } = require("../utils/permissions");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-poll")
        .setDescription("Create a SnapMaster voting poll for all eligible users"),

    async execute(interaction) {
        // Moderator check
        if (!PermissionChecker.hasModRole(interaction.member)) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                ephemeral: true
            });
        }

        const eligible = snapmaster.getEligible(5);

        if (eligible.length === 0) {
            return interaction.reply({
                content: "❌ No eligible users this month.",
                ephemeral: true
            });
        }

        // Sort descending
        eligible.sort((a, b) => b.count - a.count);

        // Build poll answers
        const answers = eligible.map(e => ({
            poll_media: {
                text: `<@${e.userId}>`
            }
        }));

        // Create poll
        await interaction.reply({
            content: "📊 Creating SnapMaster poll…",
            ephemeral: true
        });

        await interaction.channel.send({
            poll: {
                question: {
                    text: `SnapMaster of the Month — ${new Date().toLocaleString("en-GB", { month: "long", year: "numeric" })}`
                },
                answers,
                duration: 3 * 24 * 60, // 3 days in minutes
                allow_multiselect: false
            },
            allowedMentions: { parse: [] }
        });

        await interaction.followUp({
            content: "✅ SnapMaster poll posted.",
            ephemeral: true
        });
    }
};
