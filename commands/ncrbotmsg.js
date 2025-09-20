const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const ADMIN_ROLE_ID = '1324783261439889439'; // <-- Replace with your actual admin role ID

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ncrbotmsg')
    .setDescription('Post a message as NCRBot (admin only)')
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('The message for the bot to post')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('format')
        .setDescription('Message format')
        .addChoices(
          { name: 'Plain', value: 'plain' },
          { name: 'Embed', value: 'embed' }
        )
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Only admins by default
  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }
    const msg = interaction.options.getString('message');
    const format = interaction.options.getString('format') || 'plain';

    if (format === 'embed') {
      const embed = new EmbedBuilder()
        .setDescription(msg)
        .setColor(0x0099ff);
      await interaction.channel.send({ embeds: [embed] });
    } else {
      await interaction.channel.send({ content: msg });
    }
    await interaction.reply({ content: 'Message sent!', ephemeral: true });
  }
};
