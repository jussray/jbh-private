# 🔒 Juss Beautiful Hair — PRIVATE

**Owner:** Raylene | jussbeautifulhair.com  
⛔ **DO NOT make this repo public or deploy any directory from it.** It contains vendor sourcing, admin code, order operations, and private business strategy.

## Security boundary

This repository is a private backup and owner-only local control layer.

- It has no Cloudflare, Vercel, Pages, Workers, Netlify, or other deployment manifest.
- `npm run deploy` intentionally fails.
- Vite development and preview bind only to `127.0.0.1`.
- The private build contains only the dedicated `admin.html` owner entry and writes to `dist/private-local-only`.
- GitHub Actions fails if a deployment manifest, temporary-preview command, cloud deployment action, client-bundled admin password, or overbroad vendor handoff is introduced.
- The only deployable JBH repository is the separate public storefront repository.

## Structure

| Folder | Contents |
|---|---|
| `admin/` | Owner-only local order controls, vendor management, deterministic product routing, and private operational source. |
| `vendor-docs/` | Private vendor sourcing documents, product intake material, factory research, and outreach scripts. |
| `brand/` | Private launch planning, execution material, audits, strategy, and brand assets. |

## Owner workflow

The admin is built for the owner to decide which approved vendor should fulfill every item. Product routing rules map private product/variant patterns to a vendor, vendor SKU, unit cost, priority, and verification date. An order shows one vendor, a split order, or an explicit vendor-needed warning.

Vendor handoff text is generated separately for each vendor. It excludes customer totals, payment links, internal notes, margins, and other vendors. Phone and email are included only when that vendor is marked as requiring them.

## Public storefront

Build and deploy only from `jussbeautifulhair-site`.

Never copy the following into the public repository or a public build:

- `admin/`
- `vendor-docs/`
- private owner-vault exports
- environment files
- owner-access configuration
- sourcing, pricing, routing, or vendor records

## Run the owner admin locally

```bash
cd admin
npm install
npm run dev:owner
# Vite opens http://127.0.0.1:5173/admin.html
```

Do not use `--host 0.0.0.0`, a tunnel, a temporary Worker, a preview URL, or a cloud deployment service with this repository.
