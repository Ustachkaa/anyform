import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-8 pt-12 sm:px-6 lg:pt-16">
      <p className="mono text-xs uppercase tracking-widest text-ink-3">legal · draft for review</p>
      <h1 className="display mt-2 text-4xl font-semibold tracking-tight">Terms of service</h1>
      <p className="mono mt-2 text-xs text-ink-3">Last updated: September 2026. This is a plain-language draft and must be reviewed by a lawyer before launch.</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-2 [&_h2]:display [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink">
        <h2>1. The service</h2>
        <p>
          Anyform converts files you upload into other formats. Every visitor receives a limited number of free conversions; paid subscriptions remove that
          limit and raise other limits described on the pricing page.
        </p>
        <h2>2. Your files</h2>
        <p>
          You confirm that you own, or have the right to process, every file you upload. You may not upload content that is illegal, infringes someone's
          rights, or contains malware. We do not download content from third-party websites or streaming platforms.
        </p>
        <h2>3. Retention and deletion</h2>
        <p>
          Uploaded files and their outputs are deleted automatically after the retention period of your plan (two hours on the Free plan), or immediately
          when you delete them from your dashboard. We keep a record of the conversion (file name, formats, sizes, timestamps) but not the file itself.
        </p>
        <h2>4. Accounts and billing</h2>
        <p>
          Subscriptions renew automatically until cancelled. You can cancel at any time from your dashboard and keep access until the end of the paid period.
          Refunds within the first 14 days are available on request.
        </p>
        <h2>5. Fair use</h2>
        <p>
          Paid plans have no conversion count, but they are intended for a person or team, not for reselling or automated bulk processing beyond the API
          limits of your plan. We may throttle or suspend accounts that materially exceed normal use.
        </p>
        <h2>6. Availability and liability</h2>
        <p>
          We aim for high availability but do not guarantee it. Anyform is provided as is; to the extent permitted by law we are not liable for indirect
          losses, and our total liability is limited to the fees you paid in the previous three months.
        </p>
        <h2>7. Changes</h2>
        <p>We may update these terms; material changes will be announced on this page at least 14 days before they take effect.</p>
        <h2>8. Contact</h2>
        <p>Questions, abuse reports and copyright notices: legal@anyform.app.</p>
      </div>
    </article>
  );
}
