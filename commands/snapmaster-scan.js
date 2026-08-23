const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const snapmaster = require("../utils/snapmaster");
const { PermissionChecker } = require("../utils/permissions");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-scan")
        .setDescription("Retroactively scan this month's showcase submissions and rebuild SnapMaster data"),

    async execute(interaction) {
        // Moderator check
        if (!PermissionChecker.hasModRole(interaction.member)) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                ephemeral: true
            });
        }

        await interaction.reply("📸 Scanning showcase channel…");

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
                ) continue;

                const attachments = [...msg.attachments.values()];
                const imageAttachments = attachments.filter(a => a.contentType?.startsWith("image"));
                const imageCount = imageAttachments.length;

                if (imageCount > 0) {
                    const link = `https://discord.com/channels/${msg.guild.id}/${msg.channel.id}/${msg.id}`;
                    // NEW: Extract image URLs and pass them to addSubmission
                    const imageUrls = imageAttachments.map(a => a.url);
                    snapmaster.addSubmission(msg.author.id, imageCount, link, imageUrls);
                    totalImages += imageCount;
                }
            }

            lastId = fetched.last()?.id;
        } while (fetched.size === 100);

        const eligible = snapmaster.getEligible(5);
        eligible.sort((a, b) => b.count - a.count);

        const embed = new EmbedBuilder()
            .setTitle("📸 SnapMaster Scan Complete")
            .setColor(0x00aaff)
            .setTimestamp()
            .addFields({
                name: "Total Images Found",
                value: `${totalImages}`,
                inline: true
            });

        if (eligible.length === 0) {
            embed.addFields({
                name: "Eligible Users",
                value: "_No users reached 5 submissions this month._"
            });
        } else {
            embed.addFields({
                name: "Eligible Users (sorted)",
                value: eligible
                    .map(e => `• <@${e.userId}> — **${e.count}**`)
                    .join("\n")
            });
        }

        await interaction.editReply({
            embeds: [embed],
            allowedMentions: { parse: [] } // prevents pings
        });
    }
};
