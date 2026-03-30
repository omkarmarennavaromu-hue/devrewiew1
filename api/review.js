/**
 * DevReview — API Backend (Node.js)
 * Route: POST /api/review
 * Uses: Qwen AI via OpenAI-compatible API (Alibaba Cloud DashScope)
 *
 * Install deps:
 *   npm install express cors openai dotenv
 *
 * .env file:
 *   DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxx
 *   PORT=3001
 *
 * Run:
 *   node api/review.js
 *
 * If you are using a framework like Next.js, rename this file to
 *   pages/api/review.js  OR  app/api/review/route.js
 * and adjust the export format accordingly (see bottom of file).
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const OpenAI  = require('openai');

const app  = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Qwen client (OpenAI-compatible) ──────────────────────────────────────────
const qwen = new OpenAI({
  apiKey:  process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
});

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPrompt(language, code) {
  return `You are an expert code reviewer. Analyze the following ${language} code and return your review as a JSON object with EXACTLY these five keys:

{
  "bugs":        "...",
  "security":    "...",
  "performance": "...",
  "clean":       "...",
  "rewrite":     "..."
}

Rules:
- "bugs":        List every bug, logic error, null/undefined risk, and exception. One issue per line. Start each line with • and include the line number if possible.
- "security":    List every security vulnerability (injection, secrets, insecure APIs, etc.). One issue per line, starting with •.
- "performance": List every performance issue (O(n²), memory leaks, redundant calls, etc.). One issue per line, starting with •.
- "clean":       List code quality improvements (naming, structure, readability, best practices). One issue per line, starting with •.
- "rewrite":     Provide the complete rewritten version of the code — clean, idiomatic, production-ready ${language}. Include all the original logic but fixed and improved. Return only the code, no explanation.

If there are no issues in a category, write: "— No issues found."
Return ONLY valid JSON. No markdown, no backticks, no extra text outside the JSON object.

Code to review:
\`\`\`${language}
${code}
\`\`\``;
}

// ── POST /api/review ──────────────────────────────────────────────────────────
app.post('/api/review', async (req, res) => {
  const { language, code } = req.body;

  if (!language || !code || !code.trim()) {
    return res.status(400).json({ error: 'Missing "language" or "code" in request body.' });
  }

  if (code.length > 20000) {
    return res.status(400).json({ error: 'Code exceeds maximum length of 20,000 characters.' });
  }

  try {
    const completion = await qwen.chat.completions.create({
      model: 'qwen-plus',           // or qwen-turbo / qwen-max
      messages: [
        {
          role: 'system',
          content: 'You are a senior software engineer and security expert. You return only valid JSON with no extra text.'
        },
        {
          role: 'user',
          content: buildPrompt(language, code)
        }
      ],
      temperature: 0.2,
      max_tokens:  3000,
    });

    const raw = completion.choices[0].message.content.trim();

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/,'').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // If Qwen didn't return valid JSON, wrap it
      parsed = {
        bugs:        '— Parse error: see raw output.',
        security:    '— Parse error: see raw output.',
        performance: '— Parse error: see raw output.',
        clean:       '— Parse error: see raw output.',
        rewrite:     raw,
      };
    }

    // Ensure all keys exist
    const result = {
      bugs:        parsed.bugs        || '— No issues found.',
      security:    parsed.security    || '— No issues found.',
      performance: parsed.performance || '— No issues found.',
      clean:       parsed.clean       || '— No suggestions.',
      rewrite:     parsed.rewrite     || '— No rewrite provided.',
    };

    return res.status(200).json(result);

  } catch (err) {
    console.error('[DevReview API Error]', err.message);
    return res.status(500).json({
      error: 'AI review failed.',
      detail: err.message,
    });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: 'qwen-plus', timestamp: new Date().toISOString() });
});

// ── Static files (serve index.html + review.html from root) ───────────────────
const path = require('path');
app.use(express.static(path.join(__dirname, '..')));

app.listen(port, () => {
  console.log(`\n  ◆ DevReview API running at http://localhost:${port}`);
  console.log(`  ✓ POST /api/review   — code review endpoint`);
  console.log(`  ✓ GET  /api/health   — health check\n`);
});


// ─────────────────────────────────────────────────────────────────────────────
// NEXT.JS App Router version (app/api/review/route.js):
// ─────────────────────────────────────────────────────────────────────────────
//
// import OpenAI from 'openai';
// import { NextResponse } from 'next/server';
//
// const qwen = new OpenAI({
//   apiKey:  process.env.DASHSCOPE_API_KEY,
//   baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
// });
//
// export async function POST(req) {
//   const { language, code } = await req.json();
//   // ... same logic as above ...
//   return NextResponse.json(result);
// }
//
// ─────────────────────────────────────────────────────────────────────────────
// NEXT.JS Pages Router version (pages/api/review.js):
// ─────────────────────────────────────────────────────────────────────────────
//
// export default async function handler(req, res) {
//   if (req.method !== 'POST') return res.status(405).end();
//   // ... same logic as above ...
// }
