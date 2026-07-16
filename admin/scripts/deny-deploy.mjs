console.error(
  [
    "Generic deployment blocked.",
    "The JBH owner UI, local vault, vendor operations, and private documents must remain loopback-only.",
    "Run the owner control only with `npm run dev:owner` from the admin directory.",
    "The isolated API-only payment Worker has a separate reviewed deployment gate in payment-worker/README.md; this command never deploys it.",
  ].join("\n"),
);

process.exit(1);
