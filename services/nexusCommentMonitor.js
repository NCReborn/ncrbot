/**
 * Nexus Mods Comment Monitor Service
 * Monitors Nexus Mods collection comments for issue keywords and reports to Discord
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const pLimit = require('p-limit').default;
const { EmbedBuilder } = require('discord.js');

const logger = require('../utils/logger');
const { parseNexusDate, isWithinDays } = require('../utils/nexusDateParser');
const { fetchRevision, processModFiles } = require('../utils/nexusApi');
const { collections } = require('../config/collections');
const config = require('../config/nexusCommentBlacklist');

const DATA_FILE = path.join(__dirname, '..', 'data', 'nexus_comment_monitor.json');

/**
 * Main comment monitor class
 */
class NexusCommentMonitor {
  constructor() {
    this.reportedComments = new Set();
    this.limit = pLimit(config.commentSettings.concurrencyLimit);
    this.client = null;
  }

  /**
   * Initialize the monitor with Discord client
   * @param {Client} client - Discord client instance
   */
  initialize(client) {
    this.client = client;
    this.loadReportedComments();
  }

  /**
   * Load previously reported comments from data file
   */
  async loadReportedComments() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(DATA_FILE);
      await fs.mkdir(dataDir, { recursive: true });

      const data = await fs.readFile(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      this.reportedComments = new Set(parsed.reportedComments || []);
      logger.info(`[NEXUS_MONITOR] Loaded ${this.reportedComments.size} previously reported comments`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`[NEXUS_MONITOR] Failed to load reported comments: ${error.message}`);
      }
      this.reportedComments = new Set();
    }
  }

  /**
   * Save reported comments to data file
   */
  async saveReportedComments() {
    try {
      const data = {
        reportedComments: Array.from(this.reportedComments),
        lastUpdated: new Date().toISOString()
      };
      await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
      logger.debug(`[NEXUS_MONITOR] Saved ${this.reportedComments.size} reported comments`);
    } catch (error) {
      logger.error(`[NEXUS_MONITOR] Failed to save reported comments: ${error.message}`);
    }
  }

  /**
   * Run the comment monitoring process
   */
  async runMonitoring() {
    if (!this.client) {
      logger.error('[NEXUS_MONITOR] Discord client not initialized');
      return;
    }

    if (!config.alertChannelId) {
      logger.warn('[NEXUS_MONITOR] No alert channel ID configured, skipping monitoring');
      return;
    }

    logger.info('[NEXUS_MONITOR] Starting Nexus Mods comment monitoring');

    try {
      const modCollections = await this.getModCollections();
      const newAlerts = [];

      for (const collection of modCollections) {
        if (config.blacklistedCollections.includes(collection.slug)) {
          logger.debug(`[NEXUS_MONITOR] Skipping blacklisted collection: ${collection.slug}`);
          continue;
        }

        logger.info(`[NEXUS_MONITOR] Processing collection: ${collection.display} (${collection.slug})`);
        
        try {
          const mods = await this.getModsFromCollection(collection.slug);
          const collectionAlerts = await this.processModsForComments(mods, collection.display);
          newAlerts.push(...collectionAlerts);
        } catch (error) {
          logger.error(`[NEXUS_MONITOR] Failed to process collection ${collection.slug}: ${error.message}`);
        }

        // Add delay between collections to be respectful
        await this.delay(config.commentSettings.requestDelay);
      }

      if (newAlerts.length > 0) {
        await this.sendDiscordAlerts(newAlerts);
        await this.saveReportedComments();
        logger.info(`[NEXUS_MONITOR] Sent ${newAlerts.length} new comment alerts`);
      } else {
        logger.info('[NEXUS_MONITOR] No new comment alerts to send');
      }

    } catch (error) {
      logger.error(`[NEXUS_MONITOR] Comment monitoring failed: ${error.message}`);
    }
  }

  /**
   * Get mod collections to monitor
   */
  async getModCollections() {
    return collections.filter(collection => 
      !config.blacklistedCollections.includes(collection.slug)
    );
  }

  /**
   * Get mods from a collection
   * @param {string} collectionSlug - Collection slug
   * @returns {Array} - Array of mod objects
   */
  async getModsFromCollection(collectionSlug) {
    try {
      const revisionData = await fetchRevision(
        collectionSlug,
        null, // Latest revision
        process.env.NEXUS_API_KEY,
        process.env.APP_NAME,
        process.env.APP_VERSION
      );

      return processModFiles(revisionData.modFiles);
    } catch (error) {
      logger.error(`[NEXUS_MONITOR] Failed to fetch mods for collection ${collectionSlug}: ${error.message}`);
      return [];
    }
  }

  /**
   * Process mods for comments with concurrency control
   * @param {Array} mods - Array of mod objects
   * @param {string} collectionName - Collection display name
   * @returns {Array} - Array of alert objects
   */
  async processModsForComments(mods, collectionName) {
    const filteredMods = mods.filter(mod => 
      !config.blacklistedModIds.includes(mod.modId)
    );

    logger.info(`[NEXUS_MONITOR] Processing ${filteredMods.length} mods for comments`);

    const tasks = filteredMods.map(mod => 
      this.limit(() => this.processModComments(mod, collectionName))
    );

    const results = await Promise.allSettled(tasks);
    const alerts = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        alerts.push(...result.value);
      } else if (result.status === 'rejected') {
        logger.error(`[NEXUS_MONITOR] Failed to process mod comments: ${result.reason}`);
      }
    }

    return alerts;
  }

  /**
   * Process comments for a single mod
   * @param {Object} mod - Mod object
   * @param {string} collectionName - Collection display name
   * @returns {Array} - Array of alert objects for this mod
   */
  async processModComments(mod, collectionName) {
    try {
      await this.delay(config.commentSettings.requestDelay);
      
      const comments = await this.scrapeModComments(mod);
      const flaggedComments = this.filterCommentsForIssues(comments);
      const newComments = flaggedComments.filter(comment => 
        !this.reportedComments.has(comment.id)
      );

      if (newComments.length > 0) {
        logger.info(`[NEXUS_MONITOR] Found ${newComments.length} new flagged comments for mod: ${mod.name}`);
        
        // Mark comments as reported
        newComments.forEach(comment => this.reportedComments.add(comment.id));
        
        return newComments.map(comment => ({
          modName: mod.name,
          modUrl: `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}`,
          comment,
          collectionName
        }));
      }

      return [];
    } catch (error) {
      logger.error(`[NEXUS_MONITOR] Failed to process comments for mod ${mod.name}: ${error.message}`);
      return [];
    }
  }

  /**
   * Scrape comments from a mod's posts page
   * @param {Object} mod - Mod object
   * @returns {Array} - Array of comment objects
   */
  async scrapeModComments(mod) {
    const url = `https://www.nexusmods.com/${mod.domainName}/mods/${mod.modId}?tab=posts`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Cookie': process.env.NEXUS_SESSION_COOKIE
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const comments = [];

      // Nexus Mods comment structure - try multiple possible selectors
      const commentSelectors = [
        '.comment-item',
        '.post-item', 
        '.discussion-post',
        '.comment',
        '.forum-post',
        '.comment-block',
        '.user-comment',
        '[class*="comment"]',
        '[class*="post"]'
      ];

      let foundComments = false;
      for (const selector of commentSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          logger.debug(`[NEXUS_MONITOR] Found ${elements.length} elements with selector: ${selector}`);
          
          elements.each((index, element) => {
            if (index >= config.commentSettings.maxCommentsPerMod) {
              return false; // Break the loop
            }

            const $comment = $(element);
            
            // Try multiple selectors for comment content
            const textSelectors = [
              '.comment-text', '.post-content', '.content', '.message', '.body', 
              '.comment-body', '.post-body', '.text', '.description',
              '[class*="content"]', '[class*="text"]', '[class*="body"]'
            ];
            
            const dateSelectors = [
              '.comment-date', '.post-date', '.date', '.timestamp', '.time',
              '.created-at', '.posted', '.datetime', 
              '[class*="date"]', '[class*="time"]', '[datetime]'
            ];
            
            const authorSelectors = [
              '.comment-author', '.post-author', '.author', '.username', '.user',
              '.posted-by', '.by', '.name',
              '[class*="author"]', '[class*="user"]'
            ];

            let text = '';
            let dateStr = '';
            let author = '';

            // Find comment text
            for (const textSel of textSelectors) {
              const textEl = $comment.find(textSel);
              if (textEl.length > 0) {
                text = textEl.first().text().trim();
                if (text) break;
              }
            }

            // Find date
            for (const dateSel of dateSelectors) {
              const dateEl = $comment.find(dateSel);
              if (dateEl.length > 0) {
                // Try datetime attribute first, then text
                dateStr = dateEl.first().attr('datetime') || dateEl.first().attr('title') || dateEl.first().text().trim();
                if (dateStr) break;
              }
            }

            // Find author
            for (const authorSel of authorSelectors) {
              const authorEl = $comment.find(authorSel);
              if (authorEl.length > 0) {
                author = authorEl.first().text().trim();
                if (author) break;
              }
            }
            
            if (text && dateStr) {
              const date = parseNexusDate(dateStr);
              
              // Only include comments from the last 30 days
              if (date && isWithinDays(date, config.commentSettings.daysSince)) {
                const commentId = this.generateCommentId(mod, text, dateStr, author);
                
                comments.push({
                  id: commentId,
                  text,
                  date,
                  dateStr,
                  author: author || 'Unknown'
                });
              }
            }
          });
          
          foundComments = true;
          break; // Found comments with this selector, no need to try others
        }
      }

      if (!foundComments) {
        logger.debug(`[NEXUS_MONITOR] No comment elements found for mod: ${mod.name}`);
      }

      logger.debug(`[NEXUS_MONITOR] Scraped ${comments.length} recent comments from ${mod.name}`);
      return comments;

    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug(`[NEXUS_MONITOR] Mod posts not found (404): ${mod.name}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Generate a unique comment ID for deduplication
   * @param {Object} mod - Mod object
   * @param {string} text - Comment text
   * @param {string} dateStr - Date string
   * @param {string} author - Comment author
   * @returns {string} - Unique comment ID
   */
  generateCommentId(mod, text, dateStr, author) {
    const content = `${mod.modId}-${author}-${dateStr}-${text.substring(0, 100)}`;
    // Simple hash function to create shorter IDs
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `comment_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Filter comments for issue keywords
   * @param {Array} comments - Array of comment objects
   * @returns {Array} - Array of flagged comment objects
   */
  filterCommentsForIssues(comments) {
    return comments.filter(comment => {
      const text = comment.text.toLowerCase();
      return config.issueKeywords.some(keyword => 
        text.includes(keyword.toLowerCase())
      );
    });
  }

  /**
   * Send Discord alerts for flagged comments
   * @param {Array} alerts - Array of alert objects
   * @param {string} overrideChannelId - Optional channel ID to override configured channel
   */
  async sendDiscordAlerts(alerts, overrideChannelId = null) {
    if (!this.client || alerts.length === 0) {
      return;
    }

    try {
      const channelId = overrideChannelId || config.alertChannelId;
      if (!channelId) {
        logger.warn('[NEXUS_MONITOR] No alert channel configured');
        return;
      }

      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        logger.error(`[NEXUS_MONITOR] Could not find alert channel: ${channelId}`);
        return;
      }

      // Group alerts by mod to avoid spam
      const groupedAlerts = this.groupAlertsByMod(alerts);

      for (const [modKey, modAlerts] of groupedAlerts.entries()) {
        const embed = this.createAlertEmbed(modAlerts);
        await channel.send({ embeds: [embed] });
        
        // Add small delay between Discord messages
        await this.delay(500);
      }

    } catch (error) {
      logger.error(`[NEXUS_MONITOR] Failed to send Discord alerts: ${error.message}`);
    }
  }

  /**
   * Group alerts by mod to consolidate multiple comments from the same mod
   * @param {Array} alerts - Array of alert objects
   * @returns {Map} - Map of mod keys to alert arrays
   */
  groupAlertsByMod(alerts) {
    const grouped = new Map();
    
    for (const alert of alerts) {
      const key = `${alert.modName}-${alert.modUrl}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(alert);
    }
    
    return grouped;
  }

  /**
   * Create Discord embed for comment alerts
   * @param {Array} modAlerts - Array of alerts for a single mod
   * @returns {EmbedBuilder} - Discord embed
   */
  createAlertEmbed(modAlerts) {
    const firstAlert = modAlerts[0];
    const embed = new EmbedBuilder()
      .setColor('#FF6B35') // Orange color for warnings
      .setTitle('🚨 Nexus Mods Comment Alert')
      .setURL(firstAlert.modUrl)
      .addFields({
        name: 'Mod Name',
        value: firstAlert.modName,
        inline: true
      })
      .addFields({
        name: 'Collection',
        value: firstAlert.collectionName,
        inline: true
      })
      .addFields({
        name: 'Flagged Comments',
        value: modAlerts.length.toString(),
        inline: true
      })
      .setTimestamp();

    // Add comment details (limit to avoid embed size limits)
    const maxComments = 3;
    const commentsToShow = modAlerts.slice(0, maxComments);
    
    for (let i = 0; i < commentsToShow.length; i++) {
      const alert = commentsToShow[i];
      const snippet = alert.comment.text.length > 200 
        ? alert.comment.text.substring(0, 200) + '...'
        : alert.comment.text;
      
      embed.addFields({
        name: `Comment ${i + 1} (${alert.comment.dateStr})`,
        value: `**Author:** ${alert.comment.author}\n**Text:** ${snippet}`,
        inline: false
      });
    }

    if (modAlerts.length > maxComments) {
      embed.addFields({
        name: 'Additional Comments',
        value: `... and ${modAlerts.length - maxComments} more flagged comments`,
        inline: false
      });
    }

    return embed;
  }

  /**
   * Utility delay function
   * @param {number} ms - Milliseconds to delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = NexusCommentMonitor;
