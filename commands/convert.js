const { SlashCommandBuilder } = require('discord.js');
const { convertChangelogToNexusMarkdown } = require('../utils/changelogConverter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Convert NCR/ADR changelogs into Nexus Mods Markdown comment format. Provide message IDs (space-separated).')
    .addStringOption(option =>
      option.setName('message_ids')
        .setDescription('Space-separated list of message IDs to fetch and convert')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const messageIdsString = interaction.options.getString('message_ids');
    const messageIds = messageIdsString.split(/\s+/).filter(id => /^\d+$/.test(id));
    if (!messageIds.length) {
      await interaction.editReply('You must provide one or more valid Discord message IDs.');
      return;
    }

    // Fetch all messages in order, from the same channel where command was run
    let allContent = '';
    for (const id of messageIds) {
      try {
        const msg = await interaction.channel.messages.fetch(id);
        allContent += msg.content + '\n';
      } catch (err) {
        allContent += `\n[Message ID ${id} not found or inaccessible]\n`;
      }
    }

    // Convert and reply
    const output = convertChangelogToNexusMarkdown(allContent);
    await interaction.editReply({
      content: 'Here is your Nexus Mods Markdown:\n```markdown\n' + output + '\n```',
      ephemeral: true
    });
  }
};
