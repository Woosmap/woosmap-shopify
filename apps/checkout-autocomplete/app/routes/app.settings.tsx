import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getPublicSettings, saveSettings } from "../woosmap-settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return await getPublicSettings(session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  await saveSettings(session.shop, {
    key: (form.get("woosmapKey")?.toString() ?? "") || undefined,
    enabled: form.get("enabled") === "on",
    language: form.get("language")?.toString().trim() || null,
  });

  return { ok: true };
};

export default function WoosmapSettings() {
  const settings = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (actionData?.ok) {
      shopify.toast.show("Settings saved");
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="Woosmap address autocomplete">
      <Form method="post">
        <s-section heading="Provider">
          {settings.hasKey ? (
            <s-banner tone="success" heading="Woosmap key configured">
              <s-paragraph>A private key is stored (encrypted). Leave the field blank to keep it.</s-paragraph>
            </s-banner>
          ) : (
            <s-banner tone="warning" heading="No Woosmap key yet">
              <s-paragraph>Add your Woosmap private key to enable address autocomplete.</s-paragraph>
            </s-banner>
          )}

          <s-password-field
            name="woosmapKey"
            label="Woosmap private key"
            placeholder={settings.hasKey ? "•••••••• (leave blank to keep)" : "Paste your Woosmap private key"}
            details="Stored encrypted, server-side only. It is never displayed again after saving."
          />

          <s-checkbox
            name="enabled"
            value="on"
            checked={settings.enabled}
            label="Enable address autocomplete at checkout"
          />
        </s-section>

        <s-section heading="Scope">
          <s-paragraph>
            Autocomplete runs for every country the store ships to (inherited from your Shopify
            Markets). The selected country is used to scope suggestions automatically.
          </s-paragraph>
          <s-text-field
            name="language"
            label="Default language"
            value={settings.language ?? ""}
            placeholder="fr"
            details="ISO language code used when the checkout locale is unavailable."
          />
        </s-section>

        <s-button type="submit" variant="primary">
          Save
        </s-button>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
