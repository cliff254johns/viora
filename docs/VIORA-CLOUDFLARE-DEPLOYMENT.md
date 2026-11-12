# VIORA Cloudflare Static Deployment

## Architecture

- `viora-static-git` remains the legacy asset/API Worker and owns the existing translation endpoint and its Durable Object rate limiter.
- `viora-static-next` serves the repository's current `web/` asset bundle first.
- Requests for paths not included in the new deployment fall back through the `LEGACY` service binding to `viora-static-git`.
- This allows a staged cutover without deleting the existing asset catalogue.
- The production custom domains should be moved only after the new Worker has passed preview tests.

## Deploy

From the repository root:

```bash
wrangler deploy --config workers/viora-static-next/wrangler.toml
```

The `assets.directory` points to the complete `web/` folder. The API/translation Worker remains separately configured by `web/wrangler.toml`.

## Cutover and rollback

1. Verify `viora-static-next` on its workers.dev preview URL.
2. Verify `/`, `/main.html`, `/api/translation-health`, PWA install assets and all legacy fallback routes.
3. Move `viora.co.ke` and `www.viora.co.ke` custom domains to `viora-static-next`.
4. Keep `viora-static-git` deployed and available as the fallback service.
5. Roll back by reassigning the custom domains to `viora-static-git` if the new Worker fails.
6. Do not delete the legacy Worker until the new static bundle and API routing have completed a monitored stability period.

## Operational requirements

- Keep the two Wrangler configurations and source files in version control.
- Do not store API tokens in either configuration file.
- Review custom-domain assignments before each release.
- Verify Workers Logs/Traces and test both normal and fallback paths.
- Avoid deploying a partial asset manifest directly to the production custom domain.
