const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// Store bot enabled/disabled state in memory (you can switch to a DB/file if needed)
let askEnabled = true;

const MOD_ROLE_ID = '121940611908501504';
const ASK_CHANNEL_ID = '1418742976871399456';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('asktoggle')
    .setDescription('Enable or disable the ask command (mod only)')
    .addBooleanOption(option =>
      option.setName('enabled')
        .setDescription('Enable (true) or disable (false) the ask command')
        .setRequired(true)),
  async execute(interaction) {
    // Check for mod role
    if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
      return await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const enabled = interaction.options.getBoolean('enabled');
    askEnabled = enabled; // Update state

    const channel = await interaction.guild.channels.fetch(ASK_CHANNEL_ID);
    const everyoneRole = interaction.guild.roles.everyone;

    if (!channel) {
      return await interaction.reply({ content: 'Ask channel not found.', ephemeral: true });
    }

    if (enabled) {
      // Restore send permissions to everyone
      await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: true });
      await channel.send('The bot is now available again for questions!');
      await interaction.reply({ content: 'Ask command enabled and channel unlocked.', ephemeral: true });
    } else {
      // Remove send permissions from everyone except mods
      await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
      await channel.send('The bot is temporarily unavailable.');
      await interaction.reply({ content: 'Ask command disabled and channel locked.', ephemeral: true });
    }
  },
  // Export askEnabled state for other modules
  askEnabled: () => askEnabled,
};
