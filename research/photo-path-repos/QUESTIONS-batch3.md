# Batch three: the search loop batch, and the one rule that decides what counts

Read 2026-09-19. **`QUESTIONS.md` still applies in full**: the rules of evidence, the file:line
requirement, "found nothing is a finding", read the call site and not the README, no em dashes.
This file replaces the three questions with four, because this batch is a different architecture.

Two repos from the founder's list are already read and are not re-read: `danny-avila/LibreChat`
(batch two, `librechat.md`) and anything covered in `README.md` or `README-batch2.md`.

Address corrections, verified: `ItzCrazy-dev/Perplexica` does not exist. The project is
`ItzCrazyKns/Vane`, renamed from Perplexica, 36,879 stars. Use that and note the rename.

## The one rule that decides what counts

Shin makes **one call to Gemini with Google Search grounding turned on**. It runs no search API of
its own, no scraper, no crawler, no vector index, and by the founder's ruling it does not consult
its own product catalogue either. The model searches; we never see a result page.

Every one of these repos has the opposite architecture: they call a search API themselves, get
back a list of URLs, fetch the pages, and feed the text to an LLM. **So most of their machinery
cannot be copied, and reporting it as a recommendation is the failure mode of this batch.**

Therefore, every mechanism you report carries one of three labels, and a finding with no label is
incomplete:

- **`FITS`**: works inside one grounded Gemini call, or as a second Gemini call on the same input.
  Prompt structure, answer judging, output shape, retries, what to do when sources conflict.
- **`NEEDS OUR OWN SEARCH`**: requires issuing our own queries, fetching pages, or holding an index.
  Report it, describe it, and label it. It is a description of a different architecture, not a
  suggestion.
- **`FREE`**: costs no extra model call at all. Caching, deduplication, parsing, validation,
  ordering, anything that is pure local logic.

Label every bullet. The labels are the deliverable as much as the mechanisms are.

## The four questions

### QA. How is the question turned into a query, and what happens after a bad one?

- Where the search string is built from the user's input, and by what: a template, an LLM call, or
  a decomposition into sub-questions. Quote the prompt if an LLM writes the query.
- **Reformulation.** After a weak or empty result, does anything rewrite the query and try again?
  Find the exact trigger condition and the rewrite prompt. This is the mechanism we most lack.
- Whether several queries are issued at once for one question, and how their results are merged.
- Any query-level constraint: a site restriction, a recency window, a language or region setting.

### QB. What is done to a result before it is believed?

- Relevance scoring, reranking, embeddings, thresholds. Give the numbers.
- Deduplication, and by what key.
- Whether page content is fetched and cleaned, and what is dropped.
- Any filtering by domain, date or source quality, and whether any source is trusted over another.
- **Anything that extracts a number, a price, a currency or a date from a page**, and what
  validates it. This is the founder's second complaint, so hunt for it specifically and report the
  absence loudly if there is none.

### QC. How is the answer tied to its sources, and what happens when they disagree?

- How citations are attached: by the model claiming them, or by the code matching answer text back
  to source text. **Code that matches an answer span to a source span is the single most valuable
  thing this batch can contain.** Quote it.
- What happens on conflict between two sources, and on no result at all.
- Whether the answer is ever rejected and regenerated, and by what judgment.
- Whether an unsupported sentence can be dropped or flagged.

### QD. When does it stop, and what does it cost?

- The loop's exit conditions, iteration caps, token or time budgets, the numbers.
- What it returns when the budget is spent, and whether that degraded answer is marked as such.
- Retry and backoff on a failed call, and whether a retry changes the prompt.
- Any accounting of cost per question.

## Output

One file, `<repo-name>.md`, in this directory: what it actually is from the source, read depth,
then a section per question, every bullet labelled `FITS`, `NEEDS OUR OWN SEARCH` or `FREE`, every
claim with `file:line`. End with `## Nothing here on` and `## Dead or unwired`.

For the very large repos, scope hard to the search, retrieval and agent-loop packages and say what
you did not open. Clone shallow into
`C:\Users\xujam\AppData\Local\Temp\claude\shin-repo-scan\<name>`.

Report back under 150 words, and **lead with your `FITS` findings**, since those are the only ones
that can become work.
