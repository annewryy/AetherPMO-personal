const https = require('https');
const url = require('url');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const query = url.parse(req.url, true).query;
        const serviceKey = process.env.G2B_API_KEY;

        if (!serviceKey) {
            return res.status(500).json({ error: 'G2B_API_KEY environment variable is not configured.' });
        }

        const bidNtceNm = query.bidNtceNm || '';
        const dminsttNm = query.dminsttNm || '';
        
        // Dates handling: expect YYYY-MM-DD or YYYYMMDD
        let bgngDt = query.bgngDt || '';
        let endDt = query.endDt || '';

        // Clean dates
        bgngDt = bgngDt.replace(/-/g, '');
        endDt = endDt.replace(/-/g, '');

        if (!bgngDt || !endDt) {
            // Default to last 30 days
            const today = new Date();
            const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            const formatDate = (d) => {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${yyyy}${mm}${dd}`;
            };
            bgngDt = bgngDt || formatDate(past);
            endDt = endDt || formatDate(today);
        }

        // G2B requires YYYYMMDDHHMM format for inqryBgnDt and inqryEndDt
        const inqryBgnDt = bgngDt + '0000';
        const inqryEndDt = endDt + '2359';

        // Base API URL for getBidPblancListInfoServc
        const apiEndpoint = `https://apis.data.go.kr/1230000/BidPublicInfoService04/getBidPblancListInfoServc`;
        
        // Build request URL without serviceKey in URLSearchParams to prevent double encoding
        const params = new URLSearchParams({
            numOfRows: '100',
            pageNo: '1',
            inqryDiv: '1', // 1: Registration date
            inqryBgnDt: inqryBgnDt,
            inqryEndDt: inqryEndDt,
            type: 'json'
        });

        if (bidNtceNm) {
            params.append('bidNtceNm', bidNtceNm);
        }

        // Append serviceKey raw
        const requestUrl = `${apiEndpoint}?serviceKey=${serviceKey}&${params.toString()}`;

        // Make HTTP Request
        https.get(requestUrl, (apiRes) => {
            let data = '';
            apiRes.on('data', (chunk) => {
                data += chunk;
            });

            apiRes.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const itemsData = parsed?.response?.body?.items;
                    let list = [];
                    if (itemsData) {
                        if (Array.isArray(itemsData)) {
                            list = itemsData;
                        } else if (Array.isArray(itemsData.item)) {
                            list = itemsData.item;
                        } else if (itemsData.item) {
                            list = [itemsData.item];
                        }
                    }

                    // Post-filtering by 수요기관명 if provided
                    if (dminsttNm) {
                        const searchDemand = dminsttNm.toLowerCase().trim();
                        list = list.filter(item => 
                            item.dminsttNm && item.dminsttNm.toLowerCase().includes(searchDemand)
                        );
                    }

                    // Map fields for client compatibility
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

                    res.status(200).json({ announcements: formattedList });
                } catch (e) {
                    console.error('Error parsing G2B JSON response:', e, data);
                    res.status(500).json({ error: 'Failed to parse response from G2B API.', details: data });
                }
            });
        }).on('error', (err) => {
            console.error('G2B request error:', err);
            res.status(500).json({ error: 'Failed to contact G2B OpenAPI.', details: err.message });
        });

    } catch (e) {
        console.error('Serverless function exception:', e);
        res.status(500).json({ error: 'Internal Server Error', details: e.message });
    }
};
