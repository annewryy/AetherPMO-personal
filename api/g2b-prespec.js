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

function normalizeItems(items) {
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
}

async function executeFetch(operation, serviceKey, pageNo, numOfRows, beginDate = '', endDate = '') {
    const url = new URL(`${PRE_SPEC_BASE_URL}/${operation}`);
    url.searchParams.set('serviceKey', serviceKey);
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('numOfRows', String(numOfRows));
    url.searchParams.set('type', 'json');

    if (beginDate) url.searchParams.set('inqryBgnDt', beginDate);
    if (endDate) url.searchParams.set('inqryEndDt', endDate);

    const safeUrl = url.toString().replace(/serviceKey=[^&]+/, 'serviceKey=[REDACTED]');
    console.log('[G2B PreSpec Request Execution]', { operation, url: safeUrl });

    const response = await fetch(url);
    const rawText = await response.text();

    let data;
    try {
        data = JSON.parse(rawText);
    } catch (error) {
        return { ok: false, status: response.status, resultCode: 'JSON_PARSE_ERROR', resultMsg: 'JSON 파싱 실패', items: [], totalCount: 0, rawText };
    }

    const header = data?.response?.header || data?.OpenAPI_ServiceResponse?.cmmMsgHeader || {};
    const resultCode = header.resultCode || header.returnReasonCode || '';
    const resultMsg = header.resultMsg || header.errMsg || header.returnAuthMsg || '';

    const body = data?.response?.body || {};
    const rawItems = body?.items?.item ?? body?.items ?? [];
    const items = normalizeItems(rawItems);
    const totalCount = Number(body.totalCount || items.length);

    console.log('[G2B PreSpec Response Execution]', {
        operation,
        httpStatus: response.status,
        resultCode,
        resultMsg,
        totalCount,
        parsedItems: items.length
    });

    return {
        ok: response.ok && (resultCode === '00' || resultCode === '0'),
        status: response.status,
        resultCode,
        resultMsg,
        totalCount,
        items,
        rawText
    };
}

async function fetchCategory({
    category,
    serviceKey,
    pageNo,
    numOfRows,
    beginDate,
    endDate
}) {
    const opGeneral = OPERATIONS_GENERAL[category];
    const opSearch = OPERATIONS_SEARCH[category];

    const beginDate8 = beginDate ? beginDate.slice(0, 8) : '';
    const endDate8 = endDate ? endDate.slice(0, 8) : '';

    // Step 1: Try Search Operation with 12-digit dates
    let res = await executeFetch(opSearch, serviceKey, pageNo, numOfRows, beginDate, endDate);

    // Step 2: If Search Operation failed or returned 04, try Search Operation with 8-digit dates
    if (!res.ok) {
        console.log(`[PreSpec Fallback Step 2: 8-digit Search Operation] Category: ${category}`);
        const res2 = await executeFetch(opSearch, serviceKey, pageNo, numOfRows, beginDate8, endDate8);
        if (res2.ok) res = res2;
    }

    // Step 3: If Search Operations failed, try General Operation with Minimal Parameters (serviceKey, pageNo, numOfRows, type only)
    if (!res.ok) {
        console.log(`[PreSpec Fallback Step 3: Minimal General Operation] Category: ${category}`);
        const res3 = await executeFetch(opGeneral, serviceKey, pageNo, numOfRows);
        if (res3.ok) res = res3;
    }

    if (!res.ok) {
        throw new Error(
            `${category} API 오류: HTTP ${res.status}, ` +
            `${res.resultCode || 'UNKNOWN'} ${res.resultMsg || ''}`.trim()
        );
    }

    return {
        category,
        totalCount: res.totalCount,
        items: res.items.map(item => ({
            sourceType: 'PRE_SPEC',
            sourceLabel: '사전규격',
            businessType: category,
            id: item.bfSpecRgstNo || item.priorSpecRgstNo || item.ssstndrdRgstNo || '',
            title: item.prdctNm || item.bizNm || item.ssstndrdNm || item.prdctClsfcNoNm || '',
            organization: item.dminsttNm || item.orderInsttNm || item.rlDminsttNm || '',
            budget: Number(item.asignBdgtAmt || item.presmptPrce || item.budgetAmt || 0),
            registeredAt: item.rgstDt || item.publicDt || item.rcptDt || '',
            deadline: item.opninRcptClseDt || item.opninRcptClseDate || '',
            raw: item
        }))
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

    const categories = ['용역', '공사', '물품', '외자'];

    const results = await Promise.allSettled(
        categories.map(cat =>
            fetchCategory({
                category: cat,
                serviceKey,
                pageNo,
                numOfRows,
                beginDate,
                endDate
            })
        )
    );

    const announcements = [];
    const warnings = [];
    let totalCount = 0;

    results.forEach((result, index) => {
        const category = categories[index];

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
