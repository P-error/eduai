#!/usr/bin/env python3
"""Sync project files to phone via Taildrop (preferred) or SSH fallback."""

from __future__ import annotations

import os
import re
import socket
import shutil
import subprocess
import sys
import tarfile
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

try:
    import paramiko
except ModuleNotFoundError:  # pragma: no cover - optional for taildrop transport
    paramiko = None


@dataclass(frozen=True)
class SshConfig:
    """SSH connection settings for Termux."""

    host: str = os.environ.get("EDUAI_SYNC_HOST", "192.168.1.65")
    port: int = int(os.environ.get("EDUAI_SYNC_PORT", "8022"))
    username: str = os.environ.get("EDUAI_SYNC_USER", "u0_a365")
    password: str = os.environ.get("EDUAI_SYNC_PASSWORD", "7410")


PROJECT_NAME = os.environ.get("EDUAI_SYNC_PROJECT", "EduAI").strip() or "EduAI"
ARCHIVE_PREFIX = "eduai-sync"
ABOUT_NAME = f"{PROJECT_NAME.lower()}-about.md"
MODE_ENV = "EDUAI_SYNC_MODE"
TRANSPORT_ENV = "EDUAI_SYNC_TRANSPORT"
ABOUT_TEXT_ENV = "EDUAI_SYNC_ABOUT_TEXT"
CONFIRM_ENV = "EDUAI_SYNC_CONFIRM"
FILE_PATH_ENV = "EDUAI_SYNC_FILE"
FILE_NAME_ENV = "EDUAI_SYNC_NAME"
REMOTE_SUFFIX_ENV = "EDUAI_SYNC_REMOTE_SUFFIX"
TAILSCALE_TARGET_ENV = "EDUAI_SYNC_TAILSCALE_TARGET"
TAILSCALE_TARGET_HINT_ENV = "EDUAI_SYNC_TAILSCALE_TARGET_HINT"

LOCAL_ROOT = Path(__file__).resolve().parent
LOCAL_TMP_DIR = Path("/tmp")
LOCAL_ARCHIVE_PATH = LOCAL_TMP_DIR / f"{ARCHIVE_PREFIX}-latest.tar.gz"
LOCAL_ABOUT_PATH = LOCAL_TMP_DIR / ABOUT_NAME
REMOTE_SHARED_SUFFIX = (
    os.environ.get(REMOTE_SUFFIX_ENV, "").strip() or f"storage/shared/{PROJECT_NAME}"
)

DOC_ITEMS = (
    "docs",
    "README.md",
    "AGENTS.md",
    "package.json",
    "prisma/schema.prisma",
)

FULL_EXCLUDE_DIRS = {
    ".git",
    ".next",
    "node_modules",
    "__pycache__",
    ".idea",
    ".vscode",
}

FULL_EXCLUDE_FILES = {
    ".DS_Store",
    ".env",
    ".env.local",
}

TIMESTAMP_SUFFIX_RE = re.compile(r"(?:[_-]?\d{8}(?:[_-]?\d{6})?)$")


def _iter_doc_files(root: Path) -> Iterable[Path]:
    """Yield files that should be included in docs mode."""

    seen: set[Path] = set()
    for item in DOC_ITEMS:
        target = root / item
        if target.is_file():
            seen.add(target)
            continue
        if target.is_dir():
            for file_path in target.rglob("*"):
                if file_path.is_file():
                    seen.add(file_path)

    for file_path in sorted(seen, key=lambda path: path.as_posix()):
        yield file_path


def _build_archive(archive_path: Path, files: Iterable[Path], root: Path) -> None:
    """Create a tar.gz archive from a file list."""

    if archive_path.exists():
        archive_path.unlink()

    with tarfile.open(archive_path, "w:gz") as archive:
        for file_path in files:
            arcname = file_path.relative_to(root).as_posix()
            archive.add(file_path, arcname=arcname, recursive=False)


