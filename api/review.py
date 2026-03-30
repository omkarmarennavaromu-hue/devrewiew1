"""
DevReview — API Backend (Python / Flask)
Route: POST /api/review

Uses: Qwen AI via OpenAI-compatible SDK (Alibaba Cloud DashScope)

Install deps:
    pip install flask flask-cors openai python-dotenv

.env file:
    DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxx
    PORT=3001

Run:
    python api/review.py

The server will:
  - Serve index.html and review.html from the parent directory
  - Handle POST /api/review with { language, code } body
  - Return { bugs, security, performance, clean, rewrite } JSON
"""

import os
import json
import re
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='..')
CORS(app)

# ── Qwen client (OpenAI-compatible) ──────────────────────────────────────────
client = OpenAI(
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    base_url='https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
)

# ── Prompt builder ────────────────────────────────────────────────────────────
def build_prompt(language: str, code: str) -> str:
    return f"""You are an expert code reviewer. Analyze the following {language} code and return your review as a JSON object with EXACTLY these five keys:

{{
  "bugs":        "...",
  "security":    "...",
  "performance": "...",
  "clean":       "...",
  "rewrite":     "..."
}}

Rules:
- "bugs":        List every bug, logic error, null/undefined risk, and exception. One issue per line. Start each line with • and include the line number if possible.
- "security":    List every security vulnerability (injection, secrets, insecure APIs, etc.). One issue per line, starting with •.
- "performance": List every performance issue (O(n²), memory leaks, redundant calls, etc.). One issue per line, starting with •.
- "clean":       List code quality improvements (naming, structure, readability, best practices). One issue per line, starting with •.
- "rewrite":     Provide the complete rewritten version of the code — clean, idiomatic, production-ready {language}. Include all the original logic but fixed and improved. Return only the code, no explanation.

If there are no issues in a category, write: "— No issues found."
Return ONLY valid JSON. No markdown, no backticks, no extra text outside the JSON object.

Code to review:
```{language}
{code}
```"""


# ── POST /api/review ──────────────────────────────────────────────────────────
@app.route('/api/review', methods=['POST'])
def review():
    body = request.get_json(silent=True)

    if not body:
        return jsonify({'error': 'Invalid or missing JSON body.'}), 400

    language = body.get('language', '').strip()
    code     = body.get('code', '').strip()

    if not language or not code:
        return jsonify({'error': 'Missing "language" or "code" in request body.'}), 400

    if len(code) > 20000:
        return jsonify({'error': 'Code exceeds maximum length of 20,000 characters.'}), 400

    try:
        completion = client.chat.completions.create(
            model='qwen-plus',           # or qwen-turbo / qwen-max
            messages=[
                {
                    'role': 'system',
                    'content': 'You are a senior software engineer and security expert. You return only valid JSON with no extra text.'
                },
                {
                    'role': 'user',
                    'content': build_prompt(language, code)
                }
            ],
            temperature=0.2,
            max_tokens=3000,
        )

        raw = completion.choices[0].message.content.strip()

        # Strip accidental markdown fences
        cleaned = re.sub(r'^```json\s*', '', raw, flags=re.IGNORECASE)
        cleaned = re.sub(r'^```\s*',     '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'```\s*$',     '', cleaned).strip()

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            parsed = {
                'bugs':        '— Parse error: see raw output.',
                'security':    '— Parse error: see raw output.',
                'performance': '— Parse error: see raw output.',
                'clean':       '— Parse error: see raw output.',
                'rewrite':     raw,
            }

        result = {
            'bugs':        parsed.get('bugs',        '— No issues found.'),
            'security':    parsed.get('security',    '— No issues found.'),
            'performance': parsed.get('performance', '— No issues found.'),
            'clean':       parsed.get('clean',       '— No suggestions.'),
            'rewrite':     parsed.get('rewrite',     '— No rewrite provided.'),
        }

        return jsonify(result), 200

    except Exception as e:
        print(f'[DevReview API Error] {e}')
        return jsonify({'error': 'AI review failed.', 'detail': str(e)}), 500


# ── GET /api/health ───────────────────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    from datetime import datetime, timezone
    return jsonify({'status': 'ok', 'model': 'qwen-plus', 'timestamp': datetime.now(timezone.utc).isoformat()})


# ── Static file serving ───────────────────────────────────────────────────────
@app.route('/')
def serve_index():
    return send_from_directory('..', 'index.html')

@app.route('/review.html')
def serve_review():
    return send_from_directory('..', 'review.html')


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    port = int(os.getenv('PORT', 3001))
    print(f'\n  ◆ DevReview API running at http://localhost:{port}')
    print(f'  ✓ POST /api/review   — code review endpoint')
    print(f'  ✓ GET  /api/health   — health check\n')
    app.run(host='0.0.0.0', port=port, debug=False)
