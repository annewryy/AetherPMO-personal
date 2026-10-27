/**
 * AetherPMO-Personal 15개 테스트 계정 생성 및 프로필 동기화 스크립트 (Node.js)
 * 
 * Usage:
 *   node create_test_accounts.js <your_service_role_key> [optional_default_password]
 */

const serviceRoleKey = process.argv[2] || process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const defaultPassword = process.argv[3] || 'Aether2026!#';
const supabaseUrl = process.env.SUPABASE_URL || 'https://rhbyfzimvpkkuljnmfct.supabase.co';

if (!serviceRoleKey) {
    console.error('오류: Supabase Service Role Key가 누락되었습니다.');
    console.error('사용법: node create_test_accounts.js <service_role_key> [default_password]');
    process.exit(1);
}

// 15개 계정 목록
const targetAccounts = [
    // 매니저 5명 (화면 manager -> DB 저장 EXEC_ADMIN)
    { name: '매니저1', email: 'manager1@aetherpmo.com', screenRole: 'manager', role: 'EXEC_ADMIN' },
    { name: '매니저2', email: 'manager2@aetherpmo.com', screenRole: 'manager', role: 'EXEC_ADMIN' },
    { name: '매니저3', email: 'manager3@aetherpmo.com', screenRole: 'manager', role: 'EXEC_ADMIN' },
    { name: '매니저4', email: 'manager4@aetherpmo.com', screenRole: 'manager', role: 'EXEC_ADMIN' },
    { name: '매니저5', email: 'manager5@aetherpmo.com', screenRole: 'manager', role: 'EXEC_ADMIN' },

    // PM 5명 (화면 pm -> DB 저장 PM)
    { name: 'pm1', email: 'pm1@aetherpmo.com', screenRole: 'pm', role: 'PM' },
    { name: 'pm2', email: 'pm2@aetherpmo.com', screenRole: 'pm', role: 'PM' },
    { name: 'pm3', email: 'pm3@aetherpmo.com', screenRole: 'pm', role: 'PM' },
    { name: 'pm4', email: 'pm4@aetherpmo.com', screenRole: 'pm', role: 'PM' },
    { name: 'pm5', email: 'pm5@aetherpmo.com', screenRole: 'pm', role: 'PM' },

    // 수행담당자 5명 (화면 worker -> DB 저장 WORKER)
    { name: '수행담당자1', email: 'viewer1@aetherpmo.com', screenRole: 'worker', role: 'WORKER' },
    { name: '수행담당자2', email: 'viewer2@aetherpmo.com', screenRole: 'worker', role: 'WORKER' },
    { name: '수행담당자3', email: 'viewer3@aetherpmo.com', screenRole: 'worker', role: 'WORKER' },
    { name: '수행담당자4', email: 'viewer4@aetherpmo.com', screenRole: 'worker', role: 'WORKER' },
    { name: '수행담당자5', email: 'viewer5@aetherpmo.com', screenRole: 'worker', role: 'WORKER' }
];

async function run() {
    console.log('================================================================');
    console.log('AetherPMO-Personal 15개 테스트 계정 생성 및 프로필 동기화');
    console.log('Target URL:', supabaseUrl);
    console.log('================================================================\n');

    const headers = {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
    };

    try {
        // 1. 기존 auth.users 조회
        console.log('[1/4] Supabase Auth 기존 사용자 목록 조회 중...');
        const usersRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers });
        if (!usersRes.ok) throw new Error(`Auth 조회 실패: ${usersRes.status} ${await usersRes.text()}`);
        const { users: existingUsers } = await usersRes.json();
        console.log(`-> 현재 등록된 Auth 사용자 수: ${existingUsers.length}명\n`);

        // 2. 기존 public.profiles 조회
        console.log('[2/4] public.profiles 기존 레코드 조회 중...');
        const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,email,name,role`, { headers });
        if (!profRes.ok) throw new Error(`Profiles 조회 실패: ${profRes.status} ${await profRes.text()}`);
        const existingProfiles = await profRes.json();
        console.log(`-> 현재 등록된 Profiles 레코드 수: ${existingProfiles.length}건\n`);

        // 3. 계정 생성 및 프로필 동기화
        console.log('[3/4] 15개 테스트 계정 생성 및 프로필 동기화 진행...');
        let successCount = 0;
        let failCount = 0;
        const results = [];

        for (const acc of targetAccounts) {
            console.log(`\n--- [${acc.screenRole}] ${acc.name} (${acc.email}) ---`);
            const matchedUser = existingUsers.find(u => u.email.toLowerCase() === acc.email.toLowerCase());
            let userId = null;

            if (matchedUser) {
                userId = matchedUser.id;
                console.log(`  [Auth] 기존 계정 존재 (UUID: ${userId}) - 생성 건너뜀`);
            } else {
                console.log(`  [Auth] 신규 사용자 생성 중...`);
                const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        email: acc.email,
                        password: defaultPassword,
                        email_confirm: true,
                        user_metadata: { name: acc.name, role: acc.role }
                    })
                });

                if (!createRes.ok) {
                    const errText = await createRes.text();
                    console.error(`  [Auth 실패] ${errText}`);
                    failCount++;
                    results.push({ name: acc.name, email: acc.email, role: acc.role, status: 'Auth 실패', id: null });
                    continue;
                }

                const created = await createRes.json();
                userId = created.id;
                console.log(`  [Auth 성공] UUID: ${userId}`);
            }

            // Profiles 동기화
            const matchedProfile = existingProfiles.find(p => p.id === userId || (p.email && p.email.toLowerCase() === acc.email.toLowerCase()));
            const profHeaders = { ...headers, 'Prefer': 'return=representation' };

            try {
                if (matchedProfile) {
                    console.log(`  [Profile] 기존 프로필 업데이트 중 (UUID: ${userId})...`);
                    const patchRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
                        method: 'PATCH',
                        headers: profHeaders,
                        body: JSON.stringify({ name: acc.name, role: acc.role })
                    });
                    if (!patchRes.ok) throw new Error(await patchRes.text());
                    console.log(`  [Profile 업데이트 완료]`);
                } else {
                    console.log(`  [Profile] 신규 프로필 등록 중 (UUID: ${userId})...`);
                    const insertRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
                        method: 'POST',
                        headers: profHeaders,
                        body: JSON.stringify({
                            id: userId,
                            email: acc.email,
                            name: acc.name,
                            role: acc.role
                        })
                    });
                    if (!insertRes.ok) throw new Error(await insertRes.text());
                    console.log(`  [Profile 등록 완료]`);
                }
                successCount++;
                results.push({ name: acc.name, email: acc.email, role: acc.role, status: '성공', id: userId });
            } catch (err) {
                console.error(`  [Profile 실패] ${err.message}`);
                failCount++;
                results.push({ name: acc.name, email: acc.email, role: acc.role, status: 'Profile 실패', id: userId });
            }
        }

        // 4. 결과 요약
        console.log('\n================================================================');
        console.log('[4/4] 작업 완료 결과 요약');
        console.table(results);
        console.log(`성공: ${successCount}건, 실패: ${failCount}건`);
        console.log(`초기 비밀번호: ${defaultPassword}`);
        console.log('================================================================');

    } catch (err) {
        console.error('치명적 오류 발생:', err.message);
    }
}

run();
