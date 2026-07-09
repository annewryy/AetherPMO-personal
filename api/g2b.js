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
// 사전규격 API - HrcspSsstndrdInfoService
// ─────────────────────────────────────────────
const PRE_API_BASE = 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServc';

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
const fetchPreItems = async (finalKey, params) => {
    const requestUrl = `${PRE_API_BASE}?serviceKey=${finalKey}&${params.toString()}`;
    const result = await fetchG2BData(requestUrl);
    
    const xmlErr = extractXmlError(result.data);
    if (xmlErr) {
        console.warn('[PreSpec] XML error:', xmlErr.msg);
        return { items: [], totalCount: 0 };
    }
    
    let parsed;
    try {
        parsed = JSON.parse(result.data);
    } catch (e) {
        console.warn('[PreSpec] JSON parse error:', e.message);
        return { items: [], totalCount: 0 };
    }
    
    const header = parsed?.response?.header;
    if (header && header.resultCode && header.resultCode !== '00') {
        console.warn(`[PreSpec] API Error - Code: ${header.resultCode}, Message: ${header.resultMsg}`);
        return { items: [], totalCount: 0 };
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
 * 사전규격 항목을 본공고와 동일한 형식으로 변환
 */
const formatPreItem = (item, idx) => ({
    id: `g2b-pre-${idx}-${Date.now()}`,
    announcementType: 'pre',           // 사전규격 표시
    announcementNo: item.bfSpecRgstNo || item.publicPrcureThngNo || '-',
    name: item.publicPrcureThngNm || item.ntceNm || '-',
    customer: item.dminsttNm || item.ntceInsttNm || '-',
    budget: Number(item.asignBdgtAmt || item.presmptPrce || 0),
    publishDate: item.prcureReqDt ? item.prcureReqDt.substring(0, 10)
                 : item.rgstDt ? item.rgstDt.substring(0, 10) : '-',
    endDate: item.opninRcptDeadlineDt ? item.opninRcptDeadlineDt.substring(0, 10) : '-',
    url: item.detailUrl || item.bfSpecRgstUrl || '#',
    presmptPrce: Number(item.presmptPrce || 0),
    asignBdgtAmt: Number(item.asignBdgtAmt || 0)
});

/**
 * 본공고 항목을 포맷팅
 */
const formatBidItem = (item, idx) => ({
    id: `g2b-bid-${idx}-${Date.now()}`,
    announcementType: 'bid',           // 본공고 표시
    announcementNo: item.bidNtceNo || '-',
    name: item.bidNtceNm || '-',
    customer: item.dminsttNm || '-',
    budget: Number(item.asignBdgtAmt || item.presmptPrce || 0),
    publishDate: item.bidNtceDt ? item.bidNtceDt.substring(0, 10) : '-',
    endDate: item.bidClseDt ? item.bidClseDt.substring(0, 10) : '-',
    url: item.bidNtceDtlUrl || '#',
    presmptPrce: Number(item.presmptPrce || 0),
    asignBdgtAmt: Number(item.asignBdgtAmt || 0)
});

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
        // 공고유형: 'pre'(사전규격), 'bid'(본공고), 'all'(전체, 기본값)
        const announcementType = query.announcementType || 'all';

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

        // 실행할 조회 모드 결정
        const fetchBid = (announcementType === 'bid' || announcementType === 'all');
        const fetchPre = (announcementType === 'pre' || announcementType === 'all');

        console.log(`[G2B] announcementType=${announcementType}, fetchBid=${fetchBid}, fetchPre=${fetchPre}`);

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
                    const params = new URLSearchParams({
                        numOfRows: String(clientLimit),
                        pageNo: String(clientPage),
                        inqryDiv: '1',
                        inqryBgnDt: inqryBgnDt,
                        inqryEndDt: inqryEndDt,
                        type: 'json'
                    });
                    const requestUrl = `${BID_API_BASE}?serviceKey=${finalKey}&${params.toString()}`;
                    console.log(`[General Mode - BID] Fetching url: ${requestUrl.split(finalKey).join('[MASKED]')}`);
                    const result = await fetchG2BData(requestUrl);
                    
                    const xmlErr = extractXmlError(result.data);
                    if (xmlErr) throw new Error(`OpenAPI Error (XML) - Code: ${xmlErr.code}, Message: ${xmlErr.msg}`);
                    
                    const parsedJson = JSON.parse(result.data);
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
                    totalCount += parseInt(parsedJson?.response?.body?.totalCount || '0');
                    allFormattedItems = allFormattedItems.concat(list.map((item, idx) => formatBidItem(item, idx)));
                } catch (e) {
                    console.warn('[General Mode - BID] Failed:', e.message);
                }
            }

            // 사전규격 조회
            if (fetchPre) {
                try {
                    const params = new URLSearchParams({
                        numOfRows: String(clientLimit),
                        pageNo: String(clientPage),
                        inqryBgnDt: inqryBgnDt,
                        inqryEndDt: inqryEndDt,
                        type: 'json'
                    });
                    console.log(`[General Mode - PRE] Fetching pre-spec data`);
                    const { items, totalCount: preTotal } = await fetchPreItems(finalKey, params);
                    totalCount += preTotal;
                    allFormattedItems = allFormattedItems.concat(items.map((item, idx) => formatPreItem(item, idx)));
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
        // 검색 모드(Search): 하이브리드 쿼리 수집
        // ─────────────────────────────────────────
        console.log(`[Search Mode] Keyword filter active. bidNtceNm='${bidNtceNm}', dminsttNm='${dminsttNm}', type='${announcementType}'`);

        const getPastDateRange = (daysBack) => {
            const bDate = getPastDateString(daysBack);
            const eDate = getPastDateString(0);
            return { bDt: bDate + '0000', eDt: eDate + '2359' };
        };

        // 특정 범위에서 본공고 수집
        const fetchBidRange = async (daysBack, maxPages = 3) => {
            const { bDt, eDt } = getPastDateRange(daysBack);
            let collected = [];
            
            // 1. 직접 API 키워드 검색
            try {
                const directParams = new URLSearchParams({
                    numOfRows: '100', pageNo: '1',
                    inqryDiv: '1', inqryBgnDt: bDt, inqryEndDt: eDt, type: 'json'
                });
                if (bidNtceNm) directParams.append('bidNtceNm', bidNtceNm);
                if (dminsttNm) directParams.append('dminsttNm', dminsttNm);
                const { items } = await fetchBidItems(finalKey, directParams);
                collected = collected.concat(items);
            } catch (e) {
                console.warn('[Search-BID] Direct query failed:', e.message);
            }
            
            // 2. 전체 수집 후 로컬 필터링
            for (let p = 1; p <= maxPages; p++) {
                try {
                    const rangeParams = new URLSearchParams({
                        numOfRows: '100', pageNo: String(p),
                        inqryDiv: '1', inqryBgnDt: bDt, inqryEndDt: eDt, type: 'json'
                    });
                    const { items } = await fetchBidItems(finalKey, rangeParams);
                    if (!items.length) break;
                    collected = collected.concat(items);
                } catch (e) {
                    console.warn(`[Search-BID] Range page ${p} failed:`, e.message);
                    break;
                }
            }
            return collected;
        };

        // 특정 범위에서 사전규격 수집
        const fetchPreRange = async (daysBack, maxPages = 3) => {
            const { bDt, eDt } = getPastDateRange(daysBack);
            let collected = [];
            for (let p = 1; p <= maxPages; p++) {
                try {
                    const params = new URLSearchParams({
                        numOfRows: '100', pageNo: String(p),
                        inqryBgnDt: bDt, inqryEndDt: eDt, type: 'json'
                    });
                    if (bidNtceNm) params.append('publicPrcureThngNm', bidNtceNm);
                    if (dminsttNm) params.append('dminsttNm', dminsttNm);
                    const { items } = await fetchPreItems(finalKey, params);
                    if (!items.length) break;
                    collected = collected.concat(items);
                } catch (e) {
                    console.warn(`[Search-PRE] Range page ${p} failed:`, e.message);
                    break;
                }
            }
            return collected;
        };

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
            if (dminsttNm) r = r.filter(i => matchesKeyword(i.dminsttNm || i.ntceInsttNm || '', dminsttNm));
            return r;
        };

        // 중복 제거 (본공고: bidNtceNo 기준)
        const deduplicateBid = (items) => {
            const seen = new Set();
            return items.filter(i => {
                const key = i.bidNtceNo;
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        };

        // 중복 제거 (사전규격: bfSpecRgstNo 기준)
        const deduplicatePre = (items) => {
            const seen = new Set();
            return items.filter(i => {
                const key = i.bfSpecRgstNo || i.publicPrcureThngNo || Math.random();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        };

        // 수집 실행
        const promises = [];
        if (fetchBid) promises.push(fetchBidRange(30).then(items => ({ type: 'bid', items })));
        if (fetchPre) promises.push(fetchPreRange(30).then(items => ({ type: 'pre', items })));

        const results = await Promise.allSettled(promises);

        let bidRawItems = [];
        let preRawItems = [];
        for (const r of results) {
            if (r.status === 'fulfilled') {
                if (r.value.type === 'bid') bidRawItems = r.value.items;
                if (r.value.type === 'pre') preRawItems = r.value.items;
            }
        }

        let filteredBid = filterBidItems(deduplicateBid(bidRawItems));
        let filteredPre = filterPreItems(deduplicatePre(preRawItems));

        // 검색 결과가 너무 적으면 90일로 확장
        if (filteredBid.length < 5 && fetchBid) {
            console.log('[Search] Expanding bid search to 90 days...');
            const extended = await fetchBidRange(90, 3);
            filteredBid = filterBidItems(deduplicateBid(extended));
        }
        if (filteredPre.length < 5 && fetchPre) {
            console.log('[Search] Expanding pre-spec search to 90 days...');
            const extended = await fetchPreRange(90, 3);
            filteredPre = filterPreItems(deduplicatePre(extended));
        }

        // 포맷팅 및 병합
        const formattedBid = filteredBid.map((item, idx) => formatBidItem(item, idx));
        const formattedPre = filteredPre.map((item, idx) => formatPreItem(item, idx));

        let mergedList = [...formattedPre, ...formattedBid];

        // 날짜 최신순 정렬
        mergedList.sort((a, b) => {
            if (a.publishDate < b.publishDate) return 1;
            if (a.publishDate > b.publishDate) return -1;
            return 0;
        });

        console.log(`[Search] Result: bid=${formattedBid.length}, pre=${formattedPre.length}, merged=${mergedList.length}`);

        // 페이징 처리
        const startIndex = (clientPage - 1) * clientLimit;
        const endIndex = startIndex + clientLimit;
        const slicedList = mergedList.slice(startIndex, endIndex);

        res.status(200).json({ announcements: slicedList, totalCount: mergedList.length });
        return;

    } catch (e) {
        console.error('Serverless function exception:', maskKey(e.message || e));
        res.status(500).json({ 
            error: true, 
            message: 'Internal Server Error', 
            details: maskKey(e.message || e) 
        });
    }
};
