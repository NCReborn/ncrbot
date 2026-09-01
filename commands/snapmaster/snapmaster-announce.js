const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder
} = require("discord.js");

const { PermissionChecker } = require("../../utils/permissions");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-announce")
        .setDescription("Create a SnapMaster announcement using a popup text box"),

    async execute(interaction) {
        // Moderator check
        if (!PermissionChecker.hasModRole(interaction.member)) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                ephemeral: true
            });
        }

        // Build modal
        const modal = new ModalBuilder()
            .setCustomId("snapmaster_announce_modal")
            .setTitle("SnapMaster Announcement");

        const announcementInput = new TextInputBuilder()
            .setCustomId("announcement_text")
            .setLabel("Enter your announcement text")
            .setStyle(TextInputStyle.Paragraph) // MULTILINE
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(announcementInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
    },

    async handleModal(interaction) {
        if (interaction.customId !== "snapmaster_announce_modal") return;

        const rawText = interaction.fields.getTextInputValue("announcement_text");

        const embed = new EmbedBuilder()
            .setTitle("📸 SnapMaster Announcement")
            .setDescription(rawText)
            .setColor(0x00aaff)
            .setTimestamp();

        await interaction.reply({
            content: "📢 Announcement posted.",
            ephemeral: true
        });

        await interaction.channel.send({
            embeds: [embed],
            allowedMentions: { parse: [] }
        });
    }
};
