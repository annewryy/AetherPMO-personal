const https = require('https');
const http = require('http');
const url = require('url');

const extractXmlError = (xmlString) => {
    if (!xmlString || typeof xmlString !== 'string') return null;
    if (xmlString.includes('<errMsg>') || xmlString.includes('<returnAuthMsg>')) {
        const codeMatch = xmlString.match(/<returnReasonCode>([^<]+)<\/returnReasonCode>/) ||
                          xmlString.match(/<resultCode>([^<]+)<\/resultCode>/);
        const msgMatch = xmlString.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/) ||
                         xmlString.match(/<resultMsg>([^<]+)<\/resultMsg>/) ||
                         xmlString.match(/<errMsg>([^<]+)<\/errMsg>/);
        return {
            code: codeMatch ? codeMatch[1].trim() : 'UNKNOWN',
            msg: msgMatch ? msgMatch[1].trim() : 'Authentication or Gateway Error'
        };
    }
    return null;
};

const fetchG2BData = (targetUrl) => {
    return new Promise((resolve, reject) => {
        const protocolClient = targetUrl.startsWith('https') ? https : http;
        
        let timer = null;
        const req = protocolClient.get(targetUrl, (apiRes) => {
            if (timer) clearTimeout(timer);
            
            let data = '';
            apiRes.on('data', (chunk) => {
                data += chunk;
            });
            apiRes.on('end', () => {
                resolve({ statusCode: apiRes.statusCode, data });
            });
        }).on('error', (err) => {
            if (timer) clearTimeout(timer);
            reject(err);
        });

        // Set 15-second timeout on the request socket
        req.setTimeout(15000, () => {
            req.destroy(new Error('ETIMEDOUT'));
        });

        // Failsafe absolute timer
        timer = setTimeout(() => {
            req.destroy(new Error('Timeout of 15000ms exceeded'));
        }, 15000);
    });
};

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 1. Load G2B_API_KEY environment variable
    let serviceKey = (process.env.G2B_API_KEY || '').trim();

    // 2. Clean key (strip newlines, carriage returns, and leading/trailing quotes/spaces)
    serviceKey = serviceKey.replace(/[\r\n]/g, '').trim();
    if (serviceKey.startsWith('"') && serviceKey.endsWith('"')) {
        serviceKey = serviceKey.slice(1, -1);
    } else if (serviceKey.startsWith("'") && serviceKey.endsWith("'")) {
        serviceKey = serviceKey.slice(1, -1);
    }
    serviceKey = serviceKey.trim();

    // Diagnostics Log: Verify if environment variable is correctly loaded
    const crypto = require('crypto');
    const sha256 = crypto.createHash('sha256').update(serviceKey).digest('hex');
    const keyPreview = serviceKey.length > 20 
        ? `${serviceKey.slice(0, 10)}...${serviceKey.slice(-10)}` 
        : serviceKey;
    console.log(`[Diagnostics] G2B_API_KEY load check: ` + 
                `exists=${!!serviceKey}, ` + 
                `length=${serviceKey.length}, ` + 
                `sha256=${sha256}, ` + 
                `preview=${keyPreview}, ` + 
                `hasPercent=${serviceKey.includes('%')}, ` + 
                `hasPlus=${serviceKey.includes('+')}`);
    
    // Mask key helper to prevent exposure in logs/errors (masks both raw and encoded versions)
    const maskKey = (str) => {
        if (!str) return '';
        if (typeof str !== 'string') {
            try {
                str = JSON.stringify(str);
            } catch (err) {
                str = String(str);
            }
        }
        let masked = str;
        if (serviceKey) {
            const escapedKey = serviceKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            masked = masked.replace(new RegExp(escapedKey, 'g'), '[MASKED]');
        }
        const encodedKey = encodeURIComponent(serviceKey);
        if (encodedKey && encodedKey !== serviceKey) {
            const escapedEncoded = encodedKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            masked = masked.replace(new RegExp(escapedEncoded, 'g'), '[MASKED]');
        }
        return masked;
    };

    try {
        const query = url.parse(req.url, true).query;

        if (!serviceKey) {
            res.status(500).json({ error: 'G2B_API_KEY is not configured on the server.' });
            return;
        }

        const bidNtceNm = query.bidNtceNm || '';
        const dminsttNm = query.dminsttNm || '';
        let bgngDt = query.bgngDt || '';
        let endDt = query.endDt || '';

        // Clean dates: remove dashes
        bgngDt = bgngDt.replace(/-/g, '');
        endDt = endDt.replace(/-/g, '');

        if (!bgngDt || !endDt) {
            const today = new Date();
            const formatDate = (d) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
            bgngDt = bgngDt || formatDate(today);
            endDt = endDt || formatDate(today);
        }

        const inqryBgnDt = bgngDt + '0000';
        const inqryEndDt = endDt + '2359';

        const pageNo = query.pageNo || '1';
        const numOfRows = query.numOfRows || '10';

        // Build query params with URLSearchParams (excluding serviceKey)
        const params = new URLSearchParams({
            numOfRows: numOfRows,
            pageNo: pageNo,
            inqryDiv: '1', // 1: Registration date
            inqryBgnDt: inqryBgnDt,
            inqryEndDt: inqryEndDt,
            type: 'json'
        });

        if (bidNtceNm) {
            params.append('bidNtceNm', bidNtceNm);
        }

        // Apply encodeURIComponent() to process.env.G2B_API_KEY exactly once, preventing double encoding
        let rawKey = serviceKey;
        try {
            if (serviceKey.includes('%')) {
                rawKey = decodeURIComponent(serviceKey);
            }
        } catch (e) {
            console.warn('[Diagnostics] Failed to decode potentially encoded serviceKey:', e.message);
        }
        const finalKey = encodeURIComponent(rawKey);

        // Target URL matching the approved service path: https://apis.data.go.kr/1230000/ad/BidPublicInfoService
        const requestUrl = `https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc?serviceKey=${finalKey}&${params.toString()}`;

        let responseBody = '';
        try {
            console.log(`Sending G2B request to approved V1 endpoint: ${requestUrl.split(finalKey).join('[MASKED]').split(serviceKey).join('[MASKED]')}`);
            const result = await fetchG2BData(requestUrl);
            console.log(`[Response Log] Status: ${result.statusCode}, Raw Body: ${maskKey(result.data)}`);
            
            // 1. Check if the response contains XML error (common for authentication failures)
            const xmlErr = extractXmlError(result.data);
            if (xmlErr) {
                throw new Error(`OpenAPI Error (XML) - Code: ${xmlErr.code}, Message: ${xmlErr.msg}`);
            }
            
            // 2. Validate if response is valid JSON
            let parsedJson;
            try {
                parsedJson = JSON.parse(result.data);
            } catch (jsonErr) {
                const snippet = result.data ? result.data.substring(0, 200) : 'Empty response';
                throw new Error(`Failed to parse response as JSON. Content preview: ${snippet}`);
            }
            
            // 3. Check for OpenAPI business error inside JSON response
            const header = parsedJson?.response?.header;
            if (header && header.resultCode && header.resultCode !== '00') {
                throw new Error(`OpenAPI Error (JSON) - Code: ${header.resultCode}, Message: ${header.resultMsg || 'Unknown Error'}`);
            }
            
            responseBody = result.data;
        } catch (err) {
            throw new Error(`G2B API failure on approved endpoint. Error: ${maskKey(err.message)}`);
        }

        const parsed = JSON.parse(responseBody);
        const itemsData = parsed?.response?.body?.items;
        let list = [];
        if (itemsData) {
            if (Array.isArray(itemsData)) {
                list = itemsData;
            } else if (Array.isArray(itemsData.item)) {
                list = itemsData.item;
            } else if (itemsData.item) {
                list = [itemsData.item];
            }
        }

        // Post-filtering by 수요기관명 if provided
        if (dminsttNm) {
            const searchDemand = dminsttNm.toLowerCase().trim();
            list = list.filter(item => 
                item.dminsttNm && item.dminsttNm.toLowerCase().includes(searchDemand)
            );
        }

        // Map fields for client compatibility
        const formattedList = list.map((item, idx) => ({
            id: `g2b-api-${idx}-${Date.now()}`,
            announcementNo: item.bidNtceNo || '-',
            name: item.bidNtceNm || '-',
            customer: item.dminsttNm || '-',
            budget: Number(item.asignBdgtAmt || item.presmptPrce || 0),
            publishDate: item.bidNtceDt ? item.bidNtceDt.substring(0, 10) : '-',
            endDate: item.bidClseDt ? item.bidClseDt.substring(0, 10) : '-',
            url: item.bidNtceDtlUrl || '#',
            presmptPrce: Number(item.presmptPrce || 0),
            asignBdgtAmt: Number(item.asignBdgtAmt || 0)
        }));

        res.status(200).json({ announcements: formattedList });

    } catch (e) {
        console.error('Serverless function exception:', maskKey(e.message || e));
        res.status(500).json({ 
            error: true, 
            message: 'Internal Server Error', 
            details: maskKey(e.message || e) 
        });
    }
};
