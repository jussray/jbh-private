import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { PRODUCTS, CATEGORIES } from "@/lib/catalog";

export default function Shop() {
  const [active, setActive] = useState("All");

  const filtered = useMemo(
    () =>
      active === "All"
        ? PRODUCTS
        : PRODUCTS.filter((p) => p.category === active),
    [active]
  );

  return (
    <Layout>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-14 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold mb-3">
            Shop the Collection
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">All Products</h1>
          <p className="mt-3 text-primary-foreground/80 max-w-xl mx-auto">
            Premium bundles, wigs, closures, frontals, and the essentials for a
            flawless install — shipped from the US.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Category filter */}
        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setActive(c)}
              data-testid={`filter-${c.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className={`text-sm px-4 py-2 rounded-full border transition-colors ${
                active === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground mb-6" data-testid="text-result-count">
          {filtered.length} {filtered.length === 1 ? "product" : "products"}
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
