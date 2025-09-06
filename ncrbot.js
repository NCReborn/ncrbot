require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, Attachment } = require('discord.js');
const axios = require('axios');
const API_URL = 'https://api-router.nexusmods.com/graphql';
const API_KEY = process.env.NEXUS_API_KEY;
const APP_NAME = process.env.APP_NAME || 'CollectionDiffBot';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Version information - update this section when you make changes
const VERSION_INFO = {
  version: "1.0.3",
  changes: "Added 60 minute cooldown to !versions to prevent spam"
};

// Cooldown tracking for !version command
const versionCooldowns = new Map();
const VERSION_COOLDOWN_TIME = 60 * 60 * 1000; // 60 minutes in milliseconds

// Crash log monitoring configuration
const LOG_CHANNEL_ID = process.env.CRASH_LOG_CHANNEL_ID || '1411831110417252493'; // Replace with your channel ID
const SCAN_INTERVAL = 300000; // Check every 5 Minutes

// Log analysis patterns
const ERROR_PATTERNS = {
  java: [
    /java\.lang\.NullPointerException/,
    /java\.lang\.OutOfMemoryError/,
    /java\.lang\.StackOverflowError/,
    /java\.lang\.ClassNotFoundException/,
    /Exception in thread ".*"/,
  ],
  javascript: [
    /TypeError:.*/,
    /ReferenceError:.*/,
    /SyntaxError:.*/,
    /at .* \(.*\)/,
    /UnhandledPromiseRejectionWarning:/,
  ],
  python: [
    /Traceback \(most recent call last\):/,
    /SyntaxError:.*/,
    /NameError:.*/,
    /IndexError:.*/,
    /File ".*", line \d+/,
  ],
  general: [
    /error:/i,
    /exception:/i,
    /crash/i,
    /fatal/i,
    /segmentation fault/i,
    /panic/i,
  ]
};

// Helper function to get collection slug from name
function getCollectionSlug(name) {
  const normalizedName = name.toLowerCase().trim();
  switch (normalizedName) {
    case 'ncr': return 'rcuccp';
    case 'adr': return 'srpv39';
    case 'ncr lite': return 'vfy7w1';
    case 'adr lite': return 'ezxduq';
    case 'ncrlite': return 'vfy7w1';
    case 'adrlite': return 'ezxduq';
    default: return name;
  }
}

// Helper function to get collection name from slug
function getCollectionName(slug) {
  switch (slug) {
    case 'rcuccp': return 'NCR';
    case 'srpv39': return 'ADR';
    case 'vfy7w1': return 'NCR Lite';
    case 'ezxduq': return 'ADR Lite';
    default: return slug;
  }
}

// Function to analyze log content
function analyzeLog(content, filename = 'unknown') {
  const issues = [];
  const lines = content.split('\n');
  
  // Check each pattern category
  for (const [category, patterns] of Object.entries(ERROR_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          // Find the line number where this error occurred
          const lineNumber = lines.findIndex(line => line.includes(match)) + 1;
          issues.push({
            type: category,
            message: match,
            line: lineNumber,
            file: filename
          });
        });
      }
    }
  }
  
  return issues;
}

// Function to handle log file attachments
async function processLogAttachment(attachment) {
  try {
    // Check if it's a text file
    const textExtensions = ['.log', '.txt', '.crash', '.error'];
    const isTextFile = textExtensions.some(ext => attachment.name.endsWith(ext));
    
    if (!isTextFile) return null;
    
    // Fetch the attachment content
    const response = await axios.get(attachment.url, { responseType: 'text' });
    const content = response.data;
    
    // Analyze the content
    return analyzeLog(content, attachment.name);
  } catch (error) {
    console.error('Error processing attachment:', error);
    return null;
  }
}

