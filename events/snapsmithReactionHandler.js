const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const path = require('path');

// CONFIGURATION: Update these as needed for your server
const SHOWCASE_CHANNEL_ID = '1285797205927792782';
const SNAPSMITH_ROLE_ID = '1374841261898469378';
const SNAPSMITH_ANNOUNCE_CHANNEL_ID = '1406275196133965834';
const SUPER_EMOJI = '🌟'; // Change to your super reaction emoji
const STAFF_ROLE_IDS = ['1324783261439889439', '1370874936456908931']; // Fill with your staff role IDs

const DATA_PATH = path.resolve(__dirname, '../data/snapsmith.json');
const MAX_DAYS = 14;
const BASE_DAYS = 7;

// Helper functions for persistence
function loadTimers() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveTimers(timers) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(timers, null, 2));
}

// Main reaction handler
module.exports = async (client, reaction, user) => {
  try {
    // Only trigger on correct channel and emoji
    if (reaction.message.channel.id !== SHOWCASE_CHANNEL_ID) return;
    if (reaction.emoji.name !== SUPER_EMOJI) return;

    // Ensure the user who reacted is staff
    const member = await reaction.message.guild.members.fetch(user.id);
    if (!member.roles.cache.some(r => STAFF_ROLE_IDS.includes(r.id))) return;

    // Target is the author of the submission
    const targetUserId = reaction.message.author.id;
    const guild = reaction.message.guild;
    let timers = loadTimers();
    const now = Date.now();

    // Calculate expiry and announce appropriately
    if (!timers[targetUserId] || timers[targetUserId] < now) {
      // Grant SnapSmith, set timer
      const memberTarget = await guild.members.fetch(targetUserId);
      await memberTarget.roles.add(SNAPSMITH_ROLE_ID);

      timers[targetUserId] = now + BASE_DAYS * 24 * 60 * 60 * 1000;
      saveTimers(timers);

      // Announce new SnapSmith
      const channel = guild.channels.cache.get(SNAPSMITH_ANNOUNCE_CHANNEL_ID);
      const embed = new MessageEmbed()
        .setTitle('A new Snapsmith Emerges')
        .addField('Congratulations', `<@${targetUserId}>`)
        .addField('Requirements Met', `Received a staff super reaction in <#${SHOWCASE_CHANNEL_ID}>`)
        .addField('Details', `You are now awarded the role <@&${SNAPSMITH_ROLE_ID}> as a Snapsmith.`)
        .setTimestamp();
      await channel.send({ embeds: [embed] });
    } else {
      // Already SnapSmith, extend timer up to max
      const bonusDays = Math.min(MAX_DAYS, Math.ceil((timers[targetUserId] - now) / (24 * 60 * 60 * 1000)) + BASE_DAYS);
      timers[targetUserId] = now + bonusDays * 24 * 60 * 60 * 1000;
      saveTimers(timers);

      // Announce bonus
      const channel = guild.channels.cache.get(SNAPSMITH_ANNOUNCE_CHANNEL_ID);
      const embed = new MessageEmbed()
        .setTitle('Super Approval Bonus')
        .addField('Congratulations', `<@${targetUserId}>`)
        .addField('Details', `You already have Snapsmith status, but <@${user.id}> gave you a ${SUPER_EMOJI} Super Approval!\n\nYou have received 1 extra week on your Snapsmith timer!`)
        .setTimestamp();
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('Error in SnapSmith reaction handler:', err);
  }
};
