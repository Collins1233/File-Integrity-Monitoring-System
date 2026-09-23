#!/usr/bin/env python3
"""
Automated unit & integration test for Cryptographic Baseline Tamper Protection (HMAC-SHA256 Signing).
Tests:
1. Baseline HMAC key generation & loading.
2. Canonical store signing and validation.
3. Tamper detection: artificially altering baseline content causes signature mismatch.
4. Integrity check aborts execution on tampered baseline with tamper_detected=True.
5. Re-saving / accepting baseline restores valid cryptographic state.
"""

import copy
import json
import os
import shutil
import sys
import tempfile

# Add backend directory to sys.path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import config
from baseline_store import (
    BASELINE_FILE,
    _get_or_create_hmac_key,
    compute_store_signature,
    verify_store_integrity,
    load_store,
    _save_store,
    accept_monitor_changes,
)
from integrity import run_integrity_check


def run_tests():
    print("================================================================")
    print("RUNNING CRYPTOGRAPHIC BASELINE TAMPER PROTECTION TESTS")
    print("================================================================")

    # 1. Test Key Generation
    key = _get_or_create_hmac_key()
    assert isinstance(key, bytes) and len(key) == 32, f"Expected 32-byte key, got {len(key) if isinstance(key, bytes) else type(key)}"
    print("[TEST 1 PASSED] HMAC key generation verified (256-bit key).")

    # 2. Test Store Signing & Verification
    test_store = {
        "version": 2,
        "monitors": [
            {
                "id": "test_mon_1",
                "monitor_type": "folder",
                "folder_path": "C:\\test_path",
                "created_at": "2026-09-23 10:00:00",
                "files": {
                    "C:\\test_path\\file1.txt": {
                        "hash": "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                        "size": 100
                    }
                }
            }
        ],
        "active_monitor_id": "test_mon_1"
    }

    sig = compute_store_signature(test_store, key)
    assert isinstance(sig, str) and len(sig) == 64, f"Expected 64-char hex digest, got {sig}"
    test_store["signature"] = sig

    is_valid, reason = verify_store_integrity(test_store)
    assert is_valid is True and reason == "VALID", f"Expected (True, 'VALID'), got ({is_valid}, '{reason}')"
    print("[TEST 2 PASSED] Canonical baseline signature computation & verification succeeded.")

    # 3. Test Tamper Detection (Direct Dictionary Modification)
    tampered_store = copy.deepcopy(test_store)
    tampered_store["monitors"][0]["files"]["C:\\test_path\\file1.txt"]["hash"] = "0000000000000000000000000000000000000000000000000000000000000000"

    is_valid, reason = verify_store_integrity(tampered_store)
    assert is_valid is False and reason == "SIGNATURE_MISMATCH", f"Expected (False, 'SIGNATURE_MISMATCH'), got ({is_valid}, '{reason}')"
    print("[TEST 3 PASSED] Artificially modified file hash instantly flagged as SIGNATURE_MISMATCH.")

    # 4. Test Live Baseline File Tampering & run_integrity_check Abort
    # Backup existing baseline.json if present
    baseline_backup = None
    if os.path.exists(BASELINE_FILE):
        with open(BASELINE_FILE, "r", encoding="utf-8") as f:
            baseline_backup = f.read()

    try:
        # Save valid signed baseline
        _save_store(test_store)
        assert os.path.exists(BASELINE_FILE)

        # Check that on-disk baseline is valid
        is_valid, reason = verify_store_integrity()
        assert is_valid is True and reason == "VALID", f"On-disk store failed verification: {reason}"
        print("[TEST 4A PASSED] On-disk baseline.json saved with valid HMAC signature.")

        # Tamper with baseline.json directly on disk (simulating attacker replacing hash)
        with open(BASELINE_FILE, "r", encoding="utf-8") as f:
            disk_data = json.load(f)

        disk_data["monitors"][0]["files"]["C:\\test_path\\file1.txt"]["hash"] = "malicious_injected_hash"
        # Write back without recalculating signature
        with open(BASELINE_FILE, "w", encoding="utf-8") as f:
            json.dump(disk_data, f, indent=4)

        # Verify tamper detected on disk
        is_valid, reason = verify_store_integrity()
        assert is_valid is False and reason == "SIGNATURE_MISMATCH", f"Expected SIGNATURE_MISMATCH on disk, got {reason}"
        print("[TEST 4B PASSED] External file tampering detected on disk.")

        # Run integrity check - must abort and return tamper_detected=True
        result = run_integrity_check(generate_report=False)
        assert result.get("tamper_detected") is True, f"Expected tamper_detected=True, got {result}"
        assert result.get("success") is False, f"Expected success=False, got {result}"
        print(f"[TEST 4C PASSED] run_integrity_check halted execution: {result.get('message')}")

        # Test recovery / auto-rehash when _save_store is called legitimately
        _save_store(disk_data)
        is_valid, reason = verify_store_integrity()
        assert is_valid is True and reason == "VALID"
        print("[TEST 4D PASSED] Legitimate save re-signed baseline and restored VALID integrity state.")

    finally:
        # Restore original baseline if backup was taken
        if baseline_backup is not None:
            with open(BASELINE_FILE, "w", encoding="utf-8") as f:
                f.write(baseline_backup)
        elif os.path.exists(BASELINE_FILE):
            os.remove(BASELINE_FILE)

    print("================================================================")
    print("ALL CRYPTOGRAPHIC BASELINE TESTS PASSED SUCCESSFULLY! (5/5)")
    print("================================================================")


if __name__ == "__main__":
    run_tests()