// Monitor the crash log channel
async function monitorCrashLogs(client) {
  try {
    const channel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!channel) {
      console.error('Crash log channel not found');
      return;
    }
    
    // Fetch recent messages
    const messages = await channel.messages.fetch({ limit: 20 });
    
    for (const [id, message] of messages) {
      // Skip messages from the bot itself and those without attachments
      if (message.author.bot || message.attachments.size === 0) continue;
      
      // Check if we've already processed this message
      if (message.reactions.cache.has('🔍')) continue;
      
      // Process each attachment
      for (const [attachmentId, attachment] of message.attachments) {
        const issues = await processLogAttachment(attachment);
        
        if (issues && issues.length > 0) {
          // Create an embed with the analysis results
          const embed = new EmbedBuilder()
            .setTitle(`Crash Log Analysis: ${attachment.name}`)
            .setColor(0xff0000)
            .setDescription(`Found ${issues.length} potential issues`)
            .setTimestamp();
          
          // Add fields for each issue (limit to 5 to avoid embed limits)
          issues.slice(0, 5).forEach(issue => {
            embed.addFields({
              name: `${issue.type.toUpperCase()} Issue`,
              value: `**Line ${issue.line}**: ${issue.message.substring(0, 100)}...`,
              inline: false
            });
          });
          
          // Add a field with the original message link
          embed.addFields({
            name: 'Original Message',
            value: `[Jump to message](${message.url})`,
            inline: false
          });
          
          // Send the analysis to the channel
          await channel.send({ embeds: [embed] });
          
          // Add reactions to the original message
          await message.react('🔍'); // Magnifying glass
          await message.react('❌'); // X for error found
        } else if (issues) {
          // No issues found
          await message.react('✅'); // Checkmark for no issues
        }
      }
    }
  } catch (error) {
    console.error('Error monitoring crash logs:', error);
  }
}

async function fetchRevision(slug, revision) {
  const query = `
    query Revision($slug: String!, $revision: Int) {
      collectionRevision(slug: $slug, revision: $revision, viewAdultContent: true) {
        revisionNumber
        modFiles {
          fileId
          optional
          file {
            fileId
            name
            version
            mod {
              modId
              name
              game {
                name
                domainName
              }
            }
          }
        }
      }
    }
  `;
  const variables = { slug, revision };
  const headers = {
    'Content-Type': 'application/json',
    apikey: API_KEY,
    'Application-Name': APP_NAME,
    'Application-Version': APP_VERSION,
  };

  try {
    const response = await axios.post(API_URL, { query, variables }, { headers, timeout: 10000 });
    
    if (response.data.errors) {
      const errorMessage = response.data.errors.map(error => error.message).join(', ');
      throw new Error(`API Error: ${errorMessage}`);
    }
    
    if (!response.data.data || !response.data.data.collectionRevision) {
      throw new Error(`Revision ${revision} not found for collection ${slug}`);
    }
    
    return response.data.data.collectionRevision;
  } catch (error) {
    if (error.response) {
      throw new Error(`API returned status ${error.response.status}: ${error.response.statusText}`);
    } else if (error.request) {
      throw new Error('No response received from Nexus Mods API. Please try again later.');
    } else {
      throw new Error(`Failed to fetch revision: ${error.message}`);
    }
  }
}

function computeDiff(oldMods, newMods) {
  const oldMap = new Map(oldMods.map((m) => [String(m.id), m]));
  const newMap = new Map(newMods.map((m) => [String(m.id), m]));

  const added = [];
  const removed = [];
  const updated = [];

  for (const [id, mod] of newMap.entries()) {
    if (!oldMap.has(id)) {
      added.push(mod);
    } else {
      const oldMod = oldMap.get(id);
      if (oldMod.version !== mod.version) {
        updated.push({ before: oldMod, after: mod });
      }
    }
  }

  for (const [id, mod] of oldMap.entries()) {
    if (!newMap.has(id)) {
      removed.push(mod);
    }
  }

  return { added, removed, updated };
}

