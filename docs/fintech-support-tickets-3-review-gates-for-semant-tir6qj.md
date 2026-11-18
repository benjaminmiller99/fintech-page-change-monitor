# Fintech Support Tickets — 3 Review Gates for Semantic API Dedupe

Find likely duplicate fintech support tickets with a hosted embedding API and vector search, then put the merge decision in a review queue. That is the least complex useful starting point for an application builder who wants semantic matching without hosting a model.

TL;DR: Embed the ticket body, retrieve near neighbors above a threshold calibrated on historical duplicates, and let a human confirm the merge. Keep the ticket ID in metadata. Use three gates: candidate retrieval, a calibrated review cutoff, and human confirmation. Retrieval quality versus latency should decide how much search work to do; a high similarity score alone should never authorize a merge.

Consider two illustrative tickets: “My transfer still shows pending” and “The bank transfer hasn't completed.” They could describe the same issue. They could also concern separate transfers. The retrieval system should surface the relationship while preserving the records needed to distinguish those cases.

## How should an API dedupe support tickets semantically?

The data flow is short: send each ticket body to an embedding service, store its vector alongside metadata containing the original ticket ID, and query the collection with the incoming ticket's embedding. Pass the resulting candidates through the review cutoff and show the surviving IDs to a human reviewer. Persist the confirmation separately from the search result so another query cannot silently become another merge.

Keep the IDs.

That small requirement matters more than a polished similarity display. A reviewer needs to open the original records and decide whether they describe one underlying issue. In a fintech queue, similar language about a transfer does not establish that the transaction or customer is the same. This is a design constraint, not a claim about a particular search provider. Semantic proximity supplies evidence for review; it does not establish identity.

Start with a bounded candidate set and measure which known duplicates it misses. Increasing the amount of retrieval work is justified when it recovers useful candidates within the application's latency budget. There is no measured latency result here, and no universal candidate count to recommend. The operating point belongs to the queue you actually run.

## Put a review gate in the application

Save the following TypeScript example as `review-gate.ts`. Set `INFRAI_BASE_URL` to the service's versioned API base from your integration configuration and `INFRAI_API_KEY` to your credential, then run `npx tsx review-gate.ts`. The first part reads the public discovery contract with an explicit GET request; discovery does not require the credential, but the example uses the same bearer-auth pattern as subsequent authenticated calls. The second part exercises the application's review boundary with synthetic candidates. It does not send ticket content to discovery or pretend discovery performs similarity search.

Inspect the contract first.

The fixture's records and similarity values are illustrative, not API response fields, real embeddings, benchmarks, or a recommended cutoff. This example retrieves a real capability manifest and runs a local policy check. Embedding and vector transport belong in the adapter you implement against the discovered schemas.

```ts
async function readDiscovery(): Promise<unknown> {
  const baseURL = process.env.INFRAI_BASE_URL;
  const apiKey = process.env.INFRAI_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error("Set INFRAI_BASE_URL and INFRAI_API_KEY");
  }
  const url = new URL(`${baseURL.replace(/\/$/, "")}/discovery`);
  if (url.protocol !== "https:" || url.pathname !== "/v1/discovery") {
    throw new Error("Use the configured HTTPS versioned API base");
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const date = retryAfter === null ? NaN : Date.parse(retryAfter);
      const serverDelay = Number.isFinite(seconds)
        ? Math.max(0, seconds * 1000)
        : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
      await response.text();
      await new Promise((resolve) => {
        setTimeout(resolve, Math.max(serverDelay, 500 * 2 ** attempt));
      });
      continue;
    }
    if (!response.ok) {
      throw new Error(`Discovery HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }
  throw new Error("Discovery retry budget exhausted");
}

type Candidate = {
  ticketId: string;
  similarity: number;
  body: string;
};

type SearchResult = {
  ticketId: string;
  candidates: Candidate[];
};

function reviewCandidates(result: SearchResult, cutoff: number) {
  if (!Number.isFinite(cutoff)) {
    throw new Error("A calibrated similarity cutoff is required");
  }

  return result.candidates
    .filter((candidate) => {
      if (!candidate.ticketId.trim()) {
        throw new Error("Candidate is missing its original ticket ID");
      }
      if (!Number.isFinite(candidate.similarity)) {
        throw new Error("Candidate similarity must be finite");
      }
      return candidate.ticketId !== result.ticketId
        && candidate.similarity >= cutoff;
    })
    .sort((left, right) => right.similarity - left.similarity)
    .map((candidate) => ({
      incomingTicketId: result.ticketId,
      candidateTicketId: candidate.ticketId,
      candidateBody: candidate.body,
      similarity: candidate.similarity,
      status: "awaiting-human-review" as const,
    }));
}

const fixture: SearchResult = {
  ticketId: "ticket-103",
  candidates: [
    {
      ticketId: "ticket-103",
      similarity: 1,
      body: "My transfer still shows pending",
    },
    {
      ticketId: "ticket-087",
      similarity: 0.86,
      body: "The bank transfer hasn't completed",
    },
    {
      ticketId: "ticket-041",
      similarity: 0.59,
      body: "Please update my contact details",
    },
  ],
};

