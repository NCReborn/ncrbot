const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { PermissionChecker } = require("../utils/permissions");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-announce")
        .setDescription("Post a SnapMaster announcement as a clean embed")
        .addStringOption(option =>
            option.setName("text")
                .setDescription("The announcement text you want to convert into an embed")
                .setRequired(true)
        ),

    async execute(interaction) {
        // Moderator check
        if (!PermissionChecker.hasModRole(interaction.member)) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                ephemeral: true
            });
        }

        const rawText = interaction.options.getString("text");

        // Build embed
        const embed = new EmbedBuilder()
            .setTitle("📸 SnapMaster Announcement")
            .setDescription(rawText)
            .setColor(0x00aaff)
            .setTimestamp();

        // Post embed
        await interaction.reply({
            content: "📢 Announcement posted.",
            ephemeral: true
        });

        await interaction.channel.send({
            embeds: [embed],
            allowedMentions: { parse: [] } // prevents pings
        });
    }
};
