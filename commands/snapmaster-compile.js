const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const snapmaster = require("../utils/snapmaster");
const { PermissionChecker } = require("../utils/permissions");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-compile")
        .setDescription("Compile all eligible SnapMaster users and their submissions into a single embed"),

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

        const embed = new EmbedBuilder()
            .setTitle("📸 SnapMaster Voting Package")
            .setDescription("All eligible users and their submissions for this month's SnapMaster")
            .setColor(0x00aaff)
            .setTimestamp();

        // Add each user as a field
        for (const entry of eligible) {
            const userId = entry.userId;
            const data = snapmaster.getUser(userId);

            if (!data || data.messages.length === 0) continue;

            const sortedMessages = [...data.messages].reverse();

            embed.addFields({
                name: `👤 <@${userId}> — ${entry.count} submissions`,
                value: sortedMessages.map(link => `• ${link}`).join("\n")
            });
        }

        await interaction.channel.send({
            embeds: [embed],
            allowedMentions: { parse: [] }
        });

        await interaction.followUp({
            content: "✅ SnapMaster compilation posted.",
            ephemeral: true
        });
    }
};
