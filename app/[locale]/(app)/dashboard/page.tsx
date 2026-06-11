import { getTranslations } from "next-intl/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { UserRole } from "@/types";
import { DashboardStats } from "./dashboard-stats";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("dashboard") };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("id", user!.id)
    .single();

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">{t("dashboard")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Welcome back, {profile?.full_name ?? ""}
        </p>
      </div>

      <DashboardStats userId={user!.id} role={profile?.role as UserRole} locale={locale} />
    </div>
  );
}
