const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const spamDetector = require('../services/spam/SpamDetector');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antispam')
    .setDescription('Manage the anti-spam system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
  }
};
