import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * GDPR `shop/redact` — sent 48h after a shop uninstalls the app. Delete all
 * data this app holds for the shop. Here that is the shop's Woosmap settings
 * (including the encrypted private key).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} for ${shop}: deleting shop settings.`);
  await db.shopSettings.deleteMany({ where: { shop } });
  return new Response();
};
