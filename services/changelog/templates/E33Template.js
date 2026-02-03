const { EmbedBuilder } = require('discord.js');
const BaseTemplate = require('./BaseTemplate');

class E33Template extends BaseTemplate {
  async generateHeaderEmbeds(revisionInfo) {
    const { collections, gameVersion } = revisionInfo;
    const embeds = [];

    const newRev = collections[0].newRev;

    const headerEmbed = new EmbedBuilder()
      .setTitle(`Revision ${newRev} - Game Version ${gameVersion}`)
      .setDescription(
        "**⚠️ Important** - Don't forget to install new revisions to a separate profile, and remove old mods to prevent conflicts.\n\n" +
        "Any issues with updating please refer to <#1461441742694781133>\n\n" +
        "If you need further help ping a <@&1288633895910375464> or <@&1324783261439889439>"
      )
      .setColor(this.getColor('header'));

    const updateEmbed = new EmbedBuilder()
      .setTitle("Updating collection")
      .setDescription(
        "If you run into any popups during installation check this thread <#1461441742694781133>\n\n"
      )
      .setColor(this.getColor('warning'));

    embeds.push(headerEmbed, updateEmbed);
    return embeds;
  }
}

module.exports = E33Template;