def _iter_full_repo_files(root: Path) -> Iterable[Path]:
    """Yield files for a full project snapshot."""

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in FULL_EXCLUDE_DIRS]
        for name in filenames:
            if name in FULL_EXCLUDE_FILES:
                continue
            if name.endswith(".env"):
                continue
            file_path = Path(dirpath) / name
            if file_path.is_file():
                yield file_path


def _build_about_text() -> str:
    """Build about text payload."""

    raw = os.environ.get(ABOUT_TEXT_ENV, "").strip()
    if raw:
        return raw

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    return (
        "# About\n\n"
        f'"Snapshot of {PROJECT_NAME} on {timestamp}."\n'
        '"File generated automatically for quick context transfer."\n'
    )


def _build_archive_name() -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{ARCHIVE_PREFIX}_{timestamp}.tar.gz"


def _resolve_transport() -> str:
    """Resolve transfer transport from env."""

    raw = os.environ.get(TRANSPORT_ENV, "auto").strip().lower()
    if raw in {"auto", "taildrop", "ssh"}:
        return raw
    raise RuntimeError(f"Unknown transport: {raw}")


def _is_tailnet_target(value: str) -> bool:
    """Return True when value looks like a Tailscale node target."""

    host = value.strip().lower()
    if not host:
        return False
    return host.endswith(".ts.net") or host.startswith("100.") or host.startswith("fd7a:")


def _resolve_taildrop_target(config: SshConfig) -> str:
    """Resolve target node for tailscale file cp."""

    explicit = os.environ.get(TAILSCALE_TARGET_ENV, "").strip()
    if explicit:
        return explicit
    if _is_tailnet_target(config.host):
        return config.host
    detected = _detect_taildrop_target()
    if detected:
        return detected
    raise RuntimeError(
        f"Taildrop target is not set. Define {TAILSCALE_TARGET_ENV} "
        "or set EDUAI_SYNC_HOST to a Tailscale IP/DNS."
    )


def _tailscale_available() -> bool:
    return shutil.which("tailscale") is not None


def _run_tailscale(args: list[str]) -> subprocess.CompletedProcess[str]:
    """Run tailscale CLI and capture text output."""

    if not _tailscale_available():
        raise RuntimeError("tailscale CLI is not available in PATH.")

    return subprocess.run(
        ["tailscale", *args],
        check=False,
        capture_output=True,
        text=True,
    )


def _target_from_peer(peer: dict[str, object]) -> str | None:
    """Return a usable Taildrop target from a status peer object."""

    dns_name = str(peer.get("DNSName") or "").strip().rstrip(".")
    if dns_name:
        return dns_name

    tailscale_ips = peer.get("TailscaleIPs")
    if isinstance(tailscale_ips, list):
        for value in tailscale_ips:
            ip = str(value or "").strip()
            if ip:
                return ip

    host_name = str(peer.get("HostName") or "").strip()
    return host_name or None


def _peer_matches_hint(peer: dict[str, object], hint: str) -> bool:
    """Return true when a peer matches a user-provided target hint."""

    if not hint:
        return True

    needle = hint.lower()
    candidates = [
        peer.get("HostName"),
        peer.get("DNSName"),
        peer.get("OS"),
        *(
            peer.get("TailscaleIPs")
            if isinstance(peer.get("TailscaleIPs"), list)
            else []
        ),
    ]
    return any(needle in str(value or "").lower() for value in candidates)


def _detect_taildrop_target_from_status() -> str | None:
    """Detect an available Taildrop target from tailscale status JSON."""

    result = _run_tailscale(["status", "--json"])
    if result.returncode != 0:
        return None

    try:
        status = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None

    peers = status.get("Peer")
    if not isinstance(peers, dict):
        return None

    hint = os.environ.get(TAILSCALE_TARGET_HINT_ENV, "").strip()
    candidates: list[dict[str, object]] = []
    for peer in peers.values():
        if not isinstance(peer, dict):
            continue
        if not peer.get("TaildropTarget"):
            continue
        if str(peer.get("NoFileSharingReason") or "").strip():
            continue
        if not _peer_matches_hint(peer, hint):
            continue
        if _target_from_peer(peer):
            candidates.append(peer)

    if not candidates:
        return None

    candidates.sort(
        key=lambda peer: (
            0 if peer.get("Online") else 1,
            0 if peer.get("Active") else 1,
            0 if str(peer.get("OS") or "").lower() == "android" else 1,
            str(peer.get("HostName") or ""),
        )
    )
    return _target_from_peer(candidates[0])


