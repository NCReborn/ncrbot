const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

// Match your utils/snapsmithManager.js config
const DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmith.json');
const ROLE_DURATION_DAYS = 30;
const REACTION_TARGET = 25;
const MAX_BUFFER_DAYS = 60;
const SUPER_APPROVER_ID = '278359162860077056'; // zVeinz

function getCurrentMonth() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function loadData() {
    if (fs.existsSync(DATA_PATH)) {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    }
    return {};
}

async function getUserSnapsmithStatus(userId) {
    const data = loadData();
    const now = new Date();
    const month = getCurrentMonth();
    const userData = data[userId];

    if (!userData) return null;

    // Count unique reactions this month
    let monthlyUniqueReactors = new Set();
    const monthData = userData.months[month] || {};
    for (const reactorsArr of Object.values(monthData)) {
        reactorsArr.forEach(id => monthlyUniqueReactors.add(id));
    }

    // Role status
    let roleActive = false;
    let timeLeft = null;
    if (userData.expiration) {
        const expirationDate = new Date(userData.expiration);
        if (expirationDate > now) {
            roleActive = true;
            const msLeft = expirationDate - now;
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
            timeLeft = daysLeft;
        }
    }

    // Calculate how many days queued
    let daysQueued = 0;
    if (userData.superApproved) daysQueued += ROLE_DURATION_DAYS;
    let totalUniqueReactors = monthlyUniqueReactors.size;
    if (totalUniqueReactors >= REACTION_TARGET) {
        let additionalMilestones = 0;
        if (userData.superApproved) {
            additionalMilestones = Math.floor((totalUniqueReactors - 5) / REACTION_TARGET);
        } else {
            additionalMilestones = Math.floor(totalUniqueReactors / REACTION_TARGET);
        }
        daysQueued += Math.min(additionalMilestones * ROLE_DURATION_DAYS, MAX_BUFFER_DAYS - daysQueued);
    }
    daysQueued = Math.min(daysQueued, MAX_BUFFER_DAYS);

    return {
        roleActive,
        timeLeft,
        totalUniqueReactors,
        superApproved: !!userData.superApproved,
        daysQueued,
        expiration: userData.expiration
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snapsmith')
        .setDescription('Check your Snapsmith role status and eligibility'),
    async execute(interaction) {
        const status = await getUserSnapsmithStatus(interaction.user.id);
        if (!status) {
            await interaction.reply({
                content: "You have no Snapsmith activity yet. Submit your best in-game photos in <#1285797205927792782> to get started!",
                ephemeral: true
            });
            return;
        }

        let msg = `**Snapsmith Status for <@${interaction.user.id}>**\n`;
        msg += status.roleActive
            ? `- You currently have the Snapsmith role.\n- Time left: **${status.timeLeft} days**\n`
            : `- You do not currently have the Snapsmith role.\n`;

        msg += `- Unique reactions this month: **${status.totalUniqueReactors}**\n`;
        msg += status.superApproved
            ? `- You received a :star2: Super Approval from <@${SUPER_APPROVER_ID}> this month!\n`
            : "";
        msg += `- Days queued (total): **${status.daysQueued}** (max 60)\n`;

        await interaction.reply({ content: msg, ephemeral: true });
    }
};
