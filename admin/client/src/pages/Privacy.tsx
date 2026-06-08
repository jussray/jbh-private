import { Layout } from "@/components/Layout";

export default function Privacy() {
  return (
    <Layout>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold mb-3">
            Policies
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-primary-foreground/70">
            Last updated: June 7, 2026
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="prose prose-neutral max-w-none">
          <p>
            Juss Beautiful Hair ("we", "us", "our") operates jussbeautifulhair.com (the "Site").
            This page tells you what information we collect, how we use it, and the choices you have.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Information we collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Order information</strong> — your name, email, shipping address, items purchased, and order total.</li>
            <li><strong>Payment information</strong> — handled entirely by Stripe, our payment processor. We never see or store your full card number, CVC, or bank details. We only receive a confirmation that payment succeeded and the last 4 digits of the card for our records.</li>
            <li><strong>Contact / newsletter</strong> — if you sign up or message us, we keep your email and the content of your message.</li>
            <li><strong>Site usage</strong> — basic technical data (browser type, pages viewed) used only to keep the site running.</li>
          </ul>

          <h2 className="font-display text-2xl mt-8 mb-3">How we use it</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Fulfill and ship your order.</li>
            <li>Send order confirmations, shipping updates, and customer service replies.</li>
            <li>Send marketing emails — only if you opted in. You can unsubscribe any time.</li>
            <li>Prevent fraud and comply with the law.</li>
          </ul>

          <h2 className="font-display text-2xl mt-8 mb-3">Who we share it with</h2>
          <p>We share the minimum information needed with:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Stripe</strong> — to process your payment. See <a href="https://stripe.com/privacy" className="underline">stripe.com/privacy</a>.</li>
            <li><strong>Our shipping partners and suppliers</strong> — to ship your order to you.</li>
            <li><strong>Hosting providers (Vercel, Neon)</strong> — to keep the site online and store order records.</li>
          </ul>
          <p>We do <strong>not</strong> sell or rent your personal information to anyone.</p>

          <h2 className="font-display text-2xl mt-8 mb-3">Cookies</h2>
          <p>
            We use a small number of cookies to keep your cart working and to keep you logged in.
            We do not use third-party advertising cookies. Stripe sets its own cookies on its checkout pages — see their policy linked above.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Your choices</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Unsubscribe from marketing emails using the link in any email.</li>
            <li>Request a copy of the personal data we hold about you, or ask us to delete it, by emailing us (see Contact).</li>
            <li>California, Virginia, Colorado, Connecticut, and Utah residents have additional rights under state privacy laws — email us to exercise them.</li>
          </ul>

          <h2 className="font-display text-2xl mt-8 mb-3">Children</h2>
          <p>The Site is not directed to children under 13. We do not knowingly collect data from children.</p>

          <h2 className="font-display text-2xl mt-8 mb-3">Security</h2>
          <p>
            All payments are processed by Stripe under their PCI-DSS Level 1 certification.
            Order data is stored in an encrypted Postgres database (Neon) and transmitted over HTTPS.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Changes</h2>
          <p>
            If we change this policy, we'll update the date at the top of this page.
            Material changes will be announced on the home page.
          </p>

          <h2 className="font-display text-2xl mt-8 mb-3">Contact</h2>
          <p>
            Questions? Email <a href="mailto:hello@jussbeautifulhair.com" className="underline">hello@jussbeautifulhair.com</a> or
            visit our <a href="/#/contact" className="underline">Contact page</a>.
          </p>
        </div>
      </section>
    </Layout>
  );
}
