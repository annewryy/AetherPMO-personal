// AetherPMO AI 어시스턴트 헬스체크 Vercel Serverless Function 엔드포인트 (/api/ai/health)
const http = require('http');
const https = require('https');
const url = require('url');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';

  try {
    const parsed = new URL(baseUrl);
    const protocol = parsed.protocol === 'https:' ? https : http;

    // 게이트웨이가 있으면 /health, Ollama 직접 연결이면 /api/tags
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
        if (pingRes.statusCode >= 200 && pingRes.statusCode < 400) {
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

    const isHealthy = await checkPromise;
    if (isHealthy) {
      return res.status(200).json({ status: 'ok', model, baseUrl: parsed.hostname });
    } else {
      return res.status(503).json({ status: 'error', message: '추론 게이트웨이 또는 로컬 Ollama에 연결할 수 없습니다.' });
    }
  } catch (err) {
    return res.status(503).json({ status: 'error', message: err.message });
  }
};
