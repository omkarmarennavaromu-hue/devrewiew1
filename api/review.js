import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://your-site.vercel.app",
    "X-Title": "DevReview"
  }
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { language, code } = req.body;

    const prompt = `You are a senior code reviewer...
Language: ${language}
Code:
${code}`;

    const completion = await client.chat.completions.create({
      model: "qwen/qwen-2.5-72b-instruct",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    const review = completion.choices[0].message.content;

    res.status(200).json({ review });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
