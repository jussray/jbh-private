import { Layout } from "@/components/Layout";

export default function Terms() {
  return (
    <Layout>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold mb-3">
            Policies
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-sm text-primary-foreground/70">
            Last updated: June 7, 2026
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="prose prose-neutral max-w-none">
          <p>
            Welcome to Juss Beautiful Hair. By using jussbeautifulhair.com (the "Site") or buying from us, you agree to these terms.
            If you don't agree, please don't use the Site.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Who we are</h2>
          <p>
            Juss Beautiful Hair is a small business based in Pittsburgh, Pennsylvania, USA.
            Contact: <a href="mailto:hello@jussbeautifulhair.com" className="underline">hello@jussbeautifulhair.com</a>.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Orders and payment</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>All prices are in US Dollars (USD).</li>
            <li>Payments are processed by Stripe. Placing an order means you authorize the charge.</li>
            <li>We reserve the right to cancel or refuse any order — for example, if a product was mispriced, out of stock, or we suspect fraud. If we cancel, you'll be refunded in full.</li>
            <li>An order confirmation email is not a guarantee of acceptance. Your order is accepted once it ships.</li>
          </ul>

          <h2 className="font-display text-2xl mt-8 mb-3">Shipping</h2>
          <p>
            See our <a href="/#/shipping" className="underline">Shipping Policy</a> for delivery times and rates.
            Risk of loss passes to you once the carrier scans the package as delivered.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Returns and refunds</h2>
          <p>
            See our <a href="/#/returns" className="underline">Return &amp; Refund Policy</a> for the full process and timelines.
            Final-sale items are non-returnable.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Chargebacks and disputes</h2>
          <p>
            If you have a problem with your order, please email us first — we'll do our best to resolve it.
            Initiating a chargeback before contacting us delays resolution and may result in being unable to order from us in the future.
            All disputes are governed by Stripe's chargeback process in addition to our return policy.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Product information</h2>
          <p>
            We make every effort to display product colors, textures, and lengths accurately, but slight variation is normal for natural human hair.
            Hair care and styling results depend on the user — we can't guarantee a specific outcome.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Acceptable use</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Don't use the Site to break the law, harass anyone, or interfere with the Site's operation.</li>
            <li>Don't try to access admin areas or other accounts.</li>
            <li>Don't resell our products without written permission.</li>
          </ul>

          <h2 className="font-display text-2xl mt-8 mb-3">Intellectual property</h2>
          <p>
            All content on the Site — logos, photos, copy, design — is owned by Juss Beautiful Hair or used with permission.
            You may not copy or reuse it without our written consent.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Disclaimers</h2>
          <p>
            The Site and products are provided "as is" without warranties of any kind, except those that cannot be waived under applicable law.
            We do not guarantee that the Site will be uninterrupted, error-free, or secure against every threat.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Juss Beautiful Hair's total liability for any claim relating to the Site or a product
            is limited to the amount you paid for the product in question.
            We are not liable for indirect, incidental, or consequential damages.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Governing law</h2>
          <p>
            These terms are governed by the laws of the Commonwealth of Pennsylvania, USA, without regard to its conflict of laws rules.
            Any dispute will be brought in the state or federal courts located in Allegheny County, Pennsylvania.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Changes to these terms</h2>
          <p>
            We may update these terms from time to time. The updated version is effective when posted, with the new date at the top.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Contact</h2>
          <p>
            Questions about these terms? Email <a href="mailto:hello@jussbeautifulhair.com" className="underline">hello@jussbeautifulhair.com</a>.
          </p>
        </div>
      </section>
    </Layout>
  );
}
