const { SlashCommandBuilder } = require("discord.js");
const snapmaster = require("../utils/snapmaster");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-scan")
        .setDescription("Retroactively scan this month's showcase submissions and rebuild SnapMaster data"),

    async execute(interaction) {
        await interaction.reply("📸 Scanning showcase channel… This may take a moment.");

        const SHOWCASE_CHANNEL = "1285797205927792782";
        const channel = await interaction.client.channels.fetch(SHOWCASE_CHANNEL);

        if (!channel) {
            return interaction.editReply("❌ Showcase channel not found.");
        }

        // Reset DB before rebuilding
        snapmaster.reset();

        const now = new Date();
        const currentMonth = now.getUTCMonth();
        const currentYear = now.getUTCFullYear();

        let fetched;
        let lastId = null;
        let totalImages = 0;

        do {
            fetched = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
            if (!fetched || fetched.size === 0) break;

            for (const [, msg] of fetched) {
                if (msg.author.bot) continue;

                const msgDate = msg.createdAt;
                if (
                    msgDate.getUTCMonth() !== currentMonth ||
                    msgDate.getUTCFullYear() !== currentYear
                ) {
                    continue; // skip messages from other months
                }

                const attachments = [...msg.attachments.values()];
                const imageCount = attachments.filter(a => a.contentType?.startsWith("image")).length;

                if (imageCount > 0) {
                    const link = `https://discord.com/channels/${msg.guild.id}/${msg.channel.id}/${msg.id}`;
                    snapmaster.addSubmission(msg.author.id, imageCount, link);
                    totalImages += imageCount;
                }
            }

            lastId = fetched.last()?.id;
        } while (fetched.size === 100);

const eligible = snapmaster.getEligible(5);

// Sort descending
eligible.sort((a, b) => b.count - a.count);

let summary = `📸 **Scan complete!**\n\n`;
summary += `**Total images found:** ${totalImages}\n`;
summary += `**Eligible users (≥ 5 submissions):**\n`;

if (eligible.length === 0) {
    summary += "_No eligible users this month._";
} else {
    eligible.forEach(e => {
        summary += `• <@${e.userId}> — ${e.count}\n`;
    });
}

interaction.editReply(summary);
    }
};
