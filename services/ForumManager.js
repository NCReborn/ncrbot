const logger = require('../utils/logger');
const CONSTANTS = require('../config/constants');

class ForumManager {
  constructor() {
    this.megathreadCache = null;
  }

  /**
   * Get the investigating tag for the forum
   */
  async getInvestigatingTag(forumChannel) {
    const tags = forumChannel.availableTags;
    return tags.find(tag => tag.name === CONSTANTS.FORUM.TAGS.INVESTIGATING);
  }

  /**
   * Apply the Investigating tag to a thread
   */
  async applyInvestigatingTag(thread) {
    try {
      const forumChannel = thread.parent;
      if (!forumChannel) {
        logger.error('[FORUM_MANAGER] Thread has no parent channel');
        return false;
      }

      const investigatingTag = await this.getInvestigatingTag(forumChannel);
      if (!investigatingTag) {
        logger.warn('[FORUM_MANAGER] Investigating tag not found in forum');
        return false;
      }

      // Add the tag if it's not already applied
      if (!thread.appliedTags.includes(investigatingTag.id)) {
        await thread.setAppliedTags([...thread.appliedTags, investigatingTag.id]);
        logger.info(`[FORUM_MANAGER] Applied Investigating tag to thread: ${thread.name} (${thread.id})`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('[FORUM_MANAGER] Error applying investigating tag:', error);
      return false;
    }
  }

/**
 * Send alert to bot-alerts channel for new forum posts
 */
async sendNewThreadAlert(client, thread) {
  try {
    const alertChannel = await client.channels.fetch(CONSTANTS.CHANNELS.BOT_ALERTS);
    if (!alertChannel) {
      logger.error('[FORUM_MANAGER] Bot alerts channel not found');
      return;
    }

    const { EmbedBuilder } = require('discord.js');
    
    // Get the thread author
    const author = await client.users.fetch(thread.ownerId).catch(() => null);
    
    const embed = new EmbedBuilder()
      .setColor(0xFFA500) // Orange color
      .setTitle('🔔 New Forum Post Created')
      .addFields(
        { name: 'Thread', value: `[${thread.name}](https://discord.com/channels/${thread.guildId}/${thread.id})`, inline: false },
        { name: 'Author', value: author ? `${author.tag} (${author.id})` : `<@${thread.ownerId}> (${thread.ownerId})`, inline: false },
        { 
          name: 'Action Required', 
          value: `<@&${CONSTANTS.ROLES.SUPPORT}> Please check if the title needs updating and add appropriate tags:\n• ${CONSTANTS.FORUM.TAGS.COLLECTION_ISSUES}\n• ${CONSTANTS.FORUM.TAGS.MOD_ISSUES}\n• ${CONSTANTS.FORUM.TAGS.INSTALLATION_ISSUES}`,
          inline: false 
        }
      )
      .setFooter({ 
        text: `Thread ID: ${thread.id} • ${thread.guild.name}`,
        iconURL: thread.guild.iconURL()
      })
      .setTimestamp();

    // Add author thumbnail if available
    if (author) {
      embed.setThumbnail(author.displayAvatarURL({ dynamic: true }));
    }

    await alertChannel.send({ embeds: [embed] });
    logger.info(`[FORUM_MANAGER] Sent new thread alert for: ${thread.name}`);
  } catch (error) {
    logger.error('[FORUM_MANAGER] Error sending thread alert:', error);
  }
}

  /**
   * Get the megathread message
   */
  async getMegathread(client) {
    try {
      if (!CONSTANTS.FORUM.MEGATHREAD_ID) {
        logger.warn('[FORUM_MANAGER] Megathread ID not configured');
        return null;
      }

      // Find the forum channel first
      const forumChannel = await client.channels.fetch(CONSTANTS.FORUM.BUGS_AND_ISSUES_FORUM_ID);
      if (!forumChannel) {
        logger.error('[FORUM_MANAGER] Forum channel not found');
        return null;
      }

      // Fetch the megathread
      const megathread = await forumChannel.threads.fetch(CONSTANTS.FORUM.MEGATHREAD_ID);
      if (!megathread) {
        logger.error('[FORUM_MANAGER] Megathread not found');
        return null;
      }

      // Find the message with embeds (likely the first message or pinned)
      const messages = await megathread.messages.fetch({ limit: 10 });
      const embedMessage = messages.find(msg => msg.embeds.length > 0);

      return { thread: megathread, message: embedMessage };
    } catch (error) {
      logger.error('[FORUM_MANAGER] Error fetching megathread:', error);
      return null;
    }
  }

  /**
   * Get all threads with a specific tag
   */
  async getThreadsByTag(forumChannel, tagName) {
    try {
      const threads = await forumChannel.threads.fetchActive();
      const tag = forumChannel.availableTags.find(t => t.name === tagName);
      
      if (!tag) {
        logger.warn(`[FORUM_MANAGER] Tag not found: ${tagName}`);
        return [];
      }

      const filteredThreads = threads.threads.filter(thread => 
        thread.appliedTags.includes(tag.id) && 
        thread.id !== CONSTANTS.FORUM.MEGATHREAD_ID // Exclude megathread itself
      );

      return Array.from(filteredThreads.values());
    } catch (error) {
      logger.error('[FORUM_MANAGER] Error fetching threads by tag:', error);
      return [];
    }
  }

  /**
   * Update the megathread with new thread links organized by tags
   */
  async updateMegathread(client, tagName) {
    try {
      const megathreadData = await this.getMegathread(client);
      if (!megathreadData || !megathreadData.message) {
        logger.error('[FORUM_MANAGER] Cannot update megathread - message not found');
        return false;
      }

      const { thread: megathread, message: embedMessage } = megathreadData;
      const forumChannel = megathread.parent;

      // Get the tag configuration
      const tagConfig = CONSTANTS.FORUM.TAG_CONFIG[tagName];
      if (!tagConfig) {
        logger.warn(`[FORUM_MANAGER] No configuration for tag: ${tagName}`);
        return false;
      }

      // Get all threads with this tag
      const threads = await this.getThreadsByTag(forumChannel, tagName);

      // Build the new description with thread links
      let description = `## ${tagConfig.section}`;
      if (threads.length > 0) {
        description += '\n' + threads.map(t => `https://discord.com/channels/${t.guildId}/${t.id}`).join('\n');
      }

      // Update the specific embed
      const embeds = embedMessage.embeds.map((embed, index) => {
        if (index === tagConfig.embedIndex) {
          return {
            description: description,
            color: tagConfig.color
          };
        }
        // Keep other embeds as-is
        return embed.toJSON();
      });

      await embedMessage.edit({ embeds });
      logger.info(`[FORUM_MANAGER] Updated megathread section: ${tagConfig.section}`);
      return true;
    } catch (error) {
      logger.error('[FORUM_MANAGER] Error updating megathread:', error);
      return false;
    }
  }

  /**
   * Check if a tag change affects the megathread
   */
  shouldUpdateMegathread(oldTags, newTags, forumChannel) {
    const trackedTagNames = Object.keys(CONSTANTS.FORUM.TAG_CONFIG);
    const availableTags = forumChannel.availableTags;

    // Convert tag IDs to names
    const getTagNames = (tagIds) => {
      return tagIds.map(id => {
        const tag = availableTags.find(t => t.id === id);
        return tag ? tag.name : null;
      }).filter(name => name !== null);
    };

    const oldTagNames = getTagNames(oldTags);
    const newTagNames = getTagNames(newTags);

    // Find which tracked tags were added or removed
    const addedTags = newTagNames.filter(name => 
      !oldTagNames.includes(name) && trackedTagNames.includes(name)
    );
    const removedTags = oldTagNames.filter(name => 
      !newTagNames.includes(name) && trackedTagNames.includes(name)
    );

    return { added: addedTags, removed: removedTags, shouldUpdate: addedTags.length > 0 || removedTags.length > 0 };
  }
}

module.exports = new ForumManager();
