import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * GDPR `customers/redact` — delete a customer's personal data.
 *
 * This app persists no customer personal data (addresses are never stored), so
 * there is nothing to redact. Acknowledged for compliance.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} for ${shop}: no customer data stored to redact.`);
  return new Response();
};
