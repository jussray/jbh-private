import { Layout } from "@/components/Layout";

export default function Returns() {
  return (
    <Layout>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold mb-3">
            Policies
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">
            Return &amp; Refund Policy
          </h1>
        </div>
      </section>

      <article className="mx-auto max-w-2xl px-6 py-14 space-y-6 text-foreground/85 leading-relaxed">
        <p>
          We want you to love your hair. If something isn't right, here's how
          returns work:
        </p>
        <div>
          <h2 className="font-display text-xl text-foreground mb-3">
            Eligible for return (within 14 days of delivery)
          </h2>
          <ul className="space-y-2 list-disc pl-5">
            <li>Unopened, unaltered hair in original packaging</li>
            <li>Beauty supply products with seal intact</li>
          </ul>
        </div>
        <div>
          <h2 className="font-display text-xl text-foreground mb-3">
            Not eligible for return
          </h2>
          <ul className="space-y-2 list-disc pl-5">
            <li>Hair that has been washed, dyed, bleached, cut, or installed</li>
            <li>Custom or made-to-order units</li>
            <li>Sale or discounted items (final sale)</li>
          </ul>
        </div>
        <p>
          To start a return, email{" "}
          <a href="mailto:hello@jussbeautifulhair.com" className="text-primary underline">
            hello@jussbeautifulhair.com
          </a>{" "}
          with your order number and reason. We'll respond within 1 business day
          with next steps.
        </p>
        <p>
          Refunds are issued to your original payment method within 5–7 business
          days of receiving the returned item.
        </p>
      </article>
    </Layout>
  );
}
