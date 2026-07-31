import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/suggest.ts' {
  const shopify: import('@shopify/ui-extensions/purchase.address-autocomplete.suggest').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/format-suggestion.ts' {
  const shopify: import('@shopify/ui-extensions/purchase.address-autocomplete.format-suggestion').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/woosmap.ts' {
  const shopify:
    | import('@shopify/ui-extensions/purchase.address-autocomplete.suggest').Api
    | import('@shopify/ui-extensions/purchase.address-autocomplete.format-suggestion').Api;
  const globalThis: { shopify: typeof shopify };
}
