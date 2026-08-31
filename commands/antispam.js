const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const spamDetector = require('../services/spam/SpamDetector');
const SpamActionHandler = require('../services/spam/SpamActionHandler');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antispam')
    .setDescription('Configure anti-spam settings (Moderator+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View anti-spam configuration and status')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Enable or disable the anti-spam system')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('whitelist')
        .setDescription('Add a user to the anti-spam whitelist')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user to whitelist')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('unwhitelist')
        .setDescription('Remove a user from the anti-spam whitelist')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user to remove from whitelist')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('debug-enable')
        .setDescription('Enable anti-spam debug test mode')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('debug-disable')
        .setDescription('Disable anti-spam debug test mode')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('debug-set-user')
        .setDescription('Set anti-spam debug test user')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The alt account used for anti-spam debug testing')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('debug-clear-user')
        .setDescription('Clear anti-spam debug test user')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('debug-reset-user')
        .setDescription('Reset all cached anti-spam state for a specific user (for re-testing)')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user whose state should be reset')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('debug-reset-all')
        .setDescription('Reset all cached anti-spam state for all users (clears all active incidents)')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'status':
          await this.showStatus(interaction);
          break;
        case 'toggle':
          await this.toggleSystem(interaction);
          break;
        case 'whitelist':
          await this.addWhitelist(interaction);
          break;
        case 'unwhitelist':
          await this.removeWhitelist(interaction);
          break;
        case 'debug-enable':
          await this.setDebugEnabled(interaction, true);
          break;
        case 'debug-disable':
          await this.setDebugEnabled(interaction, false);
          break;
        case 'debug-set-user':
          await this.setDebugUser(interaction);
          break;
        case 'debug-clear-user':
          await this.clearDebugUser(interaction);
          break;
        case 'debug-reset-user':
          await this.resetDebugUser(interaction);
          break;
        case 'debug-reset-all':
          await this.resetDebugAll(interaction);
          break;
      }
    } catch (error) {
      logger.error('[ANTISPAM] Error executing antispam command:', error);
      await interaction.reply({
        content: '❌ An error occurred while executing the command.',
        ephemeral: true
      });
    }
  },

  async showStatus(interaction) {
    const config = spamDetector.config;

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Anti-Spam System Status')
      .setColor(config.enabled ? 0x00FF00 : 0xFF0000)
      .setTimestamp()
      .addFields([
        { 
          name: 'System Status', 
          value: config.enabled ? '✅ Enabled' : '❌ Disabled', 
          inline: true 
        },
        { 
          name: 'Alert Channel', 
          value: config.alertChannelId ? `<#${config.alertChannelId}>` : 'Not set', 
          inline: true 
        },
        { 
          name: 'Default Timeout', 
          value: `${config.defaultTimeoutSeconds / 3600} hours`, 
          inline: true 
        }
      ]);

    // Add rule status
    const rules = [];
    if (config.rules.multiChannelSpam?.enabled) {
      rules.push(`✅ Multi-Channel Spam (${config.rules.multiChannelSpam.channelCount}+ channels in ${config.rules.multiChannelSpam.timeWindowSeconds}s)`);
    }
    if (config.rules.rapidPosting?.enabled) {
      rules.push(`✅ Rapid Posting (${config.rules.rapidPosting.messageCount}+ messages in ${config.rules.rapidPosting.timeWindowSeconds}s)`);
    }
    if (config.rules.imageSpam?.enabled) {
      rules.push(`✅ Image Spam (${config.rules.imageSpam.imageCount}+ images in ${config.rules.imageSpam.timeWindowSeconds}s)`);
    }
    if (config.rules.suspiciousPatterns?.enabled) {
      rules.push(`✅ Suspicious Patterns (${config.rules.suspiciousPatterns.patterns.length} patterns)`);
    }
    if (config.rules.newAccountMonitoring?.enabled) {
      rules.push(`✅ New Account Monitoring (<${config.rules.newAccountMonitoring.accountAgeDays} days)`);
    }

    if (rules.length > 0) {
      embed.addFields([{
        name: 'Active Rules',
        value: rules.join('\n'),
        inline: false
      }]);
    }

    // Add protected channels
    const protectedChannels = [];
    if (config.protectedChannels?.showcase) {
      protectedChannels.push(`Showcase: <#${config.protectedChannels.showcase}>`);
    }
    if (config.protectedChannels?.gifs) {
      protectedChannels.push(`GIFs: <#${config.protectedChannels.gifs}>`);
    }

    if (protectedChannels.length > 0) {
      embed.addFields([{
        name: 'Protected Channels',
        value: protectedChannels.join('\n'),
        inline: false
      }]);
    }

    // Add whitelist info
    const whitelistUsers = config.whitelist?.users?.length || 0;
    const whitelistRoles = config.whitelist?.roles?.length || 0;
    
    embed.addFields([{
      name: 'Whitelist',
      value: `${whitelistUsers} user(s), ${whitelistRoles} role(s)`,
      inline: true
    }]);

    const debugEnabled = config.debug?.enabled ? '✅ Enabled' : '❌ Disabled';
    const debugUser = config.debug?.testUserId ? `<@${config.debug.testUserId}> (\`${config.debug.testUserId}\`)` : 'Not set';
    embed.addFields([{
      name: 'Debug Test Mode',
      value: `${debugEnabled}\nUser: ${debugUser}`,
      inline: false
    }]);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async toggleSystem(interaction) {
    const configPath = path.join(__dirname, '../config/spamConfig.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    config.enabled = !config.enabled;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    // Reload config
    spamDetector.reloadConfig();

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Anti-Spam System')
      .setColor(config.enabled ? 0x00FF00 : 0xFF0000)
      .setTimestamp()
      .addFields([{
        name: 'Status',
        value: config.enabled ? '✅ System Enabled' : '❌ System Disabled',
        inline: false
      }]);

    await interaction.reply({ embeds: [embed] });

    logger.info(`[ANTISPAM] System ${config.enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag}`);
  },

  async addWhitelist(interaction) {
    const user = interaction.options.getUser('user');
    const configPath = path.join(__dirname, '../config/spamConfig.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!config.whitelist) {
      config.whitelist = { users: [], roles: [] };
    }

    if (config.whitelist.users.includes(user.id)) {
      await interaction.reply({
        content: `ℹ️ ${user.tag} is already whitelisted.`,
        ephemeral: true
      });
      return;
    }

    config.whitelist.users.push(user.id);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    // Reload config
    spamDetector.reloadConfig();

    const embed = new EmbedBuilder()
      .setTitle('✅ User Whitelisted')
      .setColor(0x00FF00)
      .setTimestamp()
      .addFields([
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Added By', value: interaction.user.tag, inline: true }
      ])
      .setDescription('This user will not trigger anti-spam detection.')
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }));

    await interaction.reply({ embeds: [embed] });

    logger.info(`[ANTISPAM] User ${user.tag} whitelisted by ${interaction.user.tag}`);
  },

  async removeWhitelist(interaction) {
    const user = interaction.options.getUser('user');
    const configPath = path.join(__dirname, '../config/spamConfig.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!config.whitelist?.users?.includes(user.id)) {
      await interaction.reply({
        content: `ℹ️ ${user.tag} is not in the whitelist.`,
        ephemeral: true
      });
      return;
    }

    config.whitelist.users = config.whitelist.users.filter(id => id !== user.id);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    // Reload config
    spamDetector.reloadConfig();

    const embed = new EmbedBuilder()
      .setTitle('🗑️ User Removed from Whitelist')
      .setColor(0xFFA500)
      .setTimestamp()
      .addFields([
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Removed By', value: interaction.user.tag, inline: true }
      ])
      .setDescription('This user will now be subject to anti-spam detection.')
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }));

    await interaction.reply({ embeds: [embed] });

    logger.info(`[ANTISPAM] User ${user.tag} removed from whitelist by ${interaction.user.tag}`);
  },

  readConfig() {
    const configPath = path.join(__dirname, '../config/spamConfig.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { configPath, config };
  },

  writeConfig(configPath, config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    spamDetector.reloadConfig();
  },

  async setDebugEnabled(interaction, enabled) {
    const { configPath, config } = this.readConfig();
    config.debug = config.debug || {};
    config.debug.enabled = enabled;
    this.writeConfig(configPath, config);

    let content = `${enabled ? '✅' : '❌'} Anti-spam debug mode ${enabled ? 'enabled' : 'disabled'}.`;
    if (enabled && !config.debug.testUserId) {
      content += ' Set a test user with `/antispam debug-set-user`.';
    } else if (enabled && config.debug.testUserId) {
      content += ` Current test user: <@${config.debug.testUserId}>.`;
    }

    await interaction.reply({
      content,
      ephemeral: true
    });

    logger.info(`[ANTISPAM][DEBUG] Debug mode ${enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag}`);
  },

  async setDebugUser(interaction) {
    const user = interaction.options.getUser('user');
    const { configPath, config } = this.readConfig();
    config.debug = config.debug || {};
    config.debug.testUserId = user.id;

    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `✅ Anti-spam debug test user set to ${user.tag} (\`${user.id}\`).`,
      ephemeral: true
    });

    logger.info(`[ANTISPAM][DEBUG] Debug test user set to ${user.tag} by ${interaction.user.tag}`);
  },

  async clearDebugUser(interaction) {
    const { configPath, config } = this.readConfig();
    config.debug = config.debug || {};
    config.debug.testUserId = null;

    this.writeConfig(configPath, config);

    await interaction.reply({
      content: '✅ Anti-spam debug test user cleared.',
      ephemeral: true
    });

    logger.info(`[ANTISPAM][DEBUG] Debug test user cleared by ${interaction.user.tag}`);
  },

  async resetDebugUser(interaction) {
    const user = interaction.options.getUser('user');
    const spamHandler = SpamActionHandler.getInstance();

    spamDetector.resetUserState(user.id);
    if (spamHandler) spamHandler.resetUserState(user.id);

    const cleared = [
      '• Detector activity window',
      '• Active alert / alert lock',
    ].join('\n');

    await interaction.reply({
      content: `✅ Anti-spam state reset for ${user.tag} (\`${user.id}\`).\nCleared:\n${cleared}`,
      ephemeral: true
    });

    logger.info(`[ANTISPAM][DEBUG] State reset for user ${user.tag} (${user.id}) by ${interaction.user.tag}`);
  },

  async resetDebugAll(interaction) {
    const spamHandler = SpamActionHandler.getInstance();

    const detectorCount = spamDetector.resetAllState();
    const handlerCount = spamHandler ? spamHandler.resetAllState() : 0;

    await interaction.reply({
      content: `✅ Anti-spam state reset for all users.\nCleared ${detectorCount} detector entries and ${handlerCount} active alert(s).`,
      ephemeral: true
    });

    logger.info(`[ANTISPAM][DEBUG] Full state reset by ${interaction.user.tag} (detector: ${detectorCount}, handler: ${handlerCount})`);
  }
};
