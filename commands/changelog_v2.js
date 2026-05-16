const fs = require("fs");
const path = require("path");
const buildChangelogEmbed = require("../../utils/changelogBuilder_v2");

module.exports = {
    name: "changelogv2",
    description: "Post the new modular changelog",
    async execute(message, args, client) {

        const changelogChannel = "1285797113879334962";

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

        const channel = await client.channels.fetch(changelogChannel);
        await channel.send({ embeds: [embed] });

        message.reply("Changelog posted successfully.");
    }
};
