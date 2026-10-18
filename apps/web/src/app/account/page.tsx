import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/AccountSettings";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 lg:pt-14">
      <p className="mono text-xs uppercase tracking-widest text-ink-3">
        <Link href="/dashboard" className="hover:text-ink">
          dashboard
        </Link>{" "}
        / settings
      </p>
      <h1 className="display mt-2 text-4xl font-semibold tracking-tight">Account settings.</h1>
      <p className="mono mt-1 text-sm text-ink-3">{user.email}</p>
      <div className="mt-8">
        <AccountSettings user={user} />
      </div>
    </div>
  );
}
