const PRE_SPEC_BASE_URL =
    'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService';

const OPERATIONS_GENERAL = {
    '용역': 'getPublicPrcureThngInfoServc',
    '공사': 'getPublicPrcureThngInfoCnstwk',
    '물품': 'getPublicPrcureThngInfoThng',
    '외자': 'getPublicPrcureThngInfoFrgcpt'
};

const OPERATIONS_SEARCH = {
    '용역': 'getPublicPrcureThngInfoServcPPSSrch',
    '공사': 'getPublicPrcureThngInfoCnstwkPPSSrch',
    '물품': 'getPublicPrcureThngInfoThngPPSSrch',
    '외자': 'getPublicPrcureThngInfoFrgcptPPSSrch'
};

function cleanKey(value = '') {
    if (!value) return '';

    let cleaned = String(value)
        .trim()
        .replace(/^['"]|['"]$/g, '');

    if (cleaned.includes('%')) {
        try {
            cleaned = decodeURIComponent(cleaned);
        } catch (error) {
            console.warn('[G2B PreSpec Key Decode Warning]', error.message);
        }
    }

    return cleaned;
}

function toApiDate(value, fallbackTime) {
    if (!value) return '';

    const digits = String(value).replace(/\D/g, '');

    if (digits.length >= 12) {
        return digits.slice(0, 12);
    }

    if (digits.length === 8) {
        return `${digits}${fallbackTime}`;
    }

    return '';
}

function toApiDate8(value) {
    if (!value) return '';
    const digits = String(value).replace(/\D/g, '');
    return digits.length >= 8 ? digits.slice(0, 8) : '';
}

function normalizeString(str) {
    if (!str) return '';
    return String(str).toLowerCase().replace(/\s+/g, '').normalize('NFC');
}

function matchesDemandAgency(rawItem, selectedAgency) {
    if (!selectedAgency) return true;
    const targetNorm = normalizeString(selectedAgency);
    if (!targetNorm || targetNorm === 'all' || targetNorm === '전체' || targetNorm === '전체수요기관') {
        return true;
    }

    if (!rawItem) return false;

    // 수요기관 비교 대상 순서:
    // 1. item.dminsttNm
    // 2. item.orderInsttNm
    // 3. item.rlDminsttNm
    const candidates = [
        rawItem.dminsttNm,
        rawItem.orderInsttNm,
        rawItem.rlDminsttNm,
        rawItem.organization,
        rawItem.customer
    ].filter(val => val && typeof val === 'string' && val.trim().length > 0);

    if (candidates.length === 0) return false;

    // 공백 차이 등을 고려해 정규화한 뒤 선택한 수요기관과 부분일치 방식으로 비교
    return candidates.some(cand => normalizeString(cand).includes(targetNorm));
}

function normalizeItems(items) {
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
}

async function callCategoryApi({
    category,
    operation,
    serviceKey,
    pageNo,
    numOfRows,
    beginDate,
    endDate,
    dminsttNm = '',
    searchKeyword = ''
}) {
    const url = new URL(`${PRE_SPEC_BASE_URL}/${operation}`);

    url.searchParams.set('serviceKey', serviceKey);
    url.searchParams.set('inqryDiv', '1');
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('numOfRows', String(numOfRows));
    url.searchParams.set('type', 'json');

    if (beginDate) {
        url.searchParams.set('inqryBgnDt', beginDate);
    }

    if (endDate) {
        url.searchParams.set('inqryEndDt', endDate);
    }

    if (dminsttNm) {
        url.searchParams.set('dminsttNm', dminsttNm);
    }

    if (searchKeyword) {
        url.searchParams.set('publicPrcureThngNm', searchKeyword);
    }

    const safeUrl = url
        .toString()
        .replace(/serviceKey=[^&]+/, 'serviceKey=[REDACTED]');

    console.log('[G2B PreSpec Request]', {
        category,
        operation,
        url: safeUrl
    });

    const response = await fetch(url);
    const rawText = await response.text();

    let data;

    try {
        data = JSON.parse(rawText);
    } catch (error) {
        throw new Error(
            `${category} (${operation}) 응답 JSON 파싱 실패: ${rawText.slice(0, 200)}`
        );
    }

    const header =
        data?.response?.header ||
        data?.OpenAPI_ServiceResponse?.cmmMsgHeader ||
        {};

    const resultCode =
        header.resultCode ||
        header.returnReasonCode ||
        '';

    const resultMsg =
        header.resultMsg ||
        header.errMsg ||
        header.returnAuthMsg ||
        '';

    if (!response.ok || (resultCode && resultCode !== '00' && resultCode !== '0')) {
        throw new Error(
            `${category} (${operation}) API 오류: HTTP ${response.status}, ` +
            `${resultCode || 'UNKNOWN'} ${resultMsg || ''}`.trim()
        );
    }

    const body = data?.response?.body || {};
    const rawItems =
        body?.items?.item ??
        body?.items ??
        [];

    const items = normalizeItems(rawItems);

    console.log('[G2B PreSpec Response]', {
        category,
        operation,
        httpStatus: response.status,
        resultCode,
        resultMsg,
        totalCount: Number(body.totalCount || items.length),
        parsedItems: items.length
    });

    return {
        totalCount: Number(body.totalCount || items.length),
        rawItems: items
    };
}

async function fetchCategory({
    category,
    serviceKey,
    pageNo,
    numOfRows,
    beginDate,
    endDate,
    beginDate8,
    endDate8,
    dminsttNm = '',
    searchKeyword = ''
}) {
    const isSearch = Boolean(dminsttNm || searchKeyword);
    const targetOperation = isSearch
        ? OPERATIONS_SEARCH[category]
        : OPERATIONS_GENERAL[category];

    let apiResult = null;
    let lastError = null;

    // 1차 시도: 12자리 일시 + 타겟 Operation
    try {
        apiResult = await callCategoryApi({
            category,
            operation: targetOperation,
            serviceKey,
            pageNo,
            numOfRows,
            beginDate,
            endDate,
            dminsttNm,
            searchKeyword
        });
    } catch (err) {
        lastError = err;
        console.warn(`[G2B PreSpec] ${category} 12자리 호출 실패 (${targetOperation}):`, err.message);
    }

    // 2차 시도: 8자리 일시 재시도 (결과가 없거나 에러인 경우)
    if ((!apiResult || !apiResult.rawItems || apiResult.rawItems.length === 0) && (beginDate8 || endDate8)) {
        try {
            const res8 = await callCategoryApi({
                category,
                operation: targetOperation,
                serviceKey,
                pageNo,
                numOfRows,
                beginDate: beginDate8,
                endDate: endDate8,
                dminsttNm,
                searchKeyword
            });
            if (res8 && res8.rawItems && res8.rawItems.length > 0) {
                apiResult = res8;
                lastError = null;
            } else if (!apiResult) {
                apiResult = res8;
            }
        } catch (err8) {
            console.warn(`[G2B PreSpec] ${category} 8자리 호출 실패 (${targetOperation}):`, err8.message);
            if (!apiResult) lastError = err8;
        }
    }

    // 3차 시도 (Fallback): isSearch 시 검색용 Operation 실패 시 기존 General Operation으로 fallback
    if (isSearch && (!apiResult || lastError)) {
        const fallbackOp = OPERATIONS_GENERAL[category];
        console.warn(`[G2B PreSpec] ${category} 검색 Operation 실패. General Operation fallback 시도: ${fallbackOp}`);
        try {
            apiResult = await callCategoryApi({
                category,
                operation: fallbackOp,
                serviceKey,
                pageNo,
                numOfRows,
                beginDate: beginDate || beginDate8,
                endDate: endDate || endDate8,
                dminsttNm: '',
                searchKeyword: ''
            });
            lastError = null;
        } catch (fbErr) {
            console.warn(`[G2B PreSpec] ${category} Fallback General Operation도 실패:`, fbErr.message);
        }
    }

    if (!apiResult) {
        throw lastError || new Error(`${category} 조회 실패`);
    }

    const rawItems = apiResult.rawItems || [];

    // [요구사항 2] 사전규격 응답 후 최종 수요기관 필터 추가
    let filteredItems = rawItems;
    if (dminsttNm) {
        filteredItems = filteredItems.filter(item => matchesDemandAgency(item, dminsttNm));
    }

    // 검색어 필터링 (필요 시)
    if (searchKeyword) {
        const normKeyword = normalizeString(searchKeyword);
        filteredItems = filteredItems.filter(item => {
            const title = item.prdctNm || item.bizNm || item.ssstndrdNm || item.prdctClsfcNoNm || item.publicPrcureThngNm || item.prcurRqstPrdnm || '';
            return normalizeString(title).includes(normKeyword);
        });
    }

    const formattedItems = filteredItems.map(item => {
        const rawNo = item.bfSpecRgstNo || item.priorSpecRgstNo || item.ssstndrdRgstNo || item.publicPrcureThngNo || item.rgstNo || '';
        const rawTitle = item.prdctNm || item.bizNm || item.ssstndrdNm || item.prdctClsfcNoNm || item.prcurRqstPrdnm || item.prcurRqstNm || item.publicPrcureThngNm || item.ntceNm || '';
        const rawOrg = item.dminsttNm || item.orderInsttNm || item.rlDminsttNm || item.rcvInsttNm || item.ntceInsttNm || '';
        const regDate = (item.rgstDt || item.publicDt || item.rcptDt || item.rlseDt || item.prcureReqDt || '').substring(0, 10);
        const deadlineDate = (item.opninRgstClseDt || item.opninRcptClseDt || item.opninRcptClseDate || item.opninRcptEndDt || item.opnyRcvClseDt || item.opninRcptDeadlineDt || '').substring(0, 10);
        const rawBudget = Number(item.asignBdgtAmt || item.presmptPrce || item.budgetAmt || item.budget || 0);

        return {
            sourceType: 'PRE_SPEC',
            sourceLabel: '사전규격',
            announcementType: 'pre',
            businessType: category,
            id: rawNo,
            announcementNo: rawNo,
            title: rawTitle,
            name: rawTitle,
            organization: rawOrg,
            customer: rawOrg,
            budget: rawBudget,
            registeredAt: regDate,
            publishDate: regDate,
            deadline: deadlineDate,
            endDate: deadlineDate,
            attachmentUrl:
                item.specDocFileUrl1 ||
                item.specDocFileUrl2 ||
                item.specDocFileUrl3 ||
                '',
            raw: item
        };
    });

    return {
        category,
        totalCount: isSearch ? formattedItems.length : Number(apiResult.totalCount || formattedItems.length),
        items: formattedItems
    };
}

module.exports = async function handler(req, res) {
    const serviceKey = cleanKey(
        process.env.G2B_PRE_SERVICE_KEY ||
        process.env.G2B_API_KEY ||
        ''
    );

    if (!serviceKey) {
        return res.status(500).json({
            error: true,
            message:
                'Vercel 환경변수 G2B_API_KEY 또는 ' +
                'G2B_PRE_SERVICE_KEY가 설정되지 않았습니다.'
        });
    }

    const dminsttNm = (req.query.dminsttNm || req.query.orderInsttNm || '').trim();
    const searchKeyword = (req.query.bidNtceNm || req.query.publicPrcureThngNm || req.query.searchKeyword || req.query.prdctNm || req.query.bizNm || '').trim();

    const pageNo = Number(req.query.pageNo || 1);
    const numOfRows = Number(req.query.numOfRows || 100);

    const beginDate = toApiDate(
        req.query.bgngDt || req.query.inqryBgnDt,
        '0000'
    );

    const endDate = toApiDate(
        req.query.endDt || req.query.inqryEndDt,
        '2359'
    );

    const beginDate8 = toApiDate8(req.query.bgngDt || req.query.inqryBgnDt);
    const endDate8 = toApiDate8(req.query.endDt || req.query.inqryEndDt);

    const categories = [
        {
            category: '용역'
        },
        {
            category: '공사'
        },
        {
            category: '물품'
        },
        {
            category: '외자'
        }
    ];

    const results = await Promise.allSettled(
        categories.map(item =>
            fetchCategory({
                category: item.category,
                serviceKey,
                pageNo,
                numOfRows,
                beginDate,
                endDate,
                beginDate8,
                endDate8,
                dminsttNm,
                searchKeyword
            })
        )
    );

    let announcements = [];
    const warnings = [];
    let totalCount = 0;

    results.forEach((result, index) => {
        const category = categories[index].category;

        if (result.status === 'fulfilled') {
            totalCount += result.value.totalCount;
            announcements.push(...result.value.items);
            return;
        }

        warnings.push({
            category,
            message: result.reason?.message || '알 수 없는 오류'
        });
    });

    // 최종 응답 전 안전 필터 (dminsttNm이 있는 경우 한 번 더 확인)
    if (dminsttNm) {
        announcements = announcements.filter(ann => matchesDemandAgency(ann.raw || ann, dminsttNm));
        totalCount = announcements.length;
    }

    if (announcements.length === 0 && warnings.length === categories.length) {
        return res.status(502).json({
            error: true,
            serviceType: 'prespec',
            totalCount: 0,
            announcements: [],
            warnings
        });
    }

    return res.status(200).json({
        error: false,
        serviceType: 'prespec',
        totalCount,
        announcements,
        warnings
    });
};
