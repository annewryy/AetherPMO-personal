const https = require('https');
const http = require('http');

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
            apiRes.on('data', (chunk) => { data += chunk; });
            apiRes.on('end', () => {
                resolve({ statusCode: apiRes.statusCode, data });
            });
        }).on('error', (err) => {
            if (timer) clearTimeout(timer);
            reject(err);
        });

        req.setTimeout(15000, () => {
            req.destroy(new Error('ETIMEDOUT'));
        });

        timer = setTimeout(() => {
            req.destroy(new Error('Timeout of 15000ms exceeded'));
        }, 15000);
    });
};

const cleanKey = (key) => {
    if (!key) return '';
    let cleaned = String(key).replace(/[\r\n]/g, '').trim();
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
        cleaned = cleaned.slice(1, -1);
    }
    return cleaned.trim();
};

const PRE_OPERATIONS_GENERAL = {
    '용역': 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServc',
    '공사': 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoCnstwk',
    '물품': 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoThng',
    '외자': 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoFrgcpt'
};

const PRE_OPERATIONS_SEARCH = {
    '용역': 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServcPPSSrch',
    '공사': 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoCnstwkPPSSrch',
    '물품': 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoThngPPSSrch',
    '외자': 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoFrgcptPPSSrch'
};

const fetchPreItems = async (finalKey, params, apiBase, categoryName = '용역') => {
    const requestUrl = `${apiBase}?serviceKey=${finalKey}&${params.toString()}`;
    let result;
    try {
        result = await fetchG2BData(requestUrl);
    } catch (err) {
        console.error(`[PreSpec Diagnostic] Category: ${categoryName} | Endpoint: ${apiBase} | Fetch Error: ${err.message}`);
        return { 
            items: [], 
            totalCount: 0, 
            error: true,
            warning: { category: categoryName, endpoint: apiBase, httpStatus: 500, code: 'NETWORK_ERROR', msg: err.message }
        };
    }

    const httpStatus = result.statusCode || 200;
    const rawSnippet = (result.data || '').substring(0, 200).replace(/\s+/g, ' ');

    const xmlErr = extractXmlError(result.data);
    if (xmlErr) {
        console.error(`[PreSpec Diagnostic] Category: ${categoryName} | Endpoint: ${apiBase} | HTTP: ${httpStatus} | XML Code: ${xmlErr.code} | Msg: ${xmlErr.msg} | Snippet: ${rawSnippet}`);
        return {
            items: [],
            totalCount: 0,
            error: true,
            warning: { category: categoryName, endpoint: apiBase, httpStatus, code: xmlErr.code, msg: xmlErr.msg, rawSnippet }
        };
    }

    let parsed;
    try {
        parsed = JSON.parse(result.data);
    } catch (e) {
        console.error(`[PreSpec Diagnostic] Category: ${categoryName} | Endpoint: ${apiBase} | HTTP: ${httpStatus} | JSON Parse Fail | Snippet: ${rawSnippet}`);
        return {
            items: [],
            totalCount: 0,
            error: true,
            warning: { category: categoryName, endpoint: apiBase, httpStatus, code: 'JSON_PARSE_ERROR', msg: 'JSON 파싱 실패', rawSnippet }
        };
    }

    const header = parsed?.response?.header;
    const resultCode = header?.resultCode || 'UNKNOWN';
    const resultMsg = header?.resultMsg || 'No resultMsg';

    if (header && resultCode !== '00' && resultCode !== '0') {
        console.error(`[PreSpec Diagnostic] Category: ${categoryName} | Endpoint: ${apiBase} | HTTP: ${httpStatus} | ResultCode: ${resultCode} | Msg: ${resultMsg} | Snippet: ${rawSnippet}`);
        return {
            items: [],
            totalCount: 0,
            error: true,
            warning: { category: categoryName, endpoint: apiBase, httpStatus, code: resultCode, msg: resultMsg, rawSnippet }
        };
    }

    const itemsData = parsed?.response?.body?.items;
    let items = [];
    if (itemsData) {
        if (Array.isArray(itemsData)) items = itemsData;
        else if (Array.isArray(itemsData.item)) items = itemsData.item;
        else if (itemsData.item) items = [itemsData.item];
    }

    const totalCount = parseInt(parsed?.response?.body?.totalCount || String(items.length));
    console.log(`[PreSpec Diagnostic] Category: ${categoryName} | Endpoint: ${apiBase} | HTTP: ${httpStatus} | ResultCode: ${resultCode} | TotalCount: ${totalCount} | ParsedItems: ${items.length}`);

    return { items, totalCount, error: false, warning: null };
};

