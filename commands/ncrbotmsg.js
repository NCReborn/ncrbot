const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const ADMIN_ROLE_ID = '1324783261439889439'; // <-- Replace with your actual admin role ID

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ncrbot')
    .setDescription('Post a message as NCRBot (admin only)')
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('The message for the bot to post')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Only admins by default
  async execute(interaction) {
    // Additional role check for admins (optional, for extra safety)
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }
    const msg = interaction.options.getString('message');
    await interaction.channel.send({ content: msg });
    await interaction.reply({ content: 'Message sent!', ephemeral: true });
  }
};
