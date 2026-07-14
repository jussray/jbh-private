# Juss Beautiful Hair private repository — AI tooling boundary

This repository is a private backup and operations vault. Tool access must be narrower than the public storefront because it contains admin code, sourcing material, vendor relationships, and private strategy.

## MCP servers

- **GitHub:** repository, pull-request, Actions, and security evidence with lockdown mode.
- **Bright Data:** VS Code/Codespaces only, prompted at runtime for `API_TOKEN`, and restricted to `GROUPS=code` for npm and PyPI package metadata. It must not be used for vendor discovery, supplier research, catalog scraping, contact collection, or private sourcing work in this repository.
- **Microsoft Learn:** current official Microsoft technical documentation and code samples; no authentication required.
- **Figma:** approved brand and design context only.
- **Playwright:** pinned isolated Chromium for local admin-interface verification.

Cloudflare Builds/Observability and database MCP servers are intentionally absent. Public deployment belongs to `jussray/jussbeautifulhair-site`; broad production or database access does not belong in this backup repository.

The committed root `.mcp.json` remains credential-free. MCP hosts other than VS Code/Codespaces must configure Bright Data locally and keep the API token outside the repository. Bright Data Pro Mode and broad browser, ecommerce, and web-data groups are intentionally disabled.

## GitHub Models

GitHub Models may be used only with fixed synthetic fixtures or already-public brand copy.

- The manual workflow uses the automatic `GITHUB_TOKEN` with only `contents: read` and `models: read`.
- Local or Codespaces use may store a fine-grained `models:read` PAT as `GITHUB_MODELS_TOKEN`.
- Never commit the token or expose it through browser code.

Do not send vendor names, factory contacts, WhatsApp/WeChat details, sourcing documents, negotiated prices, outreach history, customer/order information, admin credentials, payment secrets, private brand strategy, or files from `vendor-docs/` to GitHub Models or Bright Data.

A model may classify an invented data-handling scenario. It may not select vendors, contact suppliers, change admin data, publish private material, or deploy the public storefront.