function findExclusiveChanges(diffs1, diffs2) {
  const exclusiveAdded1 = diffs1.added.filter(mod1 => !diffs2.added.some(mod2 => mod2.id === mod1.id));
  const exclusiveRemoved1 = diffs1.removed.filter(mod1 => !diffs2.removed.some(mod2 => mod2.id === mod1.id));
  const exclusiveUpdated1 = diffs1.updated.filter(update1 => !diffs2.updated.some(update2 => update2.before.id === update1.before.id));

  const exclusiveAdded2 = diffs2.added.filter(mod2 => !diffs1.added.some(mod1 => mod1.id === mod2.id));
  const exclusiveRemoved2 = diffs2.removed.filter(mod2 => !diffs1.removed.some(mod1 => mod1.id === mod2.id));
  const exclusiveUpdated2 = diffs2.updated.filter(update2 => !diffs1.updated.some(update1 => update1.before.id === update2.before.id));

  return {
    added1: exclusiveAdded1,
    removed1: exclusiveRemoved1,
    updated1: exclusiveUpdated1,
    added2: exclusiveAdded2,
    removed2: exclusiveRemoved2,
    updated2: exclusiveUpdated2
  };
}

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

function sortModsAlphabetically(mods) {
  return mods.sort((a, b) => a.name.localeCompare(b.name));
}

function sortUpdatedModsAlphabetically(updatedMods) {
  return updatedMods.sort((a, b) => a.before.name.localeCompare(b.before.name));
}

