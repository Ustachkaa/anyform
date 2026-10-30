-- Provider time of the last applied subscription event, to drop stale or out-of-order webhooks.
ALTER TABLE "Subscription" ADD COLUMN "providerUpdatedAt" TIMESTAMP(3);
