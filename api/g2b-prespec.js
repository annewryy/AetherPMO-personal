const PRE_SPEC_BASE_URL =
    'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService';

const OPERATIONS_GENERAL = {
    '용역': 'getPublicPrcureThngInfoServc',
    '공사': 'getPublicPrcureThngInfoCnstwk',
    '물품': 'getPublicPrcureThngInfoThng',
    '외자': 'getPublicPrcureThngInfoFrgcpt'
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

async function fetchCategory({
    category,
    serviceKey,
    pageNo,
    numOfRows,
    beginDate,
    endDate
}) {
    const operation = OPERATIONS_GENERAL[category];
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

    const safeUrl = url
        .toString()
        .replace(/serviceKey=[^&]+/, 'serviceKey=[REDACTED]');

    console.log('[G2B PreSpec Request]', {
        category,
        url: safeUrl
    });

    const response = await fetch(url);
    const rawText = await response.text();

    let data;

    try {
        data = JSON.parse(rawText);
    } catch (error) {
        throw new Error(
            `${category} 응답 JSON 파싱 실패: ${rawText.slice(0, 200)}`
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
            `${category} API 오류: HTTP ${response.status}, ` +
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
        httpStatus: response.status,
        resultCode,
        resultMsg,
        totalCount: Number(body.totalCount || items.length),
        parsedItems: items.length
    });

    return {
        category,
        totalCount: Number(body.totalCount || items.length),
        items: items.map(item => ({
            sourceType: 'PRE_SPEC',
            sourceLabel: '사전규격',
            businessType: category,
            id:
                item.bfSpecRgstNo ||
                item.priorSpecRgstNo ||
                item.ssstndrdRgstNo ||
                '',
            title:
                item.prdctNm ||
                item.bizNm ||
                item.ssstndrdNm ||
                item.prdctClsfcNoNm ||
                '',
            organization:
                item.dminsttNm ||
                item.orderInsttNm ||
                item.rlDminsttNm ||
                '',
            budget: Number(
                item.asignBdgtAmt ||
                item.presmptPrce ||
                item.budgetAmt ||
                0
            ),
            registeredAt:
                item.rgstDt ||
                item.publicDt ||
                item.rcptDt ||
                '',
            deadline:
                item.opninRgstClseDt ||
                item.opninRcptClseDt ||
                item.opninRcptClseDate ||
                item.opninRcptEndDt ||
                '',
            attachmentUrl:
                item.specDocFileUrl1 ||
                item.specDocFileUrl2 ||
                item.specDocFileUrl3 ||
                '',
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

    const categories = [
        {
            category: '용역',
            operation: 'getPublicPrcureThngInfoServc'
        },
        {
            category: '공사',
            operation: 'getPublicPrcureThngInfoCnstwk'
        },
        {
            category: '물품',
            operation: 'getPublicPrcureThngInfoThng'
        },
        {
            category: '외자',
            operation: 'getPublicPrcureThngInfoFrgcpt'
        }
    ];

    const results = await Promise.allSettled(
        categories.map(item =>
            fetchCategory({
                ...item,
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
