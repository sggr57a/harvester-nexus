#!/usr/bin/env python3
"""Server-side authentication for the Nexus cockpit BFF.

Credentials live in ``/etc/nexus/cockpit-auth.json`` as a PBKDF2-HMAC-SHA256
digest. ``nexus-postinstall`` seeds the file on first boot; if it is missing
when the cockpit starts, :func:`ensure_credential_store` generates a random
password and writes it to ``/etc/nexus/cockpit-password`` (mode 0600) so an
operator with node access can read it once and rotate it.

Sessions are bearer tokens held in memory only. A cockpit restart invalidates
every session, which is the behaviour we want on a single-node appliance: no
session survives a reboot, and there is no persisted token to steal.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from typing import Any

AUTH_FILE = os.environ.get("NEXUS_COCKPIT_AUTH_FILE", "/etc/nexus/cockpit-auth.json")
PASSWORD_HANDOFF_FILE = os.environ.get(
    "NEXUS_COCKPIT_PASSWORD_FILE", "/etc/nexus/cockpit-password"
)

PBKDF2_ITERATIONS = 600_000
SALT_BYTES = 16
SESSION_TTL_SECONDS = int(os.environ.get("NEXUS_COCKPIT_SESSION_TTL", "43200"))
MAX_FAILED_ATTEMPTS = 10
LOCKOUT_SECONDS = 300


def hash_password(password: str, salt: bytes | None = None, iterations: int = PBKDF2_ITERATIONS) -> dict[str, Any]:
    if salt is None:
        salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return {
        "algorithm": "pbkdf2-sha256",
        "iterations": iterations,
        "salt": base64.b64encode(salt).decode("ascii"),
        "hash": base64.b64encode(digest).decode("ascii"),
    }


def verify_password(password: str, record: dict[str, Any]) -> bool:
    """Constant-time password check against a stored credential record."""
    try:
        salt = base64.b64decode(record["salt"])
        expected = base64.b64decode(record["hash"])
        iterations = int(record.get("iterations", PBKDF2_ITERATIONS))
    except (KeyError, ValueError, TypeError):
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(candidate, expected)


class CredentialStore:
    """admin credentials plus the must-rotate flag, persisted as JSON."""

    def __init__(self, path: str = AUTH_FILE):
        self.path = path
        self._lock = threading.Lock()

    def load(self) -> dict[str, Any] | None:
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError):
            return None
        return data if isinstance(data, dict) else None

    def save(self, data: dict[str, Any]) -> None:
        with self._lock:
            directory = os.path.dirname(self.path)
            if directory:
                os.makedirs(directory, mode=0o700, exist_ok=True)
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=2)
            os.chmod(tmp, 0o600)
            os.replace(tmp, self.path)

    def set_password(self, username: str, password: str, must_change: bool = False) -> dict[str, Any]:
        record = {
            "username": username,
            "credential": hash_password(password),
            "mustChangePassword": must_change,
            "updatedAtMs": int(time.time() * 1000),
        }
        self.save(record)
        return record


def ensure_credential_store(store: CredentialStore | None = None) -> tuple[dict[str, Any], str | None]:
    """Return the credential record, generating a random password if absent.

    The second tuple element is the generated plaintext password when one was
    created (so the caller can hand it to the operator), otherwise ``None``.
    Never returns a hardcoded default — an appliance that ships a known
    password is indistinguishable from one with no password at all.
    """
    store = store or CredentialStore()
    existing = store.load()
    if existing and isinstance(existing.get("credential"), dict):
        return existing, None

    password = secrets.token_urlsafe(18)
    record = store.set_password("admin", password, must_change=True)
    try:
        directory = os.path.dirname(PASSWORD_HANDOFF_FILE)
        if directory:
            os.makedirs(directory, mode=0o700, exist_ok=True)
        with open(PASSWORD_HANDOFF_FILE, "w", encoding="utf-8") as fh:
            fh.write(password + "\n")
        os.chmod(PASSWORD_HANDOFF_FILE, 0o600)
    except OSError:
        # Handing the password back to the caller still lets the operator see
        # it in the cockpit journal, so a read-only /etc is not fatal.
        pass
    return record, password


class SessionManager:
    """In-memory bearer tokens with TTL, plus per-username lockout."""

    def __init__(self, ttl_seconds: int = SESSION_TTL_SECONDS):
        self.ttl = ttl_seconds
        self._sessions: dict[str, dict[str, Any]] = {}
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, now: float) -> None:
        expired = [token for token, meta in self._sessions.items() if meta["expiresAt"] <= now]
        for token in expired:
            self._sessions.pop(token, None)

    def create(self, username: str) -> dict[str, Any]:
        now = time.time()
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._prune(now)
            self._sessions[token] = {"username": username, "expiresAt": now + self.ttl}
        return {"token": token, "expiresInSeconds": self.ttl}

    def validate(self, token: str | None) -> str | None:
        """Return the username for a live token, else None."""
        if not token:
            return None
        now = time.time()
        with self._lock:
            self._prune(now)
            meta = self._sessions.get(token)
            if not meta:
                return None
            return str(meta["username"])

    def revoke(self, token: str | None) -> None:
        if not token:
            return
        with self._lock:
            self._sessions.pop(token, None)

    def revoke_all(self) -> None:
        with self._lock:
            self._sessions.clear()

    def locked_out(self, username: str) -> bool:
        now = time.time()
        with self._lock:
            attempts = [t for t in self._failures.get(username, []) if now - t < LOCKOUT_SECONDS]
            self._failures[username] = attempts
            return len(attempts) >= MAX_FAILED_ATTEMPTS

    def record_failure(self, username: str) -> None:
        now = time.time()
        with self._lock:
            self._failures.setdefault(username, []).append(now)

    def clear_failures(self, username: str) -> None:
        with self._lock:
            self._failures.pop(username, None)


def parse_bearer_token(header_value: str | None) -> str | None:
    if not header_value:
        return None
    parts = header_value.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def parse_session_cookie(cookie_header: str | None, name: str = "nexus_session") -> str | None:
    if not cookie_header:
        return None
    for chunk in cookie_header.split(";"):
        key, _, value = chunk.strip().partition("=")
        if key == name:
            return value.strip() or None
    return None
