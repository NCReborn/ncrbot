const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const snapsmithRoles = require('../modules/snapsmith/Roles');
const snapsmithTracker = require('../modules/snapsmith/tracker');
const snapsmithSuperApproval = require('../modules/snapsmith/superApproval');
const { loadUserData } = require('../modules/snapsmith/Storage');

const SNAPSMITH_ROLE_ID = snapsmithRoles.SNAPSMITH_ROLE_ID;
const EXTRA_DAY_REACTION_COUNT = snapsmithRoles.EXTRA_DAY_REACTION_COUNT;
const MAX_BUFFER_DAYS = snapsmithRoles.MAX_BUFFER_DAYS;
const REACTION_TARGET = snapsmithRoles.BASE_REACTIONS;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snapsmith')
        .setDescription('Check your Snapsmith role status and eligibility (based on unique users per post)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Check another user\'s Snapsmith status')
        ),
    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser?.('user') || interaction.user;
            const userId = targetUser.id;

            let usernameDisplay = `<@${userId}>`;
            if (interaction.guild) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    usernameDisplay = `${member.displayName} (<@${userId}>)`;
                } catch {
                    usernameDisplay = `${targetUser.username} (<@${userId}>)`;
                }
            } else {
                usernameDisplay = `${targetUser.username} (<@${userId}>)`;
            }

            const status = snapsmithRoles.getSnapsmithStatus(userId);
            const stats = snapsmithTracker.getUserReactionStats(userId);
            const userData = loadUserData();
            const superApprovalBonusDays = userData[userId]?.superApprovalBonusDays ?? 0;
            const superApproved = snapsmithSuperApproval.checkSuperApproval(userId);

            // Calculate milestone days from actual reactions (never negative)
            const milestoneDays = stats.total < REACTION_TARGET
                ? 0
                : Math.floor((stats.total - REACTION_TARGET) / EXTRA_DAY_REACTION_COUNT);

            let nextDayText = '';
            if (!status.isActive) {
                nextDayText = `${Math.max(REACTION_TARGET - stats.total, 0)} more reactions needed to earn Snapsmith.`;
            } else {
                // If they haven't hit initial milestone for extra days yet:
                if (stats.total < REACTION_TARGET) {
                    nextDayText = `${REACTION_TARGET - stats.total} more reactions needed to earn the first extra day.`;
                } else {
                    // Calculate how many reactions toward next extra day
                    const reactionsSinceMilestone = stats.total - REACTION_TARGET;
                    const reactionsToNextDay = EXTRA_DAY_REACTION_COUNT - (reactionsSinceMilestone % EXTRA_DAY_REACTION_COUNT);
                    nextDayText = `${reactionsToNextDay} more reactions until an additional day is added.`;
                }
            }

            let embed;
            if (!status.isActive) {
                embed = new EmbedBuilder()
                    .setColor(0xFAA61A)
                    .setTitle(`Snapsmith Status`)
                    .addFields(
                        { name: 'User', value: usernameDisplay, inline: true },
                        { name: 'Role Status', value: `You do **not** currently have the <@&${SNAPSMITH_ROLE_ID}> role.`, inline: false },
                        { name: 'Unique Reactions', value: `**${stats.total}**`, inline: true },
                        { name: `Reactions remaining`, value: `**${Math.max(REACTION_TARGET - stats.total, 0)}** more needed to earn Snapsmith.`, inline: true },
                        { name: 'Super reactions this month', value: `**${superApprovalBonusDays}**`, inline: true },
                        { name: 'Days queued', value: `**0** (max ${MAX_BUFFER_DAYS})`, inline: true }
                    );
            } else if (status.isActive && !superApproved) {
                embed = new EmbedBuilder()
                    .setColor(0xFAA61A)
                    .setTitle(`Snapsmith Status`)
                    .addFields(
                        { name: 'User', value: usernameDisplay, inline: true },
                        { name: 'Role Status', value: `You currently have the <@&${SNAPSMITH_ROLE_ID}> role.`, inline: false },
                        { name: 'Time Left', value: `**${status.daysLeft} days**`, inline: true },
                        { name: 'Unique Reactions', value: `**${stats.total}**`, inline: true },
                        { name: 'Next Day Progress', value: nextDayText, inline: true },
                        { name: 'Super reactions this month', value: `**${superApprovalBonusDays}**`, inline: true },
                        { name: 'Days queued', value: `**${status.daysLeft}** (max ${MAX_BUFFER_DAYS})`, inline: true }
                    );
            } else if (status.isActive && superApproved) {
                embed = new EmbedBuilder()
                    .setColor(0xFAA61A)
                    .setTitle(`Snapsmith Status`)
                    .addFields(
                        { name: 'User', value: usernameDisplay, inline: true },
                        { name: 'Role Status', value: `You currently have the <@&${SNAPSMITH_ROLE_ID}> role (**awarded via Super Approval**).`, inline: false },
                        { name: 'Time Left', value: `**${status.daysLeft} days**`, inline: true },
                        { name: 'Unique Reactions', value: `**${stats.total}**`, inline: true },
                        { name: 'Next Day Progress', value: nextDayText, inline: true },
                        { name: 'Super Approval', value: `You received a 🌟 Super Approval from a super approver!`, inline: false },
                        { name: 'Super reactions this month', value: `**${superApprovalBonusDays}**`, inline: true },
                        { name: 'Days queued', value: `**${status.daysLeft}** (max ${MAX_BUFFER_DAYS})`, inline: true }
                    );
            }

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (err) {
            console.error("Error in /snapsmith command:", err);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: "An error occurred while checking Snapsmith status." });
            } else {
                await interaction.reply({ content: "An error occurred while checking Snapsmith status.", ephemeral: true });
            }
        }
    }
};
