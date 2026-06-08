import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingBag, Menu, X, Instagram, Mail } from "lucide-react";
import { Logo } from "./Logo";
import { useCart } from "@/lib/cart";
import { BRAND } from "@/lib/catalog";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

function Header() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      {/* Announcement strip */}
      <div className="bg-primary text-primary-foreground text-center text-[11px] sm:text-xs tracking-[0.2em] uppercase py-2 px-4">
        Now Open · Free US Shipping Over $150 · Code{" "}
        <span className="text-gold font-semibold">{BRAND.promoCode}</span> for 10% Off
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" data-testid="link-home-logo" className="text-primary hover-elevate rounded-md px-1 py-1">
            <Logo />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                data-testid={`link-nav-${n.label.toLowerCase()}`}
                className={`text-sm tracking-wide uppercase transition-colors ${
                  location === n.href
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-primary"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/cart"
              data-testid="link-cart"
              className="relative inline-flex items-center justify-center h-10 w-10 rounded-full hover-elevate text-primary"
              aria-label="Cart"
            >
              <ShoppingBag className="h-5 w-5" />
              {count > 0 && (
                <span
                  data-testid="text-cart-count"
                  className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-gold text-primary text-[11px] font-bold flex items-center justify-center"
                >
                  {count}
                </span>
              )}
            </Link>
            <button
              className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-full hover-elevate text-primary"
              onClick={() => setOpen((o) => !o)}
              data-testid="button-menu"
              aria-label="Menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <nav className="md:hidden border-t border-border bg-background px-4 py-3 flex flex-col">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              data-testid={`link-mobnav-${n.label.toLowerCase()}`}
              onClick={() => setOpen(false)}
              className="py-3 text-sm uppercase tracking-wide text-foreground border-b border-border last:border-0"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-6 py-14 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-1">
          <div className="text-primary-foreground">
            <Logo />
          </div>
          <p className="mt-4 text-sm text-primary-foreground/70 leading-relaxed">
            Premium hair &amp; beauty supply, hand-selected and shipped from the US.
            Made for the woman who knows what she wants.
          </p>
        </div>
        <div>
          <h4 className="font-display text-lg mb-4 text-gold">Shop</h4>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li><Link href="/shop" className="hover:text-gold">All Products</Link></li>
            <li><Link href="/shop" className="hover:text-gold">Bundles</Link></li>
            <li><Link href="/shop" className="hover:text-gold">Wigs</Link></li>
            <li><Link href="/shop" className="hover:text-gold">Closures &amp; Frontals</Link></li>
            <li><Link href="/shop" className="hover:text-gold">Beauty Essentials</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display text-lg mb-4 text-gold">Help</h4>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li><Link href="/faq" className="hover:text-gold">FAQ</Link></li>
            <li><Link href="/shipping" className="hover:text-gold">Shipping Policy</Link></li>
            <li><Link href="/returns" className="hover:text-gold">Returns &amp; Refunds</Link></li>
            <li><Link href="/privacy" className="hover:text-gold">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-gold">Terms of Service</Link></li>
            <li><Link href="/contact" className="hover:text-gold">Contact Us</Link></li>
            <li><Link href="/about" className="hover:text-gold">Our Story</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display text-lg mb-4 text-gold">Stay Connected</h4>
          <a href={`mailto:${BRAND.email}`} className="flex items-center gap-2 text-sm text-primary-foreground/80 hover:text-gold mb-2">
            <Mail className="h-4 w-4" /> {BRAND.email}
          </a>
          <a href="https://instagram.com/jussbeautifulhair" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary-foreground/80 hover:text-gold mb-2">
            <Instagram className="h-4 w-4" /> {BRAND.instagram}
          </a>
          <p className="text-sm text-primary-foreground/60 mt-3">📍 {BRAND.location} — shipping nationwide</p>
          <p className="text-sm text-primary-foreground/60 mt-1">
            Wholesale: {BRAND.wholesaleEmail}
          </p>
        </div>
      </div>
      <div className="border-t border-primary-foreground/15">
        <div className="mx-auto max-w-7xl px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-primary-foreground/55">
          <span>© {new Date().getFullYear()} Juss Beautiful Hair. All rights reserved.</span>
          <span className="uppercase tracking-[0.25em]">Lawless And Flawless</span>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
