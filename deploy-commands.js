const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Replace this with your server ID for instant updates
const GUILD_ID = '1285796904160202752';

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  // Handle modules that export an array of commands (see status.js suggestion)
  if (Array.isArray(command)) {
    for (const subcommand of command) {
      commands.push(subcommand.data.toJSON());
    }
  } else if (command.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands for guild.');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands for guild.');
  } catch (error) {
    console.error(error);
  }
})();
