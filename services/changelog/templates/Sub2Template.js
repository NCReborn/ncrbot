const { EmbedBuilder } = require('discord.js');
const BaseTemplate = require('./BaseTemplate');

class Sub2Template extends BaseTemplate {
  // Collection image URL for thumbnail
  getCollectionImage() {
    return 'https://media.nexusmods.com/subnautica2/Images/[IMAGE-ID-HERE].webp'; // TODO: Add Subnautica 2 collection image URL
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
        "**⚠️ Important** - Please ensure you have a backup of your game files before updating.\n\n" +
        "Any issues with updating please reach out in our support channels.\n\n" +
        "If you need further help, ping a moderator."
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
        "**⚠️ Important** - Follow the installation guide for your collection before updating.\n\n"
      )
      .setColor(this.getColor('warning'));

    embeds.push(headerEmbed, updateEmbed);
    return embeds;
  }
}

module.exports = Sub2Template;
