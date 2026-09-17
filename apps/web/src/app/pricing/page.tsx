import type { Metadata } from "next";
import { Faq } from "@/components/Faq";
import { PricingTable } from "@/components/PricingTable";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Pricing",
  description: "10 free conversions for everyone. Then Starter, Pro and Business plans from $7.99/month with unlimited conversions and no ads.",
};

const FAQ = [
  {
    q: "What counts as a conversion?",
    a: "One file in, one file out. Failed conversions never count. On paid plans there's no count at all; you're limited by file size and how many run at once.",
  },
  {
    q: "Do my 10 free conversions reset?",
    a: "No: they're a one-time allowance so you can try Anyform properly. If you sign up, the ones you've already used carry over to your account.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, from the dashboard, in two clicks. You keep your plan until the end of the period you've paid for.",
  },
  {
    q: "Is there a refund?",
    a: "If Anyform didn't do what you needed in your first 14 days, write to us and we'll refund you. No forms.",
  },
  {
    q: "Do you offer invoices or team billing?",
    a: "Business includes 5 seats and proper invoices. Larger teams: get in touch.",
  },
  {
    q: "Which payment methods do you accept?",
    a: "Cards, Apple Pay and Google Pay, through our payment provider. We never see your card number.",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 lg:pt-16">
      <Reveal className="text-center">
        <p className="mono text-xs uppercase tracking-widest text-ink-3">pricing</p>
        <h1 className="display mt-2 text-[clamp(2.25rem,6vw,4.5rem)] font-semibold leading-[0.98] tracking-[-0.03em]">
          Ten free. Then one price.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-2">
          No minutes, no credits, no ads. Pick the plan that fits how often you convert, and cancel whenever you like.
        </p>
      </Reveal>

      <PricingTable className="mt-12" />

      <section className="mx-auto mt-24 max-w-3xl" aria-labelledby="faq">
        <h2 id="faq" className="display text-3xl font-semibold">
          Billing questions
        </h2>
        <Faq items={FAQ} className="mt-6" />
      </section>
    </div>
  );
}
