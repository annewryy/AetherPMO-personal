#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Aether PMS - Step 4: Strict Production JWT Supabase OPMS RLS Baseline Verifier
File: supabase_migrations/004_verify_migration.py

Purpose:
- Verifies authentication for dedicated test personas.
- Verifies anonymous users cannot read protected OPMS tables.
- Verifies seeded master data is readable by an authenticated administrator.
- Verifies only SYS_ADMIN can write methodology master data.
- Verifies a participating PM can read one known project artifact.
- Verifies a non-member cannot read the same project artifact.
- Creates only VERIFY_ prefixed methodology test records and removes exact records.
- Does not modify production project/artifact/workflow records.
- RPC verification is intentionally excluded.

Required environment variables:
  SUPABASE_URL
  ANON_KEY
  TEST_SYS_ADMIN_EMAIL
  TEST_SYS_ADMIN_PASSWORD
  TEST_PM_EMAIL
  TEST_PM_PASSWORD
  TEST_NONMEMBER_EMAIL
  TEST_NONMEMBER_PASSWORD
  TEST_PROJECT_ID
  TEST_PROJECT_ARTIFACT_ID
"""

import json
import os
import sys
import uuid
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

HTTP_TIMEOUT_SECONDS = 20

MASTER_TABLES = [
    "methodology_templates",
    "methodology_stages",
    "methodology_activities",
    "methodology_artifact_templates",
    "methodology_project_types",
]

APPROVED_TABLES = MASTER_TABLES + [
    "project_methodologies",
    "project_methodology_activities",
    "project_artifacts",
    "artifact_documents",
    "artifact_versions",
    "artifact_workflows",
    "artifact_workflow_steps",
]

REQUIRED_ENV_VARS = [
    "SUPABASE_URL",
    "ANON_KEY",
    "TEST_SYS_ADMIN_EMAIL",
    "TEST_SYS_ADMIN_PASSWORD",
    "TEST_PM_EMAIL",
    "TEST_PM_PASSWORD",
    "TEST_NONMEMBER_EMAIL",
    "TEST_NONMEMBER_PASSWORD",
    "TEST_PROJECT_ID",
    "TEST_PROJECT_ARTIFACT_ID",
]


def fail_config(message: str) -> None:
    print("!" * 79)
    print(f"CRITICAL CONFIGURATION ERROR: {message}")
    print("!" * 79)
    sys.exit(1)


def load_required_env() -> Dict[str, str]:
    missing = [name for name in REQUIRED_ENV_VARS if not os.getenv(name)]
    if missing:
        fail_config("Missing required environment variables:\n  - " + "\n  - ".join(missing))

    config = {name: os.environ[name].strip() for name in REQUIRED_ENV_VARS}
    config["SUPABASE_URL"] = config["SUPABASE_URL"].rstrip("/")

    for key in ("TEST_PROJECT_ID", "TEST_PROJECT_ARTIFACT_ID"):
        try:
            uuid.UUID(config[key])
        except ValueError:
            fail_config(f"{key} must be a valid UUID. Received: {config[key]!r}")

    return config


def decode_response_body(raw: bytes) -> Any:
    text = raw.decode("utf-8", errors="replace")
    if not text:
        return []
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def login_user(
    supabase_url: str,
    anon_key: str,
    email: str,
    password: str,
) -> Tuple[Optional[str], int, Any]:
    auth_url = f"{supabase_url}/auth/v1/token?grant_type=password"
    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    request = urllib.request.Request(
        auth_url,
        data=payload,
        headers={"apikey": anon_key, "Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            body = decode_response_body(response.read())
            token = body.get("access_token") if isinstance(body, dict) else None
            return token, response.status, body
    except urllib.error.HTTPError as error:
        return None, error.code, decode_response_body(error.read())
    except urllib.error.URLError as error:
        return None, 0, f"Network error: {error.reason}"
    except TimeoutError:
        return None, 0, "Request timed out"


def api_request(
    supabase_url: str,
    anon_key: str,
    method: str,
    endpoint: str,
    token: Optional[str] = None,
    body: Optional[Dict[str, Any]] = None,
    query: Optional[Dict[str, str]] = None,
) -> Tuple[int, Any]:
    url = f"{supabase_url}/rest/v1/{endpoint}"
    if query:
        url = f"{url}?{urllib.parse.urlencode(query, safe='(),.*')}"

    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {token or anon_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "return=representation",
    }

    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method.upper())

    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return response.status, decode_response_body(response.read())
    except urllib.error.HTTPError as error:
        return error.code, decode_response_body(error.read())
    except urllib.error.URLError as error:
        return 0, f"Network error: {error.reason}"
    except TimeoutError:
        return 0, "Request timed out"


def is_success(code: int) -> bool:
    return 200 <= code < 300


def error_summary(response: Any) -> str:
    if isinstance(response, dict):
        for key in ("message", "msg", "error_description", "error", "details"):
            if response.get(key):
                return str(response[key])
        return json.dumps(response, ensure_ascii=False)
    return str(response)


def main() -> None:
    config = load_required_env()

    supabase_url = config["SUPABASE_URL"]
    anon_key = config["ANON_KEY"]
    test_project_id = config["TEST_PROJECT_ID"]
    test_artifact_id = config["TEST_PROJECT_ARTIFACT_ID"]

    personas = {
        "sys_admin": (config["TEST_SYS_ADMIN_EMAIL"], config["TEST_SYS_ADMIN_PASSWORD"]),
        "project_pm": (config["TEST_PM_EMAIL"], config["TEST_PM_PASSWORD"]),
        "non_member": (config["TEST_NONMEMBER_EMAIL"], config["TEST_NONMEMBER_PASSWORD"]),
    }

    print("=" * 79)
    print("AETHER PMS - STEP 4: STRICT PRODUCTION JWT OPMS RLS BASELINE VERIFIER")
    print("=" * 79)
    print(f"Supabase Target URL: {supabase_url}")
    print(f"Test Project ID:      {test_project_id}")
    print(f"Test Artifact ID:     {test_artifact_id}\n")

    tokens: Dict[str, Optional[str]] = {"anon": None}
    failed_logins = []

    print("[AUTH] Authenticating dedicated test personas:")
    for persona, (email, password) in personas.items():
        token, code, response = login_user(supabase_url, anon_key, email, password)
        tokens[persona] = token
        if token and is_success(code):
            print(f"  [OK]   {persona:<12} {email} (HTTP {code})")
        else:
            failed_logins.append((persona, email, code, response))
            print(f"  [FAIL] {persona:<12} {email} (HTTP {code}: {error_summary(response)})")

    if failed_logins:
        print("\nAuthentication failed. No RLS verification was performed.")
        sys.exit(1)

    all_passed = True
    sys_token = tokens["sys_admin"]
    pm_token = tokens["project_pm"]
    nonmember_token = tokens["non_member"]

    print("\n" + "=" * 79)
    print("1. ANONYMOUS ACCESS DENIAL")
    print("=" * 79)

    for table in APPROVED_TABLES:
        code, response = api_request(
            supabase_url, anon_key, "GET", table, token=None,
            query={"select": "id", "limit": "1"},
        )

        if code in (401, 403):
            print(f"  [OK]   {table:<36} blocked (HTTP {code})")
        elif code == 200 and isinstance(response, list) and len(response) == 0:
            print(f"  [OK]   {table:<36} hidden by RLS (HTTP 200, 0 rows)")
        elif code == 200 and isinstance(response, list) and len(response) > 0:
            print(f"  [FAIL] {table:<36} leaked {len(response)} row(s) to anon")
            all_passed = False
        elif code == 404:
            print(f"  [FAIL] {table:<36} does not exist (HTTP 404)")
            all_passed = False
        else:
            print(f"  [FAIL] {table:<36} unexpected HTTP {code}: {error_summary(response)}")
            all_passed = False

    print("\n" + "=" * 79)
    print("2. AUTHENTICATED MASTER DATA SEED VERIFICATION")
    print("=" * 79)

    for table in MASTER_TABLES:
        code, response = api_request(
            supabase_url, anon_key, "GET", table, token=sys_token,
            query={"select": "id", "limit": "100"},
        )

        if code == 200 and isinstance(response, list) and len(response) > 0:
            print(f"  [OK]   {table:<36} {len(response)} seeded row(s)")
        elif code == 200 and isinstance(response, list):
            print(f"  [FAIL] {table:<36} 0 seeded rows")
            all_passed = False
        else:
            print(f"  [FAIL] {table:<36} HTTP {code}: {error_summary(response)}")
            all_passed = False

    print("\n" + "=" * 79)
    print("3. MASTER TABLE WRITE PERMISSION")
    print("=" * 79)

    run_suffix = uuid.uuid4().hex[:10].upper()
    admin_test_code = f"VERIFY_{run_suffix}_ADMIN"
    pm_test_code = f"VERIFY_{run_suffix}_PM"
    nonmember_test_code = f"VERIFY_{run_suffix}_NM"

    try:
        admin_code, admin_response = api_request(
            supabase_url, anon_key, "POST", "methodology_templates", token=sys_token,
            body={"code": admin_test_code, "name": "RLS Verifier Temporary Record", "version": "1.0"},
        )
        if admin_code in (200, 201):
            print(f"  [OK]   SYS_ADMIN write allowed ({admin_test_code})")
        else:
            print(f"  [FAIL] SYS_ADMIN write denied (HTTP {admin_code}: {error_summary(admin_response)})")
            all_passed = False

        pm_code, pm_response = api_request(
            supabase_url, anon_key, "POST", "methodology_templates", token=pm_token,
            body={"code": pm_test_code, "name": "Illegal PM Master Write", "version": "1.0"},
        )
        if pm_code in (200, 201):
            print(f"  [FAIL] project_pm illegally wrote master data ({pm_test_code})")
            all_passed = False
        else:
            print(f"  [OK]   project_pm master write blocked (HTTP {pm_code})")

        nonmember_code, nonmember_response = api_request(
            supabase_url, anon_key, "POST", "methodology_templates", token=nonmember_token,
            body={"code": nonmember_test_code, "name": "Illegal Non-member Master Write", "version": "1.0"},
        )
        if nonmember_code in (200, 201):
            print(f"  [FAIL] non_member illegally wrote master data ({nonmember_test_code})")
            all_passed = False
        else:
            print(f"  [OK]   non_member master write blocked (HTTP {nonmember_code})")

        print("\n" + "=" * 79)
        print("4. PROJECT ARTIFACT MEMBERSHIP READ PERMISSION")
        print("=" * 79)

        artifact_query = {
            "select": "id,project_id",
            "id": f"eq.{test_artifact_id}",
            "project_id": f"eq.{test_project_id}",
            "limit": "1",
        }

        admin_read_code, admin_read_response = api_request(
            supabase_url, anon_key, "GET", "project_artifacts", token=sys_token,
            query=artifact_query,
        )
        if admin_read_code == 200 and isinstance(admin_read_response, list) and len(admin_read_response) == 1:
            print("  [OK]   SYS_ADMIN can read the fixture artifact")
        else:
            print(f"  [FAIL] SYS_ADMIN cannot read the fixture artifact (HTTP {admin_read_code}, response={admin_read_response})")
            all_passed = False

        pm_read_code, pm_read_response = api_request(
            supabase_url, anon_key, "GET", "project_artifacts", token=pm_token,
            query=artifact_query,
        )
        if pm_read_code == 200 and isinstance(pm_read_response, list) and len(pm_read_response) == 1:
            print("  [OK]   project_pm can read the participating project artifact")
        else:
            print(f"  [FAIL] project_pm cannot read the participating project artifact (HTTP {pm_read_code}, response={pm_read_response})")
            all_passed = False

        nonmember_read_code, nonmember_read_response = api_request(
            supabase_url, anon_key, "GET", "project_artifacts", token=nonmember_token,
            query=artifact_query,
        )
        if nonmember_read_code in (401, 403):
            print(f"  [OK]   non_member is blocked from the fixture artifact (HTTP {nonmember_read_code})")
        elif nonmember_read_code == 200 and isinstance(nonmember_read_response, list) and len(nonmember_read_response) == 0:
            print("  [OK]   non_member sees 0 rows for the fixture artifact")
        else:
            print(f"  [FAIL] non_member can access the fixture artifact (HTTP {nonmember_read_code}, response={nonmember_read_response})")
            all_passed = False

    finally:
        print("\n" + "=" * 79)
        print("5. EXACT TEMPORARY RECORD CLEANUP")
        print("=" * 79)

        for code_value in (admin_test_code, pm_test_code, nonmember_test_code):
            delete_code, delete_response = api_request(
                supabase_url, anon_key, "DELETE", "methodology_templates", token=sys_token,
                query={"code": f"eq.{code_value}"},
            )

            if not is_success(delete_code):
                print(f"  [FAIL] Cleanup request failed for {code_value} (HTTP {delete_code}: {error_summary(delete_response)})")
                all_passed = False
                continue

            verify_code, verify_response = api_request(
                supabase_url, anon_key, "GET", "methodology_templates", token=sys_token,
                query={"select": "id", "code": f"eq.{code_value}", "limit": "1"},
            )
            if verify_code == 200 and isinstance(verify_response, list) and len(verify_response) == 0:
                print(f"  [OK]   Removed exact temporary record {code_value}")
            else:
                print(f"  [FAIL] Temporary record still exists or could not be verified: {code_value} (HTTP {verify_code}, response={verify_response})")
                all_passed = False

    print("\n" + "=" * 79)
    if all_passed:
        print("MIGRATION & RLS BASELINE VERIFIED CLEAN")
        print("RPC TESTING: EXCLUDED")
        print("=" * 79)
        sys.exit(0)

    print("VERIFICATION FAILED: One or more assertions failed.")
    print("Review the output above before continuing to the next deployment priority.")
    print("=" * 79)
    sys.exit(1)


if __name__ == "__main__":
    main()
