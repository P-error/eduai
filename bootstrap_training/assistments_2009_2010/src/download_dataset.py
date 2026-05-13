from __future__ import annotations

import argparse
import os
import tempfile
import urllib.request
from pathlib import Path
from typing import Any

from common import (
    build_paths,
    ensure_workspace_directories,
    infer_filename_from_headers,
    load_config,
    save_json,
    sha256_of_file,
    utc_now_iso,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download the corrected ASSISTments 2009-2010 Skill Builder dataset."
    )
    parser.add_argument("--config", default=None, help="Path to workspace config JSON.")
    parser.add_argument("--force", action="store_true", help="Re-download even if the file exists.")
    return parser.parse_args()


def build_existing_metadata(target_path: Path, config: dict[str, Any]) -> dict[str, Any]:
    stat = target_path.stat()
    return {
        "status": "skipped_existing",
        "dataset_name": config["dataset"]["name"],
        "source_page_url": config["dataset"]["source_page_url"],
        "file_page_url": config["dataset"]["file_page_url"],
        "download_url": config["dataset"]["download_url"],
        "saved_filename": target_path.name,
        "saved_path": str(target_path),
        "file_size_bytes": stat.st_size,
        "sha256": sha256_of_file(target_path),
        "observed_at_utc": utc_now_iso(),
    }


def download_file(url: str, target_path: Path) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 EduAI bootstrap workspace"})
    started_at = utc_now_iso()
    with urllib.request.urlopen(request, timeout=120) as response:
        original_filename = infer_filename_from_headers(response.headers)
        final_url = response.geturl()
        content_length = response.headers.get("Content-Length")
        last_modified = response.headers.get("Last-Modified")

        target_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".tmp",
            prefix="assistments_",
            dir=target_path.parent,
        ) as temporary_handle:
            temporary_path = Path(temporary_handle.name)
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                temporary_handle.write(chunk)

    os.replace(temporary_path, target_path)
    finished_at = utc_now_iso()

    return {
        "status": "downloaded",
        "requested_at_utc": started_at,
        "downloaded_at_utc": finished_at,
        "final_url": final_url,
        "original_filename": original_filename,
        "content_length_header": int(content_length) if content_length else None,
        "last_modified_header": last_modified,
        "file_size_bytes": target_path.stat().st_size,
        "sha256": sha256_of_file(target_path),
    }


def main() -> None:
    args = parse_args()
    config, _ = load_config(args.config)
    paths = build_paths(config)
    ensure_workspace_directories(paths)

    target_path = paths["raw_dataset"]
    metadata_path = paths["download_metadata"]

    if target_path.exists() and not args.force:
        payload = build_existing_metadata(target_path, config)
        save_json(metadata_path, payload)
        print(f"Skipped download, dataset already exists: {target_path}")
        return

    download_metadata = download_file(config["dataset"]["download_url"], target_path)
    payload = {
        "dataset_name": config["dataset"]["name"],
        "source_page_url": config["dataset"]["source_page_url"],
        "file_page_url": config["dataset"]["file_page_url"],
        "download_url": config["dataset"]["download_url"],
        "saved_filename": target_path.name,
        "saved_path": str(target_path),
        **download_metadata,
    }
    save_json(metadata_path, payload)
    print(f"Saved dataset to: {target_path}")


if __name__ == "__main__":
    main()