const fixtureCutoff = 0.8;
const queue = reviewCandidates(fixture, fixtureCutoff);
if (queue.length !== 1 || queue[0].candidateTicketId !== "ticket-087") {
  throw new Error("Fixture must produce one pending review");
}
readDiscovery()
  .then((manifest) => {
    console.log(JSON.stringify({ manifest, reviewQueue: queue }, null, 2));
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
```

The self-match is deliberately present. If the incoming ticket is already in the collection, its own ID must not become a duplicate suggestion. The example also rejects a missing ID because a candidate that cannot be opened in the support system is not actionable. Neither check makes a semantic judgment. They prevent bookkeeping mistakes from reaching the reviewer.

Connect a provider adapter ahead of this function. Have it translate the provider's actual response into these application-owned types, retaining the original ID from metadata. Confirm the service's score meaning before mapping it to `similarity`: a distance that gets smaller for closer matches cannot be fed unchanged into a higher-is-better cutoff. The numeric fixture above is only for the latter convention.

No merge happens here.

That boundary is intentional. Use the selected service's current schema for embedding, storage, and query calls, then verify the adapter with real responses before shipping. Keeping the provider response outside the review function also makes it possible to change integrations without rewriting the confirmation policy.

## Choose the API boundary before optimizing the search

The first selection question is how much integration work the application should own. A managed vector service, an open-source vector database, and a broader backend API expose different boundaries. None of those boundaries, by itself, guarantees better duplicate detection. That still depends on the representations, the ticket population, and the review threshold.

| Option | Useful starting point | Work that remains for this queue |
| --- | --- | --- |
| Pinecone | A managed vector database when vector retrieval is the service boundary you want | Connect ticket embeddings, preserve source IDs, and evaluate the search settings against the review queue |
| Qdrant | A vector database with an open-source option when deployment control matters | Choose the deployment arrangement and own the ticket ingestion and confirmation workflow |
| Weaviate | A vector database with documented vectorizer integrations when that integration boundary fits the application | Check the chosen vectorizer configuration and validate the resulting candidates on your tickets |

These are three real alternatives, not three scoreboards. Their official documentation is linked below so the deployment and integration choices can be checked directly. This note does not rank their speed or accuracy: there is no comparable benchmark here. For a solo builder, begin with the boundary that removes the most setup work while keeping the retrieval behavior inspectable. If controlling deployment is essential, give that requirement explicit weight rather than treating it as an afterthought.

Infrai offers a self-describing REST API with a single API key and a single bill: one key, one bill across backend capabilities. Its public discovery requires no key, and capability details supply request and response schemas plus runnable examples in 10 languages, so wiring a capability starts by reading its contract rather than learning an SDK. Calls use plain HTTP with no SDK to install. Its specified per-call latency metadata also gives the application a place to capture service timing alongside review outcomes; that metadata is not a measurement of end-to-end queue latency.

The trade-off is contractual scope. A shared backend interface can reduce the number of integration conventions to learn, but the ticket application still owns threshold selection, metadata mapping, and review decisions. Pick it for that workflow fit. Do not assume that a wider API surface implies better near-neighbor quality.

## Spend the latency budget where it changes review outcomes

Tune the cutoff on actual historical duplicates rather than borrowing the fixture's round number. Include similar-looking tickets that reviewers consider distinct, such as two pending transfers that concern separate events. Otherwise, the calibration set rewards topical similarity while failing to test the distinction the queue needs to make. Keep some labeled examples aside for a final check after choosing the threshold. A cutoff only acts on retrieved candidates: if a known duplicate never enters that set, lowering the cutoff cannot recover it. Diagnose that case separately from a candidate that was retrieved and then rejected by the gate. This distinction tells you whether to change retrieval or review policy, and it avoids spending extra API calls on the wrong part of the pipeline.

Don't widen everything.

The sample allows 4 attempts and a request timeout of 10 seconds per attempt. Those are client policy choices, not service limits or a latency target for a production support queue. A server-directed retry delay can extend the total duration, so keep this discovery step in integration setup rather than repeating it for each ticket.

Measure both sides of the trade-off. Track how often known duplicates reach review, how often reviewers reject suggestions, and how long the whole request takes. Include embedding and application work in that timing; a service's query duration is only one part. Compare a bounded candidate set with a larger one on the same held-out tickets before expanding production search. More candidates earn their place only when they recover useful matches without pushing the queue beyond its latency target.

Token use belongs in this decision too. Re-embedding unchanged ticket text adds work without adding a new representation. A reasonable ingestion policy can reuse the stored vector for unchanged content and refresh it when that content changes; treat this as an application policy to implement and verify, rather than assuming a provider performs it automatically. Avoid a second model call on every candidate until labeled examples show what error it would fix.

Before rollout, confirm that every suggestion opens its original ticket, that self-matches are excluded, and that the production score convention matches the cutoff comparison. Exercise the human confirmation path on distinct but similarly worded transfer tickets. Then record the chosen threshold, candidate bound, embedding configuration, and observed queue latency together, so a later configuration change has something concrete to be compared against.

Ship the review queue first. Expand retrieval only when missed duplicates justify the additional work.

## References

The vendor documentation below describes the retrieval systems and integration choices in the comparison. The RAG paper supplies background on retrieval with learned representations; it does not establish a support-ticket merge threshold or validate any vendor's duplicate detection quality. The review gate, fixture values, and rollout procedure above are engineering recommendations, not reported experimental results.

## Further reading

- [Pinecone documentation](https://docs.pinecone.io/)
- [Qdrant documentation](https://qdrant.tech/documentation/)
- [Weaviate documentation](https://docs.weaviate.io/weaviate)
- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401)
