const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getOpenAIAnswer(question) {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant. If the question is about the NCReborn collection or community, use a helpful and friendly tone.' },
        { role: 'user', content: question }
      ],
      max_completion_tokens: 200
    });
    // Debug: Uncomment the next line if you want to log the full response
    // console.dir(response, { depth: 10 });
    const answer = response.choices?.[0]?.message?.content;
    if (!answer || answer.trim() === '') {
      return "Sorry, I couldn't generate an answer. The AI may not know about this topic, or the question may be unclear. Try rephrasing, or ask in <#1285796905640788030>.";
    }
    return answer.trim();
  } catch (err) {
    console.error('OpenAI error:', err);
    return "Sorry, there was a problem generating an AI answer. Please try again later.";
  }
}

module.exports = { getOpenAIAnswer };
