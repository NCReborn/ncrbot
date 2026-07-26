const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const snapmaster = require("../utils/snapmaster");
const { PermissionChecker } = require("../utils/permissions");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-compile")
        .setDescription("Compile all eligible SnapMaster users and their submissions into embeds"),

    async execute(interaction) {
        // Moderator check
        if (!PermissionChecker.hasModRole(interaction.member)) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                ephemeral: true
            });
        }

        await interaction.reply({
            content: "📸 Compiling SnapMaster entries…",
            ephemeral: true
        });

        const eligible = snapmaster.getEligible(5);

        if (eligible.length === 0) {
            return interaction.followUp({
                content: "❌ No eligible users this month.",
                ephemeral: true
            });
        }

        // Sort descending
        eligible.sort((a, b) => b.count - a.count);

        // -----------------------------
        // MAIN ELIGIBILITY EMBED
        // -----------------------------
        const mainEmbed = new EmbedBuilder()
            .setTitle("📸 SnapMaster — Eligible Users")
            .setDescription("Users with **≥ 5 submissions** this month")
            .setColor(0x00aaff)
            .setTimestamp()
            .addFields({
                name: "Eligible Members",
                value: eligible
                    .map(e => `• <@${e.userId}> — **${e.count}** submissions`)
                    .join("\n")
            });

        await interaction.channel.send({
            embeds: [mainEmbed],
            allowedMentions: { parse: [] }
        });

        // -----------------------------
        // INDIVIDUAL USER EMBEDS
        // -----------------------------
        for (const entry of eligible) {
            const userId = entry.userId;
            const data = snapmaster.getUser(userId);

            if (!data || data.messages.length === 0) continue;

            // Sort newest → oldest
            const sortedMessages = [...data.messages].reverse();

            const userEmbed = new EmbedBuilder()
                .setTitle(`📸 SnapMaster Submissions — <@${userId}>`)
                .setColor(0x00aaff)
                .setTimestamp()
                .setDescription(
                    sortedMessages
                        .map(link => `• ${link}`)
                        .join("\n")
                );

            await interaction.channel.send({
                embeds: [userEmbed],
                allowedMentions: { parse: [] }
            });
        }

        // Final confirmation
        await interaction.followUp({
            content: "✅ SnapMaster compilation posted.",
            ephemeral: true
        });
    }
};
