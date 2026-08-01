export type BrandMoatPillar = {
  id: "story" | "quality" | "care" | "proof";
  label: string;
  title: string;
  body: string;
};

export const BRAND_MOAT = {
  eyebrow: "The Crown Standard",
  heading: "Story. Quality. Care. Proof.",
  body:
    "Juss Beautiful Hair is building a public standard around four questions: Does the look carry meaning? Are the product facts clear? Can customers understand care and support? Can each public claim be traced to approved evidence?",
  promise:
    "Lawless And Flawless should mean the story is honored, the facts are clear, care continues after checkout, and trust is earned one verified detail at a time.",
  pillars: [
    {
      id: "story",
      label: "Story",
      title: "Beauty can mark a chapter",
      body:
        "A new look can carry celebration, reset, confidence, or everyday expression. The brand makes room for that meaning without defining the person wearing it.",
    },
    {
      id: "quality",
      label: "Quality",
      title: "Facts before adjectives",
      body:
        "Materials, construction, texture, length, care, stock, and fulfillment claims belong in current product records and should be stated only when approved and supported.",
    },
    {
      id: "care",
      label: "Care",
      title: "Support is part of the product",
      body:
        "Customers should be able to understand fit, upkeep, policies, and how to reach support before and after checkout.",
    },
    {
      id: "proof",
      label: "Proof",
      title: "Trust needs receipts",
      body:
        "Public claims, catalog state, checkout, payment, fulfillment, and customer outcomes remain separate evidence layers. Missing proof stays missing until verified.",
    },
  ] satisfies BrandMoatPillar[],
};
