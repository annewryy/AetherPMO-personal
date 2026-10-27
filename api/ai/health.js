// AetherPMO AI 어시스턴트 헬스체크 Vercel Serverless Function 엔드포인트 (/api/ai/health)
// 지원 Provider: 1. Google Gemini API, 2. OpenAI API, 3. 외부 Ollama / 게이트웨이
// 단순 환경변수 존재(configured)와 실제 추론 성공 상태(ready)를 엄격히 구분하여 검증

const http = require('http');
const https = require('https');
const url = require('url');

function requestHttp(options, postData = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'http:' ? http : https;
    const req = protocol.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = body ? JSON.parse(body) : null;
        } catch (e) {
          json = body;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', (e) => reject(e));
    if (options.timeout) {
      req.setTimeout(options.timeout, () => {
        req.destroy(new Error('요청 시간 초과 (Timeout)'));
      });
    }

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

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

  const geminiKey = process.env.GEMINI_API_KEY ||
                    process.env.GOOGLE_AI_API_KEY ||
                    process.env.GOOGLE_API_KEY ||
                    process.env.GEMINI_KEY ||
                    process.env.GOOGLE_GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const ollamaUrl = process.env.OLLAMA_BASE_URL;

  // 1. Google Gemini API 헬스체크 (기본 모델: gemini-2.5-flash)
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    try {
      // 실제 API 호출 검증 (최소 토큰 'ping' 검사)
      const postData = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 2, temperature: 0.1 }
      });
      const pingRes = await requestHttp({
        protocol: 'https:',
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${geminiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 5000
      }, postData);

      if (pingRes.statusCode === 200 && pingRes.body?.candidates) {
        return res.status(200).json({
          status: 'ready',
          healthy: true,
          provider: 'gemini',
          model: model,
          message: `Google Gemini 생성형 AI 서비스(${model})와 실시간 통신에 성공했습니다.`
        });
      } else {
        const errMsg = pingRes.body?.error?.message || `HTTP ${pingRes.statusCode}`;
        return res.status(200).json({
          status: 'configured',
          healthy: false,
          provider: 'gemini',
          model: model,
          message: `Gemini API 키가 설정되어 있으나 통신 검증 실패: ${errMsg}`
        });
      }
    } catch (err) {
      return res.status(200).json({
        status: 'configured',
        healthy: false,
        provider: 'gemini',
        model: model,
        message: `Gemini API 호출 중 네트워크 예외: ${err.message}`
      });
    }
  }

  // 2. OpenAI API 헬스체크
  if (openaiKey) {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    try {
      const postData = JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 2
      });
      const pingRes = await requestHttp({
        protocol: 'https:',
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 5000
      }, postData);

      if (pingRes.statusCode === 200 && pingRes.body?.choices) {
        return res.status(200).json({
          status: 'ready',
          healthy: true,
          provider: 'openai',
          model: model,
          message: `OpenAI 생성형 AI 서비스(${model})와 실시간 통신에 성공했습니다.`
        });
      } else {
        const errMsg = pingRes.body?.error?.message || `HTTP ${pingRes.statusCode}`;
        return res.status(200).json({
          status: 'configured',
          healthy: false,
          provider: 'openai',
          model: model,
          message: `OpenAI API 키가 설정되어 있으나 통신 검증 실패: ${errMsg}`
        });
      }
    } catch (err) {
      return res.status(200).json({
        status: 'configured',
        healthy: false,
        provider: 'openai',
        model: model,
        message: `OpenAI API 호출 중 네트워크 예외: ${err.message}`
      });
    }
  }

  // 3. Ollama 서버 헬스체크
  if (ollamaUrl && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(ollamaUrl)) {
    const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
    try {
      const parsed = new URL(ollamaUrl);
      const protocol = parsed.protocol === 'https:' ? https : http;
      const targetPath = ollamaUrl.includes('11435') || parsed.pathname.includes('gateway') ? '/health' : '/api/tags';
      const headers = {};
      if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
        headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
        headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
      }
      const pingRes = await requestHttp({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: targetPath,
        method: 'GET',
        headers,
        timeout: 4000
      });

      if (pingRes.statusCode >= 200 && pingRes.statusCode < 300) {
        return res.status(200).json({
          status: 'ready',
          healthy: true,
          provider: 'ollama',
          model: model,
          message: `Ollama AI 어시스턴트 서비스(${model})가 정상 작동 중입니다.`
        });
      } else {
        return res.status(200).json({
          status: 'configured',
          healthy: false,
          provider: 'ollama',
          message: `Ollama 서버 응답 비정상 (HTTP ${pingRes.statusCode})`
        });
      }
    } catch (err) {
      return res.status(200).json({
        status: 'configured',
        healthy: false,
        provider: 'ollama',
        message: `Ollama 서버 연결 실패: ${err.message}`
      });
    }
  }

  // 4. 어떤 AI Provider도 구성되지 않은 상태
  return res.status(200).json({
    status: 'disabled',
    healthy: false,
    provider: 'none',
    message: 'AI 추론 API 키(GEMINI_API_KEY 또는 OPENAI_API_KEY)가 설정되지 않아 기능이 비활성화되어 있습니다.'
  });
};
