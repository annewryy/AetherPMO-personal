const https = require('https');
const http = require('http');
const url = require('url');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const serviceKey = (process.env.G2B_API_KEY || '').trim();
    
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

        // Base API URL for getBidPblancListInfoServc (using http:// as data.go.kr frequently has issues with https://)
        const apiEndpoint = `http://apis.data.go.kr/1230000/BidPublicInfoService04/getBidPblancListInfoServc`;
        
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

        // Final URL has serviceKey appended as the first query parameter
        const requestUrl = `${apiEndpoint}?serviceKey=${finalKey}&${params.toString()}`;

        // Log request URL with serviceKey masked (both raw and encoded versions)
        const maskedUrl = requestUrl.replace(finalKey, '[MASKED]').replace(serviceKey, '[MASKED]');
        console.log(`Sending G2B request to: ${maskedUrl}`);

        // Make HTTP Request (dynamically selecting http or https client module)
        const protocolClient = requestUrl.startsWith('https') ? https : http;
        protocolClient.get(requestUrl, (apiRes) => {
            let data = '';
            apiRes.on('data', (chunk) => {
                data += chunk;
            });

            apiRes.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
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
                    console.error('Error parsing G2B JSON response:', e, maskKey(data));
                    res.status(500).json({ error: 'Failed to parse response from G2B API.', details: maskKey(data) });
                }
            });
        }).on('error', (err) => {
            console.error('G2B request error:', maskKey(err.message));
            res.status(500).json({ error: 'Failed to contact G2B OpenAPI.', details: maskKey(err.message) });
        });

    } catch (e) {
        console.error('Serverless function exception:', maskKey(e.message || e));
        res.status(500).json({ error: 'Internal Server Error', details: maskKey(e.message || e) });
    }
};
