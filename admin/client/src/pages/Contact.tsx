import { useState } from "react";
import { Mail, Instagram, MapPin, Check } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BRAND } from "@/lib/catalog";

export default function Contact() {
  const { toast } = useToast();
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("POST", "/api/contact", form);
      setSent(true);
      toast({ title: "Message sent 💜", description: "We'll get back to you within 1 business day." });
    } catch {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold mb-3">
            We'd Love To Hear From You
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">Let's Talk</h1>
          <p className="mt-4 text-primary-foreground/80 max-w-lg mx-auto">
            Have a question, need styling advice, or want to collab? We'd love to
            hear from you.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-14 grid md:grid-cols-2 gap-12">
        {/* Info */}
        <div className="space-y-6">
          <a href={`mailto:${BRAND.email}`} className="flex items-center gap-3 text-foreground hover:text-primary">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-secondary/40 text-primary">
              <Mail className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm text-muted-foreground">Email</span>
              {BRAND.email}
            </span>
          </a>
          <a href="https://instagram.com/jussbeautifulhair" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-foreground hover:text-primary">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-secondary/40 text-primary">
              <Instagram className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm text-muted-foreground">Instagram — DM us</span>
              {BRAND.instagram}
            </span>
          </a>
          <div className="flex items-center gap-3 text-foreground">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-secondary/40 text-primary">
              <MapPin className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm text-muted-foreground">Location</span>
              Pittsburgh, PA — shipping nationwide
            </span>
          </div>
          <div className="rounded-lg bg-secondary/20 p-4 text-sm text-muted-foreground">
            <strong className="text-foreground">Wholesale &amp; stylists:</strong>{" "}
            email {BRAND.wholesaleEmail} for our pricing sheet.
          </div>
        </div>

        {/* Form */}
        <div className="rounded-lg border border-card-border bg-card p-6">
          {sent ? (
            <div className="text-center py-10" data-testid="text-contact-sent">
              <Check className="h-10 w-10 text-gold mx-auto mb-3" />
              <h2 className="font-display text-2xl text-foreground">Message sent 💜</h2>
              <p className="mt-2 text-muted-foreground">
                We'll get back to you within 1 business day.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="cname">Name</Label>
                <Input id="cname" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="input-contact-name" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="cemail">Email</Label>
                <Input id="cemail" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} data-testid="input-contact-email" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="cmsg">Message</Label>
                <Textarea id="cmsg" required rows={5} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} data-testid="input-contact-message" className="mt-1.5" />
              </div>
              <Button type="submit" size="lg" className="w-full font-semibold" data-testid="button-send-contact">
                Send Message
              </Button>
            </form>
          )}
        </div>
      </div>
    </Layout>
  );
}
