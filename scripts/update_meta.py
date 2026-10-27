# -*- coding: utf-8 -*-
import os
import urllib.request
import json

service_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not service_key:
    raise RuntimeError('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.')
url_base = os.environ.get('SUPABASE_URL', 'https://rhbyfzimvpkkuljnmfct.supabase.co') + '/auth/v1/admin/users'

updates = [
    ('515ec161-1a5d-47a1-9d14-151b8da5fea6', '매니저1', 'EXEC_ADMIN'),
    ('92a7a6b1-4b6d-4fcd-88aa-66c56868fcd9', '매니저2', 'EXEC_ADMIN'),
    ('57a366a4-2bf4-4b86-965c-ba5f60aff984', '매니저3', 'EXEC_ADMIN'),
    ('e3aa52bb-bb13-43ff-a77e-03514b4e7c79', '매니저4', 'EXEC_ADMIN'),
    ('59b82cc4-81d6-4ce4-9c34-2f71a13e92d1', '매니저5', 'EXEC_ADMIN'),
    ('7fa98a90-f9ca-45ae-95c3-e006909428a3', 'pm1', 'PM'),
    ('0a571eb4-d32a-40a5-889e-7ff42d704ebe', 'pm2', 'PM'),
    ('96cbffc2-589f-4147-9bee-5f0e147a30a6', 'pm3', 'PM'),
    ('c93f4e21-4770-4e75-a2f6-4ebf98aaf135', 'pm4', 'PM'),
    ('e584564b-bae7-43ed-aadc-9f3437037a05', 'pm5', 'PM'),
    ('345b8bf2-f9dd-4e4c-a84f-e7d2aa73a998', '수행담당자1', 'WORKER'),
    ('8700b6e0-d40a-47a1-8803-df99aad73786', '수행담당자2', 'WORKER'),
    ('b830b186-5b39-404b-aaea-59dc88e775cc', '수행담당자3', 'WORKER'),
    ('8427ef09-f6ef-45c5-b3d1-d174e3a64b53', '수행담당자4', 'WORKER'),
    ('156848f3-7668-4b89-a9a6-54db03cb42af', '수행담당자5', 'WORKER')
]

for uid, name, role in updates:
    payload = json.dumps({'user_metadata': {'name': name, 'role': role}}, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        f'{url_base}/{uid}',
        data=payload,
        headers={
            'apikey': service_key,
            'Authorization': f'Bearer {service_key}',
            'Content-Type': 'application/json; charset=utf-8'
        },
        method='PUT'
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        print(f"SUCCESS: {uid} -> {res['user_metadata']['name']} ({res['user_metadata']['role']})")
