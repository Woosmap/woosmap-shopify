// Publishes the app's backend URL to an app-owned metafield on the Shop, so the
// checkout extension can discover where to send requests in production (where its
// own `scriptUrl` points at Shopify's CDN, not the app). Called from the afterAuth
// hook. In development the extension falls back to its tunnel origin, so this is a
// no-op safety net there.
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export const APP_URL_NAMESPACE = "$app";
export const APP_URL_KEY = "app-url";

const SHOP_ID_QUERY = `#graphql
  query ShopId {
    shop {
      id
    }
  }`;

const SET_METAFIELD_MUTATION = `#graphql
  mutation SetAppUrl($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors {
        field
        message
      }
    }
  }`;

/**
 * Writes `$app:app-url` on the Shop resource with the current backend URL.
 * Best-effort: any failure is logged and swallowed so it never blocks install.
 */
export async function publishAppUrl(admin: AdminApiContext): Promise<void> {
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) {
    return;
  }

  try {
    const shopResponse = await admin.graphql(SHOP_ID_QUERY);
    const ownerId = (await shopResponse.json())?.data?.shop?.id;
    if (!ownerId) {
      return;
    }

    const response = await admin.graphql(SET_METAFIELD_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: APP_URL_NAMESPACE,
            key: APP_URL_KEY,
            type: "single_line_text_field",
            value: appUrl,
          },
        ],
      },
    });

    const errors = (await response.json())?.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length > 0) {
      console.error("[woosmap] failed to publish app-url metafield", errors);
    }
  } catch (error) {
    console.error("[woosmap] failed to publish app-url metafield", error);
  }
}
