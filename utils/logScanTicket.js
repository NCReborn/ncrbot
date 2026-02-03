const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  EmbedBuilder,
} = require('discord.js');
const { analyzeLogForErrors, buildErrorEmbed } = require('./logAnalyzer');
const logger = require('./logger'); // <-- Use logger for warnings/errors/info
const CONSTANTS = require('../config/constants');

// 15 second cooldown in milliseconds (use constant if available)
const LOG_SCAN_COOLDOWN = CONSTANTS.COOLDOWNS.LOG_SCAN;
const userScanCooldowns = new Map();

/**
 * Delete all previous "Scan a Log File" button messages from the channel.
 * Looks for bot messages with a button with customId 'log_scan_ticket'.
 * @param {TextChannel} channel
 */
async function deletePreviousLogScanButtons(channel) {
  // Fetch up to 50 messages (increase if needed)
  const messages = await channel.messages.fetch({ limit: 50 });
  const botMessages = messages.filter(
    (m) =>
      m.author.bot &&
      m.components.length > 0 &&
      m.components[0].components.some(
        (c) => (c.data?.custom_id || c.customId) === 'log_scan_ticket'
      )
  );
  for (const msg of botMessages.values()) {
    try {
      await msg.delete();
      logger.info(`[LOGSCAN] Deleted previous log scan button message (ID: ${msg.id})`);
    } catch (err) {
      // Ignore if already deleted or missing permissions
      logger.warn(`[LOGSCAN] Failed to delete previous log scan button: ${err.message}`);
    }
  }
}

/**
 * Sends a polished embed + scan button to the specified channel.
 * Deletes previous buttons before sending the new one.
 * @param {Client} client - The Discord.js client instance
 * @param {string} channelId - Channel ID to send the embed/button to
 */
async function sendLogScanButton(client, channelId) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      logger.error('[LOGSCAN] Channel not found or not text-based.');
      return;
    }

    // Delete any previous log scan button messages
    await deletePreviousLogScanButtons(channel);

    const embed = new EmbedBuilder()
      .setColor(0x38628E)
      .setTitle('📝 Submit Crashlogs Here')
      .setDescription(
        `**How to use the NCReborn Utilities Bot:**\n\n` +
          `• Use the **button below** to paste your crashlog. The bot will scan and give feedback on potential issues.\n\n` +
          `• Please only post the lower sections of your crashfiles. (Typically with stuff like [warn] or [error]) don't paste the entire thing as it will likely go over the 4000 character limit\n\n` +
          `• If your log is too large to paste (over 4000 characters), upload it as a \`.log\` or \`.txt\` file to <#${CONSTANTS.CHANNELS.CRASH_LOG}> and the bot will scan it automatically.\n\n` +
          `*ℹ️ This bot is in BETA. Its recommendations are based on previous logs and manual input from mquiny. For more help, see <#1285796905640788030>.*`
      )
      .setFooter({
        text: 'NCReborn Utilities • Log Scanner Beta',
        iconURL: null,
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('log_scan_ticket')
        .setLabel('Scan a Log File')
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
      embeds: [embed],
      components: [row],
    });
    logger.info('[LOGSCAN] Log scan ticket embed/button sent.');
  } catch (error) {
    logger.error('[LOGSCAN] Failed to send log scan ticket embed/button:', error);
  }
}

/**
 * Handles interactionCreate for log scan ticket (button + modal).
 * Call this from your main index.js interactionCreate listener.
 * Will handle both button and modal interactions.
 * @param {Interaction} interaction
 */
async function handleLogScanTicketInteraction(interaction) {
  // Button: Show modal
  if (interaction.isButton() && interaction.customId === 'log_scan_ticket') {
    const userId = interaction.user.id;
    const now = Date.now();
    const lastUsed = userScanCooldowns.get(userId) || 0;
    if (now - lastUsed < LOG_SCAN_COOLDOWN) {
      const seconds = Math.ceil(
        (LOG_SCAN_COOLDOWN - (now - lastUsed)) / 1000
      );
      logger.info(`[LOGSCAN] Cooldown hit by ${interaction.user.tag} (${interaction.user.id}) (${seconds}s left)`);
      await interaction.reply({
        content: `You are on cooldown for log analysis. Please wait ${seconds} more second(s).`,
        ephemeral: true,
      });
      return;
    }
    // Show modal
    logger.info(`[LOGSCAN] Modal shown to ${interaction.user.tag} (${interaction.user.id})`);
    const modal = new ModalBuilder()
      .setCustomId('log_scan_modal')
      .setTitle('Paste your log file here');
    const logInput = new TextInputBuilder()
      .setCustomId('log_content')
      .setLabel('Log File Content')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(4000)
      .setPlaceholder('Paste your log here (max 4000 characters)')
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(logInput));
    await interaction.showModal(modal);
    return;
  }

  // Modal: Analyze log and respond
  if (
    interaction.type === InteractionType.ModalSubmit &&
    interaction.customId === 'log_scan_modal'
  ) {
    const userId = interaction.user.id;
    userScanCooldowns.set(userId, Date.now());
    const logContent = interaction.fields.getTextInputValue('log_content');
    // If the log is too long, do not analyze, only show error
    if (logContent.length >= 4000) {
      logger.warn(`[LOGSCAN] Log too long from ${interaction.user.tag} (${interaction.user.id}) via modal`);
      await interaction.reply({
        content:
          `❌ Your log was over 4000 characters and was truncated by discord rate limits. For full analysis, upload the log file as an attachment in <#${CONSTANTS.CHANNELS.CRASH_LOG}> instead, or trim your post down to only include the [errors]. ❌`,
        ephemeral: true,
      });
      return;
    }
    // Analyze as normal
    logger.info(`[LOGSCAN] Log scan modal analysis by ${interaction.user.tag} (${interaction.user.id})`);
    const analysisResult = await analyzeLogForErrors(logContent);
    const attachmentObj = { name: 'User Submitted Log', url: '' };
    const embed = buildErrorEmbed(
      attachmentObj,
      analysisResult,
      logContent,
      ''
    );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }
}

module.exports = {
  sendLogScanButton,
  handleLogScanTicketInteraction,
};