def _detect_taildrop_target_from_targets() -> str | None:
    """Detect a Taildrop target from tailscale file cp --targets."""

    result = _run_tailscale(["file", "cp", "--targets"])
    if result.returncode != 0:
        return None

    rows = [line.split() for line in result.stdout.splitlines() if line.strip()]
    targets = [row[0] for row in rows if row]
    if len(targets) != 1:
        return None
    return targets[0]


def _detect_taildrop_target() -> str | None:
    """Detect a Taildrop target without requiring env configuration."""

    if not _tailscale_available():
        return None

    return _detect_taildrop_target_from_status() or _detect_taildrop_target_from_targets()


def _taildrop_copy(local_path: Path, remote_name: str, target: str) -> None:
    """Send file via tailscale file cp."""

    cmd = ["tailscale", "file", "cp"]
    if remote_name and remote_name != local_path.name:
        cmd.extend(["--name", remote_name])
    cmd.extend([str(local_path), f"{target}:"])

    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        details = result.stderr.strip() or result.stdout.strip() or "Unknown error."
        raise RuntimeError(f"Taildrop copy failed: {details}")

    if os.environ.get(CONFIRM_ENV, "").strip() == "1":
        print(f"Taildrop queued: {remote_name} -> {target}:")


def _send_taildrop_docs(target: str) -> None:
    files = list(_iter_doc_files(LOCAL_ROOT))
    if not files:
        raise FileNotFoundError("No files found for docs archive.")
    _build_archive(LOCAL_ARCHIVE_PATH, files, LOCAL_ROOT)
    remote_name = _build_archive_name()
    _taildrop_copy(LOCAL_ARCHIVE_PATH, remote_name, target)


def _send_taildrop_full(target: str) -> None:
    files = list(_iter_full_repo_files(LOCAL_ROOT))
    if not files:
        raise FileNotFoundError("No files found for full archive.")
    _build_archive(LOCAL_ARCHIVE_PATH, files, LOCAL_ROOT)
    remote_name = _build_archive_name()
    _taildrop_copy(LOCAL_ARCHIVE_PATH, remote_name, target)


def _send_taildrop_about(target: str) -> None:
    content = _build_about_text()
    LOCAL_ABOUT_PATH.write_text(content, encoding="utf-8")
    _taildrop_copy(LOCAL_ABOUT_PATH, ABOUT_NAME, target)


def _send_taildrop_file(target: str) -> None:
    file_path = _resolve_file_path()
    remote_name = _resolve_file_name(file_path)
    _taildrop_copy(file_path, remote_name, target)


def _send_via_taildrop(mode: str, config: SshConfig) -> None:
    """Dispatch sync by tailscale file cp."""

    target = _resolve_taildrop_target(config)
    if mode == "about":
        _send_taildrop_about(target)
        return
    if mode == "docs":
        _send_taildrop_docs(target)
        return
    if mode == "file":
        _send_taildrop_file(target)
        return
    _send_taildrop_full(target)


def _ensure_paramiko() -> None:
    """Ensure paramiko is available for SSH transport."""

    if paramiko is None:
        raise RuntimeError(
            "paramiko is not installed. Use EDUAI_SYNC_TRANSPORT=taildrop "
            "or install paramiko for SSH mode."
        )


def _get_remote_home(ssh: paramiko.SSHClient) -> str:
    """Return remote HOME path."""

    _, stdout, stderr = ssh.exec_command('printf %s "$HOME"')
    output = stdout.read().decode("utf-8", errors="ignore").strip()
    error = stderr.read()
    if error:
        raise RuntimeError(error.decode("utf-8", errors="ignore").strip())
    if not output:
        raise RuntimeError("Unable to resolve remote HOME path.")
    return output


