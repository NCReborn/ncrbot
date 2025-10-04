const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const snapsmithRoles = require('../modules/snapsmith/Roles');
const snapsmithTracker = require('../modules/snapsmith/tracker');
const snapsmithSuperApproval = require('../modules/snapsmith/superApproval');
const snapsmithAnnouncer = require('../modules/snapsmith/announcer');
const snapsmithStorage = require('../modules/snapsmith/Storage');

const SNAPSMITH_ROLE_ID = snapsmithRoles.SNAPSMITH_ROLE_ID;
const ROLE_DURATION_DAYS = snapsmithRoles.ROLE_DURATION_DAYS;
const EXTRA_DAY_REACTION_COUNT = snapsmithRoles.EXTRA_DAY_REACTION_COUNT;
const MAX_BUFFER_DAYS = snapsmithRoles.MAX_BUFFER_DAYS;

let REACTION_TARGET = snapsmithRoles.ROLE_DURATION_DAYS;
let EXTRA_DAY_REACTION_TARGET = snapsmithRoles.EXTRA_DAY_REACTION_COUNT;
let MAX_BUFFER_DAYS_MUTABLE = snapsmithRoles.MAX_BUFFER_DAYS;

const data = new SlashCommandBuilder()
    .setName('snapsmithadmin')
    .setDescription('Admin tools for managing Snapsmith system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // CONFIG GROUP
    .addSubcommandGroup(group =>
        group.setName('config')
            .setDescription('System configuration')
            .addSubcommand(subcmd =>
                subcmd.setName('setmilestones')
                    .setDescription('Set milestone config values')
                    .addIntegerOption(opt => opt.setName('reactiontarget').setDescription('Reactions required for Snapsmith').setRequired(false))
                    .addIntegerOption(opt => opt.setName('extraday').setDescription('Reactions per extra day').setRequired(false))
                    .addIntegerOption(opt => opt.setName('maxbuffer').setDescription('Max buffer days').setRequired(false))
            )
            .addSubcommand(subcmd =>
                subcmd.setName('superapprover')
                    .setDescription('View, add, or remove super approver IDs')
                    .addStringOption(opt => opt.setName('action').setDescription('view/add/remove').setRequired(true))
                    .addStringOption(opt => opt.setName('id').setDescription('Discord ID to add/remove').setRequired(false))
            )
            .addSubcommand(subcmd =>
                subcmd.setName('export')
                    .setDescription('Export all Snapsmith data')
            )
            .addSubcommand(subcmd =>
                subcmd.setName('import')
                    .setDescription('Import Snapsmith data from JSON')
                    .addAttachmentOption(opt => opt.setName('json').setDescription('JSON file').setRequired(true))
            )
    )
    // USER GROUP (only keep listed subcommands)
    .addSubcommandGroup(group =>
        group.setName('user')
            .setDescription('Per-user management')
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
                subcmd.setName('setexpiry')
                    .setDescription('Set custom expiration date for user')
                    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
                    .addStringOption(opt => opt.setName('date').setDescription('YYYY-MM-DD').setRequired(true))
            )
            .addSubcommand(subcmd =>
                subcmd.setName('forcesuper')
                    .setDescription('Manually set super approval for user')
                    .addUserOption(opt => opt.setName('user').setDescription('User to super approve').setRequired(true))
                    .addBooleanOption(opt => opt.setName('remove').setDescription('Remove super approval?').setRequired(false))
            )
    )
    // BULK GROUP
    .addSubcommandGroup(group =>
        group.setName('bulk')
            .setDescription('Bulk actions')
            .addSubcommand(subcmd =>
                subcmd.setName('massremove')
                    .setDescription('Force expire/remove Snapsmith from all users')
            )
            .addSubcommand(subcmd =>
                subcmd.setName('massgrant')
                    .setDescription('Force grant Snapsmith to all eligible users')
                    .addIntegerOption(opt => opt.setName('days').setDescription('Days to grant').setRequired(false))
            )
            .addSubcommand(subcmd =>
                subcmd.setName('syncroles')
                    .setDescription('Sync current Snapsmith role holders into system')
            )
    )
    // ANNOUNCE GROUP
    .addSubcommandGroup(group =>
        group.setName('announce')
            .setDescription('Announcement tools')
            .addSubcommand(subcmd =>
                subcmd.setName('custom')
                    .setDescription('Send a custom announcement to Snapsmith channel')
                    .addStringOption(opt => opt.setName('message').setDescription('Announcement text').setRequired(true))
            )
            .addSubcommand(subcmd =>
                subcmd.setName('winner')
                    .setDescription('Manually announce a Snapsmith winner')
                    .addUserOption(opt => opt.setName('user').setDescription('Winner to announce').setRequired(true))
                    .addIntegerOption(opt => opt.setName('days').setDescription('Days awarded').setRequired(true))
                    .addIntegerOption(opt => opt.setName('reactions').setDescription('Unique reactions (optional)').setRequired(false))
                    .addBooleanOption(opt => opt.setName('superapproved').setDescription('Was Super Approved?').setRequired(false))
            )
    );

