const RESTRICTED_CHANNEL_IDS = new Set([
  '1286080675119632394',
  '1299136815835648010',
]);

const DISCUSSION_CHANNEL_ID = '1529058366293409914';
const STAFF_ROLE_ID = '1288633895910375464';
const NEXUS_LINK_REGEX = /https?:\/\/(?:www\.)?nexusmods\.com\/[^\s]+/i;
const QUOTE_LINE_REGEX = /^>\s?.+/m;

function hasNexusLink(message) {
  if (NEXUS_LINK_REGEX.test(message?.content || '')) {
    return true;
  }

  for (const embed of message?.embeds || []) {
    if (
      NEXUS_LINK_REGEX.test(embed?.url || '') ||
      NEXUS_LINK_REGEX.test(embed?.description || '')
    ) {
      return true;
    }
  }

  for (const attachment of message?.attachments?.values?.() || []) {
    if (
      NEXUS_LINK_REGEX.test(attachment?.url || '') ||
      NEXUS_LINK_REGEX.test(attachment?.proxyURL || '')
    ) {
      return true;
    }
  }

  return false;
}

function isReplyOrQuote(message) {
  const isReply = Boolean(message?.reference?.messageId || message?.reference?.message_id);
  const hasQuoteLine = QUOTE_LINE_REGEX.test(message?.content || '');

  return isReply || hasQuoteLine;
}

async function handleModRequestModeration(message) {
  try {
    if (!message?.guild || message?.author?.bot || message?.webhookId) {
      return;
    }

    if (!RESTRICTED_CHANNEL_IDS.has(message.channelId)) {
      return;
    }

    if (message?.member?.roles?.cache?.has(STAFF_ROLE_ID)) {
      return;
    }

    const containsNexusLink = hasNexusLink(message);
    const replyOrQuote = isReplyOrQuote(message);

    if (containsNexusLink && !replyOrQuote) {
      return;
    }

    await message.delete().catch(() => null);

    const warning = await message.channel.send({
      content: `${message.author}, this channel is only for Nexus mod request/removal links (brief summary is okay). Please move discussion and replies to <#${DISCUSSION_CHANNEL_ID}>.`,
      allowedMentions: {
        users: [message.author.id],
      },
    }).catch(() => null);

    if (!warning) {
      return;
    }

    setTimeout(() => {
      warning.delete().catch(() => null);
    }, 30_000);
  } catch (error) {
    console.error('[MOD_REQUEST_GUARD] Error:', error);
  }
}

module.exports = {
  handleModRequestModeration,
};
