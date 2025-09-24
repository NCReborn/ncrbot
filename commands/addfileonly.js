const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, '../config/imageOnlyConfig.json');

module.exports = {
  data: {
    name: 'addfileonly',
    description: 'Add a channel to file-only enforcement.',
    options: [{
      name: 'channel',
      description: 'Channel to add',
      type: 7, // CHANNEL type
      required: true,
    }]
  },
  async execute(interaction) {
    if (!interaction.member.permissions.has('ManageGuild')) {
      return interaction.reply({ content: 'You need Manage Server permissions.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel');
    let config = require(configPath);

    if (!config.fileOnlyChannels.includes(channel.id)) {
      config.fileOnlyChannels.push(channel.id);
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return interaction.reply(`Channel <#${channel.id}> added to file-only list.`);
    } else {
      return interaction.reply(`Channel <#${channel.id}> is already file-only.`);
    }
  }
};
