const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getOpenAIAnswer(question) {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-nano',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: question }
      ],
      max_completion_tokens: 500,
      temperature: 0.7,
    });
    console.log('OpenAI response:', response);
    return response.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't generate an answer.";
  } catch (err) {
    console.error('OpenAI error:', err);
    return "Sorry, I couldn't generate an answer.";
  }
}

module.exports = { getOpenAIAnswer };
