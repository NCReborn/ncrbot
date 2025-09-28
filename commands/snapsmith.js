const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

const REACTION_DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmithreactions.json');
const META_DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmith.json');
const ROLE_DURATION_DAYS = 30;
const REACTION_TARGET = 25;
const MAX_BUFFER_DAYS = 60;
const SUPER_APPROVER_ID = '278359162860077056'; // zVeinz
const SHOWCASE_CHANNEL_ID = '1285797205927792782';

function getCurrentMonth() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function loadReactions() {
    if (fs.existsSync(REACTION_DATA_PATH)) {
        return JSON.parse(fs.readFileSync(REACTION_DATA_PATH, 'utf8'));
    }
    return {};
}

function loadMeta() {
    if (fs.existsSync(META_DATA_PATH)) {
        return JSON.parse(fs.readFileSync(META_DATA_PATH, 'utf8'));
    }
    return {};
}

function countSuperReactions(userId, month) {
    const reactions = loadReactions();
    let count = 0;
    if (reactions[userId] && reactions[userId][month]) {
        for (const reactorsArr of Object.values(reactions[userId][month])) {
            if (reactorsArr.includes(SUPER_APPROVER_ID)) count++;
        }
    }
    return count;
}

async function getUserSnapsmithStatus(userId) {
    const reactions = loadReactions();
    const meta = loadMeta();
    const now = new Date();
    const month = getCurrentMonth();

    // Tally reactions
    let totalUniqueReactions = 0;
    if (reactions[userId] && reactions[userId][month]) {
        for (const reactorsArr of Object.values(reactions[userId][month])) {
            totalUniqueReactions += reactorsArr.length;
        }
    }

    // Metadata (role status, expiration, superApproved)
    const userMeta = meta[userId];
    let roleActive = false;
    let timeLeft = null;
    let superApproved = false;
    let expiration = null;

    if (userMeta) {
        if (userMeta.expiration) {
            const expirationDate = new Date(userMeta.expiration);
            if (expirationDate > now) {
                roleActive = true;
                timeLeft = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));
            }
            expiration = userMeta.expiration;
        }
        if (userMeta.superApproved) {
            superApproved = true;
        }
    }

    // Calculate how many days queued
    let daysQueued = 0;
    if (superApproved) daysQueued += ROLE_DURATION_DAYS;
    if (totalUniqueReactions >= REACTION_TARGET) {
        let additionalMilestones = 0;
        if (superApproved) {
            additionalMilestones = Math.floor((totalUniqueReactions - 5) / REACTION_TARGET);
        } else {
            additionalMilestones = Math.floor(totalUniqueReactions / REACTION_TARGET);
        }
        daysQueued += Math.min(additionalMilestones * ROLE_DURATION_DAYS, MAX_BUFFER_DAYS - daysQueued);
    }
    daysQueued = Math.min(daysQueued, MAX_BUFFER_DAYS);

    // Count superreactions from Veinz this month
    const superReactionCount = countSuperReactions(userId, month);

    // If no reactions and no meta, show nothing
    if (totalUniqueReactions === 0 && !userMeta) return null;

    return {
        roleActive,
        timeLeft,
        totalUniqueReactions,
        superApproved,
        daysQueued,
        expiration,
        superReactionCount
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snapsmith')
        .setDescription('Check your Snapsmith role status and eligibility (based on unique users per post)'),
    async execute(interaction) {
        let msg;
        try {
            const status = await getUserSnapsmithStatus(interaction.user.id);
            if (!status) {
                msg = `You have no Snapsmith activity yet. Submit your best in-game photos in <#${SHOWCASE_CHANNEL_ID}> to get started!`;
            } else {
                msg = `**Snapsmith Status for <@${interaction.user.id}>**\n`;
                msg += status.roleActive
                    ? `- You currently have the Snapsmith role.\n- Time left: **${status.timeLeft} days**\n`
                    : `- You do not currently have the Snapsmith role.\n`;
                msg += `- Unique reactions this month (unique reactors per post summed): **${status.totalUniqueReactions}**\n`;
                msg += `- You need **${Math.max(REACTION_TARGET - status.totalUniqueReactions, 0)}** more unique reactions this month to earn Snapsmith.\n`;
                msg += status.superApproved
                    ? `- You received a :star2: Super Approval from <@${SUPER_APPROVER_ID}> this month!\n`
                    : "";
                msg += `- Super reactions from <@${SUPER_APPROVER_ID}> this month: **${status.superReactionCount}**\n`;
                msg += `- Days queued (total): **${status.daysQueued}** (max ${MAX_BUFFER_DAYS})\n`;
            }

            // Use editReply if deferred, reply if not
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: msg });
            } else {
                await interaction.reply({ content: msg, ephemeral: true });
            }
        } catch (err) {
            // Only log error, DO NOT try to reply again if previous reply/editReply failed.
            console.error("Error in /snapsmith command:", err);
        }
    }
};
