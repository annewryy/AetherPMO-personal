#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Aether PMS - Step 4: Supabase OPMS Migration Verifier Script
"""

import urllib.request
import urllib.error
import json
import sys

SUPABASE_URL = "https://xzlvxqzyxgtbfkkpqzxd.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6bHZ4cXp5eGd0YmZra3BxenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDkwOTgsImV4cCI6MjA5NjY4NTA5OH0.xspbrHtYU1YBWqDDpEvnqGVzbtiDmF52SKa0Hv4fZ2s"

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

def check_table(table_name):
    url = f"{SUPABASE_URL}/rest/v1/{table_name}?select=*&limit=1"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}"
        }
    )
    try:
        res = urllib.request.urlopen(req)
        body = res.read().decode("utf-8")
        data = json.loads(body)
        print(f"  [OK] Table '{table_name}' accessible! Returned {len(data)} records.")
        return True, data
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        if e.code == 404 or "does not exist" in err_msg.lower():
            print(f"  [PENDING CREATION] Table '{table_name}' does not exist on remote Supabase instance yet.")
        elif e.code == 401 or e.code == 403:
            print(f"  [RLS RESTRICTED] Table '{table_name}' exists (HTTP {e.code}: {e.reason}).")
        else:
            print(f"  [HTTP {e.code}] Table '{table_name}': {err_msg[:100]}")
        return False, None

def main():
    print("=" * 70)
    print("AETHER PMS - STEP 4: SUPABASE OPMS MIGRATION VERIFIER")
    print("=" * 70)
    print(f"Target Supabase URL: {SUPABASE_URL}\n")
    
    results = {}
    for tbl in APPROVED_TABLES:
        exists, data = check_table(tbl)
        results[tbl] = exists

    print("\n" + "=" * 70)
    print("MIGRATION READINESS SUMMARY:")
    print("=" * 70)
    for tbl, status in results.items():
        st_text = "READY / ACCESSIBLE" if status else "NEEDS DDL EXECUTION ON DASHBOARD"
        print(f"  - {tbl:<35} : {st_text}")
    
    print("\n[INSTRUCTIONS FOR ONE-CLICK DEPLOYMENT]")
    print("1. Open your Supabase Web Dashboard -> SQL Editor")
    print("2. Copy & Paste contents of 'supabase_migrations/001_opms_phase2_ddl.sql'")
    print("3. Copy & Paste contents of 'supabase_migrations/002_opms_seed_data.sql'")
    print("4. Copy & Paste contents of 'supabase_migrations/003_opms_rls_policies.sql'")

if __name__ == "__main__":
    main()
