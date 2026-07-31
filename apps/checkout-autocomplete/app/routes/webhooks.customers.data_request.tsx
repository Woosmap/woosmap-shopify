import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * GDPR `customers/data_request` — a customer (via the merchant) requested the
 * data this app holds about them.
 *
 * This app stores NO customer personal data: addresses are proxied to Woosmap
 * transiently and never persisted. The only stored data is the shop's Woosmap
 * config, keyed by shop (not by customer). So there is nothing to return.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} for ${shop}: no customer data is stored by this app.`);
  return new Response();
};
