const { EmbedBuilder } = require('discord.js');

/**
 * Removes special characters from a given name.
 * @param {string} name
 * @returns {string}
 */
function sanitizeName(name) {
  return name.replace(/[\[\]()|]/g, '');
}

/**
 * Splits a long description string into chunks that fit within Discord embed field limits.
 * @param {string} description
 * @param {number} [maxLength=4096]
 * @returns {string[]}
 */
function splitLongDescription(description, maxLength = 4096) {
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
      if (line.length > maxLength) {
        const words = line.split(' ');
        let tempLine = '';
        for (const word of words) {
          if ((tempLine + word + ' ').length > maxLength) {
            if (tempLine) {
              parts.push(tempLine.trim());
              tempLine = '';
            }
            tempLine += word + ' ';
          } else {
            tempLine += word + ' ';
          }
        }
        if (tempLine) currentPart += tempLine.trim() + '\n';
      } else {
        currentPart += line + '\n';
      }
    } else {
      currentPart += line + '\n';
    }
  }

  if (currentPart) parts.push(currentPart.trim());
  return parts;
}

/**
 * Sorts an array of mod objects alphabetically by their name property.
 * @param {Array<{name: string}>} mods
 * @returns {Array}
 */
function sortModsAlphabetically(mods) {
  return mods.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Sorts an array of updated mod objects alphabetically by their 'before.name' property.
 * @param {Array<{before: {name: string}}>} updatedMods
 * @returns {Array}
 */
function sortUpdatedModsAlphabetically(updatedMods) {
  return updatedMods.sort((a, b) => a.before.name.localeCompare(b.before.name));
}

/**
 * Generates a standardized error embed for Discord messages.
 * @param {string} title
 * @param {string} description
 * @returns {EmbedBuilder}
 */
function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title || 'Error')
    .setDescription(description || 'An unknown error occurred.')
    .setColor(0xFF0000);
}

module.exports = {
  sanitizeName,
  splitLongDescription,
  sortModsAlphabetically,
  sortUpdatedModsAlphabetically,
  errorEmbed // export the new helper
};
