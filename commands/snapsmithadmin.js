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

const data = new SlashCommandBuilder()
    .setName('snapsmithadmin')
    .setDescription('Admin tools for managing Snapsmith system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
        const sub = interaction.options.getSubcommand();
        const dataObj = loadData();
        const reactionsObj = loadReactions();
        const month = getCurrentMonth();
        let user = interaction.options.getUser('user');
        let messageId = interaction.options.getString('messageid');
        let reply = "No action taken.";

        if (sub === 'patchusers') {
            const now = Date.now();
            let patched = 0;
            for (const [userId, userData] of Object.entries(dataObj)) {
                if (userData.expiration && !userData.snapsmithAchievedAt) {
                    const expirationDate = new Date(userData.expiration);
                    const daysLeft = Math.max(0, Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24)));
                    const achievedAt = new Date(expirationDate.getTime() - daysLeft * 24 * 60 * 60 * 1000);
                    userData.snapsmithAchievedAt = achievedAt.toISOString();

                    // Compute initialReactionCount correctly
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
                reply = `Patched ${patched} users. Updated snapsmith.json.`;
            } else {
                reply = 'No users needed patching.';
            }
        }

        else if (sub === 'recalc') {
            if (!user) reply = "User required.";
            else {
                const result = recalculateExpiration(user.id, reactionsObj, dataObj, month);
                if (result.error) {
                    reply = result.error;
                } else {
                    saveData(dataObj);
                    reply = `<@${user.id}> Snapsmith recalculated: Achieved on **${new Date(result.achieved).toLocaleDateString()}**, total reactions: **${result.totalUniqueReactions}** (+${result.additionalDays} extra days), expires: **${new Date(result.newExpiration).toLocaleDateString()}**, days left: **${result.daysLeft}**.`;
                }
            }
        }
        // ...existing subcommands below...

        else if (sub === 'announce') {
            if (!user) reply = "User required.";
            else {
                const days = interaction.options.getInteger('days');
                const reactions = interaction.options.getInteger('reactions');
                const superapproved = interaction.options.getBoolean('superapproved');
                try {
                    const channel = await interaction.guild.channels.fetch(SNAPSMITH_CHANNEL_ID);

                    let requirementsStr;
                    if (superapproved) {
                        requirementsStr = `Received a Super Approval 🌟 from <@${SUPER_APPROVER_ID}>`;
                    } else if (typeof reactions === 'number' && reactions >= REACTION_TARGET) {
                        requirementsStr = `Received ${reactions} 🌟 stars from our community`;
                    } else {
                        requirementsStr = `Requirements not met or not specified`;
                    }

                    let detailsStr;
                    if (superapproved) {
                        detailsStr = `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have received a super approval star from our super approver, we now bestow upon you the role <@&${SNAPSMITH_ROLE_ID}> as a symbol of your amazing photomode skills.`;
                    } else if (typeof reactions === 'number' && reactions >= REACTION_TARGET) {
                        detailsStr = `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have received ${reactions} or more 🌟 stars from our community, we now bestow upon you the role <@&${SNAPSMITH_ROLE_ID}> as a symbol of your amazing photomode skills.`;
                    } else {
                        detailsStr = `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have not met the minimum requirements.`;
                    }

                    const embed = new EmbedBuilder()
                        .setColor(0xFAA61A)
                        .setTitle('A new Snapsmith Emerges')
                        .addFields(
                            { name: 'Congratulations', value: `<@${user.id}>`, inline: false },
                            { name: 'Requirements Met', value: requirementsStr, inline: false },
                            { name: 'Details', value: detailsStr, inline: false }
                        )
                        .setTimestamp();

                    await channel.send({ embeds: [embed] });
                    reply = `Announced Snapsmith winner for ${user}.`;
                } catch (e) {
                    reply = `Failed to announce in channel: ${e.message}`;
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
        }
        else if (sub === 'debug') {
            if (!user) reply = "User required.";
            else {
                // Show raw stored data for the user
                const userData = dataObj[user.id];
                if (userData) {
                    reply = "Raw stored data for " + user.username + ":\n```json\n" + JSON.stringify(userData, null, 2) + "\n```";
                } else {
                    reply = "No data found for " + user.username + ".";
                }
            }
        }
        else if (sub === 'forceremove') {
            if (!user) reply = "User required.";
            else {
                if (dataObj[user.id]) {
                    dataObj[user.id].expiration = null;
                    dataObj[user.id].superApproved = false;
                    saveData(dataObj);
                    try {
                        const member = await interaction.guild.members.fetch(user.id);
                        await member.roles.remove(SNAPSMITH_ROLE_ID);
                        reply = `Force-removed Snapsmith role from ${user}.`;
                    } catch (e) {
                        reply = `Force-removed in system, but could not remove Discord role: ${e.message}`;
                    }
                } else {
                    reply = "User not found in data.";
                }
            }
        }
        // ...other subcommands here...

        await interaction.editReply({ content: reply });
    } catch (err) {
        console.error("Error in snapsmithadmin command:", err);
    }
}

module.exports = {
    data,
    execute
};
