const { parseFAQMessage } = require('../faq/parser');
const { getFAQs, setFAQs, loadFAQs } = require('../faq/store');
const { findFAQMatch, refreshMatcher } = require('../faq/matcher');

const FAQ_CHANNEL_ID = '1418730986598043659';
const ASK_CHANNEL_ID = '1418742976871399456'; // <-- Only FAQ in /ask
const MOD_LOG_CHANNEL_ID = '1406048032457359481';

async function onMessageCreate(message) {
    if (message.author.bot) return;

    // 1. Handle FAQ channel entries
    if (message.channel.id === FAQ_CHANNEL_ID) {
        const fetched = await message.channel.messages.fetch({ limit: 100 });
        const allFAQs = [];
        for (const [_, msg] of fetched) {
            const faq = parseFAQMessage(msg.content);
            if (faq) allFAQs.push(faq);
        }
        setFAQs(allFAQs);
        refreshMatcher();
        return;
    }

    // 2. Only handle FAQ autorespond in /ask channel
    if (message.channel.id === ASK_CHANNEL_ID) {
        const faqs = getFAQs();
        const match = findFAQMatch(message.content, faqs);
        if (match && match.answer) {
            try {
                await message.reply(`**FAQ Match:**\n${match.answer}`);
                const logChannel = await message.client.channels.fetch(MOD_LOG_CHANNEL_ID);
                await logChannel.send(
                    `📚 FAQ matched for <@${message.author.id}> in <#${message.channel.id}>:\n` +
                    `**Q:** ${message.content}\n**A:** ${match.answer}`
                );
            } catch (err) {
                console.error('Failed to reply in channel or log FAQ match:', err);
            }
        }
    }
}

module.exports = { onMessageCreate };
