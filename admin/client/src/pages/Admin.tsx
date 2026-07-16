import { useEffect, useMemo, useState } from "react";
import {
  CloudDownload,
  Download,
  LockKeyhole,
  Package,
  Plus,
  Search,
  Store,
  Upload,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/catalog";
import {
  groupOrderByVendor,
  isLoopbackHost,
  isRouteStale,
  loadOwnerVault,
  parseOwnerVaultImport,
  saveOwnerVault,
  serializeOwnerVault,
  type OrderStatus,
  type OwnerVault,
} from "@/lib/private-admin-vault";
import { importOnlineOrders } from "@/lib/online-order-import";
import { OrderDetail } from "./owner-admin/OrderDetail";
import { OrderEditor } from "./owner-admin/OrderEditor";
import { VendorManager } from "./owner-admin/VendorManager";
import {
  BlockedHost,
  OwnerBoundary,
  downloadText,
  freshOrder,
  getRoutingDecision,
  statusClass,
} from "./owner-admin/shared";

const OWNER_ACK_KEY = "jbh.owner.local-device-ack.v1";
const ORDER_STATUSES: OrderStatus[] = [
  "new",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

type View =
  | { mode: "orders" }
  | { mode: "vendors" }
  | { mode: "new" }
  | { mode: "edit"; orderId: string }
  | { mode: "detail"; orderId: string };

export default function Admin() {
  const { toast } = useToast();
  const [vault, setVault] = useState<OwnerVault>(() => loadOwnerVault());
  const [view, setView] = useState<View>({ mode: "orders" });
  const [acknowledged, setAcknowledged] = useState(
    () => sessionStorage.getItem(OWNER_ACK_KEY) === "1",
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");

  const commit = (next: OwnerVault) => {
    setVault(next);
    saveOwnerVault(next);
  };
  useEffect(() => saveOwnerVault(vault), [vault]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return vault.orders
      .filter((order) => status === "all" || order.status === status)
      .filter(
        (order) =>
          !query ||
          order.id.toLowerCase().includes(query) ||
          order.customerName.toLowerCase().includes(query) ||
          order.items.some((item) => item.name.toLowerCase().includes(query)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [search, status, vault.orders]);

  if (!isLoopbackHost(window.location.hostname)) return <BlockedHost />;
  if (!acknowledged) {
    return (
      <OwnerBoundary
        onContinue={() => {
          sessionStorage.setItem(OWNER_ACK_KEY, "1");
          setAcknowledged(true);
        }}
      />
    );
  }

  if (view.mode === "new") {
    return (
      <OrderEditor
        initial={freshOrder()}
        vendors={vault.vendors}
        routes={vault.routes}
        onCancel={() => setView({ mode: "orders" })}
        onSave={(order) => {
          commit({ ...vault, orders: [order, ...vault.orders] });
          setView({ mode: "detail", orderId: order.id });
          toast({
            title: "Order saved and routed",
            description: getRoutingDecision(order, vault.vendors),
          });
        }}
      />
    );
  }

  if (view.mode === "edit") {
    const order = vault.orders.find((candidate) => candidate.id === view.orderId);
    if (!order) return null;
    return (
      <OrderEditor
        initial={order}
        vendors={vault.vendors}
        routes={vault.routes}
        onCancel={() => setView({ mode: "detail", orderId: order.id })}
        onSave={(updated) => {
          commit({
            ...vault,
            orders: vault.orders.map((candidate) =>
              candidate.id === updated.id ? updated : candidate,
            ),
          });
          setView({ mode: "detail", orderId: updated.id });
          toast({
            title: "Order updated",
            description: getRoutingDecision(updated, vault.vendors),
          });
        }}
      />
    );
  }

  if (view.mode === "detail") {
    const order = vault.orders.find((candidate) => candidate.id === view.orderId);
    if (!order) return null;
    return (
      <OrderDetail
        order={order}
        vault={vault}
        commit={commit}
        onBack={() => setView({ mode: "orders" })}
        onEdit={() => setView({ mode: "edit", orderId: order.id })}
      />
    );
  }

  const unresolved = vault.orders.filter((order) =>
    groupOrderByVendor(order, vault.vendors).some((group) => !group.vendor),
  ).length;
  const staleRoutes = vault.routes.filter((route) => isRouteStale(route)).length;

  return (
    <Layout>
      <header className="border-b bg-card/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="font-display text-2xl">JBH owner control</h1>
            <p className="text-xs text-muted-foreground">
              Local-only vendor and order decisions
            </p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <Button
              variant={view.mode === "orders" ? "default" : "outline"}
              onClick={() => setView({ mode: "orders" })}
            >
              <Package className="mr-1 h-4 w-4" /> Orders
            </Button>
            <Button
              variant={view.mode === "vendors" ? "default" : "outline"}
              onClick={() => setView({ mode: "vendors" })}
            >
              <Store className="mr-1 h-4 w-4" /> Vendors & routes
            </Button>
            <Button onClick={() => setView({ mode: "new" })}>
              <Plus className="mr-1 h-4 w-4" /> New order
            </Button>
          </nav>
        </div>
      </header>

      {view.mode === "vendors" ? (
        <VendorManager vault={vault} commit={commit} />
      ) : (
        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Orders", value: vault.orders.length },
              {
                label: "Active vendors",
                value: vault.vendors.filter((vendor) => vendor.active).length,
              },
              { label: "Vendor needed", value: unresolved },
              { label: "Routes to verify", value: staleRoutes },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </div>
                <div className="mt-1 font-display text-2xl">{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <div className="relative min-w-[230px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search order, customer, or product"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as OrderStatus | "all")
              }
            >
              <option value="all">All statuses</option>
              {ORDER_STATUSES.map((candidate) => (
                <option key={candidate}>{candidate}</option>
              ))}
            </select>
          </div>

          <div className="mt-4 space-y-2">
            {filteredOrders.length ? (
              filteredOrders.map((order) => (
                <button
                  key={order.id}
                  className="w-full rounded-lg border bg-card p-4 text-left hover:bg-secondary/10"
                  onClick={() => setView({ mode: "detail", orderId: order.id })}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {order.customerName}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {order.id}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {order.items
                          .map((item) => `${item.qty}× ${item.name}`)
                          .join(", ")}
                      </div>
                      <div
                        className={`mt-2 text-xs font-medium ${
                          getRoutingDecision(order, vault.vendors).includes("needed")
                            ? "text-red-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {getRoutingDecision(order, vault.vendors)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <strong>{formatPrice(order.total)}</strong>
                      <Badge className={`${statusClass(order.status)} border`}>
                        {order.status}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                No matching orders.
              </div>
            )}
          </div>

          <section className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
            <p className="text-xs text-muted-foreground">
              The versioned owner vault stays in this browser profile. Store exports
              only in an encrypted owner-controlled location.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadText(
                    `jbh-owner-vault-${new Date().toISOString().slice(0, 10)}.json`,
                    serializeOwnerVault(vault),
                  )
                }
              >
                <Download className="mr-1 h-3 w-3" /> Export vault
              </Button>

              <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm hover:bg-secondary/20">
                <CloudDownload className="mr-1 h-3 w-3" /> Import paid orders
                <input
                  className="hidden"
                  type="file"
                  accept="application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        const result = importOnlineOrders(
                          String(reader.result ?? ""),
                          file.size,
                          vault,
                        );
                        commit(result.vault);
                        toast({
                          title: "Paid orders imported",
                          description: `${result.added} added · ${result.skipped} already present`,
                        });
                      } catch (error) {
                        toast({
                          title: "Import blocked",
                          description:
                            error instanceof Error
                              ? error.message
                              : "Invalid online-order export",
                          variant: "destructive",
                        });
                      }
                    };
                    reader.readAsText(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>

              <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm hover:bg-secondary/20">
                <Upload className="mr-1 h-3 w-3" /> Import vault
                <input
                  className="hidden"
                  type="file"
                  accept="application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        const imported = parseOwnerVaultImport(
                          String(reader.result ?? ""),
                          file.size,
                        );
                        commit(imported);
                        toast({
                          title: "Owner vault imported",
                          description: `${imported.orders.length} orders · ${imported.vendors.length} vendors`,
                        });
                      } catch (error) {
                        toast({
                          title: "Import blocked",
                          description:
                            error instanceof Error
                              ? error.message
                              : "Invalid owner vault",
                          variant: "destructive",
                        });
                      }
                    };
                    reader.readAsText(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  sessionStorage.removeItem(OWNER_ACK_KEY);
                  setAcknowledged(false);
                }}
              >
                <LockKeyhole className="mr-1 h-3 w-3" /> Close
              </Button>
            </div>
          </section>
        </main>
      )}
    </Layout>
  );
}