def _ensure_remote_dir(ssh: paramiko.SSHClient, remote_dir: str) -> None:
    """Create remote directory if missing."""

    _, stdout, stderr = ssh.exec_command(f"mkdir -p {remote_dir}")
    _ = stdout.read()
    error = stderr.read()
    if error:
        raise RuntimeError(error.decode("utf-8", errors="ignore").strip())


def _connect_ssh(config: SshConfig) -> paramiko.SSHClient:
    """Connect to Termux using SSH."""

    _ensure_paramiko()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=config.host,
        port=config.port,
        username=config.username,
        password=config.password,
        timeout=10,
    )
    return client


def _confirm_remote(sftp: paramiko.SFTPClient, remote_path: str) -> None:
    """Print remote file details if it exists."""

    try:
        attrs = sftp.stat(remote_path)
    except IOError:
        print(f"Could not confirm remote file: {remote_path}")
        return
    print(f"Remote file is present: {remote_path} (size: {attrs.st_size} bytes)")


def _split_name_ext(name: str) -> tuple[str, str]:
    """Split file name into stem and extension (with .tar.gz support)."""

    lower = name.lower()
    if lower.endswith(".tar.gz"):
        return name[:-7], ".tar.gz"
    if lower.endswith(".tar.bz2"):
        return name[:-8], ".tar.bz2"
    if lower.endswith(".tar.xz"):
        return name[:-7], ".tar.xz"

    path = Path(name)
    return path.stem, path.suffix


def _canonical_remote_name(name: str) -> str:
    """Build canonical file identity, ignoring trailing timestamp suffix."""

    stem, ext = _split_name_ext(Path(name).name)
    stem = TIMESTAMP_SUFFIX_RE.sub("", stem)
    stem = stem.rstrip("_-")
    return f"{stem}{ext}".lower()


def _cleanup_remote_versions(
    sftp: paramiko.SFTPClient,
    remote_dir: str,
    target_name: str,
) -> None:
    """Remove old files that match target name ignoring trailing timestamp."""

    try:
        files = sftp.listdir(remote_dir)
    except IOError:
        return

    target_canonical = _canonical_remote_name(target_name)
    for name in files:
        if _canonical_remote_name(name) != target_canonical:
            continue
        try:
            sftp.remove(f"{remote_dir}/{name}")
        except IOError:
            pass


def _resolve_mode() -> str:
    """Resolve sync mode from env."""

    raw_mode = os.environ.get(MODE_ENV, "docs").strip().lower()
    if raw_mode in {"docs", "documentation"}:
        return "docs"
    if raw_mode == "about":
        return "about"
    if raw_mode in {"full", "project", "repo"}:
        return "full"
    if raw_mode in {"file", "send", "artifact"}:
        return "file"
    raise RuntimeError(f"Unknown sync mode: {raw_mode}")


def _resolve_file_path() -> Path:
    """Resolve local file path for file mode."""

    raw = os.environ.get(FILE_PATH_ENV, "").strip()
    if not raw:
        raise RuntimeError(f"Missing file path env: {FILE_PATH_ENV}")

    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = (LOCAL_ROOT / path).resolve()
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    if path.name == ".env" or path.name.endswith(".env"):
        raise RuntimeError("Sending .env files is blocked.")
    return path


def _resolve_file_name(file_path: Path) -> str:
    """Resolve remote file name for file mode."""

    raw = os.environ.get(FILE_NAME_ENV, "").strip()
    if not raw:
        return file_path.name
    name = Path(raw).name
    if not name:
        raise RuntimeError("Invalid remote file name.")
    return name


