# 🔒 Juss Beautiful Hair — PRIVATE

**Owner:** Raylene | jussbeautifulhair.com  
⛔ **DO NOT make this repo public.** Contains vendor sourcing, admin code, brand strategy.

## Structure

| Folder | Contents |
|---|---|
| `admin/` | Full website source code INCLUDING the admin panel (`/admin` route, vendor management, order management). The public-only version lives in the separate `jussbeautifulhair-site` repo. |
| `vendor-docs/` | Vendor sourcing master doc (.md + .pdf), product intake CSV, gatekept factory list, outreach scripts |
| `brand/` | Launch plan, execution kit, FB audit, brand strategy + all brand images |

## Backup purpose

This repo is your insurance. If your laptop dies, sandbox resets, or any tool changes, you can re-clone and have everything back.

## Re-deploying the site

The PUBLIC version (no admin code) is at: `jussbeautifulhair-site`  
Build & deploy from there: `npm install && npm run build`, then upload `dist/public/` to Cloudflare Pages.

To run the admin panel locally from THIS repo:
```bash
cd admin
npm install
npm run dev
# Then visit http://localhost:5173/admin
```
