const { EmbedBuilder } = require('discord.js');
const BaseTemplate = require('./BaseTemplate');

class Sub2Template extends BaseTemplate {
  // Collection image URL for thumbnail
  getCollectionImage() {
    return 'https://github.com/NCReborn/content-images/blob/main/sub2/content.png?raw=true'; // TODO: Add Subnautica 2 collection image URL
  }

  async generateHeaderEmbeds(revisionInfo) {
    const { collections, gameVersion } = revisionInfo;
    const embeds = [];

    let revisionTitle = `Revision `;
    if (collections.length === 1) {
      revisionTitle += `${collections[0].display}-${collections[0].newRev}`;
    } else {
      const parts = collections.map(c => `${c.display}-${c.newRev}`);
      revisionTitle += parts.join('/');
    }
    revisionTitle += ` - Game Version ${gameVersion}`;

    const headerEmbed = new EmbedBuilder()
      .setTitle(revisionTitle)
      .setDescription(
        "Any issues with updating please refer to <#1400940644565782599> & <#1285797091750187039>\n\n" +
        "If you need further help ping <@&1456751771841204295>"
      )
      .setColor(this.getColor('header'));

    // Add thumbnail image for single collection
    if (collections.length === 1) {
      const collectionImage = this.getCollectionImage(collections[0].slug);
      if (collectionImage) {
        headerEmbed.setThumbnail(collectionImage);
      }
    }

    const updateEmbed = new EmbedBuilder()
      .setTitle("Updating collection")
      .setDescription(
        "**⚠️ Important** - Refer to the bottom of this channel for how to update <#1508084714504847371>.\n\n"
      )
      .setColor(this.getColor('warning'));

    embeds.push(headerEmbed, updateEmbed);
    return embeds;
  }
}

module.exports = Sub2Template;
