// AetherPMO AI 어시스턴트 헬스체크 Vercel Serverless Function 엔드포인트 (/api/ai/health)
// 지원 Provider: 1. Gemini API, 2. OpenAI API, 3. 외부 Ollama / 게이트웨이
const http = require('http');
const https = require('https');
const url = require('url');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  // 1. Google Gemini API 검사 (우선순위 1)
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    return res.status(200).json({
      status: 'ready',
      provider: 'gemini',
      model: model,
      message: `Google Gemini 생성형 AI 서비스(${model})가 정상 준비되었습니다.`
    });
  }

  // 2. OpenAI API 검사 (우선순위 2)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    return res.status(200).json({
      status: 'ready',
      provider: 'openai',
      model: model,
      message: `OpenAI 생성형 AI 서비스(${model})가 정상 준비되었습니다.`
    });
  }

  // 3. Ollama 서버 검사 (기존 외부 Ollama 유지)
  if (!process.env.OLLAMA_BASE_URL || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(process.env.OLLAMA_BASE_URL)) {
    return res.status(200).json({
      status: 'disabled',
      provider: 'none',
      message: 'AI 추론 API 키(GEMINI_API_KEY 또는 OPENAI_API_KEY)가 설정되지 않아 기능이 비활성화되어 있습니다.'
    });
  }

  const baseUrl = process.env.OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';

  try {
    const parsed = new URL(baseUrl);
    const protocol = parsed.protocol === 'https:' ? https : http;
    const targetPath = baseUrl.includes('11435') || parsed.pathname.includes('gateway') ? '/health' : '/api/tags';

    const headers = {};
    if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
      headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
      headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
    }

    const checkPromise = new Promise((resolve, reject) => {
      const pingReq = protocol.request({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: targetPath,
        method: 'GET',
        headers,
        timeout: 3000,
      }, (pingRes) => {
        if (pingRes.statusCode >= 200 && pingRes.statusCode < 300) {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      pingReq.on('error', () => resolve(false));
      pingReq.on('timeout', () => {
        pingReq.destroy();
        resolve(false);
      });
      pingReq.end();
    });

    const isAlive = await checkPromise;
    if (isAlive) {
      return res.status(200).json({
        status: 'ready',
        provider: 'ollama',
        model: model,
        message: `Ollama AI 어시스턴트 서비스(${model})가 정상 작동 중입니다.`
      });
    } else {
      return res.status(200).json({
        status: 'error',
        provider: 'ollama',
        message: 'Ollama 서버와 통신할 수 없습니다.'
      });
    }
  } catch (err) {
    return res.status(200).json({
      status: 'error',
      message: 'AI 헬스체크 중 예외가 발생했습니다: ' + err.message
    });
  }
};
