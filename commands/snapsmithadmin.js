const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const {
    SNAPSMITH_ROLE_ID,
    SNAPSMITH_CHANNEL_ID,
    REACTION_TARGET,
    SUPER_APPROVER_ID,
    SHOWCASE_CHANNEL_ID,
    scanShowcase,
    recalculateExpiration,
    loadData,
    saveData,
    loadReactions,
    getCurrentMonth
} = require('../utils/snapsmithManager');

const ROLE_DURATION_DAYS = 30;
const MAX_BUFFER_DAYS = 60;

const data = new SlashCommandBuilder()
    .setName('snapsmithadmin')
    .setDescription('Admin tools for managing Snapsmith system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcmd =>
        subcmd.setName('setinitialcountall')
            .setDescription('Set initialReactionCount to 25 for all current Snapsmiths')
    )
    .addSubcommand(subcmd =>
        subcmd.setName('recalcall')
            .setDescription('Recalculate additional days for all current Snapsmiths')
    )
    .addSubcommand(subcmd =>
        subcmd.setName('check')
            .setDescription('Show a diagnostic embed for a user')
            .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(true))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('addreaction')
            .setDescription('Manually add a unique user reaction to a photo')
            .addUserOption(opt => opt.setName('user').setDescription('User to add as reactor').setRequired(true))
            .addStringOption(opt => opt.setName('messageid').setDescription('Showcase message ID').setRequired(true))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('removereaction')
            .setDescription('Remove a unique user reaction from a photo')
            .addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true))
            .addStringOption(opt => opt.setName('messageid').setDescription('Showcase message ID').setRequired(true))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('forcegive')
            .setDescription('Force give Snapsmith role')
            .addUserOption(opt => opt.setName('user').setDescription('User to give role').setRequired(true))
            .addIntegerOption(opt => opt.setName('days').setDescription('Number of days (default 30)').setRequired(false))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('forceremove')
            .setDescription('Force remove Snapsmith role')
            .addUserOption(opt => opt.setName('user').setDescription('User to remove role').setRequired(true))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('reset')
            .setDescription('Clear all reaction data for a user this month')
            .addUserOption(opt => opt.setName('user').setDescription('User to reset').setRequired(true))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('debug')
            .setDescription('Show raw stored data for a user')
            .addUserOption(opt => opt.setName('user').setDescription('User to debug').setRequired(true))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('forcesuper')
            .setDescription('Manually set super approval for user')
            .addUserOption(opt => opt.setName('user').setDescription('User to super approve').setRequired(true))
            .addBooleanOption(opt => opt.setName('remove').setDescription('Remove super approval?').setRequired(false))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('syncroles')
            .setDescription('Sync current Snapsmith role holders into system')
    )
    .addSubcommand(subcmd =>
        subcmd.setName('setexpiry')
            .setDescription('Set custom expiration date for user')
            .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
            .addStringOption(opt => opt.setName('date').setDescription('YYYY-MM-DD').setRequired(true))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('purge')
            .setDescription('Purge data older than N months')
            .addIntegerOption(opt => opt.setName('months').setDescription('Months to keep').setRequired(true))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('announce')
            .setDescription('Manually announce a Snapsmith winner')
            .addUserOption(opt => opt.setName('user').setDescription('Winner to announce').setRequired(true))
            .addIntegerOption(opt => opt.setName('days').setDescription('Days awarded').setRequired(true))
            .addIntegerOption(opt => opt.setName('reactions').setDescription('Unique reactions (optional)').setRequired(false))
            .addBooleanOption(opt => opt.setName('superapproved').setDescription('Was Super Approved?').setRequired(false))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('scan')
            .setDescription('Manually force a check and scan showcase for reactions')
            .addIntegerOption(opt => opt.setName('limit').setDescription('Number of messages to scan').setRequired(false))
            .addStringOption(opt => opt.setName('messageids').setDescription('Comma separated message IDs to scan').setRequired(false))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('recalc')
            .setDescription('Recalculate additional days for a user based on latest reactions')
            .addUserOption(opt => opt.setName('user').setDescription('User to recalculate').setRequired(true))
    )
    .addSubcommand(subcmd =>
        subcmd.setName('patchusers')
            .setDescription('Patch old Snapsmith users with missing achievement date and initial reactions')
    );

