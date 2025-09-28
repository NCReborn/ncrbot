const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

const REACTION_DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmithreactions.json');
const META_DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmith.json');
const ROLE_DURATION_DAYS = 30;
const REACTION_TARGET = 25;
const MAX_BUFFER_DAYS = 60;
//const SUPER_APPROVER_ID = '278359162860077056'; // zVeinz
const SUPER_APPROVER_ID = '680928073587359902'; // mquiny
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

function getNextDayReactions(meta, totalUniqueReactions) {
    if (meta.superApproved) {
        return 3 - (totalUniqueReactions % 3) === 0 ? 3 : 3 - (totalUniqueReactions % 3);
    } else if (totalUniqueReactions >= REACTION_TARGET) {
        let extra = totalUniqueReactions - REACTION_TARGET;
        return 3 - (extra % 3) === 0 ? 3 : 3 - (extra % 3);
    }
    return null;
}

async function getUserSnapsmithStatus(userId) {
    const reactions = loadReactions();
    const meta = loadMeta();
    const now = new Date();
    const month = getCurrentMonth();

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

    let totalUniqueReactions = 0;

    if (roleActive && userMeta && userMeta.snapsmithAchievedAt) {
        // Sum all reactions since achievement
        const achievementDate = new Date(userMeta.snapsmithAchievedAt);
        const userReactions = reactions[userId] || {};
        for (const [mon, posts] of Object.entries(userReactions)) {
            const monDate = new Date(mon + '-01T00:00:00.000Z');
            if (monDate >= achievementDate) {
                for (const reactorsArr of Object.values(posts)) {
                    totalUniqueReactions += reactorsArr.length;
                }
            }
        }
    } else {
        // If not a snapsmith yet, just show current month
        if (reactions[userId] && reactions[userId][month]) {
            for (const reactorsArr of Object.values(reactions[userId][month])) {
                totalUniqueReactions += reactorsArr.length;
            }
        }
    }

    let daysQueued = 0;
    if (expiration) {
        const expirationDate = new Date(expiration);
        daysQueued = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));
        daysQueued = Math.min(daysQueued, MAX_BUFFER_DAYS);
    }

    // Count superreactions from Veinz this month
    const superReactionCount = countSuperReactions(userId, month);

    if (totalUniqueReactions === 0 && !userMeta) return null;

    let nextDayReactions = null;
    if (roleActive) {
        nextDayReactions = getNextDayReactions(userMeta, totalUniqueReactions);
    }

    return {
        roleActive,
        timeLeft,
        totalUniqueReactions,
        superApproved,
        daysQueued,
        expiration,
        superReactionCount,
        nextDayReactions,
        userMeta
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snapsmith')
        .setDescription('Check your Snapsmith role status and eligibility (based on unique users per post)'),
    async execute(interaction) {
        try {
            const status = await getUserSnapsmithStatus(interaction.user.id);
            const user = interaction.user;

            let embed;
            if (!status) {
                embed = new EmbedBuilder()
                    .setColor(0xFAA61A)
                    .setTitle(`Snapsmith Status`)
                    .addFields(
                        { name: 'User', value: `<@${user.id}>`, inline: true },
                        { name: 'Role Status', value: 'You do **not** currently have the Snapsmith role.', inline: false },
                        { name: 'Unique Reactions', value: `**0**`, inline: true },
                        { name: `Reactions remaining`, value: `**${REACTION_TARGET}** more needed to earn Snapsmith.`, inline: true },
                        { name: 'Super reactions this month', value: `**0**`, inline: true },
                        { name: 'Days queued', value: `**0** (max ${MAX_BUFFER_DAYS})`, inline: true }
                    );
            } else if (!status.roleActive) {
                embed = new EmbedBuilder()
                    .setColor(0xFAA61A)
                    .setTitle(`Snapsmith Status`)
                    .addFields(
                        { name: 'User', value: `<@${user.id}>`, inline: true },
                        { name: 'Role Status', value: 'You do **not** currently have the Snapsmith role.', inline: false },
                        { name: 'Unique Reactions', value: `**${status.totalUniqueReactions}**`, inline: true },
                        { name: `Reactions remaining`, value: `**${Math.max(REACTION_TARGET - status.totalUniqueReactions, 0)}** more needed to earn Snapsmith.`, inline: true },
                        { name: 'Super reactions this month', value: `**${status.superReactionCount}**`, inline: true },
                        { name: 'Days queued', value: `**0** (max ${MAX_BUFFER_DAYS})`, inline: true }
                    );
            } else if (status.roleActive && !status.superApproved) {
                let extra = status.totalUniqueReactions - REACTION_TARGET;
                let reactionsToNextDay = 3 - ((extra > 0 ? extra : 0) % 3);
                if (reactionsToNextDay === 0) reactionsToNextDay = 3;
                embed = new EmbedBuilder()
                    .setColor(0xFAA61A)
                    .setTitle(`Snapsmith Status`)
                    .addFields(
                        { name: 'User', value: `<@${user.id}>`, inline: true },
                        { name: 'Role Status', value: 'You currently have the Snapsmith role.', inline: false },
                        { name: 'Time Left', value: `**${status.timeLeft} days**`, inline: true },
                        { name: 'Unique Reactions', value: `**${status.totalUniqueReactions}**`, inline: true },
                        { name: 'Next Day Progress', value: `**${reactionsToNextDay}** more reactions until an additional day is added.`, inline: true },
                        { name: 'Super reactions this month', value: `**${status.superReactionCount}**`, inline: true },
                        { name: 'Days queued', value: `**${status.daysQueued}** (max ${MAX_BUFFER_DAYS})`, inline: true }
                    );
            } else if (status.roleActive && status.superApproved) {
                let reactionsToNextDay = 3 - (status.totalUniqueReactions % 3);
                if (reactionsToNextDay === 0) reactionsToNextDay = 3;
                embed = new EmbedBuilder()
                    .setColor(0xFAA61A)
                    .setTitle(`Snapsmith Status`)
                    .addFields(
                        { name: 'User', value: `<@${user.id}>`, inline: true },
                        { name: 'Role Status', value: 'You currently have the Snapsmith role (**awarded via Super Approval**).', inline: false },
                        { name: 'Time Left', value: `**${status.timeLeft} days**`, inline: true },
                        { name: 'Unique Reactions', value: `**${status.totalUniqueReactions}**`, inline: true },
                        { name: 'Next Day Progress', value: `**${reactionsToNextDay}** more reactions until an additional day is added.`, inline: true },
                        { name: 'Super Approval', value: `You received a 🌟 Super Approval from <@${SUPER_APPROVER_ID}>!`, inline: false },
                        { name: 'Super reactions this month', value: `**${status.superReactionCount}**`, inline: true },
                        { name: 'Days queued', value: `**${status.daysQueued}** (max ${MAX_BUFFER_DAYS})`, inline: true }
                    );
            }

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (err) {
            console.error("Error in /snapsmith command:", err);
        }
    }
};
