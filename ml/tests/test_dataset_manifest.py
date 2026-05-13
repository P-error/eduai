from __future__ import annotations

from eduai_ml.data.dataset_manifest import (
    build_dataset_manifest,
    validate_dataset_manifest,
)


def test_dataset_manifest_builds_and_validates(tmp_path) -> None:
    dataset_path = tmp_path / "dataset.jsonl"
    dataset_path.write_text('{"ok": true}\n', encoding="utf-8")

    manifest = build_dataset_manifest(
        dataset_id="dataset_test",
        source_kinds=["synthetic"],
        observation_count=1,
        files=[dataset_path],
        generation_config={"seed": 1},
        limitations=["test only"],
        notes="unit test",
        created_at="2026-01-01T00:00:00Z",
    )
    validate_dataset_manifest(manifest)
    assert manifest["observation_count"] == 1
    assert manifest["files"][0]["sha256"] is not None
