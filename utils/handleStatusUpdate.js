const { ChannelType } = require('discord.js');
const rateLimitMap = new Map();
const RATE_LIMIT_MS = 5 * 60 * 1000;

const STATUS_CHANNEL_ID = '1395501617523986644';

const statusLabels = {
  investigating: { emoji: '🟡', label: 'Investigating (Latest)' },
  issues:       { emoji: '🔴', label: 'Issues (Latest)' },
  updating:     { emoji: '🔵', label: 'Updating (Latest)' },
  stable:       { emoji: '🟢', label: 'Stable (Latest)' },
  pending:      { emoji: '🔴', label: 'Pending (Latest)' }
};

async function handleStatusUpdate(interaction, status) {
  const userId = interaction.user.id;
  const now = Date.now();
  const lastUsed = rateLimitMap.get(userId) || 0;

  if (now - lastUsed < RATE_LIMIT_MS) {
    await interaction.reply({ content: 'You can only change the status twice per 10 minutes.', flags: 64 });
    return;
  }
  rateLimitMap.set(userId, now);

  const info = statusLabels[status];
  if (!info) {
    await interaction.reply({ content: 'Unknown status.', flags: 64 });
    return;
  }

  try {
    const channel = await interaction.client.channels.fetch(STATUS_CHANNEL_ID);

    if (!channel) {
      await interaction.reply({ content: `Status channel not found (ID: ${STATUS_CHANNEL_ID})`, flags: 64 });
      return;
    }

    if (channel.type === ChannelType.GuildText || channel.type === 0) {
      // Text channel: update topic
      const newStatus = `${info.emoji} | Status: ${info.label}`;
      await channel.setTopic(newStatus);
    } else if (channel.type === ChannelType.GuildVoice || channel.type === 2) {
      // Voice channel: update name
      const newName = `${info.emoji}┃Status : ${info.label}`;
      await channel.setName(newName);
    } else {
      await interaction.reply({ content: `Fetched channel is not a supported type. Type: ${channel.type}`, flags: 64 });
      return;
    }

  } catch (e) {
    try {
      await interaction.reply({ content: `Failed to update channel: ${e.message || e}`, flags: 64 });
    } catch (err) {}
    return;
  }

  await interaction.reply({ content: `Status changed to ${info.emoji} | ${info.label}`, flags: 64 });
}

module.exports = { handleStatusUpdate, statusLabels };
