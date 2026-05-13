# Training Datasets

Operational learning/evaluation data stays canonical in PostgreSQL.
This directory stores exported training snapshots only.

Phase roots:
- `training_datasets/synthetic/`
- `training_datasets/real/`

Both phases use the same training schema contract.
Snapshots are versioned directories created by the training dataset export workflow.
