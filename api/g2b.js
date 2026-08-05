const https = require('https');
const http = require('http');
const url = require('url');

function cleanKey(value = '') {
    if (!value) return '';
    let cleaned = String(value).trim().replace(/^['"]|['"]$/g, '');
    if (cleaned.includes('%')) {
        try {
            cleaned = decodeURIComponent(cleaned);
        } catch (e) {}
    }
    return cleaned;
}

const extractXmlError = (xmlString, statusCode = 200) => {
    if (statusCode !== 200 && (!xmlString || typeof xmlString !== 'string')) {
        return {
            code: `HTTP_${statusCode}`,
            msg: `OpenAPI Gateway returned HTTP Status ${statusCode}`
        };
    }
    if (!xmlString || typeof xmlString !== 'string') return null;
    
    if (xmlString.includes('<errMsg>') || xmlString.includes('<returnAuthMsg>') || xmlString.includes('OpenAPI_ServiceResponse') || xmlString.includes('<resultMsg>')) {
        const codeMatch = xmlString.match(/<returnReasonCode>([^<]+)<\/returnReasonCode>/) ||
                          xmlString.match(/<resultCode>([^<]+)<\/resultCode>/);
        const msgMatch = xmlString.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/) ||
                         xmlString.match(/<resultMsg>([^<]+)<\/resultMsg>/) ||
                         xmlString.match(/<errMsg>([^<]+)<\/errMsg>/);
        
        if (codeMatch || msgMatch) {
            return {
                code: codeMatch ? codeMatch[1].trim() : `HTTP_${statusCode}`,
                msg: msgMatch ? msgMatch[1].trim() : 'Authentication or Gateway Error'
            };
        }
    }
    
    if (statusCode !== 200) {
        return {
            code: `HTTP_${statusCode}`,
            msg: `OpenAPI Gateway Error (HTTP ${statusCode})`
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

const normalizeBidDateRange = (bgngDt, endDt) => {
    const cleanBgn = bgngDt.replace(/-/g, '').trim().substring(0, 8);
    const cleanEnd = endDt.replace(/-/g, '').trim().substring(0, 8);
    return {
        inqryBgnDt: cleanBgn + '0000',
        inqryEndDt: cleanEnd + '2359'
    };
};

const normalizePreDateRange = (bgngDt, endDt) => {
    const cleanBgn = bgngDt.replace(/-/g, '').trim().substring(0, 8);
    const cleanEnd = endDt.replace(/-/g, '').trim().substring(0, 8);
    return {
        inqryBgnDt12: cleanBgn + '0000',
        inqryEndDt12: cleanEnd + '2359',
        inqryBgnDt8: cleanBgn,
        inqryEndDt8: cleanEnd
    };
};

const normalizeString = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/\s+/g, '').normalize('NFC');
};

const matchesKeyword = (target, keyword) => {
    if (!keyword) return true;
    return normalizeString(target).includes(normalizeString(keyword));
};

// ─────────────────────────────────────────────
// 본공고 API - BidPublicInfoService
// ─────────────────────────────────────────────
const BID_API_BASE = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc';

// ─────────────────────────────────────────────
// 사전규격 API - HrcspSsstndrdInfoService (4개 업무별 Operations)
// ─────────────────────────────────────────────
const PRE_BASE_ENDPOINT = 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService';

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

const fetchBidItems = async (serviceKey, paramsObj) => {
    const urlObj = new URL(BID_API_BASE);
    urlObj.searchParams.set('serviceKey', serviceKey);
    for (const [key, value] of Object.entries(paramsObj)) {
        if (value !== undefined && value !== null && value !== '') {
            urlObj.searchParams.set(key, String(value));
        }
    }

    const requestUrl = urlObj.toString();
    const result = await fetchG2BData(requestUrl);
    
    const xmlErr = extractXmlError(result.data, result.statusCode || 200);
    if (xmlErr) throw new Error(`OpenAPI Error (XML) - Code: ${xmlErr.code}, Message: ${xmlErr.msg}`);
    
    const parsed = JSON.parse(result.data);
    const header = parsed?.response?.header;
    if (header && header.resultCode && header.resultCode !== '00' && header.resultCode !== '0') {
        throw new Error(`OpenAPI Error (JSON) - Code: ${header.resultCode}, Message: ${header.resultMsg}`);
    }
    
    const itemsData = parsed?.response?.body?.items;
    if (!itemsData) return { items: [], totalCount: 0 };
    
    let items = [];
    if (Array.isArray(itemsData)) items = itemsData;
    else if (Array.isArray(itemsData.item)) items = itemsData.item;
    else if (itemsData.item) items = [itemsData.item];
    
    const totalCount = parseInt(parsed?.response?.body?.totalCount || String(items.length));
    return { items, totalCount };
};

const fetchPreItems = async ({ categoryName, operation, serviceKey, params }) => {
    if (!serviceKey) {
        console.error(`[PreSpec Diagnostic Error] Category: ${categoryName} | Endpoint: ${operation} | Error: serviceKey is empty!`);
        return {
            items: [],
            totalCount: 0,
            error: true,
            warning: { category: categoryName, endpoint: operation, httpStatus: 401, code: 'SERVICE_KEY_IS_NULL', msg: 'serviceKey가 비어 있습니다.' }
        };
    }

    const urlObj = new URL(operation);
    urlObj.searchParams.set('serviceKey', serviceKey);

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            urlObj.searchParams.set(key, String(value));
        }
    }

    const requestUrl = urlObj.toString();
    const safeUrl = requestUrl.replace(/serviceKey=[^&]+/, 'serviceKey=[REDACTED]');
    console.log(`[PreSpec Request URL] Category: ${categoryName} | URL: ${safeUrl}`);

    let result;
    try {
        result = await fetchG2BData(requestUrl);
    } catch (err) {
        console.error(`[PreSpec Diagnostic] Category: ${categoryName} | Endpoint: ${operation} | Fetch Error: ${err.message}`);
        return { 
            items: [], 
            totalCount: 0, 
            error: true,
            warning: { category: categoryName, endpoint: operation, httpStatus: 500, code: 'NETWORK_ERROR', msg: err.message }
        };
    }

    const httpStatus = result.statusCode || 200;
    const rawSnippet = (result.data || '').substring(0, 200).replace(/\s+/g, ' ');

    const xmlErr = extractXmlError(result.data, httpStatus);
    if (xmlErr) {
        console.error(`[PreSpec Diagnostic] Category: ${categoryName} | Endpoint: ${operation} | HTTP: ${httpStatus} | XML Code: ${xmlErr.code} | Msg: ${xmlErr.msg} | Snippet: ${rawSnippet}`);
        return {
            items: [],
            totalCount: 0,
            error: true,
            warning: { category: categoryName, endpoint: operation, httpStatus, code: xmlErr.code, msg: xmlErr.msg, rawSnippet }
        };
    }

    let parsed;
    try {
        parsed = JSON.parse(result.data);
    } catch (e) {
        console.error(`[PreSpec Diagnostic] Category: ${categoryName} | Endpoint: ${operation} | HTTP: ${httpStatus} | JSON Parse Fail | Snippet: ${rawSnippet}`);
        return {
            items: [],
            totalCount: 0,
            error: true,
            warning: { category: categoryName, endpoint: operation, httpStatus, code: 'JSON_PARSE_ERROR', msg: 'JSON 파싱 실패', rawSnippet }
        };
    }

    const header = parsed?.response?.header;
    const resultCode = header?.resultCode || 'UNKNOWN';
    const resultMsg = header?.resultMsg || 'No resultMsg';

    if (header && resultCode !== '00' && resultCode !== '0') {
        console.error(`[PreSpec Diagnostic] Category: ${categoryName} | Endpoint: ${operation} | HTTP: ${httpStatus} | ResultCode: ${resultCode} | Msg: ${resultMsg} | Snippet: ${rawSnippet}`);
        return {
            items: [],
            totalCount: 0,
            error: true,
            warning: { category: categoryName, endpoint: operation, httpStatus, code: resultCode, msg: resultMsg, rawSnippet }
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
    console.log(`[PreSpec Diagnostic] Category: ${categoryName} | Endpoint: ${operation} | HTTP: ${httpStatus} | ResultCode: ${resultCode} | TotalCount: ${totalCount} | ParsedItems: ${items.length}`);

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

const formatBidItem = (item, idx) => {
    if (!item) return null;
    const no = item.bidNtceNo || '-';
    const ord = item.bidNtceOrd || '001';
    const uniqueId = `BID-${no}-${ord}`;

    return {
        id: uniqueId,
        sourceType: 'BID',
        sourceLabel: '본공고',
        announcementType: 'bid',
        announcementNo: no,
        announcementOrd: ord,
        title: item.bidNtceNm || '-',
        name: item.bidNtceNm || '-',
        customer: item.dminsttNm || item.ntceInsttNm || '-',
        organization: item.dminsttNm || item.ntceInsttNm || '-',
        budget: Number(item.asignBdgtAmt || item.presmptPrce || 0),
        registeredAt: item.bidNtceDt ? item.bidNtceDt.substring(0, 10) : '-',
        publishDate: item.bidNtceDt ? item.bidNtceDt.substring(0, 10) : '-',
        deadline: item.bidClseDt ? item.bidClseDt.substring(0, 10) : '-',
        endDate: item.bidClseDt ? item.bidClseDt.substring(0, 10) : '-',
        businessType: item.srvceDivNm || '용역',
        url: item.bidNtceDtlUrl || item.detailUrl || '#',
        presmptPrce: Number(item.presmptPrce || 0),
        asignBdgtAmt: Number(item.asignBdgtAmt || 0),
        raw: item
    };
};

const fetchAllPreSpecCategories = async (preServiceKey, bgngDt, endDt, clientPage, clientLimit, searchKeyword = '', dminsttNm = '') => {
    const isSearch = !!(searchKeyword || dminsttNm);
    const opsMap = isSearch ? PRE_OPERATIONS_SEARCH : PRE_OPERATIONS_GENERAL;
    const { inqryBgnDt12: preBgn12, inqryEndDt12: preEnd12, inqryBgnDt8: preBgn8, inqryEndDt8: preEnd8 } = normalizePreDateRange(bgngDt, endDt);

    const categories = [
        { name: '용역', operation: opsMap['용역'] },
        { name: '공사', operation: opsMap['공사'] },
        { name: '물품', operation: opsMap['물품'] },
        { name: '외자', operation: opsMap['외자'] }
    ];

    const tasks = categories.map(async (cat) => {
        const paramsObj = {
            numOfRows: String(clientLimit),
            pageNo: String(clientPage),
            inqryBgnDt: preBgn12,
            inqryEndDt: preEnd12,
            type: 'json'
        };
        if (searchKeyword) paramsObj['publicPrcureThngNm'] = searchKeyword;
        if (dminsttNm) paramsObj['dminsttNm'] = dminsttNm;

        let res = await fetchPreItems({
            categoryName: cat.name,
            operation: cat.operation,
            serviceKey: preServiceKey,
            params: paramsObj
        });

        if ((!res.items || res.items.length === 0) && !res.error) {
            const paramsObj8 = {
                numOfRows: String(clientLimit),
                pageNo: String(clientPage),
                inqryBgnDt: preBgn8,
                inqryEndDt: preEnd8,
                type: 'json'
            };
            if (searchKeyword) paramsObj8['publicPrcureThngNm'] = searchKeyword;
            if (dminsttNm) paramsObj8['dminsttNm'] = dminsttNm;

            const res8 = await fetchPreItems({
                categoryName: cat.name,
                operation: cat.operation,
                serviceKey: preServiceKey,
                params: paramsObj8
            });
            if (res8.items && res8.items.length > 0) res = res8;
        }

        return { ...res, category: cat.name, endpoint: cat.operation };
    });

    const results = await Promise.allSettled(tasks);

    let items = [];
    let totalCount = 0;
    let warnings = [];
    let successCount = 0;

    results.forEach((r, idx) => {
        const catName = categories[idx].name;
        const endpoint = categories[idx].operation;
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

    return { items, totalCount, warnings, successCount, allFailed: successCount === 0 && warnings.length > 0 };
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

    const bidServiceKey = cleanKey(process.env.G2B_API_KEY || '');
    const preServiceKey = cleanKey(
        process.env.G2B_PRE_SERVICE_KEY ||
        process.env.G2B_API_KEY ||
        ''
    );

    console.log('[PreSpec Key Diagnostic]', {
        g2bEnvExists: Boolean(process.env.G2B_API_KEY),
        g2bEnvLength: process.env.G2B_API_KEY ? process.env.G2B_API_KEY.length : 0,
        preKeyExists: Boolean(preServiceKey),
        preKeyLength: preServiceKey ? preServiceKey.length : 0
    });

    try {
        let query = {};
        try {
            const reqUrl = req.url.startsWith('http') ? req.url : `http://localhost${req.url}`;
            const parsedUrl = new URL(reqUrl);
            parsedUrl.searchParams.forEach((val, key) => { query[key] = val; });
        } catch (uErr) {
            query = req.query || {};
        }

        const bidNtceNm = query.bidNtceNm || '';
        const dminsttNm = query.dminsttNm || '';
        let bgngDt = query.bgngDt || '';
        let endDt = query.endDt || '';
        const clientPage = parseInt(query.pageNo || '1');
        const clientLimit = parseInt(query.numOfRows || '10');

        let serviceType = (query.serviceType || query.announcementType || 'all').toLowerCase();
        if (serviceType === 'prespec' || serviceType === 'pre' || serviceType === 'pre_spec') {
            serviceType = 'prespec';
        }

        bgngDt = bgngDt.replace(/-/g, '').trim();
        endDt = endDt.replace(/-/g, '').trim();

        if (!bgngDt || !endDt) {
            const today = new Date();
            const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            const formatDate = (d) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
            bgngDt = bgngDt || formatDate(past);
            endDt = endDt || formatDate(today);
        }

        if (checkDateRangeExceeds(bgngDt, endDt)) {
            res.status(400).json({ error: true, message: '나라장터 공고 검색은 최대 6개월 이내 기간만 조회할 수 있습니다.' });
            return;
        }

        console.log(`[API /api/g2b Route Entry] serviceType=${serviceType}, reqUrl=${req.url}`);

        // ─────────────────────────────────────────
        // 1. 사전규격 단독 라우트 (/api/g2b/prespec)
        // ─────────────────────────────────────────
        if (serviceType === 'prespec') {
            console.log(`[API /api/g2b/prespec Execution] Executing 4 Pre-Spec Work Categories (용역·공사·물품·외자)...`);
            const preRes = await fetchAllPreSpecCategories(preServiceKey, bgngDt, endDt, clientPage, clientLimit, bidNtceNm, dminsttNm);

            preRes.items.sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));
            const pagedItems = preRes.items.slice((clientPage - 1) * clientLimit, clientPage * clientLimit);

            res.status(200).json({
                announcements: pagedItems,
                totalCount: preRes.totalCount || preRes.items.length,
                warnings: preRes.warnings,
                serviceType: 'prespec',
                path: '/api/g2b/prespec'
            });
            return;
        }

        // ─────────────────────────────────────────
        // 2. 본공고 단독 라우트 (/api/g2b/bid)
        // ─────────────────────────────────────────
        if (serviceType === 'bid') {
            console.log(`[API /api/g2b/bid Execution] Executing Main Bidding query...`);
            const { inqryBgnDt: bidBgn, inqryEndDt: bidEnd } = normalizeBidDateRange(bgngDt, endDt);
            const paramsObj = {
                numOfRows: String(clientLimit),
                pageNo: String(clientPage),
                inqryDiv: '1',
                inqryBgnDt: bidBgn,
                inqryEndDt: bidEnd,
                type: 'json'
            };
            if (bidNtceNm) paramsObj['bidNtceNm'] = bidNtceNm;
            if (dminsttNm) paramsObj['dminsttNm'] = dminsttNm;

            const { items, totalCount } = await fetchBidItems(bidServiceKey, paramsObj);
            const formatted = items.map((item, idx) => formatBidItem(item, idx)).filter(Boolean);

            res.status(200).json({
                announcements: formatted,
                totalCount,
                serviceType: 'bid',
                path: '/api/g2b/bid'
            });
            return;
        }

        // ─────────────────────────────────────────
        // 3. 전체 통합 병렬 라우트 (/api/g2b?serviceType=all)
        // ─────────────────────────────────────────
        console.log(`[API /api/g2b/all Execution] Executing Parallel Bid + PreSpec Queries...`);
        const fetchBidTask = async () => {
            const { inqryBgnDt: bidBgn, inqryEndDt: bidEnd } = normalizeBidDateRange(bgngDt, endDt);
            const paramsObj = {
                numOfRows: '100', pageNo: '1', inqryDiv: '1', inqryBgnDt: bidBgn, inqryEndDt: bidEnd, type: 'json'
            };
            if (bidNtceNm) paramsObj['bidNtceNm'] = bidNtceNm;
            if (dminsttNm) paramsObj['dminsttNm'] = dminsttNm;
            const { items } = await fetchBidItems(bidServiceKey, paramsObj);
            return items.map((item, idx) => formatBidItem(item, idx)).filter(Boolean);
        };

        const [bidRes, preRes] = await Promise.allSettled([
            fetchBidTask(),
            fetchAllPreSpecCategories(preServiceKey, bgngDt, endDt, clientPage, clientLimit, bidNtceNm, dminsttNm)
        ]);

        let combined = [];
        let totalCount = 0;
        let warnings = [];

        if (bidRes.status === 'fulfilled') {
            combined = combined.concat(bidRes.value || []);
            totalCount += (bidRes.value || []).length;
        }
        if (preRes.status === 'fulfilled') {
            combined = combined.concat(preRes.value?.items || []);
            totalCount += preRes.value?.totalCount || (preRes.value?.items || []).length;
            if (preRes.value?.warnings) warnings = warnings.concat(preRes.value.warnings);
        }

        combined.sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));
        const pagedCombined = combined.slice((clientPage - 1) * clientLimit, clientPage * clientLimit);

        res.status(200).json({
            announcements: pagedCombined,
            totalCount,
            warnings,
            serviceType: 'all',
            path: '/api/g2b'
        });
        return;

    } catch (e) {
        console.error('Serverless function exception:', e.message || e);
        res.status(200).json({
            error: true,
            message: e.message || '나라장터 API 호출 중 오류가 발생했습니다.',
            announcements: [],
            totalCount: 0
        });
    }
};
