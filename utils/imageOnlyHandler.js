const config = require('../config/imageOnlyConfig.json');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    // Ignore bots and DMs
    if (message.author.bot || !message.guild) return;

    // DEBUG: Log all messages received in image-only channels
    if (config.imageOnlyChannels.includes(message.channel.id)) {
      console.log(`[DEBUG] Message in image-only channel: ${message.content} by ${message.author.tag}`);
      const hasImage = message.attachments.some(att => att.contentType && att.contentType.startsWith('image/'));
      const hasFile = message.attachments.size > 0;
      const hasLink = /(https?:\/\/[^\s]+)/i.test(message.content);

      if (!hasImage && !hasFile && !hasLink) {
        console.log('[DEBUG] Deleting message:', message.content);
        try {
          await message.delete();
          const reply = await message.channel.send({
            content: `${message.author}, your message was removed: this channel is for images, files, or links only.`,
          });
          setTimeout(() => reply.delete().catch(() => {}), 5000);
        } catch (e) {
          console.error('Failed to delete message:', e);
        }
      }
    }
  });
};
