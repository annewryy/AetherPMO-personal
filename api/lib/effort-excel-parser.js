// ==========================================================================
// AetherPMO Monthly Effort Excel Parser
// 투입공수 Excel(.xlsx, .xls) 및 CSV 파싱 & 검증기
// ==========================================================================

let XLSX;
try {
    XLSX = require('xlsx');
} catch (e) {
    // Node.js 환경에 xlsx 모듈이 없을 경우를 대비한 유연한 로더
    XLSX = null;
}

/**
 * 투입공수 엑셀 컬럼 매핑 표준
 */
const COLUMN_ALIASES = {
    memberName: ['성명', '이름', '인력명', '성 명', 'name', 'member_name'],
    organization: ['소속', '소속사', '회사', '부서', 'organization', 'company', 'dept'],
    roleName: ['역할', '직무', '담당업무', '포지션', 'role', 'role_name', 'position'],
    periodStr: ['투입기간', '기간', '수행기간', '참여기간', 'period', 'period_str'],
    workDays: ['근무일수', '투입일수', '일수', '일', 'work_days', 'days'],
    effortMm: ['투입공수', '공수', 'M/M', 'MM', 'm/m', '공수(M/M)', '투입공수(M/M)', 'effort_mm', 'mm'],
    remarks: ['비고', '메모', '참고사항', '특이사항', 'remarks', 'note', 'memo']
};

/**
 * 행 객체에서 키 매칭
 */
function extractValue(row, aliases) {
    for (const key of Object.keys(row)) {
        const cleanKey = key.toString().trim().toLowerCase().replace(/[\s_\-\(\)\/]/g, '');
        for (const alias of aliases) {
            const cleanAlias = alias.toLowerCase().replace(/[\s_\-\(\)\/]/g, '');
            if (cleanKey === cleanAlias || cleanKey.includes(cleanAlias)) {
                return row[key];
            }
        }
    }
    return null;
}

/**
 * 엑셀 또는 파싱된 2차원 배열/JSON 파싱 및 유효성 검증
 * @param {Buffer|Array} input - Buffer(엑셀 바이너리) 또는 Array(행 객체 배열)
 * @returns {Object} 파싱 결과 객체
 */
function parseEffortData(input, options = {}) {
    let rows = [];

    if (Array.isArray(input)) {
        rows = input;
    } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
        if (!XLSX) {
            throw new Error('서버 환경에 xlsx 파싱 엔진이 설치되어 있지 않습니다. 프론트엔드 파싱 또는 xlsx 패키지를 확인하세요.');
        }
        const workbook = XLSX.read(input, { type: 'buffer' });
        const sheetName = options.sheetName || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    } else if (typeof input === 'string') {
        // CSV 문자열 처리
        if (XLSX) {
            const workbook = XLSX.read(input, { type: 'string' });
            const sheetName = workbook.SheetNames[0];
            rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        } else {
            rows = parseSimpleCsv(input);
        }
    }

    const entries = [];
    const errors = [];
    let totalEffortMm = 0;

    for (let i = 0; i < rows.length; i++) {
        const rawRow = rows[i];
        const rowNum = i + 2; // 헤더 1행 고려

        const memberName = (extractValue(rawRow, COLUMN_ALIASES.memberName) || '').toString().trim();
        const organization = (extractValue(rawRow, COLUMN_ALIASES.organization) || '').toString().trim();
        const roleName = (extractValue(rawRow, COLUMN_ALIASES.roleName) || '').toString().trim();
        const periodStr = (extractValue(rawRow, COLUMN_ALIASES.periodStr) || '').toString().trim();
        const workDaysRaw = extractValue(rawRow, COLUMN_ALIASES.workDays);
        const effortMmRaw = extractValue(rawRow, COLUMN_ALIASES.effortMm);
        const remarks = (extractValue(rawRow, COLUMN_ALIASES.remarks) || '').toString().trim();

        // 빈 행 건너뛰기
        if (!memberName && !organization && !roleName && effortMmRaw === null) {
            continue;
        }

        // 필수값 검증 1: 성명
        if (!memberName) {
            errors.push(`${rowNum}행: 인력 성명이 누락되었습니다.`);
        }

        // 필수값 검증 2: 투입공수 (M/M)
        let effortMm = 0;
        if (effortMmRaw !== null && effortMmRaw !== undefined && effortMmRaw !== '') {
            const parsed = parseFloat(String(effortMmRaw).replace(/[^0-9.\-]/g, ''));
            if (isNaN(parsed) || parsed < 0 || parsed > 5.0) {
                errors.push(`${rowNum}행: 투입공수(${effortMmRaw}) 값이 유효하지 않습니다. (0 ~ 5.0 범위 필요)`);
            } else {
                effortMm = Math.round(parsed * 100) / 100;
            }
        } else {
            errors.push(`${rowNum}행: 투입공수(M/M)가 입력되지 않았습니다.`);
        }

        // 근무일수 파싱
        let workDays = 0;
        if (workDaysRaw !== null && workDaysRaw !== undefined && workDaysRaw !== '') {
            const parsedDays = parseFloat(String(workDaysRaw).replace(/[^0-9.]/g, ''));
            if (!isNaN(parsedDays)) {
                workDays = Math.round(parsedDays * 10) / 10;
            }
        }

        entries.push({
            orderNo: entries.length + 1,
            memberName,
            organization: organization || '자사',
            roleName: roleName || '수행원',
            periodStr,
            workDays,
            effortMm,
            remarks,
            rowNum
        });

        totalEffortMm += effortMm;
    }

    if (entries.length === 0) {
        errors.push('엑셀 파일에서 유효한 투입공수 행을 찾을 수 없습니다.');
    }

    const isValid = errors.length === 0;

    return {
        isValid,
        status: isValid ? 'SUCCESS' : 'NEEDS_REVIEW',
        entries,
        totalHeadcount: entries.length,
        totalEffortMm: Math.round(totalEffortMm * 100) / 100,
        errors,
        reviewNotes: errors.length > 0 ? errors.join('\n') : null
    };
}

/**
 * 단순 CSV 문자열 파서 (fallback용)
 */
function parseSimpleCsv(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
        });
        rows.push(row);
    }
    return rows;
}

module.exports = {
    COLUMN_ALIASES,
    parseEffortData
};
