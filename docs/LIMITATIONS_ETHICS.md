# Limitations and Ethics

## Scientific / Methodological Limits

- Proxy metrics only: expected accuracy/time and chat engagement are heuristics.
- No randomized controlled trial in current implementation.
- LLM non-determinism affects generation/tagging consistency.
- Duration is noisy and depends on client telemetry quality.
- Chat-derived UX signal is weak by design and should not be overinterpreted.
- Small sample sizes can produce unstable preferences despite smoothing and confidence labels.
- Axis transferability is imperfect (`response_format` is mcq-centric in tests, mapped loosely in chat).

## Data Quality Risks

- Fallback generation/tagging can contaminate learning if gating fails; current policy blocks these updates.
- Invalid tag diagnostics exist, but rule fallback still uses defaults and may bias distributions.
- Legacy data generated before hardening may still require backfill checks (duplicate attempts, historical payload snapshots).

## Privacy Model

Stored:
- test attempts, answer choices, score, by-tag aggregates, telemetry
- policy/compliance metadata
- chat event metadata and message length stats

Not stored by default:
- raw chat content (redacted placeholders unless `CHAT_STORE_RAW_CONTENT=1`)

Not currently implemented:
- explicit retention policy enforcement
- right-to-erasure workflow

## Ethics Positioning

- The product should be described as a research prototype.
- Claims should be limited to adaptation proxies and calibration quality, not causal learning gains.
- User-facing copy should keep uncertainty visible (confidence + "not enough data yet" states).

## Recommended Defense Disclosure

- Explain gating rules for excluded learning updates.
- Show sample sizes near every major metric.
- Distinguish behavior optimization from pedagogical efficacy claims.
