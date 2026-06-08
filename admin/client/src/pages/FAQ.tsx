import { Layout } from "@/components/Layout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "How long does shipping take?",
    a: "Most orders ship within 2–3 business days from our US warehouse and arrive within 5–7 business days total. You'll receive a tracking number as soon as your order ships.",
  },
  {
    q: "Is your hair real human hair?",
    a: "Yes — 100%. We carry raw, virgin, and premium human hair only. No synthetic. No blends. Every bundle can be washed, styled, colored, and reused.",
  },
  {
    q: "Can I dye or bleach the hair?",
    a: "Yes. Our raw and virgin bundles can be lifted to 613 (platinum blonde). We always recommend a licensed colorist for best results.",
  },
  {
    q: "What's your return policy?",
    a: "Unopened, unaltered products can be returned within 14 days of delivery for a refund or exchange. Hair that has been washed, dyed, cut, or installed cannot be returned for hygiene reasons.",
  },
  {
    q: "Do you offer custom wigs or install services?",
    a: "Custom unit construction is coming soon. For installs in the Pittsburgh area, DM us on Instagram @jussbeautifulhair.",
  },
  {
    q: "Do you offer wholesale pricing?",
    a: "Yes — stylists and salons can email wholesale@jussbeautifulhair.com for our wholesale pricing sheet.",
  },
  {
    q: "How do I pick the right length?",
    a: "Measure from where the hair will be installed (usually the nape) to where you want it to fall. Most 22\" bundles fall to mid-back on someone 5'5\". When in doubt, size up — you can always cut, you can't add.",
  },
  {
    q: "Can I track my order?",
    a: "Absolutely. You'll get a tracking number via email and SMS the moment your order ships.",
  },
];

export default function FAQ() {
  return (
    <Layout>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold mb-3">
            Got Questions?
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">FAQ</h1>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-6 py-12">
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`} data-testid={`faq-${i}`}>
              <AccordionTrigger className="text-left font-display text-base text-foreground">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Layout>
  );
}