async function execute(interaction) {
    try {
        const group = interaction.options.getSubcommandGroup();
        const sub = interaction.options.getSubcommand();
        let user = interaction.options.getUser('user');
        let messageId = interaction.options.getString('messageid');
        let reply = "No action taken.";

        const userData = snapsmithStorage.loadUserData();
        const reactionData = snapsmithStorage.loadReactionData();

        // CONFIG GROUP
        if (group === 'config') {
            if (sub === 'setmilestones') {
                let changed = [];
                if (interaction.options.getInteger('reactiontarget')) {
                    REACTION_TARGET = interaction.options.getInteger('reactiontarget');
                    changed.push(`REACTION_TARGET set to ${REACTION_TARGET}`);
                }
                if (interaction.options.getInteger('extraday')) {
                    EXTRA_DAY_REACTION_TARGET = interaction.options.getInteger('extraday');
                    changed.push(`EXTRA_DAY_REACTION_COUNT set to ${EXTRA_DAY_REACTION_TARGET}`);
                }
                if (interaction.options.getInteger('maxbuffer')) {
                    MAX_BUFFER_DAYS_MUTABLE = interaction.options.getInteger('maxbuffer');
                    changed.push(`MAX_BUFFER_DAYS set to ${MAX_BUFFER_DAYS_MUTABLE}`);
                }
                await interaction.editReply({ content: changed.length ? changed.join('\n') : 'No config values changed.' });
            } else if (sub === 'superapprover') {
                const action = interaction.options.getString('action');
                const id = interaction.options.getString('id');
                if (action === 'view') {
                    await interaction.editReply({ content: `Current super approver IDs: ${snapsmithSuperApproval.SUPER_APPROVER_IDS.join(', ')}` });
                } else if (action === 'add' && id) {
                    if (!snapsmithSuperApproval.SUPER_APPROVER_IDS.includes(id)) {
                        snapsmithSuperApproval.SUPER_APPROVER_IDS.push(id);
                        await interaction.editReply({ content: `Added ${id} to super approver list.` });
                    } else {
                        await interaction.editReply({ content: `${id} is already a super approver.` });
                    }
                } else if (action === 'remove' && id) {
                    const idx = snapsmithSuperApproval.SUPER_APPROVER_IDS.indexOf(id);
                    if (idx !== -1) {
                        snapsmithSuperApproval.SUPER_APPROVER_IDS.splice(idx, 1);
                        await interaction.editReply({ content: `Removed ${id} from super approver list.` });
                    } else {
                        await interaction.editReply({ content: `${id} was not a super approver.` });
                    }
                } else {
                    await interaction.editReply({ content: 'Invalid action or missing ID.' });
                }
            } else if (sub === 'export') {
                const json = JSON.stringify({ userData, reactionData }, null, 2);
                const buffer = Buffer.from(json, 'utf8');
                const attachment = new AttachmentBuilder(buffer, { name: 'snapsmith_export.json' });
                await interaction.editReply({ content: 'Snapsmith data exported:', files: [attachment] });
            } else if (sub === 'import') {
                const file = interaction.options.getAttachment('json');
                if (!file) return await interaction.editReply({ content: 'No file provided.' });
                const res = await fetch(file.url);
                const json = await res.json();
                if (json.userData && json.reactionData) {
                    snapsmithStorage.saveUserData(json.userData);
                    snapsmithStorage.saveReactionData(json.reactionData);
                    await interaction.editReply({ content: 'Imported Snapsmith data.' });
                } else {
                    await interaction.editReply({ content: 'Invalid JSON format.' });
                }
            }
        }
        // USER GROUP
        else if (group === 'user') {
            if (sub === 'forcegive') {
                if (!user) return interaction.editReply({ content: "User required." });
                const days = interaction.options.getInteger('days') ?? snapsmithRoles.ROLE_DURATION_DAYS;
                const guild = interaction.guild;
                const member = await guild.members.fetch(user.id);
                await snapsmithRoles.grantSnapsmith(member, days);
                await interaction.editReply({ content: `Granted Snapsmith role to <@${user.id}> for ${days} days.` });
            }
            else if (sub === 'forceremove') {
                if (!user) return interaction.editReply({ content: "User required." });
                const guild = interaction.guild;
                const member = await guild.members.fetch(user.id);
                await snapsmithRoles.removeSnapsmith(member);
                await interaction.editReply({ content: `Removed Snapsmith role from <@${user.id}>.` });
            }
            else if (sub === 'addreaction') {
                if (!user || !messageId) return interaction.editReply({ content: "User and message ID required." });
                snapsmithTracker.addReaction(messageId, user.id);
                await interaction.editReply({ content: `Added reaction for <@${user.id}> on message ${messageId}.` });
            }
            else if (sub === 'removereaction') {
                if (!user || !messageId) return interaction.editReply({ content: "User and message ID required." });
                snapsmithTracker.removeReaction(messageId, user.id);
                await interaction.editReply({ content: `Removed reaction for <@${user.id}> on message ${messageId}.` });
            }
            else if (sub === 'setexpiry') {
                if (!user) return interaction.editReply({ content: "User required." });
                const dateStr = interaction.options.getString('date');
                let dateObj;
                try {
                    dateObj = new Date(dateStr + "T00:00:00.000Z");
                    if (isNaN(dateObj.getTime())) throw new Error("Invalid date.");
                } catch {
                    return await interaction.editReply({ content: "Invalid date format. Use YYYY-MM-DD." });
                }
                if (!userData[user.id]) {
                    userData[user.id] = {};
                }
                userData[user.id].expiration = dateObj.toISOString();
                snapsmithStorage.saveUserData(userData);
                await interaction.editReply({ content: `Set expiration for <@${user.id}> to ${dateObj.toISOString()}` });
            }
            else if (sub === 'forcesuper') {
                if (!user) return interaction.editReply({ content: "User required." });
                const remove = interaction.options.getBoolean('remove') ?? false;
                if (remove) {
                    userData[user.id].superApproved = false;
                    snapsmithStorage.saveUserData(userData);
                    await interaction.editReply({ content: `Removed super approval for <@${user.id}>.` });
                } else {
                    snapsmithSuperApproval.applySuperApprovalBonus(user.id);
                    userData[user.id].superApproved = true;
                    snapsmithStorage.saveUserData(userData);
                    await interaction.editReply({ content: `Granted super approval bonus to <@${user.id}>.` });
                }
            }
        }
        // BULK GROUP
        else if (group === 'bulk') {
            if (sub === 'massremove') {
                let removed = 0;
                for (const userId in userData) {
                    if (snapsmithRoles.getSnapsmithStatus(userId).isActive) {
                        userData[userId].expiration = null;
                        removed++;
                    }
                }
                snapsmithStorage.saveUserData(userData);
                await interaction.editReply({ content: `Force removed Snapsmith from ${removed} users.` });
            } else if (sub === 'massgrant') {
                const days = interaction.options.getInteger('days') ?? snapsmithRoles.ROLE_DURATION_DAYS;
                let granted = 0;
                for (const userId in userData) {
                    const stats = snapsmithTracker.getUserReactionStats(userId);
                    if (!snapsmithRoles.getSnapsmithStatus(userId).isActive && stats.total >= REACTION_TARGET) {
                        userData[userId].expiration = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
                        granted++;
                    }
                }
                snapsmithStorage.saveUserData(userData);
                await interaction.editReply({ content: `Force granted Snapsmith to ${granted} eligible users.` });
            } else if (sub === 'syncroles') {
                const EXPIRATION_DAYS = 30;
                const now = Date.now();
                const guild = interaction.guild;
                await guild.members.fetch();
                const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(SNAPSMITH_ROLE_ID));
                let added = 0;
                for (const member of membersWithRole.values()) {
                    const userId = member.id;
                    userData[userId] = {
                        ...userData[userId],
                        snapsmithAchievedAt: now,
                        expiration: new Date(now + EXPIRATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
                        initialReactionCount: 30,
                        reactionMilestoneDays: 0,
                        superApprovalBonusDays: 0,
                        superApproved: false,
                    };
                    added++;
                }
                snapsmithStorage.saveUserData(userData);
                await interaction.editReply({ content: `Synced ${added} Snapsmith role holders into system and set their expiry to 30 days from now.` });
            }
        }
        // ANNOUNCE GROUP
        else if (group === 'announce') {
            if (sub === 'custom') {
                const msg = interaction.options.getString('message');
                const channel = await interaction.client.channels.fetch(snapsmithAnnouncer.SNAPSMITH_CHANNEL_ID);
                await channel.send(msg);
                await interaction.editReply({ content: 'Announcement sent.' });
            } else if (sub === 'winner') {
                const winner = interaction.options.getUser('user');
                const days = interaction.options.getInteger('days');
                const reactions = interaction.options.getInteger('reactions');
                const superapproved = interaction.options.getBoolean('superapproved');
                await snapsmithAnnouncer.announceNewSnapsmith(
                    interaction.client,
                    winner.id,
                    superapproved ? snapsmithSuperApproval.SUPER_APPROVER_IDS[0] : null
                );
                await interaction.editReply({ content: `Manually announced winner <@${winner.id}> with ${days} days${reactions ? ` and ${reactions} reactions` : ''}${superapproved ? ' (Super Approved)' : ''}.` });
            }
        }
        else {
            await interaction.editReply({ content: reply });
        }
    } catch (err) {
        console.error("Error in snapsmithadmin command:", err);
        await interaction.editReply({ content: "An error occurred while executing snapsmithadmin." });
    }
}

module.exports = {
    data,
    execute
};
