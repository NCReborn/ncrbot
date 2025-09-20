const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getOpenAIAnswer(question) {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: question }
      ],
      max_completion_tokens: 500 
    });
    console.dir(response, { depth: 10 }); // This will help you debug the full response structure
    const answer = response.choices?.[0]?.message?.content;
    console.log('Extracted AI answer:', answer);
    return answer?.trim() || "Sorry, I couldn't generate an answer.";
  } catch (err) {
    console.error('OpenAI error:', err);
    return "Sorry, I couldn't generate an answer.";
  }
}

module.exports = { getOpenAIAnswer };