async function execute(interaction) {
    try {
        // DO NOT deferReply here! Your event handler already does it.
        const sub = interaction.options.getSubcommand();
        const dataObj = loadData();
        const reactionsObj = loadReactions();
        const month = getCurrentMonth();
        let user = interaction.options.getUser('user');
        let messageId = interaction.options.getString('messageid');
        let reply = "No action taken.";

        if (sub === 'setinitialcountall') {
            let changed = 0;
            for (const [userId, userData] of Object.entries(dataObj)) {
                if (userData.expiration) {
                    userData.initialReactionCount = 25;
                    changed++;
                }
            }
            saveData(dataObj);
            await interaction.editReply({ content: `Set initialReactionCount = 25 for ${changed} Snapsmith users.` });
        }
        else if (sub === 'recalcall') {
            let processed = 0;
            for (const [userId, userData] of Object.entries(dataObj)) {
                if (userData.expiration && userData.snapsmithAchievedAt) {
                    recalculateExpiration(userId, reactionsObj, dataObj, month);
                    processed++;
                }
            }
            saveData(dataObj);
            await interaction.editReply({ content: `Recalculated days for ${processed} Snapsmith users.` });
        }
        else if (sub === 'check') {
            if (!user) {
                await interaction.editReply({ content: "User required." });
            } else {
                const userId = user.id;
                const userData = dataObj[userId];
                let totalUniqueReactions = 0;
                const userReactions = reactionsObj[userId] || {};
                const achievementDate = userData && userData.snapsmithAchievedAt ? new Date(userData.snapsmithAchievedAt) : null;
                if (achievementDate) {
                    for (const [mon, posts] of Object.entries(userReactions)) {
                        const monDate = new Date(mon + '-01T00:00:00.000Z');
                        if (monDate >= achievementDate) {
                            for (const reactorsArr of Object.values(posts)) {
                                totalUniqueReactions += reactorsArr.length;
                            }
                        }
                    }
                }
                let timeLeft = null;
                let roleActive = false;
                let superApproved = false;
                let expiration = null;
                let daysQueued = 0;
                let nextDayReactions = null;
                let superReactionCount = 0;
                if (userData) {
                    if (userData.expiration) {
                        const expirationDate = new Date(userData.expiration);
                        if (expirationDate > new Date()) {
                            roleActive = true;
                            timeLeft = Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60 * 24));
                        }
                        expiration = userData.expiration;
                    }
                    if (userData.superApproved) {
                        superApproved = true;
                    }
                    if (expiration) {
                        const expirationDate = new Date(expiration);
                        daysQueued = Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60 * 24));
                        daysQueued = Math.min(daysQueued, MAX_BUFFER_DAYS);
                    }
                    const userReactionsMonth = reactionsObj[userId]?.[month] || {};
                    for (const reactorsArr of Object.values(userReactionsMonth)) {
                        if (reactorsArr.includes(SUPER_APPROVER_ID)) superReactionCount++;
                    }
                    let initialCount = userData.initialReactionCount ?? (userData.superApproved ? 0 : REACTION_TARGET);
                    let extraReactions = totalUniqueReactions - initialCount;
                    let reactionsToNextDay = 3 - (extraReactions % 3);
                    if (reactionsToNextDay === 0) reactionsToNextDay = 3;
                    nextDayReactions = reactionsToNextDay;
                }
                const embed = new EmbedBuilder()
                    .setColor(0xFAA61A)
                    .setTitle(`Snapsmith Status`)
                    .addFields(
                        { name: 'User', value: `<@${userId}>`, inline: true },
                        { name: 'Role Status', value: roleActive
                            ? (superApproved
                                ? 'You currently have the Snapsmith role (**awarded via Super Approval**).'
                                : 'You currently have the Snapsmith role.')
                            : 'You do **not** currently have the Snapsmith role.', inline: false },
                        { name: 'Time Left', value: `**${timeLeft ?? 0} days**`, inline: true },
                        { name: 'Unique Reactions', value: `**${totalUniqueReactions}**`, inline: true },
                        { name: 'Next Day Progress', value: roleActive ? `**${nextDayReactions}** more reactions until an additional day is added.` : 'N/A', inline: true },
                        ...(superApproved ? [
                            { name: 'Super Approval', value: `You received a 🌟 Super Approval from <@${SUPER_APPROVER_ID}>!`, inline: false }
                        ] : []),
                        { name: 'Super reactions this month', value: `**${superReactionCount}**`, inline: true },
                        { name: 'Days queued', value: `**${daysQueued}** (max ${MAX_BUFFER_DAYS})`, inline: true }
                    );
                await interaction.editReply({ embeds: [embed] });
            }
        }
        else if (sub === 'debug') {
            if (!user) {
                await interaction.editReply({ content: "User required." });
            } else {
                const userData = dataObj[user.id];
                if (userData) {
                    await interaction.editReply({ content: "Raw stored data for " + user.username + ":\n```json\n" + JSON.stringify(userData, null, 2) + "\n```" });
                } else {
                    await interaction.editReply({ content: "No data found for " + user.username + "." });
                }
            }
        }
        else if (sub === 'patchusers') {
            const now = Date.now();
            let patched = 0;
            for (const [userId, userData] of Object.entries(dataObj)) {
                if (userData.expiration && !userData.snapsmithAchievedAt) {
                    const expirationDate = new Date(userData.expiration);
                    const daysLeft = Math.max(0, Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24)));
                    const achievedAt = new Date(expirationDate.getTime() - daysLeft * 24 * 60 * 60 * 1000);
                    userData.snapsmithAchievedAt = achievedAt.toISOString();

                    const userReactionsMonth = reactionsObj[userId]?.[month] || {};
                    let totalUniqueReactions = 0;
                    for (const reactorsArr of Object.values(userReactionsMonth)) {
                        totalUniqueReactions += reactorsArr.length;
                    }
                    if (userData.superApproved) {
                        userData.initialReactionCount = totalUniqueReactions;
                    } else {
                        userData.initialReactionCount = REACTION_TARGET;
                    }
                    patched++;
                }
            }
            if (patched > 0) {
                saveData(dataObj);
                await interaction.editReply({ content: `Patched ${patched} users. Updated snapsmith.json.` });
            } else {
                await interaction.editReply({ content: 'No users needed patching.' });
            }
        }
        else if (sub === 'recalc') {
            if (!user) {
                await interaction.editReply({ content: "User required." });
            } else {
                const result = recalculateExpiration(user.id, reactionsObj, dataObj, month);
                if (result.error) {
                    await interaction.editReply({ content: result.error });
                } else {
                    saveData(dataObj);
                    await interaction.editReply({ content: `<@${user.id}> Snapsmith recalculated: Achieved on **${new Date(result.achieved).toLocaleDateString()}**, total reactions: **${result.totalUniqueReactions}** (+${result.additionalDays} extra days), expires: **${new Date(result.newExpiration).toLocaleDateString()}**, days left: **${result.daysLeft}**.` });
                }
            }
        }
        else if (sub === 'scan') {
            try {
                const limit = interaction.options.getInteger('limit') || 100;
                const messageidsRaw = interaction.options.getString('messageids');
                let messageIds = null;
                if (messageidsRaw && messageidsRaw.toLowerCase() !== "all") {
                    messageIds = messageidsRaw.split(',').map(s => s.trim()).filter(Boolean);
                }
                await scanShowcase(interaction.client, { limit, messageIds });
                reply = `Manual scan completed. Showcase posts and reactions have been checked (limit: ${limit}${messageIds ? ", messageIds: " + messageIds.join(',') : ""}).`;
                console.log("Snapsmith showcase scan executed via admin command.");
            } catch (e) {
                reply = `Manual scan failed: ${e.message}`;
                console.error("Error in snapsmithadmin scan subcommand:", e);
            }
            await interaction.editReply({ content: reply });
        }
        // For brevity, you can add the implementation for other subcommands as before, just ensure you only use editReply ONCE per interaction.
        else {
            await interaction.editReply({ content: reply });
        }
    } catch (err) {
        console.error("Error in snapsmithadmin command:", err);
    }
}

module.exports = {
    data,
    execute
};
