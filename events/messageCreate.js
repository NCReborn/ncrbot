// Listens for messages in the FAQ management channel and in support channels.
// - Parses FAQ entries when new/edited messages appear in FAQ channel
// - Matches user questions in support channels, DMs answers, and logs to mod channel

const { parseFAQMessage } = require('../faq/parser');
const { getFAQs, setFAQs, loadFAQs } = require('../faq/store');
const { findFAQMatch, refreshMatcher } = require('../faq/matcher');

// CONFIGURE THESE
const FAQ_CHANNEL_ID = 'YOUR_FAQ_CHANNEL_ID';         // Replace with your FAQ channel ID
const SUPPORT_CHANNEL_IDS = ['SUPPORT_CHANNEL_ID_1', 'SUPPORT_CHANNEL_ID_2']; // Add all your support channels here
const MOD_LOG_CHANNEL_ID = 'YOUR_MOD_LOG_CHANNEL_ID'; // Replace with your mod-log channel ID

// Called in your main bot setup: client.on('messageCreate', onMessageCreate);
async function onMessageCreate(message) {
    if (message.author.bot) return;

    // 1. Handle FAQ channel entries
    if (message.channel.id === FAQ_CHANNEL_ID) {
        // Reload all messages from the FAQ channel
        const fetched = await message.channel.messages.fetch({ limit: 100 }); // Adjust limit if needed
        const allFAQs = [];
        for (const [_, msg] of fetched) {
            const faq = parseFAQMessage(msg.content);
            if (faq) allFAQs.push(faq);
        }
        setFAQs(allFAQs);
        refreshMatcher();
        return;
    }

    // 2. Handle support channel questions
    if (SUPPORT_CHANNEL_IDS.includes(message.channel.id)) {
        const match = findFAQMatch(message.content);
        if (match) {
            try {
                // DM the user with the FAQ answer
                await message.author.send(`**FAQ Match:**\n${match.answer}`);

                // Log to mod log channel
                const logChannel = await message.client.channels.fetch(MOD_LOG_CHANNEL_ID);
                await logChannel.send(
                    `📚 FAQ matched for <@${message.author.id}> in <#${message.channel.id}>:\n` +
                    `**Q:** ${message.content}\n**A:** ${match.answer}`
                );
            } catch (err) {
                console.error('Failed to DM user or log FAQ match:', err);
            }
        }
    }
}

module.exports = { onMessageCreate };
