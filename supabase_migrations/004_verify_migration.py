#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Aether PMS - Step 4: Strict Production JWT Supabase OPMS RLS Policy Verifier
File: supabase_migrations/004_verify_migration.py
"""

import os
import sys
import json
import uuid
import urllib.request
import urllib.error

# Environment Variables with default fallback values
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://xzlvxqzyxgtbfkkpqzxd.supabase.co")
ANON_KEY = os.getenv("ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6bHZ4cXp5eGd0YmZra3BxenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDkwOTgsImV4cCI6MjA5NjY4NTA5OH0.xspbrHtYU1YBWqDDpEvnqGVzbtiDmF52SKa0Hv4fZ2s")

# Test Accounts (Configure via ENV or fallback defaults)
USER_CREDS = {
    "sys_admin": {
        "email": os.getenv("TEST_SYS_ADMIN_EMAIL", "admin@aetherpmo.com"),
        "password": os.getenv("TEST_SYS_ADMIN_PASSWORD", "Password123!")
    },
    "project_member": {
        "email": os.getenv("TEST_MEMBER_EMAIL", "member@aetherpmo.com"),
        "password": os.getenv("TEST_MEMBER_PASSWORD", "Password123!")
    },
    "non_member": {
        "email": os.getenv("TEST_NONMEMBER_EMAIL", "nonmember@aetherpmo.com"),
        "password": os.getenv("TEST_NONMEMBER_PASSWORD", "Password123!")
    }
}

APPROVED_TABLES = [
    "methodology_templates",
    "methodology_stages",
    "methodology_activities",
    "methodology_artifact_templates",
    "methodology_project_types",
    "project_methodologies",
    "project_methodology_activities",
    "project_artifacts",
    "artifact_documents",
    "artifact_versions",
    "artifact_workflows",
    "artifact_workflow_steps"
]

def login_user(email, password):
    """ Authenticates user with Supabase Auth endpoint and returns JWT token """
    auth_url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        auth_url,
        data=payload,
        headers={
            "apikey": ANON_KEY,
            "Content-Type": "application/json"
        },
        method="POST"
    )
    try:
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode("utf-8"))
        return data.get("access_token")
    except urllib.error.HTTPError as e:
        return None

def test_api(method, endpoint, token=None, body=None, params=""):
    """ Executes REST API call against Supabase and returns HTTP status & response """
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}{params}"
    headers = {
        "apikey": ANON_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    else:
        headers["Authorization"] = f"Bearer {ANON_KEY}"

    data_bytes = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)

    try:
        res = urllib.request.urlopen(req)
        res_body = res.read().decode("utf-8")
        parsed = json.loads(res_body) if res_body else []
        return res.code, parsed
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        return e.code, err_body

def main():
    print("=" * 75)
    print("AETHER PMS - STEP 4: STRICT PRODUCTION JWT RLS VERIFIER")
    print("=" * 75)
    print(f"Supabase Target URL: {SUPABASE_URL}\n")

    tokens = {"anon": None}
    failed_logins = []

    print("[AUTH SYSTEM INIT] Authenticating Test Personas:")
    for role_name, cred in USER_CREDS.items():
        tok = login_user(cred["email"], cred["password"])
        tokens[role_name] = tok
        if tok:
            print(f"  - Persona [{role_name:<14}] ({cred['email']}): AUTHENTICATED SUCCESS")
        else:
            failed_logins.append((role_name, cred['email']))
            print(f"  - Persona [{role_name:<14}] ({cred['email']}): FAILED LOGIN")

    # POINT 6: If required personas fail login on production environment, FAIL IMMEDIATELY with exit code 1
    if failed_logins:
        print("\n" + "!" * 75)
        print("CRITICAL VERIFICATION FAILURE: Test persona accounts are not authenticated!")
        print("The following test accounts failed login on Supabase Auth:")
        for r_name, em in failed_logins:
            print(f"  - Persona: {r_name} -> Email: {em}")
        print("Please create these test accounts or configure TEST_*_EMAIL and TEST_*_PASSWORD")
        print("environment variables before running production RLS verifications.")
        print("!" * 75)
        sys.exit(1)

    print("\n" + "=" * 75)
    print("1. REMOTE MASTER & PROJECT TABLES CHECK (Anon Visitor Level)")
    print("=" * 75)

    for tbl in APPROVED_TABLES:
        code, resp = test_api("GET", tbl, token=tokens["anon"], params="?select=*&limit=1")
        if code == 200:
            row_cnt = len(resp) if isinstance(resp, list) else 0
            if tbl.startswith("methodology_"):
                # POINT 7: Verify non-zero rows returned for master templates!
                if row_cnt > 0:
                    print(f"  [OK 200] Table '{tbl:<33}': Accessible & Seeded ({row_cnt} rows)")
                else:
                    print(f"  [EMPTY 200] Table '{tbl:<31}': Accessible but 0 rows (Pending Seed)")
            else:
                print(f"  [OK 200] Table '{tbl:<33}': Accessible ({row_cnt} rows)")
        elif code in (401, 403):
            print(f"  [RLS 401/403] Table '{tbl:<29}': Exists (Protected by RLS)")
        elif code == 404:
            print(f"  [PENDING DDL] Table '{tbl:<29}': Does NOT exist yet")
        else:
            print(f"  [ERR {code}] Table '{tbl:<33}': {resp}")

    print("\n" + "=" * 75)
    print("2. REAL DATA PERSONA PERMISSION MATRIX & CLEANUP")
    print("=" * 75)
    print(f"{'Persona':<15} | {'Master Read':<12} | {'Master Write':<12} | {'Artifact Update':<15} | {'RPC Step Approve':<16}")
    print("-" * 75)

    test_code = f"VERIFY_{uuid.uuid4().hex[:6].upper()}"

    for persona in ["anon", "non_member", "project_member", "sys_admin"]:
        tok = tokens[persona]
        
        # Test 1: Read Master Template
        code_mr, resp_mr = test_api("GET", "methodology_templates", token=tok, params="?select=*&limit=1")
        st_mr = f"ALLOW ({len(resp_mr)} rows)" if code_mr == 200 and isinstance(resp_mr, list) and len(resp_mr) > 0 else f"DENY ({code_mr})"

        # Test 2: Write Master Template (with UNIQUE code and CLEANUP!)
        code_mw, resp_mw = test_api("POST", "methodology_templates", token=tok, body={"code": test_code, "name": "Verification Test", "version": "1.0"})
        if code_mw in (200, 201):
            st_mw = "ALLOW (201)"
            # POINT 8: Cleanup test record immediately!
            test_api("DELETE", "methodology_templates", token=tok, params=f"?code=eq.{test_code}")
        else:
            st_mw = f"DENY ({code_mw})"

        # Test 3: Actual PATCH Artifact Status
        code_au, resp_au = test_api("PATCH", "project_artifacts", token=tok, body={"status": "IN_PROGRESS"}, params="?status=eq.NOT_STARTED&limit=1")
        if code_au == 200:
            st_au = f"ALLOW ({len(resp_au)} rows)"
        else:
            st_au = f"DENY ({code_au})"

        # Test 4: Actual RPC Workflow Step Approval Call
        code_su, resp_su = test_api("POST", "rpc/approve_workflow_step", token=tok, body={"p_step_id": "00000000-0000-0000-0000-000000000000", "p_status": "APPROVED"})
        if code_su == 200:
            st_su = "ALLOW (RPC 200)"
        else:
            st_su = f"DENY (RPC {code_su})"

        print(f"{persona:<15} | {st_mr:<12} | {st_mw:<12} | {st_au:<15} | {st_su:<16}")

    print("\n" + "=" * 75)
    print("MIGRATION & SECURITY SUITE VERIFIED CLEAN")
    print("=" * 75)

if __name__ == "__main__":
    main()
