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
    .addSubcommand(sub =>
      sub.setName('status').setDescription('View anti-spam configuration and status')
    )
    .addSubcommand(sub =>
      sub.setName('toggle').setDescription('Enable or disable the anti-spam system')
    )
    .addSubcommand(sub =>
      sub.setName('whitelist')
        .setDescription('Add a user to the whitelist')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to whitelist').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('unwhitelist')
        .setDescription('Remove a user from the whitelist')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to remove').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('debug-enable').setDescription('Enable anti-spam debug mode')
    )
    .addSubcommand(sub =>
      sub.setName('debug-disable').setDescription('Disable anti-spam debug mode')
    )
    .addSubcommand(sub =>
      sub.setName('debug-set-user')
        .setDescription('Set anti-spam debug test user')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Alt account for testing').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('debug-clear-user').setDescription('Clear debug test user')
    )
    .addSubcommand(sub =>
      sub.setName('debug-reset-user')
        .setDescription('Reset anti-spam state for a specific user')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to reset').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('debug-reset-all').setDescription('Reset anti-spam state for all users')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      switch (sub) {
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
      }
    } catch (err) {
      logger.error('[ANTISPAM] Command error:', err);
      await interaction.reply({ content: '❌ Error executing command.', ephemeral: true });
    }
  },

  async showStatus(interaction) {
    const guildId = interaction.guildId;
    const config = spamDetector.config;

    // Guild-specific overrides
    const guildCfg = config.guilds?.[guildId] || {};
    const alertChannelId = guildCfg.alertChannelId || config.alertChannelId;
    const protectedChannels = guildCfg.protectedChannels || config.protectedChannels || {};

    const embed = new EmbedBuilder()
      .setTitle(`🛡️ Anti-Spam Status — ${interaction.guild.name}`)
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

    // Active rules
    const ruleLines = [];
    const r = config.rules;

    if (r.multiChannelSpam?.enabled)
      ruleLines.push(`• Multi-Channel Spam (${r.multiChannelSpam.channelCount}+ channels / ${r.multiChannelSpam.timeWindowSeconds}s)`);

    if (r.rapidPosting?.enabled)
      ruleLines.push(`• Rapid Posting (${r.rapidPosting.messageCount}+ messages / ${r.rapidPosting.timeWindowSeconds}s)`);

    if (r.imageSpam?.enabled)
      ruleLines.push(`• Image Spam (${r.imageSpam.imageCount}+ images / ${r.imageSpam.timeWindowSeconds}s)`);

    if (r.suspiciousPatterns?.enabled)
      ruleLines.push(`• Suspicious Patterns (${r.suspiciousPatterns.patterns.length} patterns)`);

    if (r.newAccountMonitoring?.enabled)
      ruleLines.push(`• New Account Monitoring (<${r.newAccountMonitoring.accountAgeDays} days)`);

    embed.addFields([{ name: 'Active Rules', value: ruleLines.join('\n') || 'None', inline: false }]);

    // Protected channels
    const protectedList = Object.entries(protectedChannels)
      .map(([name, id]) => `• ${name}: <#${id}>`);

    embed.addFields([{ name: 'Protected Channels', value: protectedList.join('\n') || 'None', inline: false }]);

    // Whitelist
    embed.addFields([{
      name: 'Whitelist',
      value: `${config.whitelist.users.length} users, ${config.whitelist.roles.length} roles`,
      inline: true
    }]);

    // Debug mode
    const debugUser = config.debug?.testUserId
      ? `<@${config.debug.testUserId}> (\`${config.debug.testUserId}\`)"
      : 'Not set';

    embed.addFields([{
      name: 'Debug Mode',
      value: `Status: ${config.debug.enabled ? 'Enabled' : 'Disabled'}\nUser: ${debugUser}`,
      inline: false
    }]);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async toggleSystem(interaction) {
    const { configPath, config } = this.readConfig();
    config.enabled = !config.enabled;
    this.writeConfig(configPath, config);

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Anti-Spam System')
      .setColor(config.enabled ? 0x00FF00 : 0xFF0000)
      .addFields([{ name: 'Status', value: config.enabled ? 'Enabled' : 'Disabled' }])
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async addWhitelist(interaction) {
    const user = interaction.options.getUser('user');
    const { configPath, config } = this.readConfig();

    if (!config.whitelist.users.includes(user.id)) {
      config.whitelist.users.push(user.id);
      this.writeConfig(configPath, config);
    }

    const embed = new EmbedBuilder()
      .setTitle('User Whitelisted')
      .setColor(0x00FF00)
      .addFields([
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Added By', value: interaction.user.tag, inline: true }
      ]);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async removeWhitelist(interaction) {
    const user = interaction.options.getUser('user');
    const { configPath, config } = this.readConfig();

    config.whitelist.users = config.whitelist.users.filter(id => id !== user.id);
    this.writeConfig(configPath, config);

    const embed = new EmbedBuilder()
      .setTitle('User Removed from Whitelist')
      .setColor(0xFFA500)
      .addFields([
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Removed By', value: interaction.user.tag, inline: true }
      ]);

    await interaction.reply({ embeds: [embed], ephemeral: true });
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
    config.debug.enabled = enabled;
    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `Debug mode ${enabled ? 'enabled' : 'disabled'}.`,
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
    const guildId = interaction.guildId;

    spamDetector.resetUserState(guildId, user.id);
    SpamActionHandler.getInstance().resetUserState(guildId, user.id);

    await interaction.reply({
      content: `Anti-spam state reset for ${user.tag}.`,
      ephemeral: true
    });
  },

  async resetDebugAll(interaction) {
    const detectorCount = spamDetector.resetAllState();
    const handlerCount = SpamActionHandler.getInstance().resetAllState();

    await interaction.reply({
      content: `Anti-spam state reset for all users.\nDetector entries: ${detectorCount}\nAlerts cleared: ${handlerCount}`,
      ephemeral: true
    });
  }
};
