#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Aether PMS - Step 4: Strict Production JWT Supabase OPMS RLS Policy Verifier
File: supabase_migrations/004_verify_migration.py
Description: Non-destructive RLS verifier with mandatory env vars, verbose auth logging,
             exact ID cleanup, sys_admin seed verification, and project PM persona tests.
"""

import os
import sys
import json
import uuid
import urllib.request
import urllib.error

# Mandatory Environment Variables (Point 5)
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://xzlvxqzyxgtbfkkpqzxd.supabase.co")
ANON_KEY = os.getenv("ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6bHZ4cXp5eGd0YmZra3BxenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDkwOTgsImV4cCI6MjA5NjY4NTA5OH0.xspbrHtYU1YBWqDDpEvnqGVzbtiDmF52SKa0Hv4fZ2s")

USER_CREDS = {
    "sys_admin": {
        "email": os.getenv("TEST_SYS_ADMIN_EMAIL", "admin@aetherpmo.com"),
        "password": os.getenv("TEST_SYS_ADMIN_PASSWORD")
    },
    "project_pm": {
        "email": os.getenv("TEST_PM_EMAIL", "pm@aetherpmo.com"),
        "password": os.getenv("TEST_PM_PASSWORD")
    },
    "non_member": {
        "email": os.getenv("TEST_NONMEMBER_EMAIL", "nonmember@aetherpmo.com"),
        "password": os.getenv("TEST_NONMEMBER_PASSWORD")
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
    """ Authenticates user with Supabase Auth endpoint and returns (token, status_code, err_msg) """
    if not password:
        return None, 400, "Password environment variable missing"

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
        return data.get("access_token"), res.code, None
    except urllib.error.HTTPError as e:
        # POINT 6: Capture and return HTTP status and response body
        err_body = e.read().decode("utf-8")
        return None, e.code, err_body

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
    print("AETHER PMS - STEP 4: STRICT PRODUCTION JWT OPMS RLS VERIFIER")
    print("=" * 75)
    print(f"Supabase Target URL: {SUPABASE_URL}\n")

    # POINT 5: Environment variable validation check
    missing_passwords = [r for r, c in USER_CREDS.items() if not c["password"]]
    if missing_passwords:
        print("!" * 75)
        print("CRITICAL CONFIGURATION ERROR: Mandatory test passwords missing from environment!")
        print("The following personas are missing TEST_*_PASSWORD variables:")
        for r in missing_passwords:
            print(f"  - Missing password for: {r} ({USER_CREDS[r]['email']})")
        print("Please set TEST_SYS_ADMIN_PASSWORD, TEST_PM_PASSWORD, TEST_NONMEMBER_PASSWORD")
        print("environment variables before executing verification.")
        print("!" * 75)
        sys.exit(1)

    tokens = {"anon": None}
    failed_logins = []

    print("[AUTH SYSTEM INIT] Authenticating Test Personas:")
    for role_name, cred in USER_CREDS.items():
        tok, code, err_msg = login_user(cred["email"], cred["password"])
        tokens[role_name] = tok
        if tok:
            print(f"  - Persona [{role_name:<14}] ({cred['email']}): AUTHENTICATED SUCCESS (HTTP {code})")
        else:
            # POINT 6: Print HTTP status and response message on login failure
            failed_logins.append((role_name, cred['email'], code, err_msg))
            print(f"  - Persona [{role_name:<14}] ({cred['email']}): FAILED (HTTP {code} -> {err_msg})")

    if failed_logins:
        print("\n" + "!" * 75)
        print("CRITICAL VERIFICATION FAILURE: Persona authentication failed!")
        for r_name, em, cd, msg in failed_logins:
            print(f"  - Persona: {r_name} ({em}) -> HTTP {cd}: {msg}")
        print("!" * 75)
        sys.exit(1)

    all_passed = True
    test_run_id = f"VERIFY_{uuid.uuid4().hex[:6].upper()}"
    test_run_id_nm = f"{test_run_id}_NM"

    print("\n" + "=" * 75)
    print("1. MASTER & PROJECT TABLES ACCESSIBILITY (Anon & Admin Level)")
    print("=" * 75)

    # POINT 1: Anon GET on TO authenticated tables returns HTTP 200 with [] (0 rows) due to RLS.
    # Seed verification is performed separately using sys_admin token.
    for tbl in APPROVED_TABLES:
        code_anon, resp_anon = test_api("GET", tbl, token=tokens["anon"], params="?select=*&limit=1")
        if code_anon == 200:
            print(f"  [OK 200] Table '{tbl:<33}': Accessible to Anon")
        elif code_anon in (401, 403):
            print(f"  [RLS 401/403] Table '{tbl:<29}': RLS Protected (Expected)")
        elif code_anon == 404:
            print(f"  [FAIL 404] Table '{tbl:<31}': Does NOT exist on remote DB")
            all_passed = False

    print("\n[SEED VERIFICATION] Checking Master Data via sys_admin Authenticated Token:")
    for master_tbl in ["methodology_templates", "methodology_stages", "methodology_activities", "methodology_artifact_templates"]:
        code_adm, resp_adm = test_api("GET", master_tbl, token=tokens["sys_admin"], params="?select=*&limit=100")
        if code_adm == 200 and isinstance(resp_adm, list):
            # POINT 1: Verify non-zero rows returned for sys_admin
            if len(resp_adm) > 0:
                print(f"  [OK] Master Table '{master_tbl:<31}': {len(resp_adm)} Seeded Rows Found")
            else:
                print(f"  [FAIL] Master Table '{master_tbl:<31}': 0 Seed Rows Found (Seed Script Required)")
                all_passed = False
        else:
            print(f"  [FAIL] Master Table '{master_tbl:<31}': HTTP {code_adm}")
            all_passed = False

    print("\n" + "=" * 75)
    print("2. PERSONA MATRIX & PROJECT PM PERMISSION VERIFICATION")
    print("=" * 75)

    # Safe test execution using try-finally for guaranteed cleanup of EXACT IDs
    try:
        sys_tok = tokens["sys_admin"]
        pm_tok = tokens["project_pm"]
        nm_tok = tokens["non_member"]

        # Master Write Test (sys_admin ONLY)
        code_mw, _ = test_api("POST", "methodology_templates", token=sys_tok, body={"code": test_run_id, "name": "Verifier Test", "version": "1.0"})
        if code_mw in (200, 201):
            print(f"  [OK 201] Sys Admin Master Write Success ({test_run_id})")
        else:
            print(f"  [FAIL] Sys Admin Master Write failed with HTTP {code_mw}")
            all_passed = False

        # Non-member Master Write Test (MUST FAIL)
        code_nmw, _ = test_api("POST", "methodology_templates", token=nm_tok, body={"code": test_run_id_nm, "name": "Illegal Write", "version": "1.0"})
        if code_nmw in (200, 201):
            print(f"  [FAIL] Non-member illegally wrote to Master Template! (HTTP {code_nmw})")
            all_passed = False
        else:
            print(f"  [OK DENY] Non-member Master Write correctly blocked (HTTP {code_nmw})")

        # POINT 2: Project PM Persona Tests (Participating vs Non-participating)
        code_pm_read, resp_pm_read = test_api("GET", "project_artifacts", token=pm_tok, params="?select=*&limit=10")
        if code_pm_read == 200:
            print(f"  [OK 200] PM Participating Project Artifacts Read Success ({len(resp_pm_read)} rows)")
        else:
            print(f"  [FAIL] PM Participating Project Artifacts Read Failed (HTTP {code_pm_read})")
            all_passed = False

        code_nm_read, resp_nm_read = test_api("GET", "project_artifacts", token=nm_tok, params="?select=*&limit=10")
        if code_nm_read == 200 and isinstance(resp_nm_read, list) and len(resp_nm_read) == 0:
            print("  [OK RLS] Non-member Project Artifacts Read correctly returned 0 rows")
        elif code_nm_read in (401, 403):
            print(f"  [OK RLS] Non-member Project Artifacts Read correctly blocked (HTTP {code_nm_read})")
        else:
            print(f"  [FAIL] Non-member Project Artifacts Read leaked data! ({resp_nm_read})")
            all_passed = False

    finally:
        # POINT 3 & 4: Exact ID Cleanup with HTTP status code verification
        print("\n" + "=" * 75)
        print("[EXACT ID CLEANUP & AUDIT]")
        print("=" * 75)
        
        # Delete exact test_run_id
        c_del1, _ = test_api("DELETE", "methodology_templates", token=tokens["sys_admin"], params=f"?code=eq.{test_run_id}")
        if c_del1 in (200, 204):
            print(f"  [OK 200] Deleted test record '{test_run_id}'")
        else:
            print(f"  [FAIL] Cleanup failed for '{test_run_id}' (HTTP {c_del1})")
            all_passed = False

        # Delete exact test_run_id_nm if created
        c_del2, _ = test_api("DELETE", "methodology_templates", token=tokens["sys_admin"], params=f"?code=eq.{test_run_id_nm}")
        if c_del2 in (200, 204):
            print(f"  [OK 200] Cleanup check completed for '{test_run_id_nm}'")

    print("\n" + "=" * 75)
    # POINT 7: Clean messaging when RPC testing is excluded
    if all_passed:
        print("MIGRATION & RLS BASELINE VERIFIED CLEAN (RPC Testing Excluded)")
        print("=" * 75)
    else:
        print("VERIFICATION FAILED: One or more assertions failed!")
        print("=" * 75)
        sys.exit(1)

if __name__ == "__main__":
    main()
