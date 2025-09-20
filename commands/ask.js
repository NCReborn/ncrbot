const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs').promises;
const { OpenAI } = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-ada-002';
const QNA_FILE = 'data/support_qna_embedded.json';
const COSINE_THRESHOLD = 0.80; // Adjust as needed

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function cosineSimilarity(vecA, vecB) {
  let dot = 0.0, aNorm = 0.0, bNorm = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    aNorm += vecA[i] * vecA[i];
    bNorm += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask a question and get a staff answer if available.')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Your question')
        .setRequired(true)
    ),
  async execute(interaction) {
    try {
      const userQuestion = interaction.options.getString('question');
      await interaction.deferReply();

      // Get embedding for user question
      const embedResult = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: userQuestion,
      });
      const userEmbedding = embedResult.data[0].embedding;

      // Load staff Q&A embeddings
      const qnaRaw = await fs.readFile(QNA_FILE, 'utf-8');
      const qnaPairs = JSON.parse(qnaRaw);

      // Find best match by cosine similarity
      let best = null;
      let bestScore = -1;
      for (const pair of qnaPairs) {
        const sim = cosineSimilarity(userEmbedding, pair.question_embedding);
        if (sim > bestScore) {
          bestScore = sim;
          best = pair;
        }
      }

      if (bestScore >= COSINE_THRESHOLD) {
        await interaction.editReply({
          content: `**(Staff Answer)**\n**Q:** ${userQuestion}\n**A:** ${best.answer}\n*Matched on: "${best.question}" (similarity: ${(bestScore*100).toFixed(1)}%)*`
        });
      } else {
        await interaction.editReply({
          content: `Sorry, I couldn't find a staff answer for that yet. Please ask in <#1285796905640788030>.`
        });
      }
    } catch (err) {
      console.error('Error in /ask command:', err);
      try {
        await interaction.editReply({
          content: "There was an error executing this command!"
        });
      } catch (editErr) {
        console.error('Failed to edit reply:', editErr);
      }
    }
  }
};
