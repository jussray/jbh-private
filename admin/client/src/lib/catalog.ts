export interface Variant {
  option: string;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  variants: Variant[];
  badge?: string;
  image: string;
}

export const BRAND = {
  name: "Juss Beautiful Hair",
  tagline: "Lawless And Flawless",
  subtitle: "Premium Hair & Beauty Supply",
  founder: "Raylene",
  location: "Pittsburgh, PA",
  email: "hello@jussbeautifulhair.com",
  wholesaleEmail: "wholesale@jussbeautifulhair.com",
  instagram: "@jussbeautifulhair",
  promoCode: "LAWLESS10",
};

export const CATEGORIES = [
  "All",
  "Bundles",
  "Closures & Frontals",
  "Wigs",
  "Beauty Essentials",
];

const img = (id: string) => `/products/${id}.jpg`;

export const PRODUCTS: Product[] = [
  {
    id: "bundle-bodywave",
    name: "Lawless Body Wave Bundle — Raw Vietnamese",
    category: "Bundles",
    tagline: "Soft, bouncy body wave that holds its curl wash after wash.",
    description:
      "Single-donor raw Vietnamese hair — minimal shedding, no tangling, fully customizable. Style it, dye it, love it. Sold per bundle. We recommend 3 bundles for a full install.",
    variants: [
      { option: '14"', price: 75 },
      { option: '16"', price: 85 },
      { option: '18"', price: 90 },
      { option: '20"', price: 100 },
      { option: '22"', price: 110 },
      { option: '24"', price: 125 },
      { option: '26"', price: 140 },
    ],
    badge: "Bestseller",
    image: img("bundle-bodywave"),
  },
  {
    id: "bundle-bonestraight",
    name: "Lawless Bone Straight Bundle — Raw Vietnamese",
    category: "Bundles",
    tagline: "Sleek, glossy, straight-from-the-gods bone straight.",
    description:
      "Holds a flat iron, takes a curl, and lays like a dream. Raw Vietnamese, single-donor.",
    variants: [
      { option: '14"', price: 75 },
      { option: '18"', price: 90 },
      { option: '22"', price: 110 },
      { option: '26"', price: 140 },
    ],
    image: img("bundle-bonestraight"),
  },
  {
    id: "bundle-deepwave",
    name: "Lawless Deep Wave Bundle",
    category: "Bundles",
    tagline: "Defined waves with serious bounce.",
    description:
      "Perfect for that 'I woke up like this' look (we won't tell). Premium virgin hair.",
    variants: [
      { option: '14"', price: 80 },
      { option: '18"', price: 95 },
      { option: '22"', price: 115 },
      { option: '26"', price: 145 },
    ],
    image: img("bundle-deepwave"),
  },
  {
    id: "bundle-loosewave",
    name: "Lawless Loose Wave Bundle",
    category: "Bundles",
    tagline: "Soft, romantic loose waves with everyday flow.",
    description:
      "Blends beautifully with natural Type 3 hair. Our most-loved texture for everyday wear.",
    variants: [
      { option: '14"', price: 80 },
      { option: '18"', price: 95 },
      { option: '22"', price: 115 },
      { option: '26"', price: 145 },
    ],
    image: img("bundle-loosewave"),
  },
  {
    id: "bundle-kinkystraight",
    name: "Flawless Kinky Straight Bundle",
    category: "Bundles",
    tagline: "The blend everyone asks about.",
    description:
      "Yaki-textured kinky straight that blends seamlessly with relaxed or pressed natural hair.",
    variants: [
      { option: '14"', price: 85 },
      { option: '18"', price: 100 },
      { option: '22"', price: 120 },
      { option: '26"', price: 155 },
    ],
    image: img("bundle-kinkystraight"),
  },
  {
    id: "bundle-royal-indian",
    name: "Royal Raw Indian Temple Bundle",
    category: "Bundles",
    tagline: "The gold standard. Our signature offering.",
    description:
      "Single-donor, cuticle-aligned raw Indian temple hair. Lifts to 613 effortlessly, never tangles, lasts 2+ years with proper care. Our most exclusive offering.",
    variants: [
      { option: '14"', price: 110 },
      { option: '18"', price: 135 },
      { option: '22"', price: 160 },
      { option: '26"', price: 195 },
    ],
    badge: "Signature",
    image: img("bundle-royal-indian"),
  },
  {
    id: "closure-4x4",
    name: "Lawless 4×4 HD Lace Closure",
    category: "Closures & Frontals",
    tagline: "Melts into every skin tone.",
    description:
      "Pre-plucked hairline, baby hairs included, knots bleached. Pair with any Lawless bundle for a flawless install.",
    variants: [{ option: '16"', price: 65 }],
    image: img("closure-4x4"),
  },
  {
    id: "closure-5x5",
    name: "Lawless 5×5 HD Lace Closure",
    category: "Closures & Frontals",
    tagline: "The lazy girl's frontal alternative.",
    description: "Extra parting space, same melt-into-your-skin HD lace.",
    variants: [{ option: '16"', price: 85 }],
    image: img("closure-5x5"),
  },
  {
    id: "frontal-13x4",
    name: "Lawless 13×4 HD Lace Frontal",
    category: "Closures & Frontals",
    tagline: "Ear-to-ear coverage for total flexibility.",
    description:
      "Side-part, middle-part, ponytail-this-week flexibility. HD lace for the most invisible install possible.",
    variants: [{ option: '18"', price: 125 }],
    image: img("frontal-13x4"),
  },
  {
    id: "wig-glueless-bodywave",
    name: "Flawless Glueless 4×4 Closure Wig — Body Wave",
    category: "Wigs",
    tagline: "Ready in 3 minutes. No glue. No stress.",
    description:
      "Adjustable straps + combs, breathable cap, premium virgin hair. 18\" length.",
    variants: [{ option: '18"', price: 165 }],
    image: img("wig-glueless-bodywave"),
  },
  {
    id: "wig-13x4-straight",
    name: "Flawless 13×4 Lace Frontal Wig — Straight",
    category: "Wigs",
    tagline: "The wig that does it all.",
    description: "Pre-plucked, pre-bleached, ready to wear. 22\" of pure confidence.",
    variants: [{ option: '22"', price: 215 }],
    image: img("wig-13x4-straight"),
  },
  {
    id: "wig-upart-deepwave",
    name: "Flawless Deep Wave U-Part Wig",
    category: "Wigs",
    tagline: "Beginner-friendly, protective, gorgeous.",
    description: "Leave-out the front of your hair, install the rest in 10 minutes.",
    variants: [{ option: '20"', price: 145 }],
    image: img("wig-upart-deepwave"),
  },
  {
    id: "wig-13x6-bob",
    name: "Flawless 13×6 Body Wave Bob Wig",
    category: "Wigs",
    tagline: "Short, sharp, and unmistakably Lawless.",
    description:
      "13×6 HD transparent lace, pre-plucked, glossy body-wave bob. 100% Remy human hair. The cut that turns heads — wear it natural or curl it under for that old-Hollywood finish.",
    variants: [{ option: '10" bob', price: 135 }],
    badge: "New",
    image: img("wig-13x6-bob"),
  },
  {
    id: "edge-control",
    name: "Lawless Edge Control — 4 oz",
    category: "Beauty Essentials",
    tagline: "Hold without flakes. Smells like sweet vanilla.",
    description:
      "Strong enough for a wedding, gentle enough for daily wear. Vegan, paraben-free.",
    variants: [{ option: "4 oz", price: 10 }],
    image: img("edge-control"),
  },
  {
    id: "lace-melt-spray",
    name: "Lawless Lace Melt Spray",
    category: "Beauty Essentials",
    tagline: "The secret to an invisible lace install.",
    description: "One spray, blow-dry, done. Works with HD and Swiss lace.",
    variants: [{ option: "2 oz", price: 15 }],
    image: img("lace-melt-spray"),
  },
  {
    id: "hair-oil",
    name: "Lawless Hair Oil — Rosemary Mint",
    category: "Beauty Essentials",
    tagline: "Lightweight scalp oil that smells incredible.",
    description:
      "Rosemary, mint, and castor. Stimulates growth, won't weigh down your install.",
    variants: [{ option: "2 oz", price: 18 }],
    image: img("hair-oil"),
  },
];

export const FEATURED_IDS = [
  "bundle-royal-indian",
  "bundle-bodywave",
  "wig-13x4-straight",
  "wig-13x6-bob",
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function fromPrice(p: Product): number {
  return Math.min(...p.variants.map((v) => v.price));
}

export function formatPrice(n: number): string {
  return `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}
