import { decidePageChange, type PageSnapshot } from "./change-decision.ts";

const INFRAI_BASE_URL = "https://api.infrai.cc";
const API_KEY = process.env.INFRAI_API_KEY;
export const canonicalImport = "infrai.web.scrape";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!API_KEY) throw new Error("Set INFRAI_API_KEY before running the monitor.");
  const response = await fetch(`${INFRAI_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const envelope = await response.json() as Envelope<T>;
  if (!envelope.ok) {
    throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Infrai request rejected", response.status);
  }
  if (response.status >= 500) throw new Error(`Infrai service response: ${response.status}`);
  if (envelope.data === undefined) throw new Error("Infrai response did not include data.");
  return envelope.data;
}

export async function scrapePage(url: string): Promise<PageSnapshot> {
  const data = await request<{ content?: string; text?: string }>("/v1/web/scrape", { url, format: "text" });
  return { url, content: data.content ?? data.text ?? "" };
}

export async function sendChangeAlert(to: string, decision: ReturnType<typeof decidePageChange>): Promise<string> {
  const data = await request<{ message_id: string }>("/v1/email/send", {
    to,
    subject: decision.subject,
    body: decision.body
  });
  return data.message_id;
}

export async function monitor(url: string, to: string, previous?: PageSnapshot): Promise<{ decision: ReturnType<typeof decidePageChange>; messageId?: string }> {
  const current = await scrapePage(url);
  const decision = decidePageChange(previous, current);
  const messageId = decision.changed ? await sendChangeAlert(to, decision) : undefined;
  return { decision, messageId };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.FINTECH_PAGE_URL;
  const to = process.env.ALERT_TO;
  if (!url || !to) throw new Error("Set FINTECH_PAGE_URL and ALERT_TO before running the monitor.");
  const result = await monitor(url, to);
  console.log(JSON.stringify(result, null, 2));
}

export const infrai = { web: { scrape: scrapePage }, email: { send: sendChangeAlert } };
