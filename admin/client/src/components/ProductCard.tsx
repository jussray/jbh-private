import { Link } from "wouter";
import type { Product } from "@/lib/catalog";
import { fromPrice, formatPrice } from "@/lib/catalog";

export function ProductCard({ product }: { product: Product }) {
  const multi = product.variants.length > 1;
  return (
    <Link
      href={`/product/${product.id}`}
      data-testid={`card-product-${product.id}`}
      className="group block card-lift rounded-lg overflow-hidden bg-card border border-card-border"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {product.badge && (
          <span
            className={`absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full ${
              product.badge === "Signature"
                ? "bg-gold text-primary"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {product.badge}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
          {product.category}
        </p>
        <h3 className="font-display text-base leading-snug text-foreground line-clamp-2 min-h-[2.6rem]">
          {product.name}
        </h3>
        <p className="mt-2 text-sm">
          <span className="font-semibold text-foreground">
            {multi ? "From " : ""}
            {formatPrice(fromPrice(product))}
          </span>
        </p>
      </div>
    </Link>
  );
}
