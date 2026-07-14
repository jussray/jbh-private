console.error(
  [
    "Deployment blocked.",
    "This repository contains the owner-only JBH admin, vendor operations, order data contracts, and private business documents.",
    "Run it only on loopback with `npm run dev` from the admin directory.",
    "Deploy the public storefront from the separate public repository instead.",
  ].join("\n"),
);

process.exit(1);
