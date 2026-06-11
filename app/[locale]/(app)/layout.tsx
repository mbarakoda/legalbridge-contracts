import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

// All (app) routes require authentication
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Fetch the LexiFlow user profile
  const { data: profile } = await supabase
    .from("users")
    .select("id, full_name, email, role, group_id, avatar_url, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    redirect(`/${locale}/login`);
  }

  return <AppShell user={profile} locale={locale}>{children}</AppShell>;
}