def _send_docs_archive(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    """Build and upload docs archive."""

    files = list(_iter_doc_files(LOCAL_ROOT))
    if not files:
        raise FileNotFoundError("No files found for docs archive.")

    _build_archive(LOCAL_ARCHIVE_PATH, files, LOCAL_ROOT)
    remote_archive = f"{remote_dir}/{_build_archive_name()}"
    _cleanup_remote_versions(sftp, remote_dir, Path(remote_archive).name)
    sftp.put(str(LOCAL_ARCHIVE_PATH), remote_archive)

    if os.environ.get(CONFIRM_ENV, "").strip() == "1":
        _confirm_remote(sftp, remote_archive)


def _send_full_archive(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    """Build and upload full project archive."""

    files = list(_iter_full_repo_files(LOCAL_ROOT))
    if not files:
        raise FileNotFoundError("No files found for full archive.")

    _build_archive(LOCAL_ARCHIVE_PATH, files, LOCAL_ROOT)
    remote_archive = f"{remote_dir}/{_build_archive_name()}"
    _cleanup_remote_versions(sftp, remote_dir, Path(remote_archive).name)
    sftp.put(str(LOCAL_ARCHIVE_PATH), remote_archive)

    if os.environ.get(CONFIRM_ENV, "").strip() == "1":
        _confirm_remote(sftp, remote_archive)


def _send_about_file(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    """Build and upload about file."""

    content = _build_about_text()
    LOCAL_ABOUT_PATH.write_text(content, encoding="utf-8")
    remote_about = f"{remote_dir}/{ABOUT_NAME}"
    _cleanup_remote_versions(sftp, remote_dir, Path(remote_about).name)
    sftp.put(str(LOCAL_ABOUT_PATH), remote_about)

    if os.environ.get(CONFIRM_ENV, "").strip() == "1":
        _confirm_remote(sftp, remote_about)


def _send_file(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    """Upload arbitrary file."""

    file_path = _resolve_file_path()
    remote_name = _resolve_file_name(file_path)
    remote_path = f"{remote_dir}/{remote_name}"
    _cleanup_remote_versions(sftp, remote_dir, remote_name)
    sftp.put(str(file_path), remote_path)

    if os.environ.get(CONFIRM_ENV, "").strip() == "1":
        _confirm_remote(sftp, remote_path)


def _send_via_ssh(mode: str, config: SshConfig) -> None:
    """Dispatch sync via SSH/SFTP transport."""

    ssh = None
    sftp = None
    try:
        ssh = _connect_ssh(config)
        remote_home = _get_remote_home(ssh)
        remote_dir = f"{remote_home}/{REMOTE_SHARED_SUFFIX}"
        _ensure_remote_dir(ssh, remote_dir)
        sftp = ssh.open_sftp()

        if mode == "about":
            _send_about_file(sftp, remote_dir)
        elif mode == "docs":
            _send_docs_archive(sftp, remote_dir)
        elif mode == "file":
            _send_file(sftp, remote_dir)
        else:
            _send_full_archive(sftp, remote_dir)
    finally:
        if sftp is not None:
            sftp.close()
        if ssh is not None:
            ssh.close()


def main() -> int:
    """Entrypoint."""

    config = SshConfig()
    mode = _resolve_mode()
    transport = _resolve_transport()

    try:
        if transport == "taildrop":
            _send_via_taildrop(mode, config)
        elif transport == "ssh":
            _send_via_ssh(mode, config)
        else:
            try:
                _send_via_taildrop(mode, config)
            except (FileNotFoundError, RuntimeError, OSError) as taildrop_error:
                print(f"Taildrop unavailable, fallback to SSH: {taildrop_error}")
                _send_via_ssh(mode, config)

        print("Done.")
        return 0
    except (FileNotFoundError, RuntimeError, OSError) as exc:
        print(f"Error: {exc}")
        return 1
    except socket.error as exc:
        print(f"SSH connection error: {exc}")
        return 1
    except Exception as exc:  # pragma: no cover - transport-level fallback guard
        if paramiko is not None and isinstance(
            exc,
            (paramiko.SSHException, paramiko.AuthenticationException),
        ):
            print(f"SSH connection error: {exc}")
            return 1
        print(f"Error: {exc}")
        return 1
    finally:
        if LOCAL_ARCHIVE_PATH.exists():
            try:
                LOCAL_ARCHIVE_PATH.unlink()
            except OSError:
                pass
        if LOCAL_ABOUT_PATH.exists():
            try:
                LOCAL_ABOUT_PATH.unlink()
            except OSError:
                pass


if __name__ == "__main__":
    sys.exit(main())
