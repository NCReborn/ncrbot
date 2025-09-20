const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Store your key in an environment variable!
});

async function getOpenAIAnswer(prompt) {
  const response = await openai.chat.completions.create({
    model: 'gpt-5-nano', // or 'gpt-5-nano' if available
    messages: [
      { role: "system", content: "You are a helpful Discord support assistant." },
      { role: "user", content: prompt }
    ],
 max_completion_tokens: 500, 
  });

  return response.choices[0]?.message?.content?.trim() || "Sorry, I couldn't generate an answer.";
}

module.exports = { getOpenAIAnswer };
