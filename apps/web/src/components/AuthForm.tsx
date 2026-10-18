"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isOneTimeProductId, isPlanId, loginSchema, ONE_TIME_PRODUCTS, signupSchema, type BillingInterval } from "@anyform/shared";
import { ApiClientError, checkout, checkoutProduct, explainError, login, signup } from "@/lib/api";

interface Props {
  mode: "login" | "signup";
}

type FieldErrors = Partial<Record<"email" | "password" | "name", string>>;

export function AuthForm({ mode }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const planParam = params.get("plan");
  const plan = isPlanId(planParam) && planParam !== "free" ? planParam : null;
  const interval: BillingInterval = params.get("interval") === "year" ? "year" : "month";
  const productParam = params.get("product");
  const product = !plan && isOneTimeProductId(productParam) ? productParam : null;
  const carry = plan ? `?plan=${plan}&interval=${interval}` : product ? `?product=${product}` : "";
  const next = params.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setErrors({});

    const parsed =
      mode === "signup"
        ? signupSchema.safeParse({ email, password, name: name.trim() || undefined })
        : loginSchema.safeParse({ email, password });

    if (!parsed.success) {
      const fe: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0];
        if (k === "email" || k === "password" || k === "name") fe[k] ??= issue.message;
      }
      setErrors(fe);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") await signup(parsed.data as { email: string; password: string; name?: string });
      else await login(parsed.data as { email: string; password: string });

      if (plan || product) {
        try {
          const { url } = plan ? await checkout(plan, interval) : await checkoutProduct(product!);
          window.location.assign(url);
          return;
        } catch {
          // Billing not configured or failed: land on the dashboard anyway.
        }
      }
      router.push(next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "CONFLICT") setFormError("An account with that email already exists. Log in instead.");
        else if (err.code === "UNAUTHORIZED" || err.status === 401) setFormError("Wrong email or password.");
        else if (err.code === "VALIDATION") setFormError(err.message);
        else setFormError(explainError(err));
      } else setFormError("Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  const input =
    "mt-1 w-full rounded-[4px] border border-line bg-paper px-3 py-2.5 text-base text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus-visible:outline-none";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {(plan || product) && (
        <p className="mono rounded-[4px] bg-accent/20 px-3 py-2 text-xs text-ink">
          you'll continue to checkout for{" "}
          <strong className="uppercase">{plan ?? ONE_TIME_PRODUCTS[product!].name}</strong>
          {plan ? ` (${interval}ly)` : ""} after this step
        </p>
      )}
      {mode === "signup" && (
        <label className="block text-sm text-ink-2">
          Name <span className="text-ink-3">(optional)</span>
          <input className={input} type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <span className="mt-1 block text-xs text-bad">{errors.name}</span>}
        </label>
      )}
      <label className="block text-sm text-ink-2">
        Email
        <input
          className={input}
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email}
        />
        {errors.email && <span className="mt-1 block text-xs text-bad">{errors.email}</span>}
      </label>
      <label className="block text-sm text-ink-2">
        Password
        <input
          className={input}
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={mode === "signup" ? 8 : 1}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password}
        />
        {errors.password && <span className="mt-1 block text-xs text-bad">{errors.password}</span>}
        {mode === "signup" && !errors.password && <span className="mono mt-1 block text-xs text-ink-3">8+ characters</span>}
      </label>
      {mode === "login" && (
        <p className="-mt-2 text-right text-sm">
          <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="link-ink">
            Forgot password?
          </Link>
        </p>
      )}

      {formError && (
        <p role="alert" className="rounded-[4px] border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-[4px] bg-ink px-5 py-3 text-base font-medium text-paper transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-60"
      >
        {busy ? "One moment…" : mode === "signup" ? "Create account" : "Log in"}
      </button>

      <p className="text-center text-sm text-ink-2">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href={`/login${carry}`} className="link-ink">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href={`/signup${carry}`} className="link-ink">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
