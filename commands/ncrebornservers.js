const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('NCReborn-servers')
        .setDescription('List all servers the bot is currently in'),

    async execute(interaction) {
        const guilds = interaction.client.guilds.cache.map(g => `${g.name} (${g.id})`);

        await interaction.reply({
            content: `**Servers I'm currently in:**\n${guilds.join('\n')}`,
            ephemeral: true
        });
    }
};
