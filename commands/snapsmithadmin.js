const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');

const DATA_PATH = path.join(__dirname, '..', 'data', 'snapsmith.json');
const ROLE_DURATION_DAYS = 30;
const REACTION_TARGET = 25;
const MAX_BUFFER_DAYS = 60;
const SUPER_APPROVER_ID = '278359162860077056'; // zVeinz
const SUPER_APPROVER_ID = '680928073587359902'; // mquiny
const SNAPSMITH_CHANNEL_ID = '1406275196133965834';

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
        ),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }
        await interaction.deferReply({ ephemeral: true }); // Defer for all admin commands

        const sub = interaction.options.getSubcommand();
        const data = loadData();
        const month = getCurrentMonth();
        let user = interaction.options.getUser('user');
        let messageId = interaction.options.getString('messageid');
        let reply = "";

        // ...all previous subcommands unchanged...

        if (sub === 'scan') {
            try {
                const { scanShowcase } = require('../utils/snapsmithManager');
                await scanShowcase(interaction.client);
                reply = "Manual scan completed. Showcase posts and reactions have been checked.";
            } catch (e) {
                reply = `Manual scan failed: ${e.message}`;
            }
        }

        // ...other subcommands unchanged...

        await interaction.editReply({ content: reply });
    }
};
