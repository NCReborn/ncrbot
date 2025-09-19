const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Store this in a DB or cache in production!
let faqs = [
  // Example:
  // { question: "How do I reset my password?", answer: "Go to settings > reset password.", embedding: [/* numbers */] }
];
// You should load your actual FAQ list here.
async function setFAQsWithEmbeddings(faqList) {
  // Call only once or when FAQ list updates
  const questions = faqList.map(f => f.question);
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small", // Cheap and accurate
    input: questions,
  });
  faqs = faqList.map((f, i) => ({
    ...f,
    embedding: response.data[i].embedding,
  }));
}

// Cosine similarity between two vectors
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Find best FAQ match for a user question
async function findFAQMatchWithEmbeddings(userQuestion, threshold = 0.80) {
  if (!faqs.length) return null;
  const embedResp = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: [userQuestion],
  });
  const userEmbedding = embedResp.data[0].embedding;

  let bestSim = -1;
  let bestFAQ = null;
  for (const faq of faqs) {
    const sim = cosineSimilarity(userEmbedding, faq.embedding);
    if (sim > bestSim) {
      bestSim = sim;
      bestFAQ = faq;
    }
  }
  if (bestSim >= threshold) {
    return { ...bestFAQ, similarity: bestSim };
  }
  return null;
}

module.exports = {
  setFAQsWithEmbeddings,
  findFAQMatchWithEmbeddings,
};
