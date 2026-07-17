export type BrandMoatPillar = {
  id: "story" | "quality" | "care" | "proof";
  label: string;
  title: string;
  body: string;
};

export const BRAND_MOAT = {
  eyebrow: "The Crown Standard",
  heading: "Every crown carries a chapter.",
  body:
    "Juss Beautiful Hair pairs story-first beauty with a practical quality standard: products should help you express who you are, perform the way you need, and come with real support after checkout.",
  promise:
    "Lawless And Flawless means the look has meaning, the quality has a standard, and the customer is never treated like an order number.",
  pillars: [
    {
      id: "story",
      label: "Story",
      title: "Beauty marks the moment",
      body:
        "A new install can hold a celebration, a reset, a first day, or a chapter nobody else fully sees. We sell hair without flattening the person wearing it.",
    },
    {
      id: "quality",
      label: "Quality",
      title: "Sample-first, care-aware sourcing",
      body:
        "Our standard is softness, construction, consistency, realistic longevity, and clear care guidance—not the cheapest listing or the loudest vendor claim.",
    },
    {
      id: "care",
      label: "Care",
      title: "Real help before and after purchase",
      body:
        "Customers should be able to ask what fits their install, understand upkeep, and reach a real person when something does not feel right.",
    },
    {
      id: "proof",
      label: "Proof",
      title: "Trust is earned in the details",
      body:
        "Vendor evidence, product specifications, fulfillment expectations, and customer feedback should guide promotion, restocks, and retirement decisions.",
    },
  ] satisfies BrandMoatPillar[],
};
