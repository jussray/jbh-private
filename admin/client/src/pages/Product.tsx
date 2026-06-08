import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, ShoppingBag, Truck, ShieldCheck, RotateCcw, Minus, Plus } from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import { getProduct, formatPrice, PRODUCTS } from "@/lib/catalog";

export default function Product() {
  const [, params] = useRoute("/product/:id");
  const product = params ? getProduct(params.id) : undefined;
  const { addItem } = useCart();
  const { toast } = useToast();
  const [variantIdx, setVariantIdx] = useState(0);
  const [qty, setQty] = useState(1);

  if (!product) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="font-display text-3xl text-foreground">Product not found</h1>
          <Link href="/shop">
            <Button className="mt-6">Back to Shop</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const variant = product.variants[variantIdx];
  const related = PRODUCTS.filter(
    (p) => p.category === product.category && p.id !== product.id
  ).slice(0, 4);

  const add = () => {
    addItem(
      {
        id: product.id,
        name: product.name,
        variant: variant.option,
        price: variant.price,
        image: product.image,
      },
      qty
    );
    toast({
      title: "Added to cart 💜",
      description: `${qty} × ${product.name} (${variant.option})`,
    });
  };

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Link
          href="/shop"
          data-testid="link-back-shop"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Shop
        </Link>

        <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
          {/* Image */}
          <div className="rounded-lg overflow-hidden bg-muted border border-card-border">
            <img
              src={product.image}
              alt={product.name}
              data-testid="img-product"
              className="w-full aspect-square object-cover"
            />
          </div>

          {/* Detail */}
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gold mb-2">
              {product.category}
            </p>
            <h1
              data-testid="text-product-name"
              className="font-display text-3xl sm:text-4xl text-foreground leading-tight"
            >
              {product.name}
            </h1>
            <p className="mt-3 text-lg text-muted-foreground italic">
              {product.tagline}
            </p>

            <p
              data-testid="text-product-price"
              className="mt-5 text-3xl font-semibold text-foreground"
            >
              {formatPrice(variant.price)}
            </p>

            <p className="mt-6 text-foreground/80 leading-relaxed">
              {product.description}
            </p>

            {/* Variant selector */}
            {product.variants.length > 1 && (
              <div className="mt-8">
                <p className="text-sm font-medium text-foreground mb-3">
                  Length / Option
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((v, i) => (
                    <button
                      key={v.option}
                      onClick={() => setVariantIdx(i)}
                      data-testid={`variant-${i}`}
                      className={`min-w-[3.5rem] px-3 py-2 rounded-md border text-sm transition-colors ${
                        variantIdx === i
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:border-primary"
                      }`}
                    >
                      {v.option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="mt-6">
              <p className="text-sm font-medium text-foreground mb-3">Quantity</p>
              <div className="inline-flex items-center rounded-md border border-border bg-card">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  data-testid="button-qty-minus"
                  className="h-10 w-10 inline-flex items-center justify-center text-foreground hover-elevate rounded-l-md"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span data-testid="text-qty" className="w-12 text-center text-sm font-medium">
                  {qty}
                </span>
                <button
                  onClick={() => setQty((q) => q + 1)}
                  data-testid="button-qty-plus"
                  className="h-10 w-10 inline-flex items-center justify-center text-foreground hover-elevate rounded-r-md"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Add to cart (desktop) */}
            <Button
              size="lg"
              onClick={add}
              data-testid="button-add-to-cart"
              className="mt-8 w-full sm:w-auto font-semibold"
            >
              <ShoppingBag className="mr-2 h-4 w-4" /> Add to Cart —{" "}
              {formatPrice(variant.price * qty)}
            </Button>

            {/* Trust row */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border pt-6">
              <div className="flex items-start gap-2.5 text-sm">
                <Truck className="h-5 w-5 text-primary shrink-0" />
                <span className="text-muted-foreground">
                  Ships in 2–3 days. Free over $150.
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-sm">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                <span className="text-muted-foreground">
                  100% premium human hair.
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-sm">
                <RotateCcw className="h-5 w-5 text-primary shrink-0" />
                <span className="text-muted-foreground">
                  14-day returns on unaltered items.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-20">
            <h2 className="font-display text-2xl text-foreground mb-6">
              You may also love
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Mobile sticky add-to-cart */}
      <div className="md:hidden sticky bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground truncate">{product.name}</p>
          <p className="text-base font-semibold text-foreground">
            {formatPrice(variant.price * qty)}
          </p>
        </div>
        <Button
          onClick={add}
          data-testid="button-add-to-cart-mobile"
          className="font-semibold"
        >
          <ShoppingBag className="mr-2 h-4 w-4" /> Add to Cart
        </Button>
      </div>
    </Layout>
  );
}
