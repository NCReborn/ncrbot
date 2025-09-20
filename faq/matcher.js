const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let faqs = [];
async function setFAQsWithEmbeddings(faqList) {
  const questions = faqList.map(f => f.question);
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: questions,
  });
  faqs = faqList.map((f, i) => ({
    ...f,
    embedding: response.data[i].embedding,
  }));
}
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
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

// Optionally implement this if you need to refresh/reload matcher state in your bot
function refreshMatcher() {}

module.exports = {
  setFAQsWithEmbeddings,
  findFAQMatchWithEmbeddings,
  findFAQMatch: findFAQMatchWithEmbeddings, // alias for compatibility
  refreshMatcher,
};
