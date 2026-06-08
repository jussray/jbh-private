import { useState } from "react";
import { Link } from "wouter";
import { Truck, Heart, MessageCircle, ArrowRight, Check } from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PRODUCTS, FEATURED_IDS, getProduct, BRAND } from "@/lib/catalog";

const VALUES = [
  {
    icon: Truck,
    title: "Fast US Shipping",
    body: "Most orders ship in 2–3 business days from our US warehouse partners.",
  },
  {
    icon: Heart,
    title: "Quality Guaranteed",
    body: "Premium raw and virgin hair, hand-selected for softness, shine, and longevity.",
  },
  {
    icon: MessageCircle,
    title: "Real Customer Care",
    body: "Real humans, real answers. DM us on Instagram or email anytime.",
  },
];

export default function Home() {
  const featured = FEATURED_IDS.map((id) => getProduct(id)!).filter(Boolean);
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await apiRequest("POST", "/api/newsletter", { email });
      setSubscribed(true);
      setEmail("");
      toast({ title: "You're on the list 💜", description: "Welcome to the Lawless inner circle." });
    } catch {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    }
  };

  return (
    <Layout>
      {/* HERO — full editorial image, model breathes, minimal overlay */}
      <section className="relative bg-primary">
        <img
          src="/jbh_homepage_hero.jpg"
          alt="Premium hair. Lawless energy."
          className="w-full h-auto block"
        />
        {/* Subtle bottom shadow for CTA legibility on desktop only */}
        <div className="hidden md:block absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-primary/70 to-transparent pointer-events-none" />
        <div className="hidden md:flex absolute left-8 bottom-8 lg:left-16 lg:bottom-12 gap-3 z-10">
          <Link href="/shop">
            <Button
              size="lg"
              data-testid="button-shop-hero"
              className="bg-white text-primary hover:bg-white/90 font-semibold px-8 shadow-xl"
            >
              Shop Now <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
        {/* Mobile CTA under the image */}
        <div className="md:hidden px-6 py-6 bg-primary">
          <Link href="/shop">
            <Button
              size="lg"
              data-testid="button-shop-hero-mobile"
              className="w-full bg-white text-primary hover:bg-white/90 font-semibold"
            >
              Shop Now <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* VALUE STRIP */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-12 grid gap-8 sm:grid-cols-3">
          {VALUES.map((v) => (
            <div key={v.title} className="flex flex-col items-start">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-secondary/40 text-primary mb-4">
                <v.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg text-foreground">{v.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                {v.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gold mb-2">
              Hand-Selected
            </p>
            <h2 className="font-display text-3xl sm:text-4xl text-foreground">
              Bestsellers &amp; Signatures
            </h2>
          </div>
          <Link
            href="/shop"
            data-testid="link-viewall"
            className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-gold"
          >
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* SIGNATURE BANNER */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gold mb-3">
              The Gold Standard
            </p>
            <h2 className="font-display text-3xl sm:text-4xl leading-tight">
              Royal Raw Indian Temple Bundle 👑
            </h2>
            <p className="mt-4 text-primary-foreground/80 leading-relaxed">
              Single-donor, cuticle-aligned raw Indian temple hair. Lifts to 613
              effortlessly, never tangles, lasts 2+ years with proper care. Our
              most exclusive offering.
            </p>
            <Link href="/product/bundle-royal-indian">
              <Button
                size="lg"
                data-testid="button-shop-signature"
                className="mt-6 bg-gold text-primary hover:bg-gold font-semibold"
              >
                Shop the Signature <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="rounded-lg overflow-hidden border border-gold/30">
            <img
              src="/products/bundle-royal-indian.jpg"
              alt="Royal Raw Indian Temple Bundle"
              className="w-full aspect-[4/3] object-cover"
            />
          </div>
        </div>
      </section>

      {/* SHOP BY CATEGORY callout */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="font-display text-3xl text-center text-foreground mb-2">
          Everything You Need
        </h2>
        <p className="text-center text-muted-foreground mb-10">
          {PRODUCTS.length} products across bundles, wigs, closures &amp; essentials.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {PRODUCTS.slice(6, 10).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="bg-secondary/30">
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold mb-3">
            Join the inner circle
          </p>
          <h2 className="font-display text-3xl text-foreground">
            Lawless Energy, In Your Inbox
          </h2>
          <p className="mt-3 text-muted-foreground">
            Restock alerts, early access, and the occasional flawless deal. Use
            code <span className="font-semibold text-primary">{BRAND.promoCode}</span> for 10% off your first order.
          </p>
          {subscribed ? (
            <p
              data-testid="text-subscribed"
              className="mt-6 inline-flex items-center gap-2 text-primary font-medium"
            >
              <Check className="h-5 w-5 text-gold" /> You're on the list. Welcome 💜
            </p>
          ) : (
            <form
              onSubmit={subscribe}
              className="mt-6 flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
            >
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                data-testid="input-newsletter"
                className="bg-card"
              />
              <Button type="submit" data-testid="button-subscribe" className="font-semibold">
                Subscribe
              </Button>
            </form>
          )}
        </div>
      </section>
    </Layout>
  );
}
