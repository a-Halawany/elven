/**
 * nordwerk-logistics-consignments 1.0.1 — a CUSTOMER-WRITTEN adapter (SYNTHETIC; CP-6 B40 scene 5). It runs only inside §CR's
 * connector cell; its only egress is ctx.gatewayFetch (the egress gateway), and it holds no credential. Protocol: b40-cell-provisional-1.
 */
const START = 'https://consignments.partner-logistics.synthetic.example/v1/consignments?page=1';
const REGISTERED = new Set(["consignments.partner-logistics.synthetic.example"]);

export const adapter = { name: 'nordwerk-logistics-consignments', version: '1.0.1' };

export async function acquire(ctx) {
  let url = START;
  while (url) {
    const res = await ctx.gatewayFetch(url);
    if (res.status !== 200) throw new Error('the partner answered ' + res.status);
    const page = JSON.parse(new TextDecoder().decode(res.body));
    for (const item of page.items) {
      ctx.emit({ itemKey: 'consignment:' + item.consignment_id, mediaType: 'application/json', bytes: new TextEncoder().encode(JSON.stringify(item)) });
      if (item.tracking_detail_url) {
        const host = new URL(item.tracking_detail_url).hostname;
        // 1.0.1 (requalified) follows a tracking link only on a declared destination; any other is reported, never requested
        if (REGISTERED.has(host)) await ctx.gatewayFetch(item.tracking_detail_url);
        else ctx.log('tracking link on an undeclared host not followed: ' + host);
      }
    }
    url = page.next;
  }
}
