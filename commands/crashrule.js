const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { loadKnowledge } = require('../utils/logAnalyzer');
const logger = require('../utils/logger');

const KNOWLEDGE_PATH = path.join(__dirname, '../config/crashKnowledge.json');

function saveKnowledge(kb) {
  fs.writeFileSync(KNOWLEDGE_PATH, JSON.stringify(kb, null, 2), 'utf8');
}

function generateRuleId(logType, name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const ts = Date.now().toString(36);
  return `${logType}-${slug}-${ts}`;
}

const LOG_TYPE_CHOICES = [
  { name: 'RED4ext', value: 'red4ext' },
  { name: 'Redscript', value: 'redscript' },
  { name: 'ArchiveXL', value: 'archivexl' },
  { name: 'TweakXL', value: 'tweakxl' },
  { name: 'Cyber Engine Tweaks', value: 'cet' },
  { name: 'REDmod', value: 'redmod' },
  { name: 'Any', value: 'any' },
];

const RECOMMENDATION_CHOICES = [
  { name: 'Clean Install', value: 'cleanInstall' },
  { name: 'Update to Latest Revision', value: 'latestRevision' },
  { name: 'Bisect Collection', value: 'bisect' },
  { name: 'Check Common Fixes', value: 'commonFixes' },
  { name: 'Post in Bugs & Issues', value: 'bugsAndIssues' },
  { name: 'None', value: 'none' },
];

