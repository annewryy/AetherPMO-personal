/**
 * AetherPMO Demo Accounts Sync Script
 * 
 * This script runs locally using Node.js and uses your Supabase Service Role Key
 * to safely create or update the 5 demo accounts via Supabase Admin API.
 * It also updates the public.profiles table to assign the correct roles.
 * 
 * Usage:
 *   node sync_demo_accounts.js <your_service_role_key>
 */

const fs = require('fs');
const path = require('path');

// 1. Setup target config and check input
const serviceRoleKey = process.argv[2] || process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
    console.error('오류: Supabase Service Role Key가 누락되었습니다.');
    console.error('사용법: node sync_demo_accounts.js <your_service_role_key> 또는 SERVICE_ROLE_KEY 환경변수 설정');
    process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://rhbyfzimvpkkuljmnfct.supabase.co';

const demoAccounts = [
    { email: 'admin.personal@aetherpmo.com', password: 'admin1234', name: '안유경 (개인 관리자)', role: 'SYS_ADMIN' },
    { email: 'admin@aetherpmo.com', password: 'admin1234', name: '시스템 관리자', role: 'SYS_ADMIN' },
    { email: 'manager@aetherpmo.com', password: 'manager1234', name: '총괄 관리자', role: 'EXEC_ADMIN' },
    { email: 'pm@aetherpmo.com', password: 'pm1234', name: '안유경 PM', role: 'PM' },
    { email: 'worker@aetherpmo.com', password: 'worker1234', name: '수행 담당자', role: 'WORKER' },
    { email: 'viewer@aetherpmo.com', password: 'viewer1234', name: '조회자', role: 'VIEWER' }
];

async function run() {
    console.log('==================================================');
    console.log('AetherPMO 데모 계정 동기화 (Admin API)');
    console.log('Target URL:', supabaseUrl);
    console.log('==================================================\n');

    try {
        // A. Fetch existing users from GoTrue Admin API
        console.log('[1/3] Supabase Auth에서 기존 사용자 목록 가져오는 중...');
        const listResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=100`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        if (!listResponse.ok) {
            const errText = await listResponse.text();
            throw new Error(`사용자 목록 조회 실패: ${listResponse.status} - ${errText}`);
        }

        const listData = await listResponse.json();
        const existingUsers = listData.users || [];
        console.log(`-> 총 ${existingUsers.length}명의 사용자가 등록되어 있습니다.\n`);

        // B. Loop and sync each account
        console.log('[2/3] 데모 계정 동기화 중...');
        for (const account of demoAccounts) {
            const existing = existingUsers.find(u => u.email.toLowerCase() === account.email.toLowerCase());
            let userId = null;

            const userBody = {
                email: account.email,
                password: account.password,
                email_confirm: true,
                user_metadata: {
                    name: account.name,
                    role: account.role
                }
            };

            if (existing) {
                // Update existing user password & metadata
                userId = existing.id;
                console.log(`[업데이트] ${account.email} (ID: ${userId}) 패스워드 및 메타데이터 업데이트 중...`);
                const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        password: account.password,
                        email_confirm: true,
                        user_metadata: userBody.user_metadata
                    })
                });

                if (!updateRes.ok) {
                    const errText = await updateRes.text();
                    console.error(`-> [실패] ${account.email} 업데이트 실패:`, errText);
                    continue;
                }
                console.log(`-> [성공] ${account.email} 업데이트 완료.`);
            } else {
                // Create new user
                console.log(`[신규생성] ${account.email} 가입 진행 중...`);
                const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(userBody)
                });

                if (!createRes.ok) {
                    const errText = await createRes.text();
                    console.error(`-> [실패] ${account.email} 생성 실패:`, errText);
                    continue;
                }
                const newUserData = await createRes.json();
                userId = newUserData.id;
                console.log(`-> [성공] ${account.email} 생성 완료. (ID: ${userId})`);
            }

            // C. Sync public.profiles table using service role bypassing RLS
            if (userId) {
                console.log(`   [프로필 동기화] ${account.email} 프로필 업데이트 중...`);
                
                // Check if profile exists
                const profCheckRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey
                    }
                });

                const profileObj = {
                    id: userId,
                    email: account.email,
                    name: account.name,
                    role: account.role
                };

                if (profCheckRes.ok) {
                    const checkData = await profCheckRes.json();
                    if (checkData && checkData.length > 0) {
                        // PATCH to update
                        const updateProfRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Bearer ${serviceRoleKey}`,
                                'apikey': serviceRoleKey,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=representation'
                            },
                            body: JSON.stringify({
                                name: account.name,
                                role: account.role
                            })
                        });
                        if (!updateProfRes.ok) {
                            console.error(`   -> [실패] 프로필 수정 실패:`, await updateProfRes.text());
                        } else {
                            console.log(`   -> [성공] 프로필 수정 완료.`);
                        }
                    } else {
                        // POST to insert
                        const insertProfRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${serviceRoleKey}`,
                                'apikey': serviceRoleKey,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=representation'
                            },
                            body: JSON.stringify(profileObj)
                        });
                        if (!insertProfRes.ok) {
                            console.error(`   -> [실패] 프로필 생성 실패:`, await insertProfRes.text());
                        } else {
                            console.log(`   -> [성공] 프로필 생성 완료.`);
                        }
                    }
                } else {
                    console.error(`   -> [오류] 프로필 상태 조회 실패.`);
                }
            }
            console.log('');
        }

        console.log('==================================================');
        console.log('데모 계정 동기화 완료! ✅');
        console.log('이제 5개의 계정으로 로그인 테스트를 진행해 주세요.');
        console.log('==================================================');

    } catch (err) {
        console.error('\n동기화 진행 중 치명적인 오류가 발생했습니다:', err.message);
    }
}

run();
