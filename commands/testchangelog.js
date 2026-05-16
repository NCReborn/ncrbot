const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const buildChangelogEmbed = require("../utils/changelogBuilder_v2");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("testchangelog")
        .setDescription("Preview the new modular changelog in DMs (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {

        const oldData = {
            core: require("../data/collections/core_old.json"),
            extras: require("../data/collections/extras_old.json"),
            body: require("../data/collections/body_old.json")
        };

        const newData = {
            core: require("../data/collections/core.json"),
            extras: require("../data/collections/extras.json"),
            body: require("../data/collections/body.json")
        };

        const embed = buildChangelogEmbed(oldData, newData);

        try {
            await interaction.user.send({ embeds: [embed] });

            return interaction.reply({
                content: "Sent you a DM with the preview.",
                ephemeral: true
            });

        } catch (err) {
            console.error(err);
            return interaction.reply({
                content: "I couldn't DM you the preview.",
                ephemeral: true
            });
        }
    }
};
