const PRE_SPEC_BASE_URL =
    'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService';

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

function normalizeItems(items) {
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
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

    // ──────────────────────────────────────────────────────────
    // 하드코딩 테스트: 공공데이터포털 미리보기와 100% 동일한 파라미터
    // Operation: getPublicPrcureThngInfoThng (물품)
    // ──────────────────────────────────────────────────────────
    const operation = 'getPublicPrcureThngInfoThng';
    const url = new URL(`${PRE_SPEC_BASE_URL}/${operation}`);
    url.searchParams.set('serviceKey', serviceKey);
    url.searchParams.set('inqryDiv', '1');
    url.searchParams.set('inqryBgnDt', '201604010000');
    url.searchParams.set('inqryEndDt', '201605052359');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('numOfRows', '10');
    url.searchParams.set('type', 'json');

    const safeUrl = url.toString().replace(/serviceKey=[^&]+/, 'serviceKey=[REDACTED]');
    console.log('[G2B PreSpec Data Portal Preview Request]', safeUrl);

    try {
        const response = await fetch(url);
        const rawText = await response.text();

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            return res.status(500).json({
                error: true,
                message: 'JSON 파싱 실패',
                rawSnippet: rawText.substring(0, 300)
            });
        }

        const header = data?.response?.header || data?.OpenAPI_ServiceResponse?.cmmMsgHeader || {};
        const resultCode = header.resultCode || header.returnReasonCode || 'UNKNOWN';
        const resultMsg = header.resultMsg || header.errMsg || header.returnAuthMsg || '';

        const body = data?.response?.body || {};
        const rawItems = body?.items?.item ?? body?.items ?? [];
        const items = normalizeItems(rawItems);
        const totalCount = Number(body.totalCount || items.length);

        console.log('[G2B PreSpec Data Portal Preview Response]', {
            httpStatus: response.status,
            resultCode,
            resultMsg,
            totalCount,
            parsedItems: items.length
        });

        const announcements = items.map(item => ({
            sourceType: 'PRE_SPEC',
            sourceLabel: '사전규격',
            businessType: '물품',
            id: item.bfSpecRgstNo || item.priorSpecRgstNo || item.ssstndrdRgstNo || '',
            title: item.prdctNm || item.bizNm || item.ssstndrdNm || item.prdctClsfcNoNm || '',
            organization: item.dminsttNm || item.orderInsttNm || item.rlDminsttNm || '',
            budget: Number(item.asignBdgtAmt || item.presmptPrce || item.budgetAmt || 0),
            registeredAt: item.rgstDt || item.publicDt || item.rcptDt || '',
            deadline: item.opninRcptClseDt || item.opninRcptClseDate || '',
            raw: item
        }));

        return res.status(200).json({
            error: false,
            testMode: 'DATA_PORTAL_PREVIEW_HARDCODED',
            operation,
            httpStatus: response.status,
            resultCode,
            resultMsg,
            totalCount,
            announcements,
            requestUrlMasked: safeUrl
        });
    } catch (err) {
        return res.status(500).json({
            error: true,
            message: err.message
        });
    }
};
