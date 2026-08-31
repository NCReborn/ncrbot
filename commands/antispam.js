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

    // STATUS
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View anti-spam configuration and status')
    )

    // TOGGLE
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Enable or disable the anti-spam system')
    )

    // WHITELIST
    .addSubcommand(subcommand =>
      subcommand
        .setName('whitelist')
        .setDescription('Add a user to the anti-spam whitelist')
        .addUserOption(option =>
          option.setName('user').setDescription('User to whitelist').setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('unwhitelist')
        .setDescription('Remove a user from the whitelist')
        .addUserOption(option =>
          option.setName('user').setDescription('User to remove').setRequired(true)
        )
    )

    // DEBUG
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
          option.setName('user').setDescription('Alt account for testing').setRequired(true)
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
        .setDescription('Reset cached anti-spam state for a user')
        .addUserOption(option =>
          option.setName('user').setDescription('User to reset').setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('debug-reset-all')
        .setDescription('Reset all cached anti-spam state')
    )

    // NEW: SET ALERT CHANNEL
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-alert-channel')
        .setDescription('Set the anti-spam alert channel for this guild')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel where anti-spam alerts will be posted')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'status': return this.showStatus(interaction);
        case 'toggle': return this.toggleSystem(interaction);
        case 'whitelist': return this.addWhitelist(interaction);
        case 'unwhitelist': return this.removeWhitelist(interaction);
        case 'debug-enable': return this.setDebugEnabled(interaction, true);
        case 'debug-disable': return this.setDebugEnabled(interaction, false);
        case 'debug-set-user': return this.setDebugUser(interaction);
        case 'debug-clear-user': return this.clearDebugUser(interaction);
        case 'debug-reset-user': return this.resetDebugUser(interaction);
        case 'debug-reset-all': return this.resetDebugAll(interaction);
        case 'set-alert-channel': return this.setAlertChannel(interaction);
      }
    } catch (error) {
      logger.error('[ANTISPAM] Error executing command:', error);
      await interaction.reply({
        content: '❌ An error occurred while executing the command.',
        ephemeral: true
      });
    }
  },

  // -----------------------------
  // STATUS
  // -----------------------------
  async showStatus(interaction) {
    const config = spamDetector.config;
    const guildId = interaction.guildId;

    const guildCfg = config.guilds?.[guildId];
    const alertChannelId = guildCfg?.alertChannelId || config.alertChannelId;

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
          value: alertChannelId ? `<#${alertChannelId}>` : 'Not set',
          inline: true
        },
        {
          name: 'Default Timeout',
          value: `${config.defaultTimeoutSeconds / 3600} hours`,
          inline: true
        }
      ]);

    // Rules
    const rules = [];
    const cfgRules = config.rules;

    if (cfgRules.multiChannelSpam?.enabled)
      rules.push(`✅ Multi-Channel Spam (${cfgRules.multiChannelSpam.channelCount}+ channels in ${cfgRules.multiChannelSpam.timeWindowSeconds}s)`);

    if (cfgRules.rapidPosting?.enabled)
      rules.push(`✅ Rapid Posting (${cfgRules.rapidPosting.messageCount}+ messages in ${cfgRules.rapidPosting.timeWindowSeconds}s)`);

    if (cfgRules.imageSpam?.enabled)
      rules.push(`✅ Image Spam (${cfgRules.imageSpam.imageCount}+ images in ${cfgRules.imageSpam.timeWindowSeconds}s)`);

    if (cfgRules.suspiciousPatterns?.enabled)
      rules.push(`✅ Suspicious Patterns (${cfgRules.suspiciousPatterns.patterns.length} patterns)`);

    if (cfgRules.newAccountMonitoring?.enabled)
      rules.push(`✅ New Account Monitoring (<${cfgRules.newAccountMonitoring.accountAgeDays} days)`);

    if (rules.length > 0) {
      embed.addFields([{ name: 'Active Rules', value: rules.join('\n'), inline: false }]);
    }

    // Protected channels
    const protectedChannels = [];
    const guildProtected = guildCfg?.protectedChannels || config.protectedChannels || {};

    for (const [name, id] of Object.entries(guildProtected)) {
      protectedChannels.push(`${name}: <#${id}>`);
    }

    if (protectedChannels.length > 0) {
      embed.addFields([{ name: 'Protected Channels', value: protectedChannels.join('\n'), inline: false }]);
    }

    // Whitelist
    embed.addFields([{
      name: 'Whitelist',
      value: `${config.whitelist.users.length} user(s), ${config.whitelist.roles.length} role(s)`,
      inline: true
    }]);

    // Debug
    const debugEnabled = config.debug?.enabled ? '✅ Enabled' : '❌ Disabled';
    const debugUser = config.debug?.testUserId ? `<@${config.debug.testUserId}>` : 'Not set';

    embed.addFields([{
      name: 'Debug Test Mode',
      value: `${debugEnabled}\nUser: ${debugUser}`,
      inline: false
    }]);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  // -----------------------------
  // CONFIG HELPERS
  // -----------------------------
  readConfig() {
    const configPath = path.join(__dirname, '../config/spamConfig.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { configPath, config };
  },

  writeConfig(configPath, config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    spamDetector.reloadConfig();
  },

  // -----------------------------
  // SET ALERT CHANNEL (NEW)
  // -----------------------------
  async setAlertChannel(interaction) {
    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;

    if (channel.guildId !== guildId) {
      return interaction.reply({
        content: '❌ That channel does not belong to this guild.',
        ephemeral: true
      });
    }

    const { configPath, config } = this.readConfig();

    if (!config.guilds) config.guilds = {};
    if (!config.guilds[guildId]) config.guilds[guildId] = {};

    config.guilds[guildId].alertChannelId = channel.id;

    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `✅ Anti-spam alert channel set to <#${channel.id}> for this guild.`,
      ephemeral: true
    });

    logger.info(`[ANTISPAM] Alert channel for guild ${guildId} set to ${channel.id} by ${interaction.user.tag}`);
  },

  // -----------------------------
  // TOGGLE
  // -----------------------------
  async toggleSystem(interaction) {
    const { configPath, config } = this.readConfig();

    config.enabled = !config.enabled;
    this.writeConfig(configPath, config);

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Anti-Spam System')
      .setColor(config.enabled ? 0x00FF00 : 0xFF0000)
      .addFields([{ name: 'Status', value: config.enabled ? 'Enabled' : 'Disabled' }]);

    await interaction.reply({ embeds: [embed] });
  },

  // -----------------------------
  // WHITELIST
  // -----------------------------
  async addWhitelist(interaction) {
    const user = interaction.options.getUser('user');
    const { configPath, config } = this.readConfig();

    if (!config.whitelist.users.includes(user.id)) {
      config.whitelist.users.push(user.id);
      this.writeConfig(configPath, config);
    }

    await interaction.reply({
      content: `✅ ${user.tag} added to whitelist.`,
      ephemeral: true
    });
  },

  async removeWhitelist(interaction) {
    const user = interaction.options.getUser('user');
    const { configPath, config } = this.readConfig();

    config.whitelist.users = config.whitelist.users.filter(id => id !== user.id);
    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `🗑️ ${user.tag} removed from whitelist.`,
      ephemeral: true
    });
  },

  // -----------------------------
  // DEBUG
  // -----------------------------
  async setDebugEnabled(interaction, enabled) {
    const { configPath, config } = this.readConfig();

    config.debug.enabled = enabled;
    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `${enabled ? 'Enabled' : 'Disabled'} debug mode.`,
      ephemeral: true
    });
  },

  async setDebugUser(interaction) {
    const user = interaction.options.getUser('user');
    const { configPath, config } = this.readConfig();

    config.debug.testUserId = user.id;
    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `Debug test user set to ${user.tag}.`,
      ephemeral: true
    });
  },

  async clearDebugUser(interaction) {
    const { configPath, config } = this.readConfig();

    config.debug.testUserId = null;
    this.writeConfig(configPath, config);

    await interaction.reply({
      content: 'Debug test user cleared.',
      ephemeral: true
    });
  },

  async resetDebugUser(interaction) {
    const user = interaction.options.getUser('user');
    const spamHandler = SpamActionHandler.getInstance();

    spamDetector.resetUserState(interaction.guildId, user.id);
    spamHandler.resetUserState(interaction.guildId, user.id);

    await interaction.reply({
      content: `Reset anti-spam state for ${user.tag}.`,
      ephemeral: true
    });
  },

  async resetDebugAll(interaction) {
    const spamHandler = SpamActionHandler.getInstance();

    spamDetector.resetAllState();
    spamHandler.resetAllState();

    await interaction.reply({
      content: `Reset all anti-spam state.`,
      ephemeral: true
    });
  }
};
