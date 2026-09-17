import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-8 pt-12 sm:px-6 lg:pt-16">
      <p className="mono text-xs uppercase tracking-widest text-ink-3">legal · draft for review</p>
      <h1 className="display mt-2 text-4xl font-semibold tracking-tight">Privacy</h1>
      <p className="mono mt-2 text-xs text-ink-3">Last updated: September 2026. This is a plain-language draft and must be reviewed by a lawyer before launch.</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-2 [&_h2]:display [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink">
        <h2>What we collect</h2>
        <p>
          The files you upload, for the sole purpose of converting them. Your email and a hashed password if you create an account. Conversion records
          (file name, formats, sizes, timestamps, which engine ran). A hashed IP address for abuse prevention. Payment details are handled by our payment
          provider; we never see your card number.
        </p>
        <h2>What we don't do</h2>
        <p>
          We don't look at your files, train anything on them, sell data, or run advertising. We don't use third-party tracking scripts. Analytics, when
          enabled, is cookieless and aggregated.
        </p>
        <h2>Cookies</h2>
        <p>
          Two first-party cookies: one that identifies you as a guest so your free conversions can be counted, and one that keeps you logged in. Both are
          essential to the service, so no consent banner is required.
        </p>
        <h2>Retention</h2>
        <p>
          Files are deleted automatically after your plan's retention window, or when you delete them. Conversion records are kept while you have an account
          and deleted 30 days after you close it. Guest records are deleted after 90 days.
        </p>
        <h2>Where data lives</h2>
        <p>Files are processed and stored encrypted on servers in the European Union. Backups of the database (not files) are kept for 30 days.</p>
        <h2>Your rights</h2>
        <p>
          You can export or delete your data at any time from the dashboard or by emailing privacy@anyform.app. EU/UK residents have the rights set out in
          the GDPR, including access, rectification, erasure and portability.
        </p>
      </div>
    </article>
  );
}
