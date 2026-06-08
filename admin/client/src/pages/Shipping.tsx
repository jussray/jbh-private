import { Layout } from "@/components/Layout";

export default function Shipping() {
  return (
    <Layout>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold mb-3">
            Policies
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">Shipping Policy</h1>
        </div>
      </section>

      <article className="mx-auto max-w-2xl px-6 py-14 space-y-6 text-foreground/85 leading-relaxed">
        <p>
          All orders are processed within 1–2 business days. Domestic US shipping
          takes an additional 3–5 business days via USPS Priority or UPS Ground.
        </p>
        <div>
          <h2 className="font-display text-xl text-foreground mb-3">Rates</h2>
          <ul className="space-y-2 list-disc pl-5">
            <li>Standard shipping: $9.99</li>
            <li>Free shipping on orders over $150</li>
            <li>Expedited 2-day shipping: $24.99</li>
          </ul>
        </div>
        <p>
          Once your order ships, you'll receive a tracking number via email. Juss
          Beautiful Hair is not responsible for delays caused by the carrier,
          weather, or incorrect shipping addresses. Please double-check your
          shipping info at checkout.
        </p>
        <p className="text-muted-foreground">
          Questions? Email{" "}
          <a href="mailto:hello@jussbeautifulhair.com" className="text-primary underline">
            hello@jussbeautifulhair.com
          </a>
          .
        </p>
      </article>
    </Layout>
  );
}
