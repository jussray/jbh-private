import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Package, ArrowRight } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { formatPrice, BRAND } from "@/lib/catalog";
import type { Order } from "@shared/schema";

interface OrderItem {
  id: string;
  name: string;
  variant: string;
  price: number;
  qty: number;
  image: string;
}

export default function Confirmation() {
  const [, params] = useRoute("/confirmation/:id");
  const id = params?.id;

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["/api/orders", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/orders/${id}`);
      return res.json();
    },
    enabled: !!id,
  });

  // itemsJson is a JSONB column — already an object from the API
  let items: OrderItem[] = [];
  if (order?.itemsJson) {
    if (Array.isArray(order.itemsJson)) {
      items = order.itemsJson as OrderItem[];
    } else {
      try {
        items = JSON.parse(order.itemsJson as unknown as string) as OrderItem[];
      } catch {
        items = [];
      }
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-secondary/40 text-primary mb-5">
            <CheckCircle2 className="h-8 w-8 text-gold" />
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold mb-2">
            {BRAND.tagline}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl text-foreground">
            Thank you{order?.customerName ? `, ${order.customerName.split(" ")[0]}` : ""}! 💜
          </h1>
          {id && (
            <p className="mt-3 text-muted-foreground" data-testid="text-order-id">
              Order <span className="font-semibold text-foreground">#{id}</span> is confirmed.
            </p>
          )}
          <div className="mt-5 inline-flex items-start gap-2.5 rounded-md bg-secondary/30 px-4 py-3 text-sm text-primary text-left max-w-md">
            <Package className="h-5 w-5 shrink-0 mt-0.5" />
            <p data-testid="text-confirmation-message">
              Your order's been received and is being prepared for shipment.
              You'll get a tracking email within 24 hours.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-10 h-40 rounded-lg bg-muted animate-pulse" />
        ) : order ? (
          <div className="mt-10 rounded-lg border border-card-border bg-card p-6">
            <h2 className="font-display text-lg text-foreground mb-4">
              Order Details
            </h2>
            <div className="space-y-3">
              {items.map((i) => (
                <div key={`${i.id}-${i.variant}`} className="flex gap-3 text-sm">
                  <img src={i.image} alt="" className="h-14 w-14 rounded object-cover bg-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground leading-tight">{i.name}</p>
                    <p className="text-muted-foreground text-xs">{i.variant} × {i.qty}</p>
                  </div>
                  <span className="text-foreground font-medium">
                    {formatPrice(i.price * i.qty)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-border mt-4 pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground">{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-foreground">
                  {order.shipping === 0 ? "FREE" : formatPrice(order.shipping)}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-base pt-1">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8 text-center">
          <Link href="/shop">
            <Button size="lg" className="font-semibold" data-testid="button-keep-shopping">
              Keep Shopping <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
