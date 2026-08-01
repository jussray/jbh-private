import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";

export default function About() {
  return (
    <Layout>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold mb-3">
            Our Story
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">Lawless And Flawless</h1>
        </div>
      </section>

      <article className="mx-auto max-w-2xl px-6 py-14 space-y-6 text-foreground/85 leading-relaxed text-[17px]">
        <p>
          Juss Beautiful Hair was born from a simple belief: beauty should help a
          person express herself without reducing her to a product or an order.
        </p>
        <p>
          Beauty can carry memory. A new look can mark a celebration, a reset, a
          first day, a quiet season, or an everyday decision to show up as yourself.
        </p>
        <p>
          We're a Pittsburgh-rooted, woman-owned storefront for customers seeking
          hair and beauty options with clearer facts, practical care guidance, and
          a reachable support path.
        </p>
        <p>
          Our public standard is <strong className="text-foreground">Story, Quality,
          Care, and Proof</strong>. Story gives the look meaning. Quality requires
          current product facts instead of louder adjectives. Care includes guidance,
          policies, and human support. Proof keeps public claims, catalog state,
          checkout, payment, fulfillment, and customer outcomes in separate evidence
          layers.
        </p>
        <p>
          Product details should be reviewed from the current catalog and policies
          before purchase. Missing sourcing, stock, performance, longevity, or
          customer-outcome evidence stays missing until it is approved and verified.
        </p>
        <p>
          Whether you're a stylist, preparing for a major moment, or simply ready for
          a different look, the goal is the same: give you enough clarity to choose
          what fits you.
        </p>
        <p className="font-display text-2xl text-primary pt-2">
          <strong>Lawless And Flawless</strong> means the story is honored, the facts
          are clear, care continues after checkout, and trust is earned.
        </p>
        <p className="text-muted-foreground italic">— Raylene, Founder</p>

        <div className="pt-6">
          <Link href="/shop">
            <Button size="lg" className="font-semibold" data-testid="button-shop-about">
              Shop the Collection <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </article>
    </Layout>
  );
}
