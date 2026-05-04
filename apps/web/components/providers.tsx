"use client";

import { Toaster } from "sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";
import { makeQueryClient } from "@/lib/queryClient";
import { SafetyDialogProvider } from "@/components/platform/SafetyDialogProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

const devtoolsEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_RQ_DEVTOOLS === "1";

const ReactQueryDevtools = devtoolsEnabled
  ? dynamic(
      () =>
        import("@tanstack/react-query-devtools").then(
          (mod) => mod.ReactQueryDevtools,
        ),
      { ssr: false },
    )
  : null;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={350} skipDelayDuration={0}>
          <SafetyDialogProvider>{children}</SafetyDialogProvider>
        </TooltipProvider>
        {ReactQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
      </QueryClientProvider>
      <Toaster richColors position="top-right" />
    </>
  );
}
