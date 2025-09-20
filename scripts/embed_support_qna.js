const fs = require('fs').promises;
const { OpenAI } = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Set this in your environment
const EMBEDDING_MODEL = 'text-embedding-ada-002';
const INPUT_FILE = 'support_qna.json';
const OUTPUT_FILE = 'support_qna_embedded.json';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function embedQuestions() {
  const raw = await fs.readFile(INPUT_FILE, 'utf-8');
  const qnaPairs = JSON.parse(raw);

  const embeddedPairs = [];

  for (let i = 0; i < qnaPairs.length; i++) {
    const pair = qnaPairs[i];
    try {
      // Get embedding for the question
      const embeddingResult = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: pair.question,
      });
      const embedding = embeddingResult.data[0].embedding;

      embeddedPairs.push({
        ...pair,
        question_embedding: embedding,
      });

      // Print progress
      if ((i + 1) % 10 === 0 || i === qnaPairs.length - 1) {
        console.log(`Embedded ${i + 1} / ${qnaPairs.length}`);
      }

      // Rate limit: sleep for 100ms between requests to be safe
      await new Promise(res => setTimeout(res, 100));
    } catch (err) {
      console.error(`Embedding failed for question ${i}:`, err);
    }
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(embeddedPairs, null, 2), 'utf-8');
  console.log(`Wrote embeddings for ${embeddedPairs.length} Q&A pairs to ${OUTPUT_FILE}`);
}

embedQuestions().catch(err => {
  console.error(err);
  process.exit(1);
});
