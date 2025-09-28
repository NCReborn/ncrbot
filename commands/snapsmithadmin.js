const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');

const DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmith.json');
const ROLE_DURATION_DAYS = 30;
const REACTION_TARGET = 25;
const MAX_BUFFER_DAYS = 60;
const SUPER_APPROVER_ID = '278359162860077056'; // zVeinz

function loadData() {
    if (fs.existsSync(DATA_PATH)) {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    }
    return {};
}

function saveData(data) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

module.exports = {
    data: new SlashCommandBuilder()
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
        ),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }
        const sub = interaction.options.getSubcommand();
        const data = loadData();
        const month = getCurrentMonth();
        let user = interaction.options.getUser('user');
        let messageId = interaction.options.getString('messageid');
        let reply = "";

        if (sub === 'addreaction') {
            if (!user || !messageId) {
                reply = "User and message ID required.";
            } else {
                let found = false;
                for (const [uid, userData] of Object.entries(data)) {
                    if (userData.months[month] && userData.months[month][messageId]) {
                        found = true;
                        if (!userData.months[month][messageId].includes(user.id)) {
                            userData.months[month][messageId].push(user.id);
                            saveData(data);
                            reply = `Added reaction for ${user} on message ${messageId}.`;
                        } else {
                            reply = `${user} already has a reaction on message ${messageId}.`;
                        }
                        break;
                    }
                }
                if (!found) {
                    reply = `Message ${messageId} not found in current month data.`;
                }
            }
        }

        if (sub === 'removereaction') {
            if (!user || !messageId) {
                reply = "User and message ID required.";
            } else {
                let found = false;
                for (const [uid, userData] of Object.entries(data)) {
                    if (userData.months[month] && userData.months[month][messageId]) {
                        found = true;
                        let arr = userData.months[month][messageId];
                        if (arr.includes(user.id)) {
                            arr = arr.filter(id => id !== user.id);
                            userData.months[month][messageId] = arr;
                            saveData(data);
                            reply = `Removed reaction for ${user} on message ${messageId}.`;
                        } else {
                            reply = `${user} does not have a reaction on message ${messageId}.`;
                        }
                        break;
                    }
                }
                if (!found) {
                    reply = `Message ${messageId} not found in current month data.`;
                }
            }
        }

        if (sub === 'forcegive') {
            let days = interaction.options.getInteger('days') || ROLE_DURATION_DAYS;
            if (!user) reply = "User required.";
            else {
                if (!data[user.id]) data[user.id] = { months: {}, expiration: null, superApproved: false };
                const newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
                data[user.id].expiration = newExpiry.toISOString();
                saveData(data);
                try {
                    const member = await interaction.guild.members.fetch(user.id);
                    await member.roles.add(SNAPSMITH_ROLE_ID);
                    reply = `Force-given Snapsmith role to ${user} for ${days} days.`;
                } catch (e) {
                    reply = `Force-given in system, but could not add Discord role: ${e.message}`;
                }
            }
        }

        if (sub === 'forceremove') {
            if (!user) reply = "User required.";
            else {
                if (data[user.id]) {
                    data[user.id].expiration = null;
                    data[user.id].superApproved = false;
                    saveData(data);
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

        if (sub === 'reset') {
            if (!user) reply = "User required.";
            else {
                if (data[user.id]) {
                    data[user.id].months[month] = {};
                    saveData(data);
                    reply = `Cleared all reaction data for ${user} for month ${month}.`;
                } else {
                    reply = "User not found in data.";
                }
            }
        }

        if (sub === 'debug') {
            if (!user) reply = "User required.";
            else {
                if (data[user.id]) {
                    reply = `Data for ${user}:\n\`\`\`json\n${JSON.stringify(data[user.id], null, 2)}\n\`\`\``;
                } else {
                    reply = "User not found in data.";
                }
            }
        }

        if (sub === 'forcesuper') {
            let remove = interaction.options.getBoolean('remove');
            if (!user) reply = "User required.";
            else {
                if (!data[user.id]) data[user.id] = { months: {}, expiration: null, superApproved: false };
                data[user.id].superApproved = !remove;
                saveData(data);
                reply = `${remove ? 'Removed' : 'Set'} super approval for ${user}.`;
            }
        }

        if (sub === 'syncroles') {
            // Use manager's function dynamically
            try {
                const { syncCurrentSnapsmiths } = require('../utils/snapsmithManager');
                await syncCurrentSnapsmiths(interaction.client);
                reply = "Synced current Snapsmith role holders from Discord into system.";
            } catch (e) {
                reply = `Sync failed: ${e.message}`;
            }
        }

        if (sub === 'setexpiry') {
            const dateStr = interaction.options.getString('date');
            if (!user || !dateStr) reply = "User and date required.";
            else {
                const exp = new Date(dateStr);
                if (isNaN(exp.getTime())) reply = "Invalid date format. Use YYYY-MM-DD.";
                else {
                    if (!data[user.id]) data[user.id] = { months: {}, expiration: null, superApproved: false };
                    data[user.id].expiration = exp.toISOString();
                    saveData(data);
                    reply = `Set expiration for ${user} to ${exp.toISOString()}.`;
                }
            }
        }

        if (sub === 'purge') {
            const months = interaction.options.getInteger('months');
            if (!months || months < 1) {
                reply = "Months to keep must be at least 1.";
            } else {
                let purged = 0;
                for (const userData of Object.values(data)) {
                    if (!userData.months) continue;
                    const keys = Object.keys(userData.months);
                    if (keys.length > months) {
                        const toDelete = keys.sort().slice(0, keys.length - months);
                        toDelete.forEach(k => delete userData.months[k]);
                        purged += toDelete.length;
                    }
                }
                saveData(data);
                reply = `Purged data for ${purged} month(s) older than last ${months} months.`;
            }
        }

        await interaction.reply({ content: reply, ephemeral: true });
    }
};
