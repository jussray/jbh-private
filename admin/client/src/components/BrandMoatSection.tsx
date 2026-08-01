import { BadgeCheck, BookOpenText, HeartHandshake, ShieldCheck } from "lucide-react";
import { BRAND_MOAT } from "@/lib/brandMoat";

const ICONS = {
  story: BookOpenText,
  quality: BadgeCheck,
  care: HeartHandshake,
  proof: ShieldCheck,
} as const;

export function BrandMoatSection() {
  return (
    <section
      data-testid="brand-moat"
      aria-labelledby="brand-moat-heading"
      className="border-y border-border bg-secondary/20"
    >
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-gold">
            {BRAND_MOAT.eyebrow}
          </p>
          <h2
            id="brand-moat-heading"
            className="font-display text-3xl text-foreground sm:text-4xl"
          >
            {BRAND_MOAT.heading}
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            {BRAND_MOAT.body}
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {BRAND_MOAT.pillars.map((pillar) => {
            const Icon = ICONS[pillar.id];
            return (
              <article
                key={pillar.id}
                data-testid={`brand-moat-${pillar.id}`}
                className="rounded-xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-secondary/40 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-gold">
                  {pillar.label}
                </p>
                <h3 className="mt-2 font-display text-xl text-foreground">
                  {pillar.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {pillar.body}
                </p>
              </article>
            );
          })}
        </div>

        <blockquote className="mx-auto mt-10 max-w-4xl border-l-4 border-gold pl-5 font-display text-xl leading-relaxed text-primary sm:text-2xl">
          {BRAND_MOAT.promise}
        </blockquote>
      </div>
    </section>
  );
}
