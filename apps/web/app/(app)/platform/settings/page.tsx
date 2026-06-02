"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/platform/AsyncState";
import type { ApiResponse } from "@/lib/api-response";

type PermissionsCheckDetails = {
  role?: string;
  perms?: unknown;
};

type SetupPayload = {
  env: {
    ops_dashboard_url_set: boolean;
    scheduling_service_token_set: boolean;
  };
  checks: {
    ops_health: { ok: boolean; status?: number; error?: string };
    ops_deep_health: { ok: boolean; status?: number; error?: string };
    platform_permissions: { ok: boolean; status?: number; error?: string; details?: PermissionsCheckDetails };
  };
};

function StatusBadge({ ok }: { ok: boolean }) {
  return <Badge variant={ok ? "success" : "danger"}>{ok ? "جاهز" : "غير جاهز"}</Badge>;
}

export default function PlatformSettingsPage() {
  const setupQ = useQuery({
    queryKey: ["platform-setup"],
    queryFn: async () => {
      const res = await fetch("/api/platform/setup", { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as ApiResponse<SetupPayload> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر تحميل فحص التهيئة.");
      return out.data;
    },
  });

  const permsRole = setupQ.data?.checks?.platform_permissions?.details?.role;
  const permsList = setupQ.data?.checks?.platform_permissions?.details?.perms;

  return (
    <div className="flex flex-col gap-cg-5">
      <PlatformPageHeader
        title="إعدادات المنصة"
        description="هذه الصفحة تشرح لك بسرعة لماذا بعض الصفحات لا تعرض بيانات، وما الذي يجب أن يكون شغالاً."
        right={
          <Button variant="outline" onClick={() => void setupQ.refetch()} disabled={setupQ.isFetching}>
            تحديث
          </Button>
        }
      />

      {setupQ.isLoading ? <LoadingState title="جارٍ فحص التهيئة..." /> : null}
      {setupQ.isError ? (
        <ErrorState
          title="تعذر فحص التهيئة"
          description={setupQ.error instanceof Error ? setupQ.error.message : "تعذر الاتصال."}
          onRetry={() => void setupQ.refetch()}
        />
      ) : null}

      {setupQ.data ? (
        <div className="grid gap-cg-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-ds-h3">بيئة التشغيل</CardTitle>
                <CardDescription>لا نعرض القيم، فقط هل هي موجودة أم لا.</CardDescription>
              </div>
              <StatusBadge ok={setupQ.data.env.ops_dashboard_url_set && setupQ.data.env.scheduling_service_token_set} />
            </CardHeader>
            <CardContent className="flex flex-col gap-cg-2">
              <div className="flex items-center justify-between text-ds-body">
                <span>OPS_DASHBOARD_URL</span>
                <Badge variant="outline">{setupQ.data.env.ops_dashboard_url_set ? "موجود" : "غير موجود"}</Badge>
              </div>
              <div className="flex items-center justify-between text-ds-body">
                <span>SCHEDULING_SERVICE_TOKEN</span>
                <Badge variant="outline">{setupQ.data.env.scheduling_service_token_set ? "موجود" : "غير موجود"}</Badge>
              </div>
              <p className="pt-cg-2 text-ds-small text-muted-foreground">
                إذا كانت أي قيمة غير موجودة، ستفشل معظم صفحات المنصة لأنها تعتمد على ops-dashboard كـ Backend.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-ds-h3">صحة النظام (ops-dashboard)</CardTitle>
                <CardDescription>فحوصات أساسية + فحص عميق.</CardDescription>
              </div>
              <StatusBadge ok={setupQ.data.checks.ops_health.ok && setupQ.data.checks.ops_deep_health.ok} />
            </CardHeader>
            <CardContent className="flex flex-col gap-cg-2 text-ds-body">
              <div className="flex items-center justify-between">
                <span>Health</span>
                <Badge variant={setupQ.data.checks.ops_health.ok ? "success" : "danger"}>
                  {setupQ.data.checks.ops_health.ok ? "OK" : `خطأ (${setupQ.data.checks.ops_health.status || 0})`}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Deep health</span>
                <Badge variant={setupQ.data.checks.ops_deep_health.ok ? "success" : "danger"}>
                  {setupQ.data.checks.ops_deep_health.ok ? "OK" : `خطأ (${setupQ.data.checks.ops_deep_health.status || 0})`}
                </Badge>
              </div>
              {!setupQ.data.checks.ops_health.ok || !setupQ.data.checks.ops_deep_health.ok ? (
                <p className="pt-cg-2 text-ds-small text-muted-foreground">
                  عند فشل الصحة، صفحات مثل الحوادث/القرارات/الإجراءات قد تظهر فارغة أو رسائل Upstream error.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-ds-h3">صلاحيات المنصة (RBAC)</CardTitle>
                <CardDescription>لماذا بعض الأزرار لا تظهر أو لا تعمل.</CardDescription>
              </div>
              <StatusBadge ok={setupQ.data.checks.platform_permissions.ok} />
            </CardHeader>
            <CardContent className="flex flex-col gap-cg-2 text-ds-body">
              <div className="flex flex-wrap items-center gap-cg-2">
                <Badge variant="secondary">الدور: {permsRole ? String(permsRole) : "غير معروف"}</Badge>
                <Badge variant="outline">
                  الصلاحيات: {Array.isArray(permsList) ? String(permsList.length) : "؟"}
                </Badge>
              </div>
              <p className="text-ds-small text-muted-foreground">
                إذا كانت الصلاحيات غير جاهزة، ستظهر صفحات المنصة وكأنها لا تعمل لأنها ستمنع الطلبات من المصدر.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-ds-h3">روابط سريعة</CardTitle>
          <CardDescription>أهم أماكن الإدارة اليومية.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-cg-2">
          <Button asChild>
            <Link href="/platform/clinics">العيادات</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/platform/incidents">الحوادث</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/platform/decisions">القرارات</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/platform/actions">الإجراءات</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/platform/audit">التدقيق</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/support-agent">تطبيق الدعم</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/ops-center">مركز العمليات</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

