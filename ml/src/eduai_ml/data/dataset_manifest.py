from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

from eduai_ml.factor_space import FACTOR_SPACE_VERSION

CONTRACT_VERSION = "pedagogy_policy_contract_v1"
TRAINING_SCHEMA_VERSION = "training_observation.v1"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _file_record(path: str | Path, role: str = "observations_jsonl") -> dict[str, Any]:
    file_path = Path(path)
    record: dict[str, Any] = {
        "path": file_path.as_posix(),
        "role": role,
        "sha256": None,
        "bytes": None,
    }
    if file_path.exists() and file_path.is_file():
        payload = file_path.read_bytes()
        record["sha256"] = hashlib.sha256(payload).hexdigest()
        record["bytes"] = len(payload)
    return record


def build_dataset_manifest(
    *,
    dataset_id: str,
    source_kinds: Iterable[str],
    observation_count: int,
    files: Iterable[str | Path],
    split_strategy: str | None = None,
    generation_config: Mapping[str, Any] | None = None,
    limitations: Iterable[str] | None = None,
    notes: str | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    file_records = [_file_record(path) for path in files]
    manifest = {
        "dataset_id": dataset_id,
        "created_at": created_at or _utc_now_iso(),
        "contract_version": CONTRACT_VERSION,
        "factor_space_version": FACTOR_SPACE_VERSION,
        "schema_version": TRAINING_SCHEMA_VERSION,
        "source_kinds": sorted(set(source_kinds)),
        "observation_count": int(observation_count),
        "split_strategy": split_strategy,
        "generation_config": dict(generation_config) if generation_config is not None else None,
        "files": file_records,
        "checksums": {
            "sha256": {
                item["path"]: item["sha256"]
                for item in file_records
                if item.get("sha256") is not None
            }
        },
        "limitations": list(limitations or []),
        "notes": notes,
    }
    validate_dataset_manifest(manifest)
    return manifest


def validate_dataset_manifest(manifest: Mapping[str, Any]) -> None:
    required = {
        "dataset_id",
        "created_at",
        "contract_version",
        "factor_space_version",
        "schema_version",
        "source_kinds",
        "observation_count",
        "split_strategy",
        "generation_config",
        "files",
        "checksums",
        "limitations",
        "notes",
    }
    missing = required - set(manifest.keys())
    if missing:
        raise ValueError(f"Dataset manifest missing fields: {sorted(missing)}")
    if manifest["contract_version"] != CONTRACT_VERSION:
        raise ValueError("Unsupported contract_version")
    if manifest["factor_space_version"] != FACTOR_SPACE_VERSION:
        raise ValueError("Unsupported factor_space_version")
    if manifest["schema_version"] != TRAINING_SCHEMA_VERSION:
        raise ValueError("Unsupported schema_version")
    if not isinstance(manifest["source_kinds"], list) or not manifest["source_kinds"]:
        raise ValueError("source_kinds must be a non-empty list")
    if int(manifest["observation_count"]) < 0:
        raise ValueError("observation_count must be non-negative")
    if not isinstance(manifest["files"], list):
        raise ValueError("files must be a list")
    for item in manifest["files"]:
        if not isinstance(item, Mapping):
            raise ValueError("Each file manifest entry must be an object")
        if not item.get("path") or not item.get("role"):
            raise ValueError("Each file manifest entry requires path and role")
    if not isinstance(manifest["limitations"], list):
        raise ValueError("limitations must be a list")


def write_dataset_manifest(path: str | Path, manifest: Mapping[str, Any]) -> None:
    validate_dataset_manifest(manifest)
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(dict(manifest), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def load_dataset_manifest(path: str | Path) -> dict[str, Any]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Dataset manifest must be a JSON object")
    validate_dataset_manifest(data)
    return data
