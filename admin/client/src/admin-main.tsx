import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { CartProvider } from "@/lib/cart";
import { queryClient } from "@/lib/queryClient";
import Admin from "@/pages/Admin";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CartProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <Admin />
        </Router>
      </CartProvider>
    </TooltipProvider>
  </QueryClientProvider>,
);