async function sendCombinedChangelogMessages(channel, diffs1, diffs2, exclusiveChanges, slug1, oldRev1, newRev1, slug2, oldRev2, newRev2) {
  const sanitizeName = (name) => name.replace(/[\[\]()|]/g, '');
  const collectionName1 = getCollectionName(slug1);
  const collectionName2 = getCollectionName(slug2);

  const embed1 = new EmbedBuilder()
    .setTitle(`Revision ${collectionName1}-${newRev1}/${collectionName2}-${newRev2} - Game Version 2.3`)
    .setDescription("**⚠️ Important** - Don't forget to install new revisions to a separate profile, and remove old mods to prevent conflicts. <#1346957358244433950>\n\n**⚠️ Important** - To keep the game stable, permanently delete all files in the Steam\\steamapps\\common\\Cyberpunk 2077\\r6\\cache folder with each new revision, verify the game files, then deploy mods from vortex.\n\n**⚠️ Important** - If you encounter any redscript errors please see the recommendations in <#1332486336040403075> as it can sometimes be a simple case of a dependency that hasn't installed properly.\n\n**⚠️ Important** - Any fallback installer errors you come across, just select \"Yes, install to staging anyway\" every time you see it.\n\nAny issues with updating please refer to <#1329368428590399633> & <#1285797091750187039>\n\nIf you need further help ping a <@&1288633895910375464> or <@&1324783261439889439>")
    .setColor(5814783);

  const embed1a = new EmbedBuilder()
    .setTitle("Updating collection")
    .setDescription("If you run into any popups during installation check these threads <#1346957358244433950>\n<#1332486354063593524> & <#1332486336967610449>\n\nIf you run into fallback messages just select \"Yes, install to staging anyway\"  <#1332486336967610449>")
    .setColor(16746072);

  await channel.send({ embeds: [embed1, embed1a] });

  const collectionHeader = new EmbedBuilder()
    .setTitle(`${collectionName1} (v${oldRev1} → v${newRev1}) & ${collectionName2} (v${oldRev2} → v${newRev2}) Combined Changes`)
    .setColor(1146986);
  
  await channel.send({ embeds: [collectionHeader] });

  // Added Mods
  const allAdded = [...diffs1.added, ...diffs2.added];
  const uniqueAdded = allAdded.filter((mod, index, self) => index === self.findIndex(m => m.id === mod.id));
  const sortedAdded = sortModsAlphabetically([...uniqueAdded]);

  if (sortedAdded.length > 0) {
    const sharedAdded = sortedAdded.filter(mod => !exclusiveChanges.added1.some(m => m.id === mod.id) && !exclusiveChanges.added2.some(m => m.id === mod.id));
    const exclusiveAdded1 = sortModsAlphabetically([...exclusiveChanges.added1]);
    const exclusiveAdded2 = sortModsAlphabetically([...exclusiveChanges.added2]);

    let addedList = '';
    if (sharedAdded.length > 0) {
      addedList += sharedAdded.map(mod => {
        const modName = sanitizeName(mod.name);
        const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
        return `• [${modName} (v${mod.version})](${modUrl})`;
      }).join('\n');
    }

    if (exclusiveAdded1.length > 0) {
      if (addedList) addedList += '\n\n';
      addedList += `**${collectionName1} Exclusive:**\n` + exclusiveAdded1.map(mod => {
        const modName = sanitizeName(mod.name);
        const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
        return `• [${modName} (v${mod.version})](${modUrl})`;
      }).join('\n');
    }

    if (exclusiveAdded2.length > 0) {
      if (addedList) addedList += '\n\n';
      addedList += `**${collectionName2} Exclusive:**\n` + exclusiveAdded2.map(mod => {
        const modName = sanitizeName(mod.name);
        const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
        return `• [${modName} (v${mod.version})](${modUrl})`;
      }).join('\n');
    }

    const addedParts = splitLongDescription(addedList);
    for (let i = 0; i < addedParts.length; i++) {
      const title = i === 0 ? "➕ Added Mods" : `➕ Added Mods (Part ${i + 1})`;
      const embed = new EmbedBuilder().setTitle(title).setDescription(addedParts[i]).setColor(5763719);
      await channel.send({ embeds: [embed] });
    }
  } else {
    const embed = new EmbedBuilder().setTitle("➕ Added Mods").setDescription("No mods were added in either collection").setColor(5763719);
    await channel.send({ embeds: [embed] });
  }

  // Updated Mods
  const allUpdated = [...diffs1.updated, ...diffs2.updated];
  const uniqueUpdated = allUpdated.filter((update, index, self) => index === self.findIndex(u => u.before.id === update.before.id));
  const sortedUpdated = sortUpdatedModsAlphabetically([...uniqueUpdated]);

  if (sortedUpdated.length > 0) {
    const sharedUpdated = sortedUpdated.filter(update => !exclusiveChanges.updated1.some(u => u.before.id === update.before.id) && !exclusiveChanges.updated2.some(u => u.before.id === update.before.id));
    const exclusiveUpdated1 = sortUpdatedModsAlphabetically([...exclusiveChanges.updated1]);
    const exclusiveUpdated2 = sortUpdatedModsAlphabetically([...exclusiveChanges.updated2]);

    let updatedList = '';
    if (sharedUpdated.length > 0) {
      updatedList += sharedUpdated.map(update => {
        const modName = sanitizeName(update.before.name);
        const modUrl = `https://www.nexusmods.com/${update.before.domainName}/mods/${update.before.modId}`;
        return `• [${modName}](${modUrl}) : v${update.before.version} → v${update.after.version}`;
      }).join('\n');
    }

    if (exclusiveUpdated1.length > 0) {
      if (updatedList) updatedList += '\n\n';
      updatedList += `**${collectionName1} Exclusive:**\n` + exclusiveUpdated1.map(update => {
        const modName = sanitizeName(update.before.name);
        const modUrl = `https://www.nexusmods.com/${update.before.domainName}/mods/${update.before.modId}`;
        return `• [${modName}](${modUrl}) : v${update.before.version} → v${update.after.version}`;
      }).join('\n');
    }

    if (exclusiveUpdated2.length > 0) {
      if (updatedList) updatedList += '\n\n';
      updatedList += `**${collectionName2} Exclusive:**\n` + exclusiveUpdated2.map(update => {
        const modName = sanitizeName(update.before.name);
        const modUrl = `https://www.nexusmods.com/${update.before.domainName}/mods/${update.before.modId}`;
        return `• [${modName}](${modUrl}) : v${update.before.version} → v${update.after.version}`;
      }).join('\n');
    }

    const updatedParts = splitLongDescription(updatedList);
    for (let i = 0; i < updatedParts.length; i++) {
      const title = i === 0 ? "🔄 Updated Mods" : `🔄 Updated Mods (Part ${i + 1})`;
      const embed = new EmbedBuilder().setTitle(title).setDescription(updatedParts[i]).setColor(16776960);
      await channel.send({ embeds: [embed] });
    }
  } else {
    const embed = new EmbedBuilder().setTitle("🔄 Updated Mods").setDescription("No mods were updated in either collection").setColor(16776960);
    await channel.send({ embeds: [embed] });
  }

  // Removed Mods
  const allRemoved = [...diffs1.removed, ...diffs2.removed];
  const uniqueRemoved = allRemoved.filter((mod, index, self) => index === self.findIndex(m => m.id === mod.id));
  const sortedRemoved = sortModsAlphabetically([...uniqueRemoved]);

  if (sortedRemoved.length > 0) {
    const sharedRemoved = sortedRemoved.filter(mod => !exclusiveChanges.removed1.some(m => m.id === mod.id) && !exclusiveChanges.removed2.some(m => m.id === mod.id));
    const exclusiveRemoved1 = sortModsAlphabetically([...exclusiveChanges.removed1]);
    const exclusiveRemoved2 = sortModsAlphabetically([...exclusiveChanges.removed2]);

    let removedList = '';
    if (sharedRemoved.length > 0) {
      removedList += sharedRemoved.map(mod => {
        const modName = sanitizeName(mod.name);
        const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
        return `• [${modName} (v${mod.version})](${modUrl})`;
      }).join('\n');
    }

    if (exclusiveRemoved1.length > 0) {
      if (removedList) removedList += '\n\n';
      removedList += `**${collectionName1} Exclusive:**\n` + exclusiveRemoved1.map(mod => {
        const modName = sanitizeName(mod.name);
        const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
        return `• [${modName} (v${mod.version})](${modUrl})`;
      }).join('\n');
    }

    if (exclusiveRemoved2.length > 0) {
      if (removedList) removedList += '\n\n';
      removedList += `**${collectionName2} Exclusive:**\n` + exclusiveRemoved2.map(mod => {
        const modName = sanitizeName(mod.name);
        const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
        return `• [${modName} (v${mod.version})](${modUrl})`;
      }).join('\n');
    }

    const removedParts = splitLongDescription(removedList);
    for (let i = 0; i < removedParts.length; i++) {
      const title = i === 0 ? "🗑️ Removed Mods" : `🗑️ Removed Mods (Part ${i + 1})`;
      const embed = new EmbedBuilder().setTitle(title).setDescription(removedParts[i]).setColor(15548997);
      await channel.send({ embeds: [embed] });
    }
  } else {
    const embed = new EmbedBuilder().setTitle("🗑️ Removed Mods").setDescription("No mods were removed in either collection").setColor(15548997);
    await channel.send({ embeds: [embed] });
  }
}

