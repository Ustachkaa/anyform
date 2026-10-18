#!/usr/bin/env node
/**
 * Create Anyform's products and prices in a Paddle account and print the
 * env lines to paste into .env.
 *
 *   PADDLE_API_KEY=pdl_sdbx_... node scripts/paddle-setup.mjs            # sandbox (default)
 *   PADDLE_API_KEY=pdl_live_... PADDLE_ENV=production node scripts/paddle-setup.mjs
 *   ... node scripts/paddle-setup.mjs --webhook https://api.example.com/v1/billing/webhook
 *
 * Prices come from packages/shared (build it first). Run once per account;
 * running again creates duplicates (archive them in the Paddle dashboard).
 * With --webhook it also creates the notification destination and prints its
 * secret (PADDLE_WEBHOOK_SECRET).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { PLANS, ONE_TIME_PRODUCTS } = await import(pathToFileURL(resolve(root, "packages/shared/dist/index.js")).href);

function envFromFile(key) {
  try {
    const line = readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).replace(/\s+#.*$/, "").trim() || undefined;
  } catch {
    return undefined;
  }
}

const apiKey = process.env.PADDLE_API_KEY ?? envFromFile("PADDLE_API_KEY");
const env = (process.env.PADDLE_ENV ?? envFromFile("PADDLE_ENV") ?? "sandbox") === "production" ? "production" : "sandbox";
const webhookIdx = process.argv.indexOf("--webhook");
const webhookUrl = webhookIdx > 0 ? process.argv[webhookIdx + 1] : undefined;
if (!apiKey || apiKey.endsWith("...")) {
  console.error("Set PADDLE_API_KEY (Paddle → Developer tools → Authentication → API keys).");
  process.exit(1);
}
const base = env === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

async function api(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${res.status} ${json?.error?.code ?? ""} ${json?.error?.detail ?? ""}`);
  return json.data;
}

const cents = (usd) => String(Math.round(usd * 100));
const lines = [];

for (const id of ["starter", "pro", "business"]) {
  const plan = PLANS[id];
  const product = await api("/products", { name: `Anyform ${plan.name}`, tax_category: "standard", description: plan.tagline, custom_data: { plan: id } });
  const monthly = await api("/prices", {
    product_id: product.id,
    description: `${plan.name} monthly`,
    name: "Monthly",
    unit_price: { amount: cents(plan.priceMonthly), currency_code: "USD" },
    billing_cycle: { interval: "month", frequency: 1 },
  });
  const yearly = await api("/prices", {
    product_id: product.id,
    description: `${plan.name} yearly`,
    name: "Yearly",
    unit_price: { amount: cents(plan.priceYearlyPerMonth * 12), currency_code: "USD" },
    billing_cycle: { interval: "year", frequency: 1 },
  });
  lines.push(`PADDLE_PRICE_${id.toUpperCase()}_MONTHLY=${monthly.id}`, `PADDLE_PRICE_${id.toUpperCase()}_YEARLY=${yearly.id}`);
  console.error(`created ${plan.name}: ${monthly.id} (monthly), ${yearly.id} (yearly)`);
}

for (const id of ["pack", "pass"]) {
  const p = ONE_TIME_PRODUCTS[id];
  const product = await api("/products", { name: `Anyform ${p.name}`, tax_category: "standard", description: p.tagline, custom_data: { product: id } });
  // No billing_cycle: a one-time price.
  const price = await api("/prices", { product_id: product.id, description: p.name, name: p.name, unit_price: { amount: cents(p.price), currency_code: "USD" } });
  lines.push(`PADDLE_PRICE_${id.toUpperCase()}=${price.id}`);
  console.error(`created ${p.name}: ${price.id}`);
}

if (webhookUrl) {
  const dest = await api("/notification-settings", {
    description: "Anyform API",
    destination: webhookUrl,
    type: "url",
    api_version: 1,
    subscribed_events: [
      "transaction.completed",
      "subscription.created",
      "subscription.updated",
      "subscription.activated",
      "subscription.canceled",
      "subscription.past_due",
      "subscription.paused",
      "subscription.resumed",
      "subscription.trialing",
    ],
  });
  lines.push(`PADDLE_WEBHOOK_SECRET=${dest.endpoint_secret_key}`);
  console.error(`created webhook destination ${dest.id} → ${webhookUrl}`);
}

console.log(`\n# Paste into .env (${env})\nBILLING_PROVIDER=paddle\nPADDLE_ENV=${env}\n${lines.join("\n")}`);
