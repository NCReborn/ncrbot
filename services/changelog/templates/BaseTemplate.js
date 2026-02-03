const { EmbedBuilder } = require('discord.js');

class BaseTemplate {
  constructor(config) {
    this.config = config;
  }

  async generateHeaderEmbeds(revisionInfo) {
    return [];
  }

  generateChangesTitle(revisionInfo) {
    const { collections } = revisionInfo;
    
    if (collections.length === 1) {
      const c = collections[0];
      return `${c.display} (v${c.oldRev} → v${c.newRev}) Changes`;
    } else {
      const parts = collections.map(c => `${c.display} (v${c.oldRev} → v${c.newRev})`);
      return `${parts.join(' & ')} Combined Changes`;
    }
  }

  getColor(type) {
    const colors = {
      header: 5814783,
      warning: 16746072,
      changes: 1146986,
      added: 0x00FF00,
      removed: 0xFF0000,
      updated: 0xFFAA00
    };
    return colors[type] || colors.header;
  }

  formatModList(mods) {
    return mods.map(mod => {
      const modName = mod.name.replace(/[\[\]()|]/g, '');
      const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
      return `• [${modName} (v${mod.version})](${modUrl})`;
    }).join('\n');
  }

  splitLongDescription(description, maxLength = 4096) {
    if (description.length <= maxLength) return [description];

    const parts = [];
    let currentPart = '';
    const lines = description.split('\n');

    for (const line of lines) {
      if ((currentPart + line + '\n').length > maxLength) {
        if (currentPart) {
          parts.push(currentPart.trim());
          currentPart = '';
        }
        currentPart += line + '\n';
      } else {
        currentPart += line + '\n';
      }
    }

    if (currentPart) parts.push(currentPart.trim());
    return parts;
  }
}

module.exports = BaseTemplate;
