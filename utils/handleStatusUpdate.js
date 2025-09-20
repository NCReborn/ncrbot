// utils/handleStatusUpdate.js
const rateLimitMap = new Map();
// 2 per 10 minutes = 1 per 5 minutes per user
const RATE_LIMIT_MS = 5 * 60 * 1000;

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

  // TODO: Your logic to update the status channel/voice channel here!
  // For example:
  // await updateVoiceChannelStatus(status);

  const info = statusLabels[status];
  if (!info) {
    await interaction.reply({ content: 'Unknown status.', ephemeral: true });
    return;
  }
  await interaction.reply({ content: `Status changed to ${info.emoji} | ${info.label}`, ephemeral: true });
}

module.exports = { handleStatusUpdate, statusLabels };
