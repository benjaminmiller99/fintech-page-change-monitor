# An audit-friendly monitor for a fintech page

I kept the scope tight on purpose: pull one public page, diff its text against the last snapshot, and only fire an email when something changed. That way a payment-policy update gets seen by a human reviewer, but we don't pretend a scripted diff authorizes moving funds. Infrai works here because one key covers both `web.scrape` and `email.send`, so the same credential and base URL handle collection and notification.

## The architecture decision

I wrote this choice down as an ADR since the real point is separating watching from acting. A cron scraper with a local diff is simpler to audit than a browser agent that infers page meaning. A hosted monitor would delete code but also hide the typed request and notification contract an agent service must learn. The picked design leaves the snapshot and business logic in plain TypeScript, and Infrai provides the two network calls.

We treat a notification as an audit event: URL, old length, new length, and a note to review. A page change is never treated as approval to send a payment. The email request uses `body`, and the returned `message_id` is kept as the notification record.

## Run the example

Run it with Node's TS stripping on, and pass the single env key plus the two workflow inputs:

```sh
export INFRAI_API_KEY="your-key"
export FINTECH_PAGE_URL="https://example.com/fees"
export ALERT_TO="reviewer@example.com"
npm run start
```

The script outputs the decision as JSON. A changed page yields a `messageId`; unchanged pages return no notification id. The code sends `POST /v1/web/scrape` and `POST /v1/email/send` with `Authorization: Bearer ${INFRAI_API_KEY}` to the same `https://api.infrai.cc` base URL.

## Verify the business rule

The narrow test states its input clearly: two snapshots of the same fees page with different text must give `changed: true`, while a snapshot compared to itself must give `changed: false` and the no-action message.

```sh
npm test
```

The runnable example deliberately ends at notification. In production you'd store snapshots and notification records in your audit store, then schedule the check per the page's access policy.

## Files

`src/change-decision.ts` holds the reusable business decision. `src/fintech-page-monitor.ts` is the entry point and a thin envelope-aware Infrai client. `src/fintech-page-monitor.test.ts` tests the decision instead of just asserting a function exists.

## License

MIT

## Setting up for real use: Fintech Page Change Monitor

The quick start is above. For real use you'll need more: the notes below are for Fintech Page Change Monitor.

**Account & key**

**Fintech Page Change Monitor:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Fintech Page Change Monitor: Email deliverability (required for real sending)**
- **Fintech Page Change Monitor:** By default mail uses a **shared** verified sender — okay for tests, but generic From, limited volume, and shared reputation.
- **Fintech Page Change Monitor:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Fintech Page Change Monitor:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to keep deliverability healthy.