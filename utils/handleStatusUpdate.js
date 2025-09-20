const { ChannelType } = require('discord.js');
const rateLimitMap = new Map();
// 2 per 10 minutes = 1 per 5 minutes per user
const RATE_LIMIT_MS = 5 * 60 * 1000;

// Update with your actual channel ID
const STATUS_CHANNEL_ID = '1395501617523986644';

const statusLabels = {
  investigating: { emoji: '🟡', label: 'Investigating' },
  issues:       { emoji: '🔴', label: 'Issues' },
  updating:     { emoji: '🔵', label: 'Updating' },
  stable:       { emoji: '🟢', label: 'Stable' },
  pending:      { emoji: '🔴', label: 'Pending' }
};

async function handleStatusUpdate(interaction, status) {
  const userId = interaction.user.id;
  const now = Date.now();
  const lastUsed = rateLimitMap.get(userId) || 0;

  if (now - lastUsed < RATE_LIMIT_MS) {
    await interaction.reply({ content: 'You can only change the status twice per 10 minutes.', ephemeral: true });
    return;
  }
  rateLimitMap.set(userId, now);

  const info = statusLabels[status];
  if (!info) {
    await interaction.reply({ content: 'Unknown status.', ephemeral: true });
    return;
  }

  // --------- Topic update logic here ---------
  try {
    const channel = await interaction.client.channels.fetch(STATUS_CHANNEL_ID);
    if (channel && channel.type === ChannelType.GuildText) {
      await channel.setTopic(`${info.emoji} | Status: ${info.label}`);
    }
  } catch (e) {
    // You can add logging here if desired
    console.warn('Failed to update status channel topic:', e);
  }
  // -------------------------------------------

  await interaction.reply({ content: `Status changed to ${info.emoji} | ${info.label}`, ephemeral: true });
}

module.exports = { handleStatusUpdate, statusLabels };
