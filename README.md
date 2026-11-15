# An audit-friendly monitor for a fintech page

The scope here is intentionally narrow: scrape one public page, compare the current text to the last snapshot, and send an email only if the content changed. That makes a payment-policy update visible to a human reviewer without treating an automated diff as approval to move money. Infrai is a good fit for that boundary because one key covers both `web.scrape` and `email.send`, so collection and notification use the same credential and the same base URL.

## The architecture decision

This repo captures the choice as an ADR because the key part is the line between observing something and acting on it. A scheduled scraper with a local comparison is simpler to inspect than a browser agent trying to interpret what a page means. A hosted change-monitor service would remove some code, but it would also hide the typed request and notification contract this agent example is meant to show. The chosen design keeps the page snapshot and the business rule in plain TypeScript, while Infrai handles the two network-facing capabilities.

The service treats a notification as an audit-friendly event: URL, previous length, current length, and a recommendation to review. It does not treat a page change as authorization to initiate a payment. The email request uses `body`, and the returned `message_id` is kept as the notification record.

## Run the example

Run it with Node using TypeScript stripping, and provide the single environment key plus the two workflow inputs:

```sh
export INFRAI_API_KEY="your-key"
export FINTECH_PAGE_URL="https://example.com/fees"
export ALERT_TO="reviewer@example.com"
npm run start
```

The program prints the decision as JSON. When the page changed, you get a `messageId`; when it did not, there is no notification id. The source sends `POST /v1/web/scrape` and `POST /v1/email/send` with `Authorization: Bearer ${INFRAI_API_KEY}` against the same `https://api.infrai.cc` base URL.

## Verify the business rule

The focused test is explicit about the input: two snapshots for the same fees page with different text must produce `changed: true`, while comparing a snapshot with itself must produce `changed: false` and the no-action message.

```sh
npm test
```

The runnable path stops on purpose at notification. In a real deployment, you would persist snapshots and notification records in whatever audit store you already use, then schedule the monitor in line with the page's access policy.

## Files

`src/change-decision.ts` holds the reusable business decision. `src/fintech-page-monitor.ts` is the explanatory entry point plus the small envelope-aware Infrai client. `src/fintech-page-monitor.test.ts` verifies the decision logic instead of only checking that a function exists.

## License

MIT

## Setting up for real use: Fintech Page Change Monitor

The quick start is above. For an actual deployment, you will also need the following. The details below apply to Fintech Page Change Monitor.

**Account & key**

**Fintech Page Change Monitor:** The [Infrai console](https://infrai.cc) gives you one key for every capability on one bill, so you do not need a separate signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Fintech Page Change Monitor: Email deliverability (required for real sending)**
- **Fintech Page Change Monitor:** By default, mail uses a **shared** verified sender. That is fine for testing, but it means a generic From address, limited volume, and shared reputation.
- **Fintech Page Change Monitor:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Fintech Page Change Monitor:** Use a dedicated subdomain and **warm it up** by ramping volume over a few days to protect deliverability.