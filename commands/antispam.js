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

    // SET ALERT CHANNEL
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
    )

    // SET PROTECTED CHANNEL
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-protected-channel')
        .setDescription('Set a protected channel for this guild (spam rules ignore it)')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Name/key for this protected channel (e.g. showcase, gifs)')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel to protect')
            .setRequired(true)
        )
    )

    // RULE CONFIG COMMANDS
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-multichannel-count')
        .setDescription('Set Multi-Channel Spam threshold for this guild')
        .addIntegerOption(option =>
          option.setName('count')
            .setDescription('Number of unique channels required to trigger')
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('add-rapidposting-exclude')
        .setDescription('Exclude a channel from Rapid Posting rule (per guild)')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to exclude')
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('add-imagespam-exclude')
        .setDescription('Exclude a channel from Image Spam rule (per guild)')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to exclude')
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('add-carpetbomb-channel')
        .setDescription('Add a watched channel for Carpet-Bomb rule (per guild)')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to watch for carpet-bombing')
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('set-newaccount-days')
        .setDescription('Set new-account age threshold for this guild')
        .addIntegerOption(option =>
          option.setName('days')
            .setDescription('Account age in days required to avoid flagging')
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
        case 'set-protected-channel': return this.setProtectedChannel(interaction);

        // RULE CONFIG
        case 'set-multichannel-count': return this.setMultiChannelCount(interaction);
        case 'add-rapidposting-exclude': return this.addRapidPostingExclude(interaction);
        case 'add-imagespam-exclude': return this.addImageSpamExclude(interaction);
        case 'add-carpetbomb-channel': return this.addCarpetBombChannel(interaction);
        case 'set-newaccount-days': return this.setNewAccountDays(interaction);
      }
    } catch (error) {
      logger.error('[ANTISPAM] Error executing command:', error);
      await interaction.reply({
        content: '❌ An error occurred while executing the command.',
        ephemeral: true
      });
    }
  },

  // STATUS
  async showStatus(interaction) {
    const config = spamDetector.config;
    const guildId = interaction.guildId;

    const guildCfg = config.guilds?.[guildId];
    const alertChannelId = guildCfg?.alertChannelId || config.alertChannelId;

    const cfgRules = guildCfg?.rules || config.rules;

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

    const rules = [];

    if (cfgRules.multiChannelSpam?.enabled)
      rules.push(`Multi-Channel Spam: ${cfgRules.multiChannelSpam.channelCount}+ channels`);

    if (cfgRules.rapidPosting?.enabled)
      rules.push(`Rapid Posting: ${cfgRules.rapidPosting.messageCount}+ msgs`);

    if (cfgRules.imageSpam?.enabled)
      rules.push(`Image Spam: ${cfgRules.imageSpam.imageCount}+ images`);

    if (cfgRules.suspiciousPatterns?.enabled)
      rules.push(`Suspicious Patterns: ${cfgRules.suspiciousPatterns.patterns.length} patterns`);

    if (cfgRules.newAccountMonitoring?.enabled)
      rules.push(`New Account: <${cfgRules.newAccountMonitoring.accountAgeDays} days`);

    embed.addFields([{ name: 'Active Rules', value: rules.join('\n'), inline: false }]);

    const protectedChannels = [];
    const guildProtected = guildCfg?.protectedChannels || config.protectedChannels || {};

    for (const [name, id] of Object.entries(guildProtected)) {
      protectedChannels.push(`${name}: <#${id}>`);
    }

    embed.addFields([{ name: 'Protected Channels', value: protectedChannels.join('\n'), inline: false }]);

    embed.addFields([{
      name: 'Whitelist',
      value: `${config.whitelist.users.length} user(s), ${config.whitelist.roles.length} role(s)`,
      inline: true
    }]);

    const debugEnabled = config.debug?.enabled ? 'Enabled' : 'Disabled';
    const debugUser = config.debug?.testUserId ? `<@${config.debug.testUserId}>` : 'Not set';

    embed.addFields([{ name: 'Debug Mode', value: `${debugEnabled}\nUser: ${debugUser}`, inline: false }]);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  // CONFIG HELPERS
  readConfig() {
    const configPath = path.join(__dirname, '../config/spamConfig.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { configPath, config };
  },

  writeConfig(configPath, config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    spamDetector.reloadConfig();
  },

  // SET ALERT CHANNEL
  async setAlertChannel(interaction) {
    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;

    if (channel.guildId !== guildId) {
      return interaction.reply({ content: '❌ That channel does not belong to this guild.', ephemeral: true });
    }

    const { configPath, config } = this.readConfig();

    if (!config.guilds) config.guilds = {};
    if (!config.guilds[guildId]) config.guilds[guildId] = {};

    config.guilds[guildId].alertChannelId = channel.id;

    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `Alert channel set to <#${channel.id}>.`,
      ephemeral: true
    });
  },

  // SET PROTECTED CHANNEL
  async setProtectedChannel(interaction) {
    const guildId = interaction.guildId;
    const name = interaction.options.getString('name');
    const channel = interaction.options.getChannel('channel');

    if (channel.guildId !== guildId) {
      return interaction.reply({ content: '❌ That channel does not belong to this guild.', ephemeral: true });
    }

    const { configPath, config } = this.readConfig();

    if (!config.guilds) config.guilds = {};
    if (!config.guilds[guildId]) config.guilds[guildId] = {};
    if (!config.guilds[guildId].protectedChannels)
      config.guilds[guildId].protectedChannels = {};

    config.guilds[guildId].protectedChannels[name] = channel.id;

    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `Protected channel **${name}** set to <#${channel.id}>.`,
      ephemeral: true
    });
  },

  // RULE CONFIG COMMANDS

  async setMultiChannelCount(interaction) {
    const guildId = interaction.guildId;
    const count = interaction.options.getInteger('count');

    const { configPath, config } = this.readConfig();

    if (!config.guilds) config.guilds = {};
    if (!config.guilds[guildId]) config.guilds[guildId] = {};
    if (!config.guilds[guildId].rules) config.guilds[guildId].rules = {};
    if (!config.guilds[guildId].rules.multiChannelSpam)
      config.guilds[guildId].rules.multiChannelSpam = {};

    config.guilds[guildId].rules.multiChannelSpam.channelCount = count;

    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `Multi-Channel Spam threshold set to **${count} channels**.`,
      ephemeral: true
    });
  },

  async addRapidPostingExclude(interaction) {
    const guildId = interaction.guildId;
    const channel = interaction.options.getChannel('channel');

    if (channel.guildId !== guildId) {
      return interaction.reply({ content: '❌ Channel is not in this guild.', ephemeral: true });
    }

    const { configPath, config } = this.readConfig();

    if (!config.guilds) config.guilds = {};
    if (!config.guilds[guildId]) config.guilds[guildId] = {};
    if (!config.guilds[guildId].rules) config.guilds[guildId].rules = {};
    if (!config.guilds[guildId].rules.rapidPosting)
      config.guilds[guildId].rules.rapidPosting = { excludeChannels: [] };

    const ruleCfg = config.guilds[guildId].rules.rapidPosting;

    if (!ruleCfg.excludeChannels.includes(channel.id))
      ruleCfg.excludeChannels.push(channel.id);

    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `Added <#${channel.id}> to Rapid Posting exclude list.`,
      ephemeral: true
    });
  },

  async addImageSpamExclude(interaction) {
    const guildId = interaction.guildId;
    const channel = interaction.options.getChannel('channel');

    if (channel.guildId !== guildId) {
      return interaction.reply({ content: '❌ Channel is not in this guild.', ephemeral: true });
    }

    const { configPath, config } = this.readConfig();

    if (!config.guilds) config.guilds = {};
    if (!config.guilds[guildId]) config.guilds[guildId] = {};
    if (!config.guilds[guildId].rules) config.guilds[guildId].rules = {};
    if (!config.guilds[guildId].rules.imageSpam)
      config.guilds[guildId].rules.imageSpam = { excludeChannels: [] };

    const ruleCfg = config.guilds[guildId].rules.imageSpam;

    if (!ruleCfg.excludeChannels.includes(channel.id))
      ruleCfg.excludeChannels.push(channel.id);

    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `Added <#${channel.id}> to Image Spam exclude list.`,
      ephemeral: true
    });
  },

  async addCarpetBombChannel(interaction) {
    const guildId = interaction.guildId;
    const channel = interaction.options.getChannel('channel');

    if (channel.guildId !== guildId) {
      return interaction.reply({ content: '❌ Channel is not in this guild.', ephemeral: true });
    }

    const { configPath, config } = this.readConfig();

    if (!config.guilds) config.guilds = {};
    if (!config.guilds[guildId]) config.guilds[guildId] = {};
    if (!config.guilds[guildId].rules) config.guilds[guildId].rules = {};
    if (!config.guilds[guildId].rules.channelCarpetBomb)
      config.guilds[guildId].rules.channelCarpetBomb = { watchedChannels: [] };

    const ruleCfg = config.guilds[guildId].rules.channelCarpetBomb;

    if (!ruleCfg.watchedChannels.includes(channel.id))
      ruleCfg.watchedChannels.push(channel.id);

    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `Added <#${channel.id}> as a watched Carpet-Bomb channel.`,
      ephemeral: true
    });
  },

  async setNewAccountDays(interaction) {
    const guildId = interaction.guildId;
    const days = interaction.options.getInteger('days');

    const { configPath, config } = this.readConfig();

    if (!config.guilds) config.guilds = {};
    if (!config.guilds[guildId]) config.guilds[guildId] = {};
    if (!config.guilds[guildId].rules) config.guilds[guildId].rules = {};
    if (!config.guilds[guildId].rules.newAccountMonitoring)
      config.guilds[guildId].rules.newAccountMonitoring = {};

    config.guilds[guildId].rules.newAccountMonitoring.accountAgeDays = days;

    this.writeConfig(configPath, config);

    await interaction.reply({
      content: `New Account threshold set to **${days} days**.`,
      ephemeral: true
    });
  },

  // DEBUG COMMANDS
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
