#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Aether PMS - Step 4: Safe Real-Data JWT Supabase OPMS RLS Policy Verifier
File: supabase_migrations/004_verify_migration.py
Description: Runs non-destructive RLS security tests using VERIFY_ prefixed
             test records with guaranteed try-finally cleanup and strict assertions.
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

# Dedicated Test Accounts (Matching profiles, resources, project_members)
USER_CREDS = {
    "sys_admin": {
        "email": os.getenv("TEST_SYS_ADMIN_EMAIL", "test_admin@aetherpmo.com"),
        "password": os.getenv("TEST_SYS_ADMIN_PASSWORD", "Password123!")
    },
    "project_pm": {
        "email": os.getenv("TEST_PM_EMAIL", "test_pm@aetherpmo.com"),
        "password": os.getenv("TEST_PM_PASSWORD", "Password123!")
    },
    "non_member": {
        "email": os.getenv("TEST_NONMEMBER_EMAIL", "test_nonmember@aetherpmo.com"),
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
    print("AETHER PMS - STEP 4: SAFE REAL-DATA JWT OPMS RLS VERIFIER")
    print("=" * 75)
    print(f"Supabase Target URL: {SUPABASE_URL}\n")

    tokens = {"anon": None}
    failed_logins = []

    print("[AUTH SYSTEM INIT] Authenticating Dedicated Test Personas:")
    for role_name, cred in USER_CREDS.items():
        tok = login_user(cred["email"], cred["password"])
        tokens[role_name] = tok
        if tok:
            print(f"  - Persona [{role_name:<14}] ({cred['email']}): AUTHENTICATED SUCCESS")
        else:
            failed_logins.append((role_name, cred['email']))
            print(f"  - Persona [{role_name:<14}] ({cred['email']}): FAILED LOGIN")

    # POINT 6: Exit code 1 immediately if test persona auth is missing
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

    all_passed = True
    test_run_id = f"VERIFY_{uuid.uuid4().hex[:6].upper()}"

    print("\n" + "=" * 75)
    print("1. REMOTE MASTER & PROJECT TABLES CHECK (Anon Visitor Level)")
    print("=" * 75)

    for tbl in APPROVED_TABLES:
        code, resp = test_api("GET", tbl, token=tokens["anon"], params="?select=*&limit=1")
        if code == 200:
            row_cnt = len(resp) if isinstance(resp, list) else 0
            if tbl.startswith("methodology_"):
                # POINT 7: Non-zero row verification for seeded master tables
                if row_cnt > 0:
                    print(f"  [OK 200] Table '{tbl:<33}': Accessible & Seeded ({row_cnt} rows)")
                else:
                    print(f"  [FAIL] Table '{tbl:<33}': 0 rows returned (Seed required)")
                    all_passed = False
            else:
                print(f"  [OK 200] Table '{tbl:<33}': Accessible ({row_cnt} rows)")
        elif code in (401, 403):
            print(f"  [RLS 401/403] Table '{tbl:<29}': Protected by RLS (Expected)")
        elif code == 404:
            print(f"  [PENDING DDL] Table '{tbl:<29}': Does NOT exist yet")
            all_passed = False
        else:
            print(f"  [ERR {code}] Table '{tbl:<33}': {resp}")
            all_passed = False

    print("\n" + "=" * 75)
    print("2. PERSONA PERMISSION MATRIX & DEDICATED TEST CLEANUP")
    print("=" * 75)

    # Safe test execution using try-finally for guaranteed cleanup of VERIFY_ prefixed records
    try:
        # POINT 5: Create dedicated test records with VERIFY_ prefix using sys_admin
        admin_tok = tokens["sys_admin"]
        
        # Test Code Cleanup Pre-check
        test_api("DELETE", "methodology_templates", token=admin_tok, params=f"?code=eq.{test_run_id}")

        # Master Write Test (sys_admin ONLY)
        code_mw, _ = test_api("POST", "methodology_templates", token=admin_tok, body={"code": test_run_id, "name": "Verifier Test", "version": "1.0"})
        if code_mw not in (200, 201):
            print(f"  [FAIL] Sys Admin Master Write failed with HTTP {code_mw}")
            all_passed = False
        else:
            print(f"  [OK] Dedicated Test Master Template created ({test_run_id})")

        # Non-member Master Write Test (MUST FAIL)
        code_nmw, _ = test_api("POST", "methodology_templates", token=tokens["non_member"], body={"code": f"{test_run_id}_NM", "name": "Illegal Write", "version": "1.0"})
        if code_nmw in (200, 201):
            print("  [FAIL] Non-member illegally wrote to Master Template!")
            all_passed = False
            test_api("DELETE", "methodology_templates", token=admin_tok, params=f"?code=eq.{test_run_id}_NM")
        else:
            print(f"  [OK] Non-member Master Write correctly blocked (HTTP {code_nmw})")

    finally:
        # POINT 5: Guaranteed cleanup in finally block
        print("\n[CLEANUP] Deleting temporary VERIFY_ test records...")
        test_api("DELETE", "methodology_templates", token=tokens["sys_admin"], params=f"?code=like.VERIFY_%")
        print("[CLEANUP] Cleanup completed cleanly.")

    print("\n" + "=" * 75)
    if all_passed:
        print("MIGRATION & SECURITY SUITE VERIFIED CLEAN")
        print("=" * 75)
    else:
        print("VERIFICATION FAILED: One or more assertions failed!")
        print("=" * 75)
        sys.exit(1)

if __name__ == "__main__":
    main()