const RECOMMENDATION_LABELS = {
  cleanInstall: 'Clean Install',
  latestRevision: 'Update to Latest Revision',
  bisect: 'Bisect Collection',
  commonFixes: 'Check Common Fixes',
  bugsAndIssues: 'Post in Bugs & Issues',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crashrule')
    .setDescription('Manage the crash log knowledge base')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a new crash rule')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Rule display name').setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('log_type')
            .setDescription('Log type this rule applies to')
            .setRequired(true)
            .addChoices(...LOG_TYPE_CHOICES)
        )
        .addStringOption(opt =>
          opt.setName('pattern').setDescription('Plain text pattern to match (case-insensitive)').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('solution').setDescription('Human-written solution text').setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('severity')
            .setDescription('Severity level (default: critical)')
            .addChoices(
              { name: 'Critical', value: 'critical' },
              { name: 'Warning', value: 'warning' },
              { name: 'Info', value: 'info' }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('recommendation')
            .setDescription('Recommended action channel (optional)')
            .addChoices(...RECOMMENDATION_CHOICES)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List all crash rules')
        .addStringOption(opt =>
          opt
            .setName('log_type')
            .setDescription('Filter by log type (optional)')
            .addChoices(...LOG_TYPE_CHOICES)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a crash rule by ID')
        .addStringOption(opt =>
          opt.setName('id').setDescription('Rule ID to remove').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('View full details of a specific rule')
        .addStringOption(opt =>
          opt.setName('id').setDescription('Rule ID to inspect').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const name = interaction.options.getString('name');
      const logType = interaction.options.getString('log_type');
      const pattern = interaction.options.getString('pattern');
      const solution = interaction.options.getString('solution');
      const severity = interaction.options.getString('severity') || 'critical';
      const recommendationRaw = interaction.options.getString('recommendation') || null;
      const recommendation = (recommendationRaw === 'none' || !recommendationRaw) ? null : recommendationRaw;

      const kb = loadKnowledge();
      const id = generateRuleId(logType, name);

      const links = [];
      if (recommendation && kb.channels[recommendation]) {
        links.push({ label: RECOMMENDATION_LABELS[recommendation], channelId: kb.channels[recommendation] });
      }

      const newRule = {
        id,
        logType,
        name,
        severity,
        patterns: [pattern],
        matchMode: 'any',
        solution,
        recommendation,
        links,
        addedBy: interaction.user.id,
        addedAt: new Date().toISOString().slice(0, 10),
      };

      kb.rules.push(newRule);
      saveKnowledge(kb);

      logger.info(`[CRASHRULE] Rule added: ${id} by ${interaction.user.tag}`);

      const severityIcon = severity === 'critical' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️';
      const embed = new EmbedBuilder()
        .setTitle('✅ Crash Rule Added')
        .setColor(0x00bb55)
        .setTimestamp()
        .addFields(
          { name: 'ID', value: id, inline: false },
          { name: 'Name', value: `${severityIcon} ${name}`, inline: true },
          { name: 'Log Type', value: logType, inline: true },
          { name: 'Severity', value: severity, inline: true },
          { name: 'Pattern', value: `\`${pattern}\``, inline: false },
          { name: 'Solution', value: solution.slice(0, 1024), inline: false }
        );

      if (recommendation) {
        embed.addFields({ name: 'Recommendation', value: RECOMMENDATION_LABELS[recommendation] || recommendation, inline: true });
      }

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'list') {
      const logTypeFilter = interaction.options.getString('log_type') || null;
      const kb = loadKnowledge();
      let rules = kb.rules;
      if (logTypeFilter) rules = rules.filter(r => r.logType === logTypeFilter);

      if (rules.length === 0) {
        await interaction.reply({
          content: logTypeFilter
            ? `No rules found for log type \`${logTypeFilter}\`.`
            : 'No crash rules defined yet.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const lines = rules.map(r => {
        const icon = r.severity === 'critical' ? '❌' : r.severity === 'warning' ? '⚠️' : 'ℹ️';
        return `${icon} \`${r.id}\` — **${r.name}** [\`${r.logType}\`]`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`📋 Crash Rules${logTypeFilter ? ` — ${logTypeFilter}` : ''}`)
        .setColor(0x38628e)
        .setDescription(lines.join('\n').slice(0, 4096))
        .setFooter({ text: `${rules.length} rule(s)` });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'remove') {
      const ruleId = interaction.options.getString('id');
      const kb = loadKnowledge();
      const idx = kb.rules.findIndex(r => r.id === ruleId);
      if (idx === -1) {
        await interaction.reply({
          content: `❌ No rule found with ID \`${ruleId}\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const removed = kb.rules.splice(idx, 1)[0];
      saveKnowledge(kb);

      logger.info(`[CRASHRULE] Rule removed: ${ruleId} by ${interaction.user.tag}`);

      await interaction.reply({
        content: `✅ Rule **${removed.name}** (\`${ruleId}\`) removed.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'info') {
      const ruleId = interaction.options.getString('id');
      const kb = loadKnowledge();
      const rule = kb.rules.find(r => r.id === ruleId);
      if (!rule) {
        await interaction.reply({
          content: `❌ No rule found with ID \`${ruleId}\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const severityIcon = rule.severity === 'critical' ? '❌' : rule.severity === 'warning' ? '⚠️' : 'ℹ️';
      const embed = new EmbedBuilder()
        .setTitle(`Rule: ${rule.name}`)
        .setColor(rule.severity === 'critical' ? 0xff0000 : rule.severity === 'warning' ? 0xff8c00 : 0x38628e)
        .setTimestamp()
        .addFields(
          { name: 'ID', value: rule.id, inline: false },
          { name: 'Log Type', value: rule.logType, inline: true },
          { name: 'Severity', value: `${severityIcon} ${rule.severity}`, inline: true },
          { name: 'Match Mode', value: rule.matchMode, inline: true },
          { name: 'Patterns', value: rule.patterns.map(p => `\`${p}\``).join('\n'), inline: false },
          { name: 'Solution', value: rule.solution.slice(0, 1024), inline: false }
        );

      if (rule.recommendation) {
        embed.addFields({ name: 'Recommendation', value: RECOMMENDATION_LABELS[rule.recommendation] || rule.recommendation, inline: true });
      }
      if (rule.links && rule.links.length > 0) {
        embed.addFields({ name: 'Links', value: rule.links.map(l => `<#${l.channelId}>`).join('\n'), inline: true });
      }
      embed.addFields(
        { name: 'Added By', value: `<@${rule.addedBy}>`, inline: true },
        { name: 'Added At', value: rule.addedAt, inline: true }
      );

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }
  },
};
