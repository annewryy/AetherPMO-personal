import json
import sys
import urllib.request
import urllib.error

# Setup configuration
service_role_key = sys.argv[1] if len(sys.argv) > 1 else ""
if not service_role_key:
    print("오류: Supabase Service Role Key가 누락되었습니다.")
    print("사용법: python sync_demo_accounts.py <your_service_role_key>")
    sys.exit(1)

supabase_url = "https://xzlvxqzyxgtbfkkpqzxd.supabase.co"

demo_accounts = [
    { "email": "admin@aetherpmo.com", "password": "admin1234", "name": "시스템 관리자", "role": "SYS_ADMIN" },
    { "email": "manager@aetherpmo.com", "password": "manager1234", "name": "총괄 관리자", "role": "EXEC_ADMIN" },
    { "email": "pm@aetherpmo.com", "password": "pm1234", "name": "안유경 PM", "role": "PM" },
    { "email": "worker@aetherpmo.com", "password": "worker1234", "name": "수행 담당자", "role": "WORKER" },
    { "email": "viewer@aetherpmo.com", "password": "viewer1234", "name": "조회자", "role": "VIEWER" }
]

def make_request(url, method="GET", headers=None, data=None):
    if headers is None:
        headers = {}
    
    req = urllib.request.Request(url, method=method)
    for k, v in headers.items():
        req.add_header(k, v)
        
    body = None
    if data is not None:
        body = json.dumps(data).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
        
    try:
        with urllib.request.urlopen(req, data=body) as res:
            return res.status, res.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return 500, str(e)

def run():
    print("==================================================")
    print("AetherPMO 데모 계정 동기화 (Python Admin API)")
    print("Target URL:", supabase_url)
    print("==================================================\n")
    
    headers = {
        "Authorization": f"Bearer {service_role_key}",
        "apikey": service_role_key
    }
    
    # 1. Fetch users list
    print("[1/3] Supabase Auth에서 기존 사용자 목록 가져오는 중...")
    status, res_text = make_request(f"{supabase_url}/auth/v1/admin/users?per_page=100", headers=headers)
    if status != 200:
        print(f"오류: 사용자 목록 조회 실패 ({status}) - {res_text}")
        sys.exit(1)
        
    users_data = json.loads(res_text)
    existing_users = users_data.get("users", [])
    print(f"-> 총 {len(existing_users)}명의 사용자가 등록되어 있습니다.\n")
    
    # 2. Sync demo accounts
    print("[2/3] 데모 계정 동기화 중...")
    for account in demo_accounts:
        existing = next((u for u in existing_users if u.get("email", "").lower() == account["email"].lower()), None)
        user_id = None
        
        user_metadata = {
            "name": account["name"],
            "role": account["role"]
        }
        
        if existing:
            user_id = existing["id"]
            print(f"[업데이트] {account['email']} (ID: {user_id}) 패스워드 및 메타데이터 업데이트 중...")
            payload = {
                "password": account["password"],
                "email_confirm": True,
                "user_metadata": user_metadata
            }
            update_status, update_text = make_request(
                f"{supabase_url}/auth/v1/admin/users/{user_id}",
                method="PUT",
                headers=headers,
                data=payload
            )
            if update_status != 200:
                print(f"-> [실패] {account['email']} 업데이트 실패: {update_text}")
                continue
            print(f"-> [성공] {account['email']} 업데이트 완료.")
        else:
            print(f"[신규생성] {account['email']} 가입 진행 중...")
            payload = {
                "email": account["email"],
                "password": account["password"],
                "email_confirm": True,
                "user_metadata": user_metadata
            }
            create_status, create_text = make_request(
                f"{supabase_url}/auth/v1/admin/users",
                method="POST",
                headers=headers,
                data=payload
            )
            if create_status != 200:
                print(f"-> [실패] {account['email']} 생성 실패: {create_text}")
                continue
            new_user = json.loads(create_text)
            user_id = new_user["id"]
            print(f"-> [성공] {account['email']} 생성 완료. (ID: {user_id})")
            
        # 3. Profiles Sync
        if user_id:
            print(f"   [프로필 동기화] {account['email']} 프로필 업데이트 중...")
            check_status, check_text = make_request(
                f"{supabase_url}/rest/v1/profiles?id=eq.{user_id}",
                headers=headers
            )
            
            profile_data = {
                "id": user_id,
                "email": account["email"],
                "name": account["name"],
                "role": account["role"]
            }
            
            if check_status == 200:
                profiles = json.loads(check_text)
                if len(profiles) > 0:
                    # Update
                    patch_status, patch_text = make_request(
                        f"{supabase_url}/rest/v1/profiles?id=eq.{user_id}",
                        method="PATCH",
                        headers=headers,
                        data={
                            "name": account["name"],
                            "role": account["role"]
                        }
                    )
                    if patch_status not in [200, 204]:
                        print(f"   -> [실패] 프로필 수정 실패: {patch_text}")
                    else:
                        print("   -> [성공] 프로필 수정 완료.")
                else:
                    # Insert
                    post_status, post_text = make_request(
                        f"{supabase_url}/rest/v1/profiles",
                        method="POST",
                        headers=headers,
                        data=profile_data
                    )
                    if post_status not in [200, 201]:
                        print(f"   -> [실패] 프로필 생성 실패: {post_text}")
                    else:
                        print("   -> [성공] 프로필 생성 완료.")
            else:
                print(f"   -> [오류] 프로필 조회 실패: {check_text}")
        print("")
        
    print("==================================================")
    print("데모 계정 동기화 완료! [OK]")
    print("==================================================")

if __name__ == "__main__":
    run()
