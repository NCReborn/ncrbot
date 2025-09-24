const config = require('../config/imageOnlyConfig.json');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    // Ignore bots or DMs
    if (message.author.bot || !message.guild) return;

    // DEBUG: Log all messages received in image-only channels
    if (config.imageOnlyChannels.includes(message.channel.id)) {
      console.log(`[IMAGE-ONLY] Checking message: "${message.content}" by ${message.author.tag}`);

      // Accept: any image attachment OR a link in the message content
      const hasImage = message.attachments.some(att => att.contentType && att.contentType.startsWith('image/'));
      const hasLink = /(https?:\/\/[^\s]+)/i.test(message.content);

      // Only accept messages with an image attachment or a link
      if (!hasImage && !hasLink) {
        console.log('[IMAGE-ONLY] Deleting message:', message.content);
        try {
          await message.delete();
          const reply = await message.channel.send({
            content: `${message.author}, your message was removed: this channel is for images or links only.`,
          });
          setTimeout(() => reply.delete().catch(() => {}), 5000);
        } catch (e) {
          console.error('Failed to delete message:', e);
        }
      }
    }
  });
};
