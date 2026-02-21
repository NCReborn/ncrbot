const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');

const KNOWLEDGE_PATH = path.join(__dirname, '../config/crashKnowledge.json');

/**
 * Load the crash knowledge base from disk.
 * @returns {Object} The parsed knowledge base object.
 */
function loadKnowledge() {
  return JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
}

async function fetchLogAttachment(attachment) {
  const validExts = ['.log', '.txt', '.error'];
  if (!validExts.some(ext => attachment.name.toLowerCase().endsWith(ext))) return null;
  try {
    const response = await axios.get(attachment.url);
    return response.data;
  } catch (err) {
    return null;
  }
}

/**
 * Detect which log type this content belongs to.
 * @param {string} logContent
 * @param {Object} logTypes - logTypes map from knowledge base
 * @returns {string|null} logType key or null
 */
function detectLogType(logContent, logTypes) {
  const lower = logContent.toLowerCase();
  for (const [key, def] of Object.entries(logTypes)) {
    for (const id of def.identifiers) {
      if (lower.includes(id.toLowerCase())) return key;
    }
  }
  return null;
}

/**
 * Extract loaded plugins list from RED4ext log content.
 * @param {string} logContent
 * @returns {string[]}
 */
function extractPlugins(logContent) {
  const plugins = [];
  const lines = logContent.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/\[RED4ext\].*Loaded plugin[:\s]+(.+)/i);
    if (m) plugins.push(m[1].trim());
  }
  return plugins;
}

/**
 * Extract version info (RED4ext version, game version) from log content.
 * @param {string} logContent
 * @returns {Object}
 */
function extractVersions(logContent) {
  const versions = {};
  const red4extMatch = logContent.match(/\[RED4ext\].*version[:\s]+([\d.]+)/i);
  if (red4extMatch) versions.red4ext = red4extMatch[1];
  const gameMatch = logContent.match(/game version[:\s]+([\d.]+)/i);
  if (gameMatch) versions.game = gameMatch[1];
  return versions;
}

/**
 * Extract mod list from log content if present.
 * @param {string} logContent
 * @returns {string[]}
 */
function extractModList(logContent) {
  const modFailMatch = logContent.match(/This error has been caused by mods listed below:\n- ([\s\S]+)/i);
  if (modFailMatch) {
    return modFailMatch[1].split('\n')
      .filter(l => l.trim().startsWith('-'))
      .map(l => l.replace(/^- /, '').trim());
  }
  return [];
}

/**
 * Analyze the log using the knowledge base.
 * Returns: { logType, matchedRules, plugins, versions, modList }
 */
async function analyzeLogForErrors(logContent) {
  const kb = loadKnowledge();
  const logType = detectLogType(logContent, kb.logTypes);
  const lower = logContent.toLowerCase();

  const seenIds = new Set();
  const matchedRules = [];

  for (const rule of kb.rules) {
    if (rule.logType !== 'any' && rule.logType !== logType) continue;
    if (seenIds.has(rule.id)) continue;

    const patterns = rule.patterns.map(p => p.toLowerCase());
    let matched = false;
    if (rule.matchMode === 'all') {
      matched = patterns.every(p => lower.includes(p));
    } else {
      matched = patterns.some(p => lower.includes(p));
    }

    if (matched) {
      seenIds.add(rule.id);
      matchedRules.push(rule);
    }
  }

  const plugins = extractPlugins(logContent);
  const versions = extractVersions(logContent);
  const modList = extractModList(logContent);

  return { logType, matchedRules, plugins, versions, modList };
}

// Helper to ensure all embed fields are valid and within size limits
function safeField(name, value, inline = false) {
  if (!name || !value) return null;
  return {
    name: String(name).slice(0, 256),
    value: String(value).slice(0, 1024),
    inline
  };
}

