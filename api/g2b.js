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

// Date helper to verify if range exceeds 6 months (186 days)
const checkDateRangeExceeds = (startStr, endStr) => {
    if (startStr.length < 8 || endStr.length < 8) return false;
    const sYear = parseInt(startStr.substring(0, 4));
    const sMonth = parseInt(startStr.substring(4, 6)) - 1;
    const sDay = parseInt(startStr.substring(6, 8));
    
    const eYear = parseInt(endStr.substring(0, 4));
    const eMonth = parseInt(endStr.substring(4, 6)) - 1;
    const eDay = parseInt(endStr.substring(6, 8));
    
    const startDate = new Date(sYear, sMonth, sDay);
    const endDate = new Date(eYear, eMonth, eDay);
    
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays > 186;
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

    // Diagnostics Log
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
    
    // Mask key helper to prevent exposure in logs/errors
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
            res.status(500).json({ error: true, message: 'G2B_API_KEY is not configured on the server.' });
            return;
        }

        const bidNtceNm = query.bidNtceNm || '';
        const dminsttNm = query.dminsttNm || '';
        let bgngDt = query.bgngDt || '';
        let endDt = query.endDt || '';
        const clientPage = parseInt(query.pageNo || '1');
        const clientLimit = parseInt(query.numOfRows || '10');

        // Clean dates: remove dashes
        bgngDt = bgngDt.replace(/-/g, '').trim();
        endDt = endDt.replace(/-/g, '').trim();

        if (!bgngDt || !endDt) {
            const today = new Date();
            const formatDate = (d) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
            bgngDt = bgngDt || formatDate(today);
            endDt = endDt || formatDate(today);
        }

        // Back-end Guard: Verify if the range exceeds 6 months
        if (checkDateRangeExceeds(bgngDt, endDt)) {
            console.warn(`[Guard] G2B request rejected: range exceeds 6 months (${bgngDt} ~ ${endDt})`);
            res.status(400).json({
                error: true,
                message: '나라장터 공고 검색은 응답 지연 방지를 위해 최대 6개월 이내 기간만 조회할 수 있습니다.'
            });
            return;
        }

        const inqryBgnDt = bgngDt + '0000';
        const inqryEndDt = endDt + '2359';

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

        const isSearchMode = !!(bidNtceNm || dminsttNm);

        if (!isSearchMode) {
            // General query mode: Simply fetch target page from API
            const params = new URLSearchParams({
                numOfRows: String(clientLimit),
                pageNo: String(clientPage),
                inqryDiv: '1',
                inqryBgnDt: inqryBgnDt,
                inqryEndDt: inqryEndDt,
                type: 'json'
            });

            const requestUrl = `https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc?serviceKey=${finalKey}&${params.toString()}`;
            console.log(`[General Mode] Fetching url: ${requestUrl.split(finalKey).join('[MASKED]')}`);
            
            const result = await fetchG2BData(requestUrl);
            
            const xmlErr = extractXmlError(result.data);
            if (xmlErr) {
                throw new Error(`OpenAPI Error (XML) - Code: ${xmlErr.code}, Message: ${xmlErr.msg}`);
            }

            let parsedJson;
            try {
                parsedJson = JSON.parse(result.data);
            } catch (jsonErr) {
                const snippet = result.data ? result.data.substring(0, 200) : 'Empty response';
                throw new Error(`Failed to parse response as JSON. Content preview: ${snippet}`);
            }

            const header = parsedJson?.response?.header;
            if (header && header.resultCode && header.resultCode !== '00') {
                throw new Error(`OpenAPI Error (JSON) - Code: ${header.resultCode}, Message: ${header.resultMsg}`);
            }

            const itemsData = parsedJson?.response?.body?.items;
            let list = [];
            if (itemsData) {
                if (Array.isArray(itemsData)) list = itemsData;
                else if (Array.isArray(itemsData.item)) list = itemsData.item;
                else if (itemsData.item) list = [itemsData.item];
            }

            const apiTotalCount = parseInt(parsedJson?.response?.body?.totalCount || '0');

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

            res.status(200).json({ announcements: formattedList, totalCount: apiTotalCount });
            return;

        } else {
            // Search mode: Fetch multiple pages in parallel chunks and filter
            console.log(`[Search Mode] Keyword filter active. bidNtceNm='${bidNtceNm}', dminsttNm='${dminsttNm}'`);

            const getPageUrl = (page) => {
                const p = new URLSearchParams({
                    numOfRows: '100', // Fetch 100 at a time for filtering efficiency
                    pageNo: String(page),
                    inqryDiv: '1',
                    inqryBgnDt: inqryBgnDt,
                    inqryEndDt: inqryEndDt,
                    type: 'json'
                });
                return `https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc?serviceKey=${finalKey}&${p.toString()}`;
            };

            // 1. Fetch first page to assess totalCount
            const firstPageUrl = getPageUrl(1);
            console.log(`[Search Mode] Fetching page 1: ${firstPageUrl.split(finalKey).join('[MASKED]')}`);
            
            const firstResult = await fetchG2BData(firstPageUrl);
            const firstXmlErr = extractXmlError(firstResult.data);
            if (firstXmlErr) {
                throw new Error(`OpenAPI Error (XML) - Code: ${firstXmlErr.code}, Message: ${firstXmlErr.msg}`);
            }

            let firstJson;
            try {
                firstJson = JSON.parse(firstResult.data);
            } catch (e) {
                throw new Error(`Failed to parse first page G2B JSON. Preview: ${firstResult.data ? firstResult.data.substring(0, 200) : 'N/A'}`);
            }

            const header = firstJson?.response?.header;
            if (header && header.resultCode && header.resultCode !== '00') {
                throw new Error(`OpenAPI Error (JSON) - Code: ${header.resultCode}, Message: ${header.resultMsg}`);
            }

            const totalCount = parseInt(firstJson?.response?.body?.totalCount || '0');
            console.log(`[Search Mode] Total count inside date range reported by API: ${totalCount}`);

            const itemsData = firstJson?.response?.body?.items;
            let mergedItems = [];
            if (itemsData) {
                if (Array.isArray(itemsData)) mergedItems = [...itemsData];
                else if (Array.isArray(itemsData.item)) mergedItems = [...itemsData.item];
                else if (itemsData.item) mergedItems = [itemsData.item];
            }

            // 2. Assess extra pages required (Limit to maximum 10 pages / 1,000 items)
            const maxPages = Math.min(Math.ceil(totalCount / 100), 10);
            console.log(`[Search Mode] Need to fetch up to page ${maxPages} (capped at 10)`);

            const extraPages = [];
            for (let p = 2; p <= maxPages; p++) {
                extraPages.push(p);
            }

            // 3. Batch concurrent request loops (concurrency size = 3)
            const chunkSize = 3;
            for (let i = 0; i < extraPages.length; i += chunkSize) {
                const chunk = extraPages.slice(i, i + chunkSize);
                console.log(`[Search Mode] Fetching batch pages: ${chunk}`);
                
                const promises = chunk.map(page => fetchG2BData(getPageUrl(page)));
                const responses = await Promise.all(promises);

                for (let rIdx = 0; rIdx < responses.length; rIdx++) {
                    const resData = responses[rIdx].data;
                    const pageNum = chunk[rIdx];
                    
                    const xmlErr = extractXmlError(resData);
                    if (xmlErr) {
                        console.warn(`[Search Mode] Skip page ${pageNum} due to XML Error: ${xmlErr.msg}`);
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(resData);
                        const items = parsed?.response?.body?.items;
                        if (items) {
                            if (Array.isArray(items)) mergedItems = mergedItems.concat(items);
                            else if (Array.isArray(items.item)) mergedItems = mergedItems.concat(items.item);
                            else if (items.item) mergedItems.push(items.item);
                        }
                    } catch (e) {
                        console.warn(`[Search Mode] Skip page ${pageNum} due to JSON parse error: ${e.message}`);
                    }
                }
            }

            console.log(`[Search Mode] Aggregated raw items size: ${mergedItems.length}`);
            if (mergedItems.length > 0) {
                console.log('[Search Mode] Sample raw item fields:');
                console.log(JSON.stringify(mergedItems.slice(0, 3).map(item => ({
                    bidNtceNm: item.bidNtceNm,
                    bidNtceNo: item.bidNtceNo,
                    dminsttNm: item.dminsttNm,
                    ntceInsttNm: item.ntceInsttNm
                })), null, 2));
            }

            // 4. Case-insensitive string matching
            const searchTitle = bidNtceNm.toLowerCase().trim();
            const searchCustomer = dminsttNm.toLowerCase().trim();

            let filteredList = mergedItems;
            if (searchTitle) {
                filteredList = filteredList.filter(item => {
                    const name = String(item.bidNtceNm || '').toLowerCase().trim();
                    const no = String(item.bidNtceNo || '').toLowerCase().trim();
                    return name.includes(searchTitle) || no.includes(searchTitle);
                });
            }
            if (searchCustomer) {
                filteredList = filteredList.filter(item => {
                    const customer = String(item.dminsttNm || '').toLowerCase().trim();
                    const inst = String(item.ntceInsttNm || '').toLowerCase().trim();
                    return customer.includes(searchCustomer) || inst.includes(searchCustomer);
                });
            }

            console.log(`[Search Mode] Filtered matching items size: ${filteredList.length}`);

            // 5. Paginate client slice
            const startIndex = (clientPage - 1) * clientLimit;
            const endIndex = startIndex + clientLimit;
            const slicedList = filteredList.slice(startIndex, endIndex);

            console.log(`[Search Mode] Slicing matching items for page ${clientPage} (limit ${clientLimit}): size=${slicedList.length}`);

            const formattedList = slicedList.map((item, idx) => ({
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

            // Return filteredList.length as totalCount to maintain correct pagination UI
            res.status(200).json({ announcements: formattedList, totalCount: filteredList.length });
            return;
        }

    } catch (e) {
        console.error('Serverless function exception:', maskKey(e.message || e));
        res.status(500).json({ 
            error: true, 
            message: 'Internal Server Error', 
            details: maskKey(e.message || e) 
        });
    }
};
