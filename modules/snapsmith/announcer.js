const { EmbedBuilder } = require('discord.js');
const SNAPSMITH_CHANNEL_ID = '1406275196133965834'; // Set your actual channel ID
const SHOWCASE_CHANNEL_ID = '1285797205927792782'; // Set your actual channel ID
const SNAPSMITH_ROLE_ID = '1374841261898469378';   // Set your actual role ID

/**
 * Announce a new Snapsmith achievement in the Snapsmith channel.
 * @param {Discord.Client} client
 * @param {string} userId
 * @param {string} superApproverId (optional)
 */
async function announceNewSnapsmith(client, userId, superApproverId = null) {
    const channel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);
    const requirementsStr = superApproverId
        ? `Received a Super Approval 🌟 from <@${superApproverId}>`
        : `Received at least 30 unique reactions in <#${SHOWCASE_CHANNEL_ID}>`;
    const detailsStr = superApproverId
        ? `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have received a super approval star from <@${superApproverId}>, we now bestow upon you the role <@&${SNAPSMITH_ROLE_ID}> as a Snapsmith.`
        : `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have received enough unique reactions, you are now awarded the role <@&${SNAPSMITH_ROLE_ID}> as a Snapsmith.`;

    const embed = new EmbedBuilder()
        .setColor(0xFAA61A)
        .setTitle('A new Snapsmith Emerges')
        .addFields(
            { name: 'Congratulations', value: `<@${userId}>`, inline: false },
            { name: 'Requirements Met', value: requirementsStr, inline: false },
            { name: 'Details', value: detailsStr, inline: false }
        )
        .setTimestamp();

    await channel.send({ embeds: [embed] });
}

/**
 * Announce extra day(s) earned by a Snapsmith.
 * @param {Discord.Client} client
 * @param {string} userId
 * @param {number} days
 */
async function announceExtraDay(client, userId, days = 1) {
    const channel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);
    const embed = new EmbedBuilder()
        .setColor(0xFAA61A)
        .setTitle(`${userId} has earned additional day${days > 1 ? 's' : ''}!`)
        .addFields(
            { name: 'Congratulations', value: `<@${userId}>`, inline: false },
            { name: 'Details', value: `Your submissions in <#${SHOWCASE_CHANNEL_ID}> have received enough reactions, you have earned ${days} extra day${days > 1 ? 's' : ''} onto your <@&${SNAPSMITH_ROLE_ID}> timer!`, inline: false }
        )
        .setTimestamp();

    await channel.send({ embeds: [embed] });
}

/**
 * Announce a Super Approval bonus for a Snapsmith.
 * @param {Discord.Client} client
 * @param {string} userId
 * @param {string} superApproverId
 */
async function announceSuperApproval(client, userId, superApproverId) {
    const channel = await client.channels.fetch(SNAPSMITH_CHANNEL_ID);
    const embed = new EmbedBuilder()
        .setColor(0xFAA61A)
        .setTitle('Super Approval Bonus')
        .addFields(
            { name: 'Congratulations', value: `<@${userId}>`, inline: false },
            { name: 'Details', value: `You already have Snapsmith status, but <@${superApproverId}> gave you a 🌟 Super Approval!\n\n**You have received 1 extra day on your Snapsmith timer!**`, inline: false }
        )
        .setTimestamp();

    await channel.send({ embeds: [embed] });
}

module.exports = {
    announceNewSnapsmith,
    announceExtraDay,
    announceSuperApproval,
    SNAPSMITH_CHANNEL_ID,
    SHOWCASE_CHANNEL_ID,
    SNAPSMITH_ROLE_ID,
};
