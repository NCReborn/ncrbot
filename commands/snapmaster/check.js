const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const snapmaster = require("../../utils/snapmaster");
const { PermissionChecker } = require("../../utils/permissions");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-check")
        .setDescription("Shows all SnapMaster submissions made by a user this month")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("User to check")
                .setRequired(true)
        ),

    async execute(interaction) {
        // Moderator check
        if (!PermissionChecker.hasModRole(interaction.member)) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                flags: MessageFlags.Ephemeral
            });
        }

        const user = interaction.options.getUser("user");
        const data = snapmaster.getUser(user.id);

        if (!data || data.messages.length === 0) {
            return interaction.reply({
                content: `❌ No SnapMaster submissions found for ${user}.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Sort newest → oldest
        const sortedMessages = [...data.messages].reverse();

        const embed = new EmbedBuilder()
            .setTitle(`📸 SnapMaster Submissions for ${user.username}`)
            .setColor(0x00aaff)
            .setTimestamp()
            .setDescription(
                sortedMessages
                    .map(link => `• ${link}`)
                    .join("\n")
            );

        await interaction.reply({
            embeds: [embed],
            allowedMentions: { parse: [] } // prevents pings
        });
    }
};