const formatPreItem = (item, idx, businessType = '용역') => {
    if (!item) return null;
    const rawNo = item.bfSpecRgstNo || item.publicPrcureThngNo || item.rgstNo || '-';
    const rawName = item.prcurRqstPrdnm || item.prcurRqstNm || item.publicPrcureThngNm || item.ntceNm || item.bidNtceNm || '-';
    const rawCustomer = item.dminsttNm || item.ntceInsttNm || item.orderInsttNm || item.rcvInsttNm || '-';
    const rawBudget = Number(item.asignBdgtAmt || item.presmptPrce || item.budget || 0);
    
    let rawPublishDate = '-';
    if (item.rlseDt) rawPublishDate = item.rlseDt.substring(0, 10);
    else if (item.rgstDt) rawPublishDate = item.rgstDt.substring(0, 10);
    else if (item.prcureReqDt) rawPublishDate = item.prcureReqDt.substring(0, 10);
    else if (item.rcptDt) rawPublishDate = item.rcptDt.substring(0, 10);
    
    let rawEndDate = '-';
    if (item.opnyRcvClseDt) rawEndDate = item.opnyRcvClseDt.substring(0, 10);
    else if (item.opninRcptDeadlineDt) rawEndDate = item.opninRcptDeadlineDt.substring(0, 10);
    else if (item.opninRcptEndDt) rawEndDate = item.opninRcptEndDt.substring(0, 10);

    const rawUrl = item.bfSpecRgstUrl || item.detailUrl || item.g2bUrl || `https://www.g2b.go.kr:8081/ep/preparation/prestd/preStdDtl.do?preStdRegNo=${rawNo}`;
    const uniqueId = `PRE_SPEC-${rawNo}`;

    return {
        id: uniqueId,
        sourceType: 'PRE_SPEC',
        sourceLabel: '사전규격',
        announcementType: 'pre',
        announcementNo: rawNo,
        title: rawName,
        name: rawName,
        customer: rawCustomer,
        organization: rawCustomer,
        budget: rawBudget,
        registeredAt: rawPublishDate,
        publishDate: rawPublishDate,
        deadline: rawEndDate,
        endDate: rawEndDate,
        businessType: item.businessType || businessType || '용역',
        url: rawUrl,
        presmptPrce: Number(item.presmptPrce || 0),
        asignBdgtAmt: Number(item.asignBdgtAmt || 0),
        raw: item
    };
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control, Pragma');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const preServiceKey = cleanKey(process.env.G2B_API_KEY || process.env.G2B_PRE_SERVICE_KEY || '');
    if (!preServiceKey) {
        res.status(200).json({ error: true, message: 'G2B_API_KEY가 설정되지 않았습니다.', announcements: [], totalCount: 0 });
        return;
    }

    let query = {};
    try {
        const reqUrl = req.url.startsWith('http') ? req.url : `http://localhost${req.url}`;
        const parsedUrl = new URL(reqUrl);
        parsedUrl.searchParams.forEach((val, key) => { query[key] = val; });
    } catch (uErr) {
        query = req.query || {};
    }

    const searchKeyword = query.bidNtceNm || query.publicPrcureThngNm || '';
    const dminsttNm = query.dminsttNm || '';
    let bgngDt = (query.bgngDt || '').replace(/-/g, '').trim().substring(0, 8);
    let endDt = (query.endDt || '').replace(/-/g, '').trim().substring(0, 8);
    const clientPage = parseInt(query.pageNo || '1');
    const clientLimit = parseInt(query.numOfRows || '100');

    if (!bgngDt || !endDt) {
        const today = new Date();
        const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        const formatDate = (d) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        bgngDt = bgngDt || formatDate(past);
        endDt = endDt || formatDate(today);
    }

    const isSearch = !!(searchKeyword || dminsttNm);
    const opsMap = isSearch ? PRE_OPERATIONS_SEARCH : PRE_OPERATIONS_GENERAL;
    const finalPreKey = encodeURIComponent(preServiceKey.includes('%') ? decodeURIComponent(preServiceKey) : preServiceKey);

    const categories = [
        { name: '용역', endpoint: opsMap['용역'] },
        { name: '공사', endpoint: opsMap['공사'] },
        { name: '물품', endpoint: opsMap['물품'] },
        { name: '외자', endpoint: opsMap['외자'] }
    ];

    const tasks = categories.map(async (cat) => {
        const params = new URLSearchParams({
            numOfRows: String(clientLimit),
            pageNo: String(clientPage),
            inqryBgnDt: bgngDt + '0000',
            inqryEndDt: endDt + '2359',
            type: 'json'
        });
        if (searchKeyword) params.append('publicPrcureThngNm', searchKeyword);
        if (dminsttNm) params.append('dminsttNm', dminsttNm);

        let res = await fetchPreItems(finalPreKey, params, cat.endpoint, cat.name);

        if ((!res.items || res.items.length === 0) && !res.error) {
            const params8 = new URLSearchParams({
                numOfRows: String(clientLimit),
                pageNo: String(clientPage),
                inqryBgnDt: bgngDt,
                inqryEndDt: endDt,
                type: 'json'
            });
            if (searchKeyword) params8.append('publicPrcureThngNm', searchKeyword);
            if (dminsttNm) params8.append('dminsttNm', dminsttNm);

            const res8 = await fetchPreItems(finalPreKey, params8, cat.endpoint, cat.name);
            if (res8.items && res8.items.length > 0) res = res8;
        }

        return { ...res, category: cat.name, endpoint: cat.endpoint };
    });

    const results = await Promise.allSettled(tasks);

    let items = [];
    let totalCount = 0;
    let warnings = [];
    let successCount = 0;

    results.forEach((r, idx) => {
        const catName = categories[idx].name;
        const endpoint = categories[idx].endpoint;
        if (r.status === 'fulfilled') {
            const val = r.value;
            if (val.warning) warnings.push(val.warning);
            if (val.items && val.items.length > 0) {
                successCount++;
                totalCount += val.totalCount;
                const formatted = val.items.map((item, itemIdx) => formatPreItem(item, itemIdx, catName)).filter(Boolean);
                items = items.concat(formatted);
            }
        } else {
            warnings.push({ category: catName, endpoint, code: 'PROMISE_REJECTED', msg: r.reason?.message || 'API Call Rejected' });
        }
    });

    items.sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));
    const pagedItems = items.slice((clientPage - 1) * clientLimit, clientPage * clientLimit);

    res.status(200).json({
        announcements: pagedItems,
        totalCount: totalCount || items.length,
        warnings,
        serviceType: 'prespec',
        path: '/api/g2b/prespec'
    });
};
