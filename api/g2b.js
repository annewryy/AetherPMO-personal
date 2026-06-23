const https = require('https');
const http = require('http');
const url = require('url');

const fetchG2BData = (targetUrl) => {
    return new Promise((resolve, reject) => {
        const protocolClient = targetUrl.startsWith('https') ? https : http;
        protocolClient.get(targetUrl, (apiRes) => {
            let data = '';
            apiRes.on('data', (chunk) => {
                data += chunk;
            });
            apiRes.on('end', () => {
                resolve({ statusCode: apiRes.statusCode, data });
            });
        }).on('error', (err) => {
            reject(err);
        });
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

    let serviceKey = (process.env.G2B_API_KEY || '').trim();
    // Strip leading and trailing quotes if the env variable was wrapped in them
    if (serviceKey.startsWith('"') && serviceKey.endsWith('"')) {
        serviceKey = serviceKey.slice(1, -1);
    } else if (serviceKey.startsWith("'") && serviceKey.endsWith("'")) {
        serviceKey = serviceKey.slice(1, -1);
    }
    serviceKey = serviceKey.trim();
    
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
            const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            const formatDate = (d) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
            bgngDt = bgngDt || formatDate(past);
            endDt = endDt || formatDate(today);
        }

        const inqryBgnDt = bgngDt + '0000';
        const inqryEndDt = endDt + '2359';

        // Build remaining query params with URLSearchParams (excluding serviceKey)
        const params = new URLSearchParams({
            numOfRows: '100',
            pageNo: '1',
            inqryDiv: '1', // 1: Registration date
            inqryBgnDt: inqryBgnDt,
            inqryEndDt: inqryEndDt,
            type: 'json'
        });

        if (bidNtceNm) {
            params.append('bidNtceNm', bidNtceNm);
        }

        // If the key does not contain '%' (Decoding Key), encode it once to protect '+' and '/' characters
        let finalKey = serviceKey;
        if (!finalKey.includes('%')) {
            finalKey = encodeURIComponent(finalKey);
        }

        // Target URLs for G2B getBidPblancListInfoServc (V4 and V1)
        const requestUrlV4 = `http://apis.data.go.kr/1230000/BidPublicInfoService04/getBidPblancListInfoServc?serviceKey=${finalKey}&${params.toString()}`;
        const requestUrlV1 = `http://apis.data.go.kr/1230000/BidPublicInfoService/getBidPblancListInfoServc?serviceKey=${finalKey}&${params.toString()}`;

        let responseBody = '';
        let successUrl = '';
        try {
            console.log(`Sending G2B request to V4 endpoint: ${requestUrlV4.replace(finalKey, '[MASKED]').replace(serviceKey, '[MASKED]')}`);
            const result = await fetchG2BData(requestUrlV4);
            // Validate if response is JSON (data.go.kr returns plain text/XML errors for auth failures)
            JSON.parse(result.data);
            responseBody = result.data;
            successUrl = requestUrlV4;
        } catch (v4Err) {
            console.log(`G2B V4 failed or returned non-JSON. Retrying with V1 fallback endpoint...`);
            try {
                console.log(`Sending G2B request to V1 endpoint: ${requestUrlV1.replace(finalKey, '[MASKED]').replace(serviceKey, '[MASKED]')}`);
                const result = await fetchG2BData(requestUrlV1);
                JSON.parse(result.data);
                responseBody = result.data;
                successUrl = requestUrlV1;
            } catch (v1Err) {
                // If both failed, throw error
                throw new Error(`G2B API failure on both endpoints. V4: ${maskKey(v4Err.message)}, V1: ${maskKey(v1Err.message)}`);
            }
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
        res.status(500).json({ error: 'Internal Server Error', details: maskKey(e.message || e) });
    }
};