/**
 * Builds an error analysis embed for a log file using the knowledge base.
 * @param {Object} attachment - {name, url}
 * @param {Object} analysisResult - Output of analyzeLogForErrors: { logType, matchedRules, plugins, versions, modList }
 * @param {string} logContent - The log's full content
 * @param {string} messageUrl - The "jump to message" URL, or empty string if ephemeral
 * @param {boolean} showOriginalMessage - If false, don't show "Original Message" block (for ephemeral replies)
 */
function buildErrorEmbed(attachment, analysisResult, logContent, messageUrl = '', showOriginalMessage = true) {
  const { logType, matchedRules, plugins, versions, modList } = analysisResult;
  const kb = loadKnowledge();

  const hasCritical = matchedRules.some(r => r.severity === 'critical');
  const color = hasCritical ? 0xff0000 : matchedRules.length > 0 ? 0xff8c00 : 0x00bb55;

  const logTypeLabel = logType ? (kb.logTypes[logType]?.description || logType) : 'Unknown';

  const embed = new EmbedBuilder()
    .setTitle(`Crash Log Analysis: ${attachment.name}`)
    .setColor(color)
    .setTimestamp();

  if (matchedRules.length > 0) {
    embed.setDescription(
      `**Log type:** ${logTypeLabel}\n` +
      `Detected **${matchedRules.length} issue(s)** in this log file.\n\n**Details:**`
    );

    for (const rule of matchedRules) {
      const severityIcon = rule.severity === 'critical' ? '❌' : rule.severity === 'warning' ? '⚠️' : 'ℹ️';
      let fieldValue = rule.solution;
      if (rule.links && rule.links.length > 0) {
        const linkParts = rule.links.map(l => `<#${l.channelId}>`);
        fieldValue += `\n\n**See also:** ${linkParts.join(' • ')}`;
      }
      const field = safeField(`${severityIcon} ${rule.name}`, fieldValue);
      if (field) embed.addFields(field);
    }

    if (modList.length > 0) {
      const modsField = safeField(
        'Mods Possibly Causing the Crash',
        modList.map(m => `• ${m}`).join('\n')
      );
      if (modsField) embed.addFields(modsField);
    }

    const helpfulLinks = [
      `• <#${kb.channels.commonFixes}> — Common fixes`,
      `• <#${kb.channels.cleanInstall}> — Clean install guide`,
      `• <#${kb.channels.bisect}> — Bisect your collection`,
      `• <#${kb.channels.bugsAndIssues}> — Post in Bugs & Issues`
    ].join('\n');
    const resourcesField = safeField('📌 Helpful Resources', helpfulLinks);
    if (resourcesField) embed.addFields(resourcesField);
  } else {
    embed.setDescription(
      `**Log type:** ${logTypeLabel}\n\n` +
      `✅ **No known issues were detected in this log file.**\n\n` +
      `If you are still experiencing problems, try the common fixes below or post your log in <#${kb.channels.bugsAndIssues}> for further assistance.\n\n` +
      `• <#${kb.channels.commonFixes}> — Common fixes\n` +
      `• <#${kb.channels.cleanInstall}> — Clean install guide\n` +
      `• <#${kb.channels.bugsAndIssues}> — Bugs & Issues forum`
    );
  }

  if (showOriginalMessage && messageUrl) {
    const origField = safeField('Original Message', `[Jump to message](${messageUrl})`);
    if (origField) embed.addFields(origField);
  }

  // Footer with version info + plugin count
  const footerParts = ['Powered by NCRBot Knowledge Base'];
  if (versions.red4ext) footerParts.push(`RED4ext ${versions.red4ext}`);
  if (versions.game) footerParts.push(`Game ${versions.game}`);
  if (plugins.length > 0) footerParts.push(`${plugins.length} plugin(s) loaded`);
  embed.setFooter({ text: footerParts.join(' • '), iconURL: null });

  return embed;
}

module.exports = {
  fetchLogAttachment,
  analyzeLogForErrors,
  buildErrorEmbed,
  loadKnowledge
};
