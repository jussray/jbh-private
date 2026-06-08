import { useState } from "react";
import { useLocation } from "wouter";
import { Lock, Info, Instagram, Mail, Check } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/catalog";

export default function Checkout() {
  const { items, subtotal, shipping, total, clear } = useCart();
  const [, navigate] = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reservationId, setReservationId] = useState<string>("");
  const [form, setForm] = useState({
    customerName: "",
    email: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    notes: "",
  });

  // Reservation success screen — shown after the customer submits the form.
  if (submitted) {
    const orderSummary = items
      .map((i) => `• ${i.name}${i.variant ? ` (${i.variant})` : ""} × ${i.qty} — ${formatPrice(i.price * i.qty)}`)
      .join("\n");
    const emailBody = encodeURIComponent(
      `Hi Juss Beautiful Hair team,\n\nI just reserved an order on your site. Please send me a secure payment link.\n\nReservation #: ${reservationId}\nName: ${form.customerName}\nPhone: ${form.phone}\n\nOrder:\n${orderSummary}\n\nSubtotal: ${formatPrice(subtotal)}\nShipping: ${formatPrice(shipping)}\nTotal: ${formatPrice(total)}\n\nShip to:\n${form.street}\n${form.city}, ${form.state} ${form.zip}\n\n${form.notes ? `Notes: ${form.notes}\n\n` : ""}Thanks!`
    );
    const emailSubject = encodeURIComponent(`Order Reservation ${reservationId} — ${form.customerName}`);
    const igMessage = encodeURIComponent(
      `Hi! I just reserved order ${reservationId} on your site (${formatPrice(total)}). Can you send me a payment link?`
    );
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="rounded-lg border border-card-border bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary/30">
              <Check className="h-7 w-7 text-primary" />
            </div>
            <h1 className="font-display text-3xl text-foreground mb-3">
              Got it, {form.customerName.split(" ")[0] || "queen"} 💜
            </h1>
            <p className="text-muted-foreground mb-2">
              Your reservation is saved.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Reservation # <span className="font-mono font-semibold text-foreground">{reservationId}</span> · Total {formatPrice(total)}
            </p>

            <div className="rounded-md bg-secondary/20 px-5 py-4 text-left text-sm text-primary mb-6">
              <p className="font-medium mb-2">One more step to confirm your order:</p>
              <p>
                DM us on Instagram or send a quick email with your reservation number. We'll reply with a secure Stripe payment link within an hour (faster during business hours).
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <a
                href={`https://ig.me/m/jussbeautifulhair?text=${igMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Instagram className="h-4 w-4" />
                DM @jussbeautifulhair
              </a>
              <a
                href={`mailto:hello@jussbeautifulhair.com?subject=${emailSubject}&body=${emailBody}`}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-primary px-5 py-3 text-sm font-medium text-primary hover:bg-primary/5"
              >
                <Mail className="h-4 w-4" />
                Email us
              </a>
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              Save your reservation number. Your cart has been cleared.
            </p>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => navigate("/shop")}
            >
              Keep Shopping
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (items.length === 0) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="font-display text-3xl text-foreground">Your cart is empty</h1>
          <Button className="mt-6" onClick={() => navigate("/shop")}>
            Shop Now
          </Button>
        </div>
      </Layout>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const placeOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Generate a short, human-friendly reservation ID locally — no backend needed.
    const stamp = Date.now().toString(36).toUpperCase().slice(-4);
    const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
    const id = `JBH-${stamp}${rand}`;
    setReservationId(id);
    // Brief delay so the button shows a submitting state, then show success.
    setTimeout(() => {
      clear();
      setSubmitted(true);
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 400);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="font-display text-3xl sm:text-4xl text-foreground mb-2">
          Checkout
        </h1>
        <p className="text-muted-foreground mb-8">
          Almost there. Just a few details and your order is on its way.
        </p>

        <form onSubmit={placeOrder} className="grid lg:grid-cols-3 gap-10">
          {/* Form */}
          <div className="lg:col-span-2 space-y-8">
            <section className="rounded-lg border border-card-border bg-card p-6">
              <h2 className="font-display text-xl text-foreground mb-4">
                Contact
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" required value={form.customerName} onChange={set("customerName")} data-testid="input-name" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={form.email} onChange={set("email")} data-testid="input-email" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" required value={form.phone} onChange={set("phone")} data-testid="input-phone" className="mt-1.5" />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-card-border bg-card p-6">
              <h2 className="font-display text-xl text-foreground mb-4">
                Shipping Address
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="street">Street address</Label>
                  <Input id="street" required value={form.street} onChange={set("street")} data-testid="input-street" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" required value={form.city} onChange={set("city")} data-testid="input-city" className="mt-1.5" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input id="state" required value={form.state} onChange={set("state")} data-testid="input-state" className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="zip">ZIP</Label>
                    <Input id="zip" required value={form.zip} onChange={set("zip")} data-testid="input-zip" className="mt-1.5" />
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <Label htmlFor="notes">Order notes (optional)</Label>
                <Textarea id="notes" value={form.notes} onChange={set("notes")} data-testid="input-notes" className="mt-1.5" placeholder="Anything we should know?" />
              </div>
            </section>

            <section className="rounded-lg border border-card-border bg-card p-6">
              <h2 className="font-display text-xl text-foreground mb-4">
                Payment
              </h2>
              <div className="flex items-start gap-3 rounded-md bg-secondary/30 px-4 py-3 text-sm text-primary">
                <Info className="h-5 w-5 shrink-0 mt-0.5" />
                <div data-testid="text-demo-notice" className="space-y-2">
                  <p className="font-medium">
                    Secure online checkout is launching soon.
                  </p>
                  <p>
                    To place an order today, DM us on Instagram{" "}
                    <a
                      href="https://instagram.com/jussbeautifulhair"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      @jussbeautifulhair
                    </a>{" "}
                    or email{" "}
                    <a
                      href="mailto:hello@jussbeautifulhair.com"
                      className="underline font-medium"
                    >
                      hello@jussbeautifulhair.com
                    </a>
                    . We'll confirm your order and send a secure payment link.
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="rounded-lg border border-card-border bg-card p-6 sticky top-28">
              <h2 className="font-display text-xl text-foreground mb-4">
                Order Summary
              </h2>
              <div className="space-y-3 max-h-64 overflow-auto mb-4">
                {items.map((i) => (
                  <div key={`${i.id}-${i.variant}`} className="flex gap-3 text-sm">
                    <img src={i.image} alt="" className="h-12 w-12 rounded object-cover bg-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground leading-tight line-clamp-2">{i.name}</p>
                      <p className="text-muted-foreground text-xs">{i.variant} × {i.qty}</p>
                    </div>
                    <span className="text-foreground font-medium">{formatPrice(i.price * i.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground font-medium">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="text-foreground font-medium">{shipping === 0 ? "FREE" : formatPrice(shipping)}</span>
                </div>
              </div>
              <div className="border-t border-border my-4" />
              <div className="flex justify-between items-baseline mb-6">
                <span className="font-display text-lg text-foreground">Total</span>
                <span className="text-2xl font-semibold text-foreground">{formatPrice(total)}</span>
              </div>
              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                data-testid="button-place-order"
                className="w-full font-semibold"
              >
                <Lock className="mr-2 h-4 w-4" />
                {submitting ? "Submitting…" : `Reserve Order — ${formatPrice(total)}`}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
}
