import http from 'node:http';
import fs from 'node:fs';

// PROVIDER=anthropic (default) | openai  (OpenAI-compatible: Ollama, LM Studio, llama.cpp, vLLM, OpenRouter, Groq, ...)
const PROVIDER = (process.env.PROVIDER || 'anthropic').toLowerCase();
const KEY = process.env.ANTHROPIC_API_KEY;
const OA_BASE = (process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
const OA_KEY = process.env.OPENAI_API_KEY || 'ollama';
if (PROVIDER === 'anthropic' && !KEY) { console.error('ANTHROPIC_API_KEY is not set (or use PROVIDER=openai for a local/own model)'); process.exit(1); }
const MODEL = PROVIDER === 'openai'
  ? { default: process.env.MODEL || 'qwen2.5:14b', complex: process.env.MODEL_COMPLEX || process.env.MODEL || 'qwen2.5:14b', quick: process.env.MODEL || 'qwen2.5:14b' }
  : { default: process.env.MODEL || 'claude-sonnet-5-5', complex: process.env.MODEL_COMPLEX || 'claude-opus-5-5', quick: 'claude-haiku-5-5' };
const MAX_TOKENS = +process.env.MAX_TOKENS || (PROVIDER === 'openai' ? 8192 : 32000);
const RATE = +process.env.RATE_LIMIT_PER_MIN || 0; // 0 = no limit from this server
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/manifest.json': ['manifest.json', 'application/manifest+json'], '/sw.js': ['sw.js', 'text/javascript'],
  '/icon-192.png': ['icon-192.png', 'image/png'], '/icon-512.png': ['icon-512.png', 'image/png'], '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png']
};
const cache = Object.fromEntries(Object.entries(FILES).map(([u, [f, t]]) => [u, [fs.readFileSync(new URL('./' + f, import.meta.url)), t]]));
const hits = new Map();

// ---- Anthropic-style request -> OpenAI-compatible request
function toOpenAI(messages, tools) {
  const out = [];
  for (const m of messages) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue; }
    const parts = [], calls = [], results = [];
    for (const b of m.content || []) {
      if (b.type === 'text') parts.push({ type: 'text', text: b.text });
      else if (b.type === 'image') parts.push({ type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } });
      else if (b.type === 'tool_use') calls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } });
      else if (b.type === 'tool_result') results.push({ role: 'tool', tool_call_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) });
    }
    if (m.role === 'assistant') {
      const text = parts.map(p => p.text || '').join('');
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      out.push(...results);
      if (parts.length) out.push({ role: 'user', content: parts.every(p => p.type === 'text') ? parts.map(p => p.text).join('') : parts });
    }
  }
  return {
    messages: out,
    ...(tools?.length ? { tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema || { type: 'object', properties: {} } } })) } : {})
  };
}

// ---- OpenAI-compatible SSE -> Anthropic-style SSE (what index.html understands)
async function pipeOpenAI(up, res) {
  const send = ev => res.write('data: ' + JSON.stringify(ev) + '\n\n');
  let next = 0, textIdx = null, stop = 'end_turn', buf = '';
  const tools = {};
  const dec = new TextDecoder();
  for await (const chunk of up.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const ln of lines) {
      if (!ln.startsWith('data:')) continue;
      const d = ln.slice(5).trim(); if (!d || d === '[DONE]') continue;
      let j; try { j = JSON.parse(d); } catch { continue; }
      const ch = j.choices && j.choices[0]; if (!ch) continue;
      const dl = ch.delta || {};
      if (typeof dl.content === 'string' && dl.content) {
        if (textIdx === null) { textIdx = next++; send({ type: 'content_block_start', index: textIdx, content_block: { type: 'text', text: '' } }); }
        send({ type: 'content_block_delta', index: textIdx, delta: { type: 'text_delta', text: dl.content } });
      }
      for (const tc of dl.tool_calls || []) {
        const k = tc.index ?? 0;
        if (tools[k] === undefined) {
          tools[k] = next++;
          send({ type: 'content_block_start', index: tools[k], content_block: { type: 'tool_use', id: tc.id || 'call_' + Math.random().toString(36).slice(2), name: (tc.function && tc.function.name) || '', input: {} } });
        }
        const a = tc.function && tc.function.arguments;
        if (a) send({ type: 'content_block_delta', index: tools[k], delta: { type: 'input_json_delta', partial_json: a } });
      }
      if (ch.finish_reason) stop = ch.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn';
    }
  }
  if (Object.keys(tools).length && stop !== 'tool_use') stop = 'tool_use';
  send({ type: 'message_delta', delta: { stop_reason: stop } });
  res.end();
}

http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (req.method === 'GET') {
    if (path === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ provider: PROVIDER, model: MODEL.default })); }
    const f = cache[path];
    if (!f) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': path === '/sw.js' ? 'no-cache' : 'public, max-age=300' });
    return res.end(f[0]);
  }
  if (req.method === 'POST' && path === '/api/chat') {
    if (RATE > 0) {
      const ip = req.socket.remoteAddress, now = Date.now();
      const h = (hits.get(ip) || []).filter(t => now - t < 60000);
      if (h.length >= RATE) { res.writeHead(429); return res.end('rate limit'); }
      h.push(now); hits.set(ip, h);
    }
    let body = '';
    for await (const c of req) { body += c; if (body.length > 64e6) { res.writeHead(413); return res.end(); } }
    try {
      const { messages, tools, tier } = JSON.parse(body);
      const model = MODEL[tier] || MODEL.default;
      if (PROVIDER === 'openai') {
        const o = toOpenAI(messages, tools);
        const up = await fetch(OA_BASE + '/chat/completions', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + OA_KEY },
          body: JSON.stringify({ model, stream: true, max_tokens: MAX_TOKENS, ...o })
        });
        if (!up.ok) { res.writeHead(up.status); return res.end(await up.text()); }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        return await pipeOpenAI(up, res);
      }
      const up = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, stream: true, messages, ...(tools?.length ? { tools } : {}) })
      });
      res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') || 'text/event-stream', 'Cache-Control': 'no-cache' });
      for await (const c of up.body) res.write(c);
      res.end();
    } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(String(e)); }
    return;
  }
  res.writeHead(404); res.end();
}).listen(process.env.PORT || 3000, () => console.log(`Nova on http://localhost:${process.env.PORT || 3000}  [provider: ${PROVIDER}, model: ${MODEL.default}]`));
