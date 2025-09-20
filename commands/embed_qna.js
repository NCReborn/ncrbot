const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { OpenAI } = require('openai');

const QNA_INPUT_FILE = path.resolve(__dirname, '../data/support_qna.json');
const QNA_OUTPUT_FILE = path.resolve(__dirname, '../data/support_qna_embedded.json');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-ada-002';
const BATCH_SIZE = 10; // Adjust as needed
const SLEEP_MS = 200; // Adjust as needed

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed_qna')
    .setDescription('Embed support Q&A pairs for semantic search (admin only)'),
  async execute(interaction) {
    // Admin check
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: "You must be an admin to run this command.", ephemeral: true });
      return;
    }

    await interaction.reply({ content: "Starting embedding of Q&A pairs. This may take a while...", ephemeral: true });

    if (!OPENAI_API_KEY) {
      await interaction.followUp({ content: "OPENAI_API_KEY is not set in the environment!", ephemeral: true });
      return;
    }
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Load QnA data
    let qnaPairs = [];
    try {
      const raw = await fs.readFile(QNA_INPUT_FILE, 'utf-8');
      qnaPairs = JSON.parse(raw);
    } catch (e) {
      await interaction.followUp({ content: "Could not read input QnA file!", ephemeral: true });
      return;
    }

    // Try to resume from previous progress
    let outputPairs = [];
    try {
      const raw = await fs.readFile(QNA_OUTPUT_FILE, 'utf-8');
      outputPairs = JSON.parse(raw);
    } catch {
      outputPairs = [];
    }
    // Map for fast lookup
    const outputMap = new Map(outputPairs.map(pair => [pair.question_id, pair]));

    let toEmbed = [];
    for (const pair of qnaPairs) {
      if (outputMap.has(pair.question_id) && outputMap.get(pair.question_id).question_embedding) {
        continue; // Already embedded
      }
      toEmbed.push(pair);
    }

    await interaction.followUp({
      content: `Total QnA pairs: ${qnaPairs.length}\nAlready embedded: ${outputPairs.length}\nTo embed now: ${toEmbed.length}`,
      ephemeral: true
    });

    for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
      const batch = toEmbed.slice(i, i + BATCH_SIZE);
      const questions = batch.map(p => p.question);

      try {
        const resp = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: questions
        });
        for (let j = 0; j < batch.length; j++) {
          batch[j].question_embedding = resp.data[j].embedding;
          outputMap.set(batch[j].question_id, batch[j]);
        }
        await interaction.followUp({
          content: `Embedded batch ${i + 1} to ${i + batch.length} / ${toEmbed.length}`,
          ephemeral: true
        });
      } catch (err) {
        await interaction.followUp({
          content: `Error embedding batch starting at ${i}: ${err.message || err}`,
          ephemeral: true
        });
      }
      await fs.writeFile(QNA_OUTPUT_FILE, JSON.stringify(Array.from(outputMap.values()), null, 2), 'utf-8');
      await sleep(SLEEP_MS);
    }

    await interaction.followUp({ content: "Embedding complete.", ephemeral: true });
  }
};
