# Juss Beautiful Hair private repository — AI tooling boundary

This repository is a private backup and operations vault. Tool access must be narrower than the public storefront because it contains admin code, sourcing material, vendor relationships, and private strategy.

## MCP servers

- **GitHub:** repository, pull-request, Actions, and security evidence with lockdown mode.
- **Figma:** approved brand and design context only.
- **Playwright:** pinned isolated Chromium for local admin-interface verification.

Cloudflare Builds/Observability and database MCP servers are intentionally absent. Public deployment belongs to `jussray/jussbeautifulhair-site`; broad production or database access does not belong in this backup repository.

## GitHub Models

GitHub Models may be used only with fixed synthetic fixtures or already-public brand copy.

- The manual workflow uses the automatic `GITHUB_TOKEN` with only `contents: read` and `models: read`.
- Local or Codespaces use may store a fine-grained `models:read` PAT as `GITHUB_MODELS_TOKEN`.
- Never commit the token or expose it through browser code.

Do not send vendor names, factory contacts, WhatsApp/WeChat details, sourcing documents, negotiated prices, outreach history, customer/order information, admin credentials, payment secrets, private brand strategy, or files from `vendor-docs/` to GitHub Models.

A model may classify an invented data-handling scenario. It may not select vendors, contact suppliers, change admin data, publish private material, or deploy the public storefront.
