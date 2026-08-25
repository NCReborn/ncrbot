const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const snapmaster = require("../utils/snapmaster");
const { PermissionChecker } = require("../utils/permissions");
const logger = require("../utils/logger");

const MIN_SUBMISSIONS = 5;
// Set SNAPMASTER_FORUM_CHANNEL_ID in your environment, or replace this fallback with your actual forum channel ID
const FORUM_CHANNEL_ID = process.env.SNAPMASTER_FORUM_CHANNEL_ID || "1541146355391537343";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snapmaster-forum")
        .setDescription("[TEST] Manually generate the SnapMaster forum posts for this month"),

    async execute(interaction) {
        if (!PermissionChecker.hasModRole(interaction.member)) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                ephemeral: true
            });
        }

        await interaction.reply({
            content: "🔄 Building SnapMaster forum… this may take a moment.",
            ephemeral: true
        });

        try {
            await buildSnapmasterForum(interaction.guild);
            await interaction.editReply({
                content: "✅ SnapMaster forum posts created successfully!"
            });
        } catch (err) {
            logger.error("[SNAPMASTER_FORUM] Error:", err);
            await interaction.editReply({
                content: `❌ Error building forum: ${err.message}`
            });
        }
    }
};

async function buildSnapmasterForum(guild) {
    const forumChannel = await guild.channels.fetch(FORUM_CHANNEL_ID);
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
        throw new Error("Forum channel not found or is not a forum channel.");
    }

    const eligible = snapmaster.getEligible(MIN_SUBMISSIONS);
    if (eligible.length === 0) {
        logger.info("[SNAPMASTER_FORUM] No eligible users this month — skipping forum generation.");
        return;
    }

    // Sort by submission count descending
    eligible.sort((a, b) => b.count - a.count);

    // Archive all active threads from the previous month
    await archiveOldSnapmasterThreads(forumChannel);

    const monthYear = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Create a thread for each eligible user
    for (const user of eligible) {
        const userData = snapmaster.getUser(user.userId);

        // Prefer in-Discord message jump links
        const rawMessages = Array.isArray(userData?.messages) ? userData.messages : [];
        const messageLinks = normalizeAndDedupeJumpLinks(rawMessages);

        // Legacy fallback only
        const imageUrls = Array.isArray(userData?.imageUrls) ? dedupeStrings(userData.imageUrls) : [];

        if (messageLinks.length === 0 && imageUrls.length === 0) continue;

        let displayName;
        try {
            const member = await guild.members.fetch(user.userId);
            displayName = member.displayName;
        } catch {
            displayName = user.userId;
        }

        const threadTitle = `@${displayName} — ${user.count} submissions (${monthYear})`;

        const thread = await forumChannel.threads.create({
            name: threadTitle,
            message: {
                content: `📸 **All submissions from <@${user.userId}> this month** (${user.count} total)`
            }
        });

        if (messageLinks.length > 0) {
            // Primary: post durable message jump links in chunks
            const chunks = chunkArray(messageLinks, 10);
            let chunkIndex = 0;

            for (const chunk of chunks) {
                chunkIndex++;

                const embed = new EmbedBuilder()
                    .setColor(0x00aaff)
                    .setTitle("📎 Submission Links")
                    .setDescription(
                        chunk
                            .map((link, i) => `${i + 1}. [View Submission](${link})`)
                            .join("\n")
                    )
                    .setFooter({ text: `Chunk ${chunkIndex}/${chunks.length}` })
                    .setTimestamp();

                try {
                    await thread.send({
                        embeds: [embed],
                        allowedMentions: { parse: [] }
                    });

                    logger.info(
                        `[SNAPMASTER_FORUM] Sent message-link chunk ${chunkIndex}/${chunks.length} for ${user.userId}`
                    );

                    // Small delay between messages
                    await delay(350);
                } catch (err) {
                    logger.error(
                        `[SNAPMASTER_FORUM] Error posting message-link chunk ${chunkIndex}: ${err.message}`
                    );
                }
            }
        } else {
            // Fallback for historical data that has only image URLs
            const chunks = chunkArray(imageUrls, 4);
            let chunkIndex = 0;

            for (const chunk of chunks) {
                chunkIndex++;
                try {
                    const embed = new EmbedBuilder()
                        .setColor(0xffa500)
                        .setTitle("📸 Legacy Submission URLs")
                        .setDescription(
                            "⚠️ These are older direct image URLs and may expire.\n\n" +
                            chunk.map((url, i) => `${i + 1}. [Image ${i + 1}](${url})`).join("\n")
                        )
                        .setFooter({ text: `Chunk ${chunkIndex}/${chunks.length}` })
                        .setTimestamp();

                    await thread.send({ embeds: [embed] });
                    logger.info(
                        `[SNAPMASTER_FORUM] Sent legacy image-url chunk ${chunkIndex}/${chunks.length} for ${user.userId}`
                    );

                    await delay(350);
                } catch (err) {
                    logger.error(
                        `[SNAPMASTER_FORUM] Error posting legacy image chunk ${chunkIndex}: ${err.message}`
                    );
                }
            }
        }

        // Lock thread to prevent user comments
        await thread.setLocked(true);

        logger.info(
            `[SNAPMASTER_FORUM] Created thread for ${user.userId} (${displayName}) with ${user.count} submissions`
        );
    }

    logger.info(`[SNAPMASTER_FORUM] Completed: ${eligible.length} threads created`);
}

async function archiveOldSnapmasterThreads(forumChannel) {
    const { threads } = await forumChannel.threads.fetchActive();
    for (const [, thread] of threads) {
        if (!thread.archived) {
            await thread.setArchived(true);
            logger.info(`[SNAPMASTER_FORUM] Archived old thread: ${thread.name}`);
        }
    }
}

function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

function dedupeStrings(values) {
    return [...new Set(values.filter(v => typeof v === "string" && v.trim().length > 0))];
}

function normalizeAndDedupeJumpLinks(values) {
    const links = dedupeStrings(values);

    // Keep only Discord message jump-link format: /channels/<guild>/<channel>/<message>
    return links.filter(link => /^https:\/\/discord\.com\/channels\/\d+\/\d+\/\d+$/.test(link));
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports.buildSnapmasterForum = buildSnapmasterForum;
