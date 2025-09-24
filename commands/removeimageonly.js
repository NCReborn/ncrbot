const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, '../config/imageOnlyConfig.json');

module.exports = {
  data: {
    name: 'removeimageonly',
    description: 'Remove a channel from image-only enforcement.',
    options: [{
      name: 'channel',
      description: 'Channel to remove',
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

    if (config.imageOnlyChannels.includes(channel.id)) {
      config.imageOnlyChannels = config.imageOnlyChannels.filter(id => id !== channel.id);
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return interaction.reply(`Channel <#${channel.id}> removed from image-only list.`);
    } else {
      return interaction.reply(`Channel <#${channel.id}> is not in the image-only list.`);
    }
  }
};
