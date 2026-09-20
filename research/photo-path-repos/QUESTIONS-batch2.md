# Batch two: the framework batch, and the extra question it exists to answer

Read 2026-09-19, same day as batch one. **`QUESTIONS.md` still applies in full: the three
questions, the rules of evidence, the file:line requirement, the "found nothing is a finding"
rule, no em dashes.** This file only adds what is specific to this batch.

Two repos from the founder's list, `GoogleCloudPlatform/generative-ai` and `vercel/ai`, were read
in batch one and are not re-read. Their findings stand in their own files.

`firebase/genkit` has moved. GitHub 301s it to **`genkit-ai/genkit`**. Use the new location and
say so in the file.

## Why this batch is different

Batch one was applications. This batch is frameworks and one documentation site, which means the
code is a faithful map of **what the Gemini API actually exposes**, written by people who had to
support every version of it. A framework that gates a field on a model version is telling you the
API rejects it elsewhere, and that is evidence batch one could not produce.

Weigh accordingly:

- **Real code beats documentation.** `google/adk-docs` is a documentation repository. Anything
  taken from it is labelled as a documentation claim, never as a code finding, and if the same
  repo ships runnable samples, prefer those and say which you used.
- **A framework's tests and its version gates are the best evidence in this batch.** A thrown
  exception, a validation branch, a "not supported on" comment, or a field renamed between model
  versions each tell you something no tutorial will.

## Q4, this batch only: what controls when and how hard it searches

Shin searches on every single scan, unconditionally, and cannot vary that. Find every knob:

- **Dynamic retrieval.** Is there a threshold that decides whether the model searches at all
  (`dynamic_retrieval_config`, `dynamicThreshold`, `DynamicRetrievalConfig`, `mode: MODE_DYNAMIC`)?
  Get the default value, the range, what the number means, and which models accept it. One repo in
  this list is claimed to expose it to users. Confirm or break that claim.
- **The two surface names.** `googleSearchRetrieval` versus `googleSearch`. Which model versions
  get which, and does the framework switch between them by version? Quote the switch. This is the
  clearest available evidence of what the API accepts where.
- **Forcing or forbidding a search.** Tool choice, tool config, `mode: ANY|AUTO|NONE`, a required
  tool, or a way to make the model answer without searching.
- **Cost or call control.** Anything that counts searches, caps them, or reuses a previous search
  result rather than issuing a new one.

## The three original questions, aimed at this batch

- **Q1.** Can an image part and a search tool go on the same request through this framework? The
  strongest evidence is a **version gate or a validation error**, not an example. If the framework
  rejects the combination anywhere, quote the rejection. If it builds the request without
  complaint, say that it permits it, and be explicit that permitting is not the same as the API
  accepting. `tanaikech/GeminiWithFiles` is claimed to pass uploaded files and a search together,
  which is our exact question in another language, so that one is priority.
- **Q2.** What stops a wrong answer. In frameworks, look for: retry and backoff policy, whether a
  retry changes the prompt, structured-output repair loops, and above all **whether anything reads
  the grounding metadata to check the answer against its sources** rather than only rendering
  citations. Name the grounding metadata fields the framework surfaces and the ones it drops.
- **Q3.** What pins the output shape. Is a response schema sent as a real API schema, and **can it
  be sent together with a search tool**? A framework that throws when both are set is the finding
  we most want. A framework that allows both, on which model ids?

## Output

One file per repo, `<repo-name>.md`, in this directory, following the structure in `QUESTIONS.md`,
with one extra section `## Q4 when and how hard it searches`. Report back under 150 words.
