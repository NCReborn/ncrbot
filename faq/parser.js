// Parses FAQ entries from messages in the FAQ channel.
// Expected format:
// Trigger: trigger phrase 1, trigger phrase 2, ...
// Answer: The answer, can be multiline.

function parseFAQMessage(content) {
    const triggerMatch = content.match(/^Trigger:\s*(.+)$/im);
    const answerMatch = content.match(/^Answer:\s*([\s\S]+)$/im);

    if (!triggerMatch || !answerMatch) return null;

    const triggers = triggerMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const answer = answerMatch[1].trim();

    if (triggers.length === 0 || !answer) return null;

    return { triggers, answer };
}

module.exports = { parseFAQMessage };
