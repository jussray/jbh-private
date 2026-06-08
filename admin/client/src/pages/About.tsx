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
          Juss Beautiful Hair was born from a simple belief: every woman
          deserves hair that makes her feel{" "}
          <strong className="text-foreground">unstoppable</strong>.
        </p>
        <p>
          We're a Pittsburgh-rooted, woman-owned boutique built for the woman who
          knows what she wants — premium hair, flawless installs, and beauty
          essentials that actually work. No fluff. No cheap stock. No settling.
        </p>
        <p>
          Every bundle, wig, and product we carry is hand-selected. We work
          directly with trusted factories in Vietnam, India, and right here in
          the US so you get factory pricing without sacrificing quality.
        </p>
        <p>
          Whether you're a stylist building your dream chair, a bride preparing
          for the biggest day of your life, or a woman just ready to feel like{" "}
          <em>her</em> — we've got you.
        </p>
        <p className="font-display text-2xl text-primary pt-2">
          <strong>Lawless And Flawless</strong> isn't just a tagline. It's a
          promise.
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