async function sendSingleChangelogMessages(channel, diffs, slug, oldRev, newRev, collectionName) {
  const sanitizeName = (name) => name.replace(/[\[\]()|]/g, '');

  const embed1 = new EmbedBuilder()
    .setTitle(`Revision ${collectionName}-${newRev} - Game Version 2.3`)
    .setDescription("**⚠️ Important** - Don't forget to install new revisions to a separate profile, and remove old mods to prevent conflicts. <#1346957358244433950>\n\n**⚠️ Important** - To keep the game stable, permanently delete all files in the Steam\\steamapps\\common\\Cyberpunk 2077\\r6\\cache folder with each new revision, verify the game files, then deploy mods from vortex.\n\n**⚠️ Important** - If you encounter any redscript errors please see the recommendations in <#1332486336040403075> as it can sometimes be a simple case of a dependency that hasn't installed properly.\n\n**⚠️ Important** - Any fallback installer errors you come across, just select \"Yes, install to staging anyway\" every time you see it.\n\nAny issues with updating please refer to <#1329368428590399633> & <#1285797091750187039>\n\nIf you need further help ping a <@&1288633895910375464> or <@&1324783261439889439>")
    .setColor(5814783);

  const embed1a = new EmbedBuilder()
    .setTitle("Updating collection")
    .setDescription("If you run into any popups during installation check these threads <#1346957358244433950>\n<#1332486354063593524> & <#1332486336967610449>\n\nIf you run into fallback messages just select \"Yes, install to staging anyway\"  <#1332486336967610449>")
    .setColor(16746072);

  await channel.send({ embeds: [embed1, embed1a] });

  const collectionHeader = new EmbedBuilder()
    .setTitle(`${collectionName} (v${oldRev} → v${newRev}) Changes`)
    .setColor(1146986);
  
  await channel.send({ embeds: [collectionHeader] });

  // Added Mods
  if (diffs.added.length > 0) {
    const sortedAdded = sortModsAlphabetically([...diffs.added]);
    let addedList = sortedAdded.map(mod => {
      const modName = sanitizeName(mod.name);
      const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
      return `• [${modName} (v${mod.version})](${modUrl})`;
    }).join('\n');

    const addedParts = splitLongDescription(addedList);
    for (let i = 0; i < addedParts.length; i++) {
      const title = i === 0 ? "➕ Added Mods" : `➕ Added Mods (Part ${i + 1})`;
      const embed = new EmbedBuilder().setTitle(title).setDescription(addedParts[i]).setColor(5763719);
      await channel.send({ embeds: [embed] });
    }
  } else {
    const embed = new EmbedBuilder().setTitle("➕ Added Mods").setDescription("No mods were added in this revision").setColor(5763719);
    await channel.send({ embeds: [embed] });
  }

  // Updated Mods
  if (diffs.updated.length > 0) {
    const sortedUpdated = sortUpdatedModsAlphabetically([...diffs.updated]);
    let updatedList = sortedUpdated.map(update => {
      const modName = sanitizeName(update.before.name);
      const modUrl = `https://www.nexusmods.com/${update.before.domainName}/mods/${update.before.modId}`;
      return `• [${modName}](${modUrl}) : v${update.before.version} → v${update.after.version}`;
    }).join('\n');

    const updatedParts = splitLongDescription(updatedList);
    for (let i = 0; i < updatedParts.length; i++) {
      const title = i === 0 ? "🔄 Updated Mods" : `🔄 Updated Mods (Part ${i + 1})`;
      const embed = new EmbedBuilder().setTitle(title).setDescription(updatedParts[i]).setColor(16776960);
      await channel.send({ embeds: [embed] });
    }
  } else {
    const embed = new EmbedBuilder().setTitle("🔄 Updated Mods").setDescription("No mods were updated in this revision").setColor(16776960);
    await channel.send({ embeds: [embed] });
  }

  // Removed Mods
  if (diffs.removed.length > 0) {
    const sortedRemoved = sortModsAlphabetically([...diffs.removed]);
    let removedList = sortedRemoved.map(mod => {
      const modName = sanitizeName(mod.name);
      const modUrl = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`;
      return `• [${modName} (v${mod.version})](${modUrl})`;
    }).join('\n');

    const removedParts = splitLongDescription(removedList);
    for (let i = 0; i < removedParts.length; i++) {
      const title = i === 0 ? "🗑️ Removed Mods" : `🗑️ Removed Mods (Part ${i + 1})`;
      const embed = new EmbedBuilder().setTitle(title).setDescription(removedParts[i]).setColor(15548997);
      await channel.send({ embeds: [embed] });
    }
  } else {
    const embed = new EmbedBuilder().setTitle("🗑️ Removed Mods").setDescription("No mods were removed in this revision").setColor(15548997);
    await channel.send({ embeds: [embed] });
  }
}

// -----------------------------------------------------------------------------
//  Discord client setup
// -----------------------------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Start monitoring the crash log channel
  if (LOG_CHANNEL_ID !== 'YOUR_CRASH_LOG_CHANNEL_ID') {
    setInterval(() => monitorCrashLogs(client), SCAN_INTERVAL);
    // Also run immediately on startup
    setTimeout(() => monitorCrashLogs(client), 5000);
    console.log('Crash log monitoring started');
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  // Handle !version command
  if (message.content.startsWith('!version')) {
    console.log('!version command received from:', message.author.tag);
    const now = Date.now();
    const cooldownKey = `${message.author.id}-version`;
    const cooldownEndTime = versionCooldowns.get(cooldownKey) || 0;
    
    // Check if user is on cooldown (skip for administrators)
    const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.Administrator);
    console.log('User is admin:', isAdmin, 'Cooldown end time:', cooldownEndTime, 'Current time:', now);
    
    if (now < cooldownEndTime && !isAdmin) {
      console.log('User is on cooldown');
      const timeLeft = Math.ceil((cooldownEndTime - now) / 1000 / 60);
      const cooldownEmbed = new EmbedBuilder()
        .setTitle('Command Cooldown')
        .setDescription(`Please wait ${timeLeft} more minutes before using the !version command again.`)
        .setColor(15548997);
      
      try {
        console.log('Attempting to send DM for cooldown');
        // Send a DM instead of ephemeral message for regular text commands
        await message.author.send({ embeds: [cooldownEmbed] });
        console.log('DM sent successfully');
        
        // Now try to delete the original message if possible
        if (message.deletable) {
          await message.delete().catch(error => console.log('Delete error (non-fatal):', error));
        }
      } catch (error) {
        console.error('Error sending DM:', error);
        // Fallback to regular message in the channel if DM fails
        const fallbackEmbed = new EmbedBuilder()
          .setTitle('Command Cooldown')
          .setDescription(`Please wait ${timeLeft} more minutes before using the !version command again.\n\n*(This message would normally be sent as a DM)*`)
          .setColor(15548997);
        await message.reply({ embeds: [fallbackEmbed] });
      }
      return;
    }
    
    // Set cooldown only for non-administrators
    if (!isAdmin) {
      versionCooldowns.set(cooldownKey, now + VERSION_COOLDOWN_TIME);
      console.log('Cooldown set for user:', cooldownKey);
    }
    
    // Clean up old cooldowns periodically
    if (Math.random() < 0.1) {
      const currentTime = Date.now();
      for (const [key, endTime] of versionCooldowns.entries()) {
        if (currentTime > endTime) {
          versionCooldowns.delete(key);
        }
      }
    }
    
    const versionEmbed = new EmbedBuilder()
      .setTitle('NCReborn CL Bot Version')
      .setDescription(`**Version:** ${VERSION_INFO.version}\n**Changes:** ${VERSION_INFO.changes}`)
      .setColor(5814783);
    
    await message.reply({ embeds: [versionEmbed] });
    console.log('Version response sent');
    return;
  }
  
  // Process crash log attachments in the designated channel
  if (message.channelId === LOG_CHANNEL_ID && LOG_CHANNEL_ID !== 'YOUR_CRASH_LOG_CHANNEL_ID') {
    // Skip messages from the bot itself and those without attachments
    if (message.author.bot || message.attachments.size === 0) return;
    
    // Process each attachment
    for (const [attachmentId, attachment] of message.attachments) {
      const issues = await processLogAttachment(attachment);
      
      if (issues && issues.length > 0) {
        // Create an embed with the analysis results
        const embed = new EmbedBuilder()
          .setTitle(`Crash Log Analysis: ${attachment.name}`)
          .setColor(0xff0000)
          .setDescription(`Found ${issues.length} potential issues`)
          .setTimestamp();
        
        // Add fields for each issue (limit to 5)
        issues.slice(0, 5).forEach(issue => {
          embed.addFields({
            name: `${issue.type.toUpperCase()} Issue`,
            value: `**Line ${issue.line}**: ${issue.message.substring(0, 100)}...`,
            inline: false
          });
        });
        
        // Send the analysis as a reply
        await message.reply({ embeds: [embed] });
        
        // Add reactions to indicate analysis completed
        await message.react('🔍');
        await message.react('❌');
      } else if (issues) {
        // No issues found
        await message.react('✅');
      }
    }
    return;
  }
  
  if (!message.content.startsWith('!diff')) return;
  
  // Check if user has administrator permissions
  if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.reply('This command is only available to administrators.');
  }
  
  const args = message.content.split(/\s+/);
  
  // Check if we have single collection (4 args) or dual collection (7 args)
  if (args.length !== 4 && args.length !== 7) {
    await message.reply('Utilisation : \n`!diff <collection> <révisionA> <révisionB>` for single collection\n`!diff <collection1> <revA1> <revB1> <collection2> <revA2> <revB2>` for dual collection comparison\n\nSupported collections: NCR, ADR, NCR Lite, ADR Lite');
    return;
  }

  try {
    if (args.length === 4) {
      // Single collection comparison
      const slug = getCollectionSlug(args[1]);
      const oldRev = parseInt(args[2]);
      const newRev = parseInt(args[3]);
      const collectionName = getCollectionName(slug);
      
      if (isNaN(oldRev) || isNaN(newRev)) {
        await message.reply('Les révisions doivent être des nombres valides.');
        return;
      }
      
      if (oldRev === newRev) {
        await message.reply('Les révisions doivent être différentes.');
        return;
      }
      
      await message.channel.send(`Fetching revisions ${oldRev} and ${newRev} for ${collectionName}...`);
      
      const [oldRevision, newRevision] = await Promise.all([
        fetchRevision(slug, oldRev),
        fetchRevision(slug, newRev)
      ]);
      
      const oldMods = oldRevision.modFiles.map(mf => ({
        id: mf.file.fileId,
        modId: mf.file.mod.modId,
        name: mf.file.mod.name,
        version: mf.file.version,
        domainName: mf.file.mod.game.domainName
      }));
      
      const newMods = newRevision.modFiles.map(mf => ({
        id: mf.file.fileId,
        modId: mf.file.mod.modId,
        name: mf.file.mod.name,
        version: mf.file.version,
        domainName: mf.file.mod.game.domainName
      }));
      
      const diffs = computeDiff(oldMods, newMods);
      
      await sendSingleChangelogMessages(message.channel, diffs, slug, oldRev, newRev, collectionName);
      
    } else if (args.length === 7) {
      // Dual collection comparison
      const slug1 = getCollectionSlug(args[1]);
      const oldRev1 = parseInt(args[2]);
      const newRev1 = parseInt(args[3]);
      const slug2 = getCollectionSlug(args[4]);
      const oldRev2 = parseInt(args[5]);
      const newRev2 = parseInt(args[6]);
      const collectionName1 = getCollectionName(slug1);
      const collectionName2 = getCollectionName(slug2);
      
      if (isNaN(oldRev1) || isNaN(newRev1) || isNaN(oldRev2) || isNaN(newRev2)) {
        await message.reply('Toutes les révisions doivent être des nombres valides.');
        return;
      }
      
      if (oldRev1 === newRev1 || oldRev2 === newRev2) {
        await message.reply('Les révisions doivent être différentes pour chaque collection.');
        return;
      }
      
      await message.channel.send(`Fetching revisions for ${collectionName1} (${oldRev1} → ${newRev1}) and ${collectionName2} (${oldRev2} → ${newRev2})...`);
      
      const [oldRevision1, newRevision1, oldRevision2, newRevision2] = await Promise.all([
        fetchRevision(slug1, oldRev1),
        fetchRevision(slug1, newRev1),
        fetchRevision(slug2, oldRev2),
        fetchRevision(slug2, newRev2)
      ]);
      
      const oldMods1 = oldRevision1.modFiles.map(mf => ({
        id: mf.file.fileId,
        modId: mf.file.mod.modId,
        name: mf.file.mod.name,
        version: mf.file.version,
        domainName: mf.file.mod.game.domainName
      }));
      
      const newMods1 = newRevision1.modFiles.map(mf => ({
        id: mf.file.fileId,
        modId: mf.file.mod.modId,
        name: mf.file.mod.name,
        version: mf.file.version,
        domainName: mf.file.mod.game.domainName
      }));
      
      const oldMods2 = oldRevision2.modFiles.map(mf => ({
        id: mf.file.fileId,
        modId: mf.file.mod.modId,
        name: mf.file.mod.name,
        version: mf.file.version,
        domainName: mf.file.mod.game.domainName
      }));
      
      const newMods2 = newRevision2.modFiles.map(mf => ({
        id: mf.file.fileId,
        modId: mf.file.mod.modId,
        name: mf.file.mod.name,
        version: mf.file.version,
        domainName: mf.file.mod.game.domainName
      }));
      
      const diffs1 = computeDiff(oldMods1, newMods1);
      const diffs2 = computeDiff(oldMods2, newMods2);
      const exclusiveChanges = findExclusiveChanges(diffs1, diffs2);
      
      await sendCombinedChangelogMessages(message.channel, diffs1, diffs2, exclusiveChanges, slug1, oldRev1, newRev1, slug2, oldRev2, newRev2);
    }
    
  } catch (error) {
    console.error('Error:', error);
    await message.reply(`Erreur : ${error.message}`);
  }
});

client.login(BOT_TOKEN);