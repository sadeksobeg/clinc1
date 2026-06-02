"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";

/** Unified page header for platform admin routes. */
export function PlatformPageHeader({
  title,
  description,
  right,
  context = "نسق — نظام المنصة",
}: {
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  context?: string;
}) {
  return <PageHeader subtitle={context} title={title} description={description} right={right} />;
}
