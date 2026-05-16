const diffMods = require("./modDiff_v2");
const { EmbedBuilder } = require("discord.js");

module.exports = function buildChangelogEmbed(oldData, newData) {
    const embed = new EmbedBuilder()
        .setTitle(`Revision ${newData.core.version} - Game Version 2.3`)
        .setColor("#00AEEF")
        .setTimestamp()
        .setDescription(
            `⚠️ **Important** - Don’t forget to install new revisions to a separate profile.\n` +
            `⚠️ **Important** - Delete **r6/cache** before deploying mods.\n` +
            `⚠️ **Important** - If you encounter redscript errors, check **#common-fixes**.\n\n` +
            `📘 **How to update the collection:** https://yourwebsite.com/update-guide\n\n`
        );

    const collections = [
        { key: "core", label: "NCR Core" },
        { key: "extras", label: "NCR Extras" },
        { key: "body", label: "NCR Body" }
    ];

    for (const col of collections) {
        const diff = diffMods(oldData[col.key].mods, newData[col.key].mods);

        let section = `### ${col.label}\n`;

        if (diff.added.length) {
            section += `🟩 **Added Mods**\n`;
            diff.added.forEach(m => section += `- ${m.name} (v${m.version})\n`);
        }

        if (diff.updated.length) {
            section += `🟦 **Updated Mods**\n`;
            diff.updated.forEach(m => section += `- ${m.name} (${m.oldVersion} → ${m.newVersion})\n`);
        }

        if (diff.removed.length) {
            section += `🟥 **Removed Mods**\n`;
            diff.removed.forEach(m => section += `- ${m.name} (v${m.version})\n`);
        }

        embed.addFields({ name: col.label, value: section });
    }

    return embed;
};
