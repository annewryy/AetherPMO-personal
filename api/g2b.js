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

// 날짜 정규화 함수: 본공고용 (12자리: YYYYMMDD0000 / YYYYMMDD2359)
const normalizeBidDateRange = (bgngDt, endDt) => {
    const cleanBgn = bgngDt.replace(/-/g, '').trim();
    const cleanEnd = endDt.replace(/-/g, '').trim();
    return {
        inqryBgnDt: cleanBgn + '0000',
        inqryEndDt: cleanEnd + '2359'
    };
};

// 날짜 정규화 함수: 사전규격용 (8자리: YYYYMMDD / YYYYMMDD)
const normalizePreDateRange = (bgngDt, endDt) => {
    const cleanBgn = bgngDt.replace(/-/g, '').trim();
    const cleanEnd = endDt.replace(/-/g, '').trim();
    return {
        inqryBgnDt: cleanBgn,
        inqryEndDt: cleanEnd
    };
};

const normalizeString = (str) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .replace(/\s+/g, '')                  // 모든 공백 제거
        .normalize('NFC');                     // 한글 NFC 정규화
};

const matchesKeyword = (target, keyword) => {
    if (!keyword) return true;
    return normalizeString(target).includes(normalizeString(keyword));
};

const getPastDateString = (days) => {
    const d = new Date();
    const past = new Date(d.getTime() - days * 24 * 60 * 60 * 1000);
    const yyyy = past.getFullYear();
    const mm = String(past.getMonth() + 1).padStart(2, '0');
    const dd = String(past.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
};

// ─────────────────────────────────────────────
// 본공고(입찰공고) API - BidPublicInfoService
// ─────────────────────────────────────────────
const BID_API_BASE = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc';

// ─────────────────────────────────────────────
// 사전규격 API - HrcspSsstndrdInfoService (일반 및 검색조건 조회 분리)
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 사전규격 API - HrcspSsstndrdInfoService (용역, 공사, 물품, 외자)
// ─────────────────────────────────────────────
const PRE_API_SERVICES_BASE = 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServcPPSSrch';
const PRE_API_CONSTRUCTION_BASE = 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoCnstwkPPSSrch';
const PRE_API_THNG_BASE = 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoThngPPSSrch';
const PRE_API_FRGCPT_BASE = 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoFrgcptPPSSrch';

const PRE_SEARCH_API_BASE = 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServcPPSSrch';

/**
 * 본공고 목록 가져오기
 * Returns raw API items array
 */
const fetchBidItems = async (finalKey, params) => {
    const requestUrl = `${BID_API_BASE}?serviceKey=${finalKey}&${params.toString()}`;
    const result = await fetchG2BData(requestUrl);
    
    const xmlErr = extractXmlError(result.data);
    if (xmlErr) throw new Error(`OpenAPI Error (XML) - Code: ${xmlErr.code}, Message: ${xmlErr.msg}`);
    
    const parsed = JSON.parse(result.data);
    const header = parsed?.response?.header;
    if (header && header.resultCode && header.resultCode !== '00') {
        throw new Error(`OpenAPI Error (JSON) - Code: ${header.resultCode}, Message: ${header.resultMsg}`);
    }
    
    const itemsData = parsed?.response?.body?.items;
    if (!itemsData) return { items: [], totalCount: 0 };
    
    let items = [];
    if (Array.isArray(itemsData)) items = itemsData;
    else if (Array.isArray(itemsData.item)) items = itemsData.item;
    else if (itemsData.item) items = [itemsData.item];
    
    const totalCount = parseInt(parsed?.response?.body?.totalCount || '0');
    return { items, totalCount };
};

/**
 * 사전규격 목록 가져오기 (용역)
 * Returns raw API items array
 */
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
            warning: { category: categoryName, endpoint: apiBase, httpStatus, code: 'JSON_PARSE_ERROR', msg: 'JSON 파싱 실패 (XML/HTML 응답 가능성)', rawSnippet }
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

/**
 * 사전규격 항목을 공통 형식으로 변환 (Null 방어 및 Fallback 매핑 제공)
 */
/**
 * 사전규격 항목을 공통 모델로 정규화 (용역/공사/물품/외자 통합)
 */
const formatPreItem = (item, idx, businessType = '용역') => {
    if (!item) return null;
    const rawNo = item.bfSpecRgstNo || item.publicPrcureThngNo || item.rgstNo || '-';
    const rawName = item.prcurRqstPrdnm || item.prcurRqstNm || item.publicPrcureThngNm || item.ntceNm || item.bidNtceNm || '-';
    const rawCustomer = item.dminsttNm || item.ntceInsttNm || item.orderInsttNm || item.rcvInsttNm || '-';
    const rawBudget = Number(item.asignBdgtAmt || item.presmptPrce || item.budget || 0);
    
    let rawPublishDate = '-';
    if (item.rlseDt) {
        rawPublishDate = item.rlseDt.substring(0, 10);
    } else if (item.rgstDt) {
        rawPublishDate = item.rgstDt.substring(0, 10);
    } else if (item.prcureReqDt) {
        rawPublishDate = item.prcureReqDt.substring(0, 10);
    } else if (item.rcptDt) {
        rawPublishDate = item.rcptDt.substring(0, 10);
    }
    
    let rawEndDate = '-';
    if (item.opnyRcvClseDt) {
        rawEndDate = item.opnyRcvClseDt.substring(0, 10);
    } else if (item.opninRcptDeadlineDt) {
        rawEndDate = item.opninRcptDeadlineDt.substring(0, 10);
    } else if (item.opninRcptEndDt) {
        rawEndDate = item.opninRcptEndDt.substring(0, 10);
    }

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
    return {
        id: `g2b-bid-${idx}-${Date.now()}`,
        announcementType: 'bid',
        announcementNo: item.bidNtceNo || '-',
        announcementOrd: item.bidNtceOrd || '001',
        name: item.bidNtceNm || '-',
        customer: item.dminsttNm || item.ntceInsttNm || '-',
        ntceInsttNm: item.ntceInsttNm || item.dminsttNm || '-',
        budget: Number(item.asignBdgtAmt || item.presmptPrce || 0),
        publishDate: item.bidNtceDt ? item.bidNtceDt.substring(0, 10) : '-',
        endDate: item.bidClseDt ? item.bidClseDt.substring(0, 10) : '-',
        bidBeginDt: item.bidBeginDt || item.bidNtceBgnDt || '-',
        bidClseDt: item.bidClseDt || '-',
        opengDt: item.opengDt || item.openDt || '-',
        bidMethdNm: item.bidMethdNm || '일반(총액)경쟁',
        cntrctCnclsMthdNm: item.cntrctCnclsMthdNm || '협상에 의한 계약',
        url: item.bidNtceDtlUrl || item.detailUrl || '#',
        presmptPrce: Number(item.presmptPrce || 0),
        asignBdgtAmt: Number(item.asignBdgtAmt || 0)
    };
};

module.exports = async (req, res) => {
    // Enable CORS & Disable 304 Cache / ETag caching
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control, Pragma');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 1. Load service keys
    const cleanKey = (key) => {
        if (!key) return '';
        let cleaned = key.replace(/[\r\n]/g, '').trim();
        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
            cleaned = cleaned.slice(1, -1);
        } else if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
            cleaned = cleaned.slice(1, -1);
        }
        return cleaned.trim();
    };

    let bidServiceKey = cleanKey(process.env.G2B_API_KEY || '');
    let preServiceKey = cleanKey(process.env.G2B_API_KEY || process.env.G2B_PRE_SERVICE_KEY || '');

    // Diagnostics Log
    const crypto = require('crypto');
    const bidSha = crypto.createHash('sha256').update(bidServiceKey).digest('hex');
    const preSha = crypto.createHash('sha256').update(preServiceKey).digest('hex');
    console.log(`[Diagnostics] Keys load check: ` + 
                `bidExists=${!!bidServiceKey}, bidSha=${bidSha.slice(0, 10)}..., ` + 
                `preExists=${!!preServiceKey}, preSha=${preSha.slice(0, 10)}...`);
    
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
        if (bidServiceKey) {
            const escapedKey = bidServiceKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            masked = masked.replace(new RegExp(escapedKey, 'g'), '[MASKED_BID]');
            const encodedBidKey = encodeURIComponent(bidServiceKey);
            if (encodedBidKey && encodedBidKey !== bidServiceKey) {
                const escapedEncoded = encodedBidKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                masked = masked.replace(new RegExp(escapedEncoded, 'g'), '[MASKED_BID]');
            }
        }
        if (preServiceKey && preServiceKey !== bidServiceKey) {
            const escapedKey = preServiceKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            masked = masked.replace(new RegExp(escapedKey, 'g'), '[MASKED_PRE]');
            const encodedPreKey = encodeURIComponent(preServiceKey);
            if (encodedPreKey && encodedPreKey !== preServiceKey) {
                const escapedEncoded = encodedPreKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                masked = masked.replace(new RegExp(escapedEncoded, 'g'), '[MASKED_PRE]');
            }
        }
        return masked;
    };

    try {
        let query = {};
        try {
            const reqUrl = req.url.startsWith('http') ? req.url : `http://localhost${req.url}`;
            const parsedUrl = new URL(reqUrl);
            parsedUrl.searchParams.forEach((val, key) => { query[key] = val; });
        } catch (uErr) {
            query = url.parse(req.url, true).query || {};
        }

        const bidNtceNm = query.bidNtceNm || '';
        const dminsttNm = query.dminsttNm || '';
        let bgngDt = query.bgngDt || '';
        let endDt = query.endDt || '';
        const clientPage = parseInt(query.pageNo || '1');
        const clientLimit = parseInt(query.numOfRows || '10');
        // 공고유형: 'pre'(사전규격), 'bid'(본공고), 'all'(전체, 기본값)
        // Vercel Rewrite 또는 직접 쿼리를 처리하기 위해 serviceType과 announcementType 둘 다 수용
        const serviceType = query.serviceType || query.announcementType || 'all';

        // 실행할 조회 모드 결정
        const fetchBid = (serviceType === 'bid' || serviceType === 'all');
        const fetchPre = (serviceType === 'pre' || serviceType === 'preSpec' || serviceType === 'pre_spec' || serviceType === 'all');

        if (fetchBid && !bidServiceKey) {
            res.status(200).json({ 
                error: true, 
                message: '서버에 나라장터 API 키(G2B_API_KEY)가 설정되지 않았습니다. Vercel 환경 변수에 G2B_API_KEY를 등록해주세요.',
                announcements: [],
                totalCount: 0
            });
            return;
        }
        if (fetchPre && !preServiceKey) {
            res.status(200).json({ 
                error: true, 
                message: '서버에 나라장터 사전규격 API 키(G2B_PRE_SERVICE_KEY 또는 G2B_API_KEY)가 설정되지 않았습니다.',
                announcements: [],
                totalCount: 0
            });
            return;
        }

        // Clean dates: remove dashes
        bgngDt = bgngDt.replace(/-/g, '').trim();
        endDt = endDt.replace(/-/g, '').trim();

        if (!bgngDt || !endDt) {
            const today = new Date();
            const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            const formatDate = (d) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
            bgngDt = bgngDt || formatDate(past);
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

        // Apply encodeURIComponent() to keys exactly once, preventing double encoding
        const encodeKey = (key) => {
            if (!key) return '';
            let rawKey = key;
            try {
                if (key.includes('%')) {
                    rawKey = decodeURIComponent(key);
                }
            } catch (e) {
                console.warn('[Diagnostics] Failed to decode potentially encoded key:', e.message);
            }
            return encodeURIComponent(rawKey);
        };

        const finalBidKey = encodeKey(bidServiceKey);
        const finalPreKey = encodeKey(preServiceKey);

        console.log(`[G2B] serviceType=${serviceType}, fetchBid=${fetchBid}, fetchPre=${fetchPre}`);

        const isSearchMode = !!(bidNtceNm || dminsttNm);

        // ─────────────────────────────────────────
        // 비검색 모드(General): 단순 페이지 조회
        // ─────────────────────────────────────────
        if (!isSearchMode) {
            let allFormattedItems = [];
            let totalCount = 0;

            // 본공고 조회
            if (fetchBid) {
                try {
                    const { inqryBgnDt: bidBgn, inqryEndDt: bidEnd } = normalizeBidDateRange(bgngDt, endDt);
                    const params = new URLSearchParams({
                        numOfRows: String(clientLimit),
                        pageNo: String(clientPage),
                        inqryDiv: '1',
                        inqryBgnDt: bidBgn,
                        inqryEndDt: bidEnd,
                        type: 'json'
                    });
                    const requestUrl = `${BID_API_BASE}?serviceKey=${finalBidKey}&${params.toString()}`;
                    console.log(`[General Mode - BID] Fetching url: ${requestUrl.split(finalBidKey).join('[MASKED]')}`);
                    const result = await fetchG2BData(requestUrl);
                    
                    const xmlErr = extractXmlError(result.data);
                    if (xmlErr) {
                        console.warn('[General Mode - BID] OpenAPI XML Error:', xmlErr.msg);
                    } else {
                        let parsedJson = null;
                        try {
                            parsedJson = JSON.parse(result.data);
                        } catch (pErr) {
                            console.warn('[General Mode - BID] Non-JSON response received:', pErr.message);
                        }

                        if (parsedJson) {
                            const header = parsedJson?.response?.header;
                            if (header && header.resultCode && header.resultCode !== '00') {
                                console.warn(`[General Mode - BID] Header Error: ${header.resultCode} - ${header.resultMsg}`);
                            } else {
                                const itemsData = parsedJson?.response?.body?.items;
                                let list = [];
                                if (itemsData) {
                                    if (Array.isArray(itemsData)) list = itemsData;
                                    else if (Array.isArray(itemsData.item)) list = itemsData.item;
                                    else if (itemsData.item) list = [itemsData.item];
                                }
                                totalCount += parseInt(parsedJson?.response?.body?.totalCount || '0');
                                allFormattedItems = allFormattedItems.concat(list.map((item, idx) => formatBidItem(item, idx)).filter(Boolean));
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[General Mode - BID] Failed:', e.message);
                }
            }

            // 사전규격 조회
            if (fetchPre) {
                try {
                    const { inqryBgnDt: preBgn, inqryEndDt: preEnd } = normalizePreDateRange(bgngDt, endDt);
                    const params = new URLSearchParams({
                        numOfRows: String(clientLimit),
                        pageNo: String(clientPage),
                        inqryBgnDt: preBgn,
                        inqryEndDt: preEnd,
                        type: 'json'
                    });
                    console.log(`[General Mode - PRE] Fetching pre-spec data`);
                    const { items, totalCount: preTotal } = await fetchPreItems(finalPreKey, params, PRE_API_BASE);
                    totalCount += preTotal;
                    allFormattedItems = allFormattedItems.concat(items.map((item, idx) => formatPreItem(item, idx)).filter(Boolean));
                } catch (e) {
                    console.warn('[General Mode - PRE] Failed:', e.message);
                }
            }

            // 게시일 최신순 정렬
            allFormattedItems.sort((a, b) => {
                if (a.publishDate < b.publishDate) return 1;
                if (a.publishDate > b.publishDate) return -1;
                return 0;
            });

            res.status(200).json({ announcements: allFormattedItems, totalCount });
            return;
        }

        // ─────────────────────────────────────────
        // 검색 모드(Search): 병렬 직접 키워드 검색
        // ─────────────────────────────────────────
        console.log(`[Search Mode] bidNtceNm='${bidNtceNm}', dminsttNm='${dminsttNm}', type='${serviceType}'`);

        // 로컬 필터링 (본공고용)
        const filterBidItems = (items) => {
            let r = items;
            if (bidNtceNm) r = r.filter(i => matchesKeyword(i.bidNtceNm || '', bidNtceNm) || matchesKeyword(i.bidNtceNo || '', bidNtceNm));
            if (dminsttNm) r = r.filter(i => matchesKeyword(i.dminsttNm || '', dminsttNm) || matchesKeyword(i.ntceInsttNm || '', dminsttNm));
            return r;
        };

        // 로컬 필터링 (사전규격용)
        const filterPreItems = (items) => {
            let r = items;
            if (bidNtceNm) r = r.filter(i => matchesKeyword(i.publicPrcureThngNm || i.ntceNm || '', bidNtceNm));
            if (dminsttNm) r = r.filter(i => matchesKeyword(i.dminsttNm || i.ntceInsttNm || i.orderInsttNm || '', dminsttNm));
            return r;
        };

        // 본공고 검색 (API 직접 키워드 검색 + 로컬 필터링)
        const searchBid = async () => {
            if (!fetchBid) return [];
            try {
                const { inqryBgnDt: bidBgn, inqryEndDt: bidEnd } = normalizeBidDateRange(bgngDt, endDt);
                const params = new URLSearchParams({
                    numOfRows: '100', pageNo: '1',
                    inqryDiv: '1',
                    inqryBgnDt: bidBgn,
                    inqryEndDt: bidEnd,
                    type: 'json'
                });
                if (bidNtceNm) params.append('bidNtceNm', bidNtceNm);
                if (dminsttNm) params.append('dminsttNm', dminsttNm);
                const { items } = await fetchBidItems(finalBidKey, params);
                return filterBidItems(items);
            } catch (e) {
                console.warn('[Search-BID] Failed:', e.message);
                return [];
            }
        };

        // 사전규격 검색 (API 직접 키워드 검색 + 로컬 필터링)
        const searchPre = async () => {
            if (!fetchPre) return [];
            try {
                const { inqryBgnDt: preBgn, inqryEndDt: preEnd } = normalizePreDateRange(bgngDt, endDt);
                const params = new URLSearchParams({
                    numOfRows: '100', pageNo: '1',
                    inqryBgnDt: preBgn,
                    inqryEndDt: preEnd,
                    type: 'json'
                });
                
                // 검색 조건 여부에 따라 getPublicPrcureThngInfoServcPPSSrch 오퍼레이션 분기 호출
                let apiBase = PRE_API_BASE;
                if (bidNtceNm) {
                    params.append('publicPrcureThngNm', bidNtceNm);
                    apiBase = PRE_SEARCH_API_BASE;
                }
                if (dminsttNm) {
                    params.append('dminsttNm', dminsttNm);
                }
                
                const { items } = await fetchPreItems(finalPreKey, params, apiBase);
                return filterPreItems(items);
            } catch (e) {
                console.warn('[Search-PRE] Failed:', e.message);
                return [];
            }
        };

        // 병렬 실행
        const [bidResults, preResults] = await Promise.all([searchBid(), searchPre()]);

        console.log(`[Search] bid=${bidResults.length}, pre=${preResults.length}`);

        // 포맷팅 및 병합 (사전규격 먼저)
        const formattedBid = bidResults.map((item, idx) => formatBidItem(item, idx)).filter(Boolean);
        const formattedPre = preResults.map((item, idx) => formatPreItem(item, idx)).filter(Boolean);
        let mergedList = [...formattedPre, ...formattedBid];

        // 날짜 최신순 정렬
        mergedList.sort((a, b) => {
            if (a.publishDate < b.publishDate) return 1;
            if (a.publishDate > b.publishDate) return -1;
            return 0;
        });

        // 페이징 처리
        const startIndex = (clientPage - 1) * clientLimit;
        const slicedList = mergedList.slice(startIndex, startIndex + clientLimit);

        res.status(200).json({ announcements: slicedList, totalCount: mergedList.length });
        return;

    } catch (e) {
        console.error('Serverless function exception:', maskKey(e.message || e));
        res.status(200).json({ 
            error: true, 
            message: maskKey(e.message || '나라장터 API 호출 중 오류가 발생했습니다.'), 
            announcements: [],
            totalCount: 0,
            details: maskKey(e.message || e) 
        });
    }
};
