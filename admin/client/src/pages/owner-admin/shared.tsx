import { useState } from "react";
import { AlertTriangle, Check, ClipboardCopy, LockKeyhole, ShieldCheck } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { emptyOrderItem, newOrderId, routeLabel, type LocalOrder, type Vendor } from "@/lib/private-admin-vault";

export function freshOrder(): LocalOrder {
  return {
    id: newOrderId(),
    createdAt: new Date().toISOString(),
    source: "website",
    customerName: "",
    email: "",
    phone: "",
    address: { street: "", city: "", state: "", zip: "" },
    items: [emptyOrderItem()],
    subtotal: 0,
    shipping: 0,
    total: 0,
    status: "new",
    notes: "",
    paymentLink: "",
  };
}

export function getRoutingDecision(order: LocalOrder, vendors: Vendor[]): string {
  return routeLabel(order, vendors);
}

export function statusClass(status: string): string {
  if (["paid", "delivered", "confirmed"].includes(status)) return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (["processing", "ordered"].includes(status)) return "bg-blue-100 text-blue-900 border-blue-300";
  if (status === "shipped") return "bg-purple-100 text-purple-900 border-purple-300";
  if (["cancelled", "unassigned"].includes(status)) return "bg-red-100 text-red-900 border-red-300";
  return "bg-amber-100 text-amber-900 border-amber-300";
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check className="mr-1 h-3 w-3" /> : <ClipboardCopy className="mr-1 h-3 w-3" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function OwnerBoundary({ onContinue }: { onContinue: () => void }) {
  return (
    <Layout>
      <main className="mx-auto max-w-xl px-6 py-16">
        <section className="rounded-xl border border-card-border bg-card p-7 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary/30">
            <LockKeyhole className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-center font-display text-2xl">Private owner control</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This dashboard is local-only. Your encrypted, password-protected device and operating-system account are the security boundary. It must never be placed on Cloudflare, Vercel, a tunnel, or a preview URL.
          </p>
          <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            Continue only on your own device and browser profile. Customer records, vendor routing, private pricing, and exports stay under your control.
          </div>
          <Button className="mt-6 w-full" onClick={onContinue}>
            <ShieldCheck className="mr-2 h-4 w-4" /> Open owner controls
          </Button>
        </section>
      </main>
    </Layout>
  );
}

export function BlockedHost() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <section className="rounded-xl border border-red-300 bg-red-50 p-7 text-red-950">
        <AlertTriangle className="mb-3 h-8 w-8" />
        <h1 className="font-display text-2xl">Owner controls blocked</h1>
        <p className="mt-3 text-sm leading-6">
          This page only runs on loopback. Start it with <code>npm run dev:owner</code> and use the 127.0.0.1 address opened by Vite.
        </p>
      </section>
    </main>
  );
}
