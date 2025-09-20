const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { OpenAI } = require('openai');

const QNA_INPUT_FILE = path.resolve(__dirname, '../data/support_qna.json');
const QNA_OUTPUT_FILE = path.resolve(__dirname, '../data/support_qna_embedded.json');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-ada-002';
const BATCH_SIZE = 10;
const SLEEP_MS = 200;
const DECIMALS = 4;

// Helper to write valid JSON array as a stream
async function writeStreamingJSONArray(pairs, isFirstBatch) {
  const data = pairs.map(pair => JSON.stringify(pair)).join(',\n');
  if (isFirstBatch) {
    await fsp.writeFile(QNA_OUTPUT_FILE, '[\n' + data, 'utf-8');
  } else {
    await fsp.appendFile(QNA_OUTPUT_FILE, ',\n' + data, 'utf-8');
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed_qna_streaming')
    .setDescription('Embed support Q&A pairs for semantic search (admin, streaming/low RAM)'),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: "You must be an admin to run this command.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: "Starting streaming embedding of Q&A pairs. This may take a while...", ephemeral: true });

    if (!OPENAI_API_KEY) {
      await interaction.followUp({ content: "OPENAI_API_KEY is not set in the environment!", ephemeral: true });
      return;
    }
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Load QnA data
    let qnaPairs = [];
    try {
      const raw = await fsp.readFile(QNA_INPUT_FILE, 'utf-8');
      qnaPairs = JSON.parse(raw);
    } catch (e) {
      await interaction.followUp({ content: "Could not read input QnA file!", ephemeral: true });
      return;
    }

    let total = qnaPairs.length;
    await fsp.writeFile(QNA_OUTPUT_FILE, '', 'utf-8'); // Start fresh output
    let isFirstBatch = true;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = qnaPairs.slice(i, i + BATCH_SIZE);
      const questions = batch.map(p => p.question);

      try {
        const resp = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: questions
        });
        for (let j = 0; j < batch.length; j++) {
          batch[j] = {
            question: batch[j].question,
            answer: batch[j].answer,
            question_embedding: resp.data[j].embedding.map(f => Number(f.toFixed(DECIMALS)))
          };
        }
        await writeStreamingJSONArray(batch, isFirstBatch);
        isFirstBatch = false;
        await interaction.followUp({
          content: `Embedded batch ${i + 1} to ${i + batch.length} / ${total}`,
          ephemeral: true
        });
      } catch (err) {
        await interaction.followUp({
          content: `Error embedding batch starting at ${i}: ${err.message || err}`,
          ephemeral: true
        });
      }
      await new Promise(res => setTimeout(res, SLEEP_MS));
    }
    // Finish the JSON array
    await fsp.appendFile(QNA_OUTPUT_FILE, '\n]\n', 'utf-8');
    await interaction.followUp({ content: "Streaming embedding complete. Output is a valid JSON array.", ephemeral: true });
  }
};
