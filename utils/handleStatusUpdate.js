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

  // --------- Topic update logic with debug ---------
  try {
    console.log(`[DEBUG] Fetching status channel with ID: ${STATUS_CHANNEL_ID}`);
    const channel = await interaction.client.channels.fetch(STATUS_CHANNEL_ID);

    if (!channel) {
      console.error(`[DEBUG] Channel not found for ID: ${STATUS_CHANNEL_ID}`);
      await interaction.reply({ content: `Status channel not found (ID: ${STATUS_CHANNEL_ID})`, ephemeral: true });
      return;
    }

    console.log(`[DEBUG] Fetched channel:`, {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      topic: channel.topic
    });

    // For Discord.js v14, ChannelType.GuildText === 0
    if (channel.type !== ChannelType.GuildText && channel.type !== 0) {
      console.error(`[DEBUG] Channel type is not GuildText: ${channel.type}`);
      await interaction.reply({ content: `Fetched channel is not a text channel. Type: ${channel.type}`, ephemeral: true });
      return;
    }

    // Log old topic
    console.log(`[DEBUG] Old topic: "${channel.topic}"`);
    const newTopic = `${info.emoji} | Status: ${info.label}`;
    await channel.setTopic(newTopic);

    // Log new topic
    console.log(`[DEBUG] New topic set: "${newTopic}"`);

  } catch (e) {
    console.error('[DEBUG] Failed to update status channel topic:', e);
    try {
      await interaction.reply({ content: `Failed to update channel topic: ${e.message || e}`, ephemeral: true });
    } catch (err) {
      console.error('[DEBUG] Failed to reply to interaction:', err);
    }
    return;
  }
  // -------------------------------------------

  await interaction.reply({ content: `Status changed to ${info.emoji} | ${info.label}`, ephemeral: true });
}

module.exports = { handleStatusUpdate, statusLabels };
