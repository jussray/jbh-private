# Juss Beautiful Hair — Website Source

The source code for [jussbeautifulhair.com](https://jussbeautifulhair.com).

A static React + Vite + Tailwind storefront, deployed via Cloudflare Pages.

---

## What's in the public build

- Storefront pages: Home, Shop, Product, Cart, Checkout, Confirmation
- Info pages: About, FAQ, Contact, Shipping, Returns, Privacy, Terms
- Checkout flow: customer fills a form → gets a reservation ID → DMs Instagram or emails for payment link
- **No backend.** No customer accounts, no payment processing on-site, no order database in the public bundle.

## What is NOT in the public build

- The admin dashboard (`client/src/pages/Admin.tsx`) is in the source tree but is **not registered as a route** in `App.tsx`. It will not appear on the live site even if someone visits `/admin`.
- For day-to-day order management, use the separate `jbh-admin.html` file (local-only, runs in your browser, never deployed).

---

## Deploy via Cloudflare Pages (auto-deploy from GitHub)

### One-time setup

1. **Create a GitHub repo**
   - Go to [github.com/new](https://github.com/new)
   - Repo name: `juss-beautiful-hair` (or whatever you want)
   - Set to **Private** (recommended — keeps source non-public)
   - Click **Create repository**

2. **Upload this code to the repo**
   - On the new empty repo page, click **uploading an existing file**
   - Drag the contents of this folder (NOT the folder itself — the files inside)
   - Commit with message: "Initial commit"

3. **Connect to Cloudflare Pages**
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
   - Click **Create** → **Pages** → **Connect to Git**
   - Authorize Cloudflare to access your GitHub
   - Select the `juss-beautiful-hair` repo
   - Build settings:
     - Framework preset: **Vite**
     - Build command: `npm run build`
     - Build output directory: `dist/public`
   - Click **Save and Deploy**

4. **Attach the custom domain**
   - In Cloudflare Pages → your project → **Custom domains** → **Set up a custom domain**
   - Enter `jussbeautifulhair.com` → follow prompts
   - SSL provisions automatically (5-10 minutes)

### Updating the site

Just push to GitHub:
- Edit any file (locally, on GitHub.com, or in any editor)
- Commit + push to `main` branch
- Cloudflare auto-builds and deploys in ~2 minutes

No more manual zip uploads. 🎉

---

## Environment variables (set in Cloudflare, NOT in code)

In Cloudflare Pages → your project → **Settings** → **Environment variables**, add:

| Variable | Where to get it | Notes |
|---|---|---|
| `VITE_ADMIN_PASSWORD` | You pick it | Only needed if you ever bundle the admin into the public site (don't recommend). |
| `STRIPE_SECRET_KEY` | [dash.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) | Only needed when you add real checkout. |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks | Only needed for webhooks. |
| `DATABASE_URL` | Neon, Supabase, or D1 | Only needed when you add a backend. |

**Never commit secrets to GitHub.** `.env` is git-ignored. Use Cloudflare's env vars panel.

---

## Local development

```bash
npm install
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173).

To build for production:

```bash
npm run build
```

Output goes to `dist/public/`.

---

## Adding features later

The site is intentionally simple — static frontend, no backend. To add features:

| Want to add... | Easiest path |
|---|---|
| Customer accounts + login | Migrate to Shopify ($29/mo) OR add [Supabase Auth](https://supabase.com/docs/guides/auth) (free tier) |
| Real on-site checkout | Add Stripe Checkout via Cloudflare Workers |
| Inventory tracking | Add a database (Supabase, Neon, or Cloudflare D1) |
| Email notifications | [Resend](https://resend.com) or Cloudflare Email Workers |
| Subscriptions / loyalty | Shopify makes this 10x easier |

When you're ready, bring any of these to a future Perplexity thread with a link to this repo and I (or any dev) can extend it.

---

## File structure

```
client/src/
  pages/        - all the route components (Home, Shop, Checkout, etc.)
  components/   - shared UI (Layout, Header, Footer)
  lib/          - cart state, utilities
  data/         - product catalog
api/            - serverless API routes (not used on Cloudflare static — for future use)
shared/         - shared types between client and api
migrations/     - SQL migrations (not used yet — for future database)
```

---

## License

Private. Do not redistribute the source. All product photos, branding, and content © Juss Beautiful Hair / Raylene McGill.
