const buildChangelogEmbed = require("../../utils/changelogBuilder_v2");

module.exports = {
    name: "testchangelog",
    description: "Preview the new modular changelog without posting it",
    async execute(message, args, client) {

        const oldData = {
            core: require("../../data/collections/core_old.json"),
            extras: require("../../data/collections/extras_old.json"),
            body: require("../../data/collections/body_old.json")
        };

        const newData = {
            core: require("../../data/collections/core.json"),
            extras: require("../../data/collections/extras.json"),
            body: require("../../data/collections/body.json")
        };

        const embed = buildChangelogEmbed(oldData, newData);

        message.author.send({ embeds: [embed] })
            .catch(() => message.reply("I couldn't DM you the preview."));
    }
};
