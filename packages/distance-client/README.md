# @woosmap/distance-client

Worker-safe Woosmap **Distance Matrix** client over a pluggable `fetch` transport.

```ts
import { DistanceClient } from '@woosmap/distance-client';

const client = new DistanceClient({ privateKey: process.env.WOOSMAP_PRIVATE_KEY });

// One origin → N destinations, one mode. Elements align with `destinations`.
const elements = await client.travelTimes(
  { lat: 51.5, lng: -0.12 },
  [{ lat: 51.51, lng: -0.13 }, { lat: 51.49, lng: -0.11 }],
  'walking',
);

for (const el of elements) {
  if (el.status === 'OK') console.log(el.distance?.text, el.duration?.text);
}
```

- `distanceMatrix(request)` — full origins×destinations matrix.
- `travelTimes(origin, destinations, mode?)` — single-origin convenience.

Sends `elements=duration_distance` by default (both distance and duration per cell). Non-2xx responses throw `WoosmapApiError`; the transport is injectable for tests and non-browser runtimes.
