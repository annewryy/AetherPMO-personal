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
            // Search mode: 하이브리드 쿼리 수집 및 중복 제거
            console.log(`[Search Mode] Keyword filter active. bidNtceNm='${bidNtceNm}', dminsttNm='${dminsttNm}'`);

            // 1단계: 조달청 API 직접 검색 쿼리 전송 (최대 200건)
            let directItems = [];
            try {
                const directParams = new URLSearchParams({
                    numOfRows: '100',
                    pageNo: '1',
                    inqryDiv: '1',
                    inqryBgnDt: inqryBgnDt,
                    inqryEndDt: inqryEndDt,
                    type: 'json'
                });
                if (bidNtceNm) directParams.append('bidNtceNm', bidNtceNm);
                if (dminsttNm) directParams.append('dminsttNm', dminsttNm);
                
                const directUrl = `https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc?serviceKey=${finalKey}&${directParams.toString()}`;
                const directRes = await fetchG2BData(directUrl);
                
                const directXmlErr = extractXmlError(directRes.data);
                if (!directXmlErr) {
                    const directJson = JSON.parse(directRes.data);
                    const items = directJson?.response?.body?.items;
                    if (items) {
                        if (Array.isArray(items)) directItems = [...items];
                        else if (Array.isArray(items.item)) directItems = [...items.item];
                        else if (items.item) directItems = [items.item];
                    }
                }
            } catch (e) {
                console.warn('[Hybrid Search] Direct API query failed:', e.message);
            }

            // 2단계: 검색어 없이 최근 30일 전체 공고 데이터 수집 (최대 300건)
            const fetchRangeData = async (daysLimit) => {
                const bDate = getPastDateString(daysLimit);
                const eDate = getPastDateString(0);
                const bDt = bDate + '0000';
                const eDt = eDate + '2359';
                
                let collected = [];
                // 최대 3페이지(300건)까지 가져와 병합
                for (let p = 1; p <= 3; p++) {
                    try {
                        const rangeParams = new URLSearchParams({
                            numOfRows: '100',
                            pageNo: String(p),
                            inqryDiv: '1',
                            inqryBgnDt: bDt,
                            inqryEndDt: eDt,
                            type: 'json'
                        });
                        const rangeUrl = `https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc?serviceKey=${finalKey}&${rangeParams.toString()}`;
                        const rangeRes = await fetchG2BData(rangeUrl);
                        
                        const xmlErr = extractXmlError(rangeRes.data);
                        if (xmlErr) break;
                        
                        const rangeJson = JSON.parse(rangeRes.data);
                        const items = rangeJson?.response?.body?.items;
                        if (items) {
                            if (Array.isArray(items)) collected = collected.concat(items);
                            else if (Array.isArray(items.item)) collected = collected.concat(items.item);
                            else if (items.item) collected.push(items.item);
                        } else {
                            break;
                        }
                    } catch (e) {
                        console.warn(`[Hybrid Search] Range query failed for page ${p}:`, e.message);
                        break;
                    }
                }
                return collected;
            };

            let rangeItems = await fetchRangeData(30);

            // 3단계: 두 결과 병합 및 공고번호(bidNtceNo) 기준으로 중복 제거
            let mergedRawItems = [...directItems, ...rangeItems];
            const seenNoticeNos = new Set();
            let uniqueItems = [];
            
            mergedRawItems.forEach(item => {
                const no = item.bidNtceNo;
                if (no && !seenNoticeNos.has(no)) {
                    seenNoticeNos.add(no);
                    uniqueItems.push(item);
                }
            });

            // 4단계: 한글 정규화/공백제거 includes 로컬 부분 매칭 수행
            const performLocalFiltering = (items) => {
                let res = items;
                if (bidNtceNm) {
                    res = res.filter(item => 
                        matchesKeyword(item.bidNtceNm || '', bidNtceNm) || 
                        matchesKeyword(item.bidNtceNo || '', bidNtceNm)
                    );
                }
                if (dminsttNm) {
                    res = res.filter(item => 
                        matchesKeyword(item.dminsttNm || '', dminsttNm) || 
                        matchesKeyword(item.ntceInsttNm || '', dminsttNm)
                    );
                }
                return res;
            };

            let finalFilteredList = performLocalFiltering(uniqueItems);
            console.log(`[Hybrid Search] 30-day filtered matching items size: ${finalFilteredList.length}`);

            // 5단계: 결과가 너무 적으면(5건 미만) 최근 90일 범위로 확장 수집 (확장 옵션 작동)
            if (finalFilteredList.length < 5) {
                console.log(`[Hybrid Search] Results count (${finalFilteredList.length}) is too low. Expanding search range to 90 days...`);
                const extendedRangeItems = await fetchRangeData(90);
                
                // 다시 병합 및 중복 제거
                let extendedRawItems = [...uniqueItems, ...extendedRangeItems];
                const extendedSeen = new Set();
                let extendedUnique = [];
                extendedRawItems.forEach(item => {
                    const no = item.bidNtceNo;
                    if (no && !extendedSeen.has(no)) {
                        extendedSeen.add(no);
                        extendedUnique.push(item);
                    }
                });
                
                finalFilteredList = performLocalFiltering(extendedUnique);
                console.log(`[Hybrid Search] Post-expansion final filtered list size: ${finalFilteredList.length}`);
            }

            // 6단계: 페이징 처리 및 리턴 포맷팅
            const startIndex = (clientPage - 1) * clientLimit;
            const endIndex = startIndex + clientLimit;
            const slicedList = finalFilteredList.slice(startIndex, endIndex);

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

            res.status(200).json({ announcements: formattedList, totalCount: finalFilteredList.length });
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
