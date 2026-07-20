import { Layout } from "@/components/Layout";

export default function About() {
  return (
    <Layout>
      <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <h1 className="font-display text-4xl sm:text-5xl text-foreground mb-8">
          About Juss Beautiful Hair
        </h1>
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
          <p>
            At Juss Beautiful Hair, we believe every woman{" "}
            <strong className="text-foreground">deserves hair that makes her feel</strong>{" "}
            <strong className="text-foreground">unstoppable</strong>.
          </p>
          <p>
            Beauty carries memory. A new install can mark the celebration, the
            comeback, the soft season, or the chapter where you finally chose
            yourself. We treat the woman and her story as seriously as the hair.
          </p>
          <p>
            We're a Pittsburgh-rooted, woman-owned boutique built for the woman who
            knows what she wants — premium hair, flawless installs, and beauty
            that moves with her life.
          </p>
          <p>
            We work directly with trusted factories in Vietnam, India, and right here in
            the US so you get factory pricing without sacrificing quality.
          </p>
          <p>
            Our moat is the full standard: story, quality, care, and proof. That
            means sample-first sourcing, realistic care guidance, real customer
            support, and evidence that helps us decide what deserves a restock and
            what should be retired.
          </p>
          <p>
            Whether you're a stylist building your dream chair, a bride preparing
            for the biggest day of your life, or a woman just ready to feel like{" "}
            <em>her</em> — we've got you.
          </p>
          <p className="font-display text-2xl text-primary pt-2">
            <strong>Lawless And Flawless</strong> isn't just a tagline. It's a
            promise that your look has meaning and our quality has a standard.
          </p>
          <p className="text-muted-foreground italic">— Raylene, Founder</p>
        </div>
      </main>
    </Layout>
  );
}