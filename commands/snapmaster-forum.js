const { SlashCommandBuilder, EmbedBuilder, ChannelType, AttachmentBuilder } = require("discord.js");
const snapmaster = require("../utils/snapmaster");
const { PermissionChecker } = require("../utils/permissions");
const logger = require("../utils/logger");
const fetch = require("node-fetch");

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
        logger.info('[SNAPMASTER_FORUM] No eligible users this month — skipping forum generation.');
        return;
    }

    // Sort by submission count descending
    eligible.sort((a, b) => b.count - a.count);

    // Archive all active threads from the previous month
    await archiveOldSnapmasterThreads(forumChannel);

    const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Create a thread for each eligible user
    for (const user of eligible) {
        const userData = snapmaster.getUser(user.userId);
        const imageUrls = userData?.imageUrls ?? [];
        const messages = userData?.messages ?? [];
        if (imageUrls.length === 0 && messages.length === 0) continue;

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

        if (imageUrls.length > 0) {
            // Group images into chunks of 4 per message
            const imageChunks = chunkArray(imageUrls, 4);
            for (const chunk of imageChunks) {
                try {
                    const attachments = [];
                    
                    // Fetch and create attachments for each image
                    for (let i = 0; i < chunk.length; i++) {
                        const imageUrl = chunk[i];
                        const response = await fetch(imageUrl);
                        const buffer = await response.buffer();
                        
                        // Generate filename with index
                        const filename = `image_${i + 1}.${getFileExtension(imageUrl)}`;
                        const attachment = new AttachmentBuilder(buffer, { name: filename });
                        attachments.push(attachment);
                    }
                    
                    // Send all 4 images in one message
                    await thread.send({ files: attachments });
                } catch (err) {
                    logger.error(`[SNAPMASTER_FORUM] Error fetching/uploading images: ${err.message}`);
                    // Fallback: send links if image fetching fails
                    const embed = new EmbedBuilder()
                        .setColor(0x00aaff)
                        .setTitle("Submissions")
                        .setDescription(chunk.map((url, i) => `[Image ${i + 1}](${url})`).join("\n"))
                        .setTimestamp();
                    await thread.send({ embeds: [embed] });
                }
            }
        } else {
            // Fallback: post message links if no image URLs are stored
            const chunks = chunkArray(messages, 5);
            for (const chunk of chunks) {
                const embeds = chunk.map(link =>
                    new EmbedBuilder()
                        .setTitle("Submission")
                        .setURL(link)
                        .setDescription(`[View in Discord](${link})`)
                        .setColor(0x00aaff)
                        .setTimestamp()
                );
                await thread.send({ embeds });
            }
        }

        // Lock thread to prevent user comments
        await thread.setLocked(true);

        logger.info(`[SNAPMASTER_FORUM] Created thread for ${user.userId} (${displayName}) with ${user.count} submissions`);
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

function getFileExtension(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const ext = pathname.split('.').pop().split('?')[0];
        return ext || 'png';
    } catch {
        return 'png';
    }
}

module.exports.buildSnapmasterForum = buildSnapmasterForum;
