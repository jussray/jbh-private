# 🔒 Juss Beautiful Hair — PRIVATE

**Owner:** Raylene | jussbeautifulhair.com  
⛔ **DO NOT make this repo public or deploy any directory from it.** It contains vendor sourcing, admin code, order operations, and private business strategy.

## Security boundary

This repository is a private backup and owner-only local control layer.

- It has no Cloudflare, Vercel, Pages, Workers, Netlify, or other deployment manifest.
- `npm run deploy` intentionally fails.
- Vite development and preview bind only to `127.0.0.1`.
- The private build output is named `dist/private-local-only` to prevent confusion with the public storefront artifact.
- GitHub Actions fails if a deployment manifest, temporary-preview command, or cloud deployment action is added.
- The only deployable JBH repository is the separate public storefront repository.

## Structure

| Folder | Contents |
|---|---|
| `admin/` | Owner-only admin source, vendor management, and order management. The public-only version lives in the separate public repository. |
| `vendor-docs/` | Private vendor sourcing documents, product intake material, factory research, and outreach scripts. |
| `brand/` | Private launch planning, execution material, audits, strategy, and brand assets. |

## Backup purpose

This repo is your recovery copy if a laptop, local sandbox, or external tool fails. Backup status does not make it safe to deploy.

## Public storefront

Build and deploy only from `jussbeautifulhair-site`.

Never copy the following into the public repository or a public build:

- `admin/`
- `vendor-docs/`
- private order exports
- environment files
- owner-access configuration
- sourcing, pricing, or vendor records

## Run the owner admin locally

```bash
cd admin
npm install
npm run dev
# Visit http://127.0.0.1:5173/admin
```

Do not use `--host 0.0.0.0`, a tunnel, a temporary Worker, a preview URL, or a cloud deployment service with this repository.
