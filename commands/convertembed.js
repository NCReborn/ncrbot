const { SlashCommandBuilder } = require('discord.js');
const { convertChangelogToNexusMarkdownFromEmbeds } = require('../utils/changelogConverter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('convertembed')
    .setDescription('Fetches embeds from one or more messages and converts them to Nexus-ready Markdown')
    .addStringOption(option =>
      option.setName('message_ids')
        .setDescription('One or more message IDs (space, comma, or newline separated)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('channel_id')
        .setDescription('The channel ID (defaults to current channel)')
        .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const messageIdsRaw = interaction.options.getString('message_ids');
    const channelId = interaction.options.getString('channel_id') || interaction.channelId;

    // Split by space, comma, or newline, filter valid IDs
    const messageIds = messageIdsRaw
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(s => /^\d+$/.test(s));

    if (!messageIds.length) {
      await interaction.editReply('You must provide one or more valid Discord message IDs.');
      return;
    }

    try {
      const channel = await interaction.client.channels.fetch(channelId);
      if (!channel.isTextBased()) {
        await interaction.editReply('That channel is not a text channel.');
        return;
      }

      let allEmbeds = [];
      let failedIds = [];
      for (const id of messageIds) {
        try {
          const msg = await channel.messages.fetch(id);
          allEmbeds.push(...msg.embeds.map(e => e.toJSON()));
        } catch {
          failedIds.push(id);
        }
      }

      if (!allEmbeds.length) {
        let errorMsg = 'No embeds found in the provided message(s).';
        if (failedIds.length) errorMsg += ` Could not fetch messages: ${failedIds.join(', ')}`;
        await interaction.editReply(errorMsg);
        return;
      }

      const converted = convertChangelogToNexusMarkdownFromEmbeds(allEmbeds);

      // Check if output exceeds Discord's single-message limit
      const DISCORD_LIMIT = 1950;
      if (converted.length > DISCORD_LIMIT) {
        // Create file attachment with markdown code block format
        const fileContent = `\`\`\`markdown\n${converted}\n\`\`\``;
        const buffer = Buffer.from(fileContent, 'utf8');
        
        await interaction.editReply({
          content: 'The converted output is too large for a single message. Here it is as a file:',
          files: [{
            attachment: buffer,
            name: 'converted_markdown.txt'
          }]
        });
      } else {
        // Small output, send as message like before
        const content = `\`\`\`markdown\n${converted}\n\`\`\``;
        await interaction.editReply(content);
      }

      // Optionally, mention missing messages
      if (failedIds.length) {
        await interaction.followUp({
          content: `Warning: Could not fetch messages with IDs: ${failedIds.join(', ')}`,
          ephemeral: true
        });
      }
    } catch (err) {
      await interaction.editReply('Could not fetch the channel. Make sure the bot has access and the IDs are correct.');
    }
  }
};
