# Security Notes

## Secrets Handling

- Never commit secrets, tokens, API keys, or production database URLs.
- Use `.env.example` and `.env.production.example` as templates only.
- Store real values in deployment platform environment settings.

## Key Rotation

If any secret may be exposed:
1. Rotate `JWT_SECRET`.
2. Rotate `OPENAI_API_KEY`.
3. Rotate `DATASET_EXPORT_SECRET`.
4. Update environment settings and redeploy.

## Reporting

If you discover a security issue in this prototype, report it privately to the project owner before public disclosure.
