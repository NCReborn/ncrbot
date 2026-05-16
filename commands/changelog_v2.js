const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const buildChangelogEmbed = require("../utils/changelogBuilder_v2");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("changelogv2")
        .setDescription("Post the new modular changelog (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {

        const changelogChannel = "1285797113879334962";

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
            const channel = await interaction.client.channels.fetch(changelogChannel);
            await channel.send({ embeds: [embed] });

            return interaction.reply({
                content: "Changelog posted successfully.",
                ephemeral: true
            });

        } catch (err) {
            console.error(err);
            return interaction.reply({
                content: "Failed to post changelog.",
                ephemeral: true
            });
        }
    }
};
