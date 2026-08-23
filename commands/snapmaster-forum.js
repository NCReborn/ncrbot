const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const snapmaster = require("../utils/snapmaster");
const { PermissionChecker } = require("../utils/permissions");
const logger = require("../utils/logger");

const MIN_SUBMISSIONS = 5;
// Set SNAPMASTER_FORUM_CHANNEL_ID in your environment, or replace this fallback with your actual forum channel ID
const FORUM_CHANNEL_ID = process.env.SNAPMASTER_FORUM_CHANNEL_ID || "1324990321393930240";

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

    // Create a thread for each eligible user
    for (const user of eligible) {
        const userData = snapmaster.getUser(user.userId);
        if (!userData || userData.messages.length === 0) continue;

        let displayName;
        try {
            const member = await guild.members.fetch(user.userId);
            displayName = member.displayName;
        } catch {
            displayName = user.userId;
        }

        const threadTitle = `@${displayName} — ${user.count} submissions`;

        const thread = await forumChannel.threads.create({
            name: threadTitle,
            message: {
                content: `📸 **All submissions from <@${user.userId}> this month** (${user.count} total)`
            }
        });

        // Post submissions in batches of 5 as embeds
        const chunks = chunkArray(userData.messages, 5);
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

module.exports.buildSnapmasterForum = buildSnapmasterForum;
