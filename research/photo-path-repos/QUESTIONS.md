# The question sheet, every repo gets the same one

Read 2026-09-19. This scan exists because Shin's photo path fails three ways, in the founder's
words: it "doesn't correctly identify a lot of objects", it "cannot accurately find its prices",
and it "cannot accurately prompt gemini everytime". Those three are the only lenses. A repo that
speaks to none of them gets one line saying so, and that is a legitimate result.

## The rules of evidence

1. **Every mechanism you report carries `path/to/file.ext:LINE` inside that repo.** A claim I
   cannot re-find by grepping the clone does not go in the file. This is the whole point.
2. **Read the call site, not the README.** Go to where the request body to the model is
   constructed, and to where its response is parsed. All three failures live there. READMEs on
   this list have already been shown to be wrong about their own repos.
3. **Found nothing is a finding.** Write "nothing on Q2, searched X, Y, Z" rather than padding
   with a summary of what the repo does instead. Never infer a mechanism from a dependency in
   `package.json`, and never from a file name.
4. **Aspirational and dead code is reported as such.** If the mechanism exists but nothing calls
   it, say so, with the grep that proves nothing imports it.
5. **No em dashes in anything you write.**

## The three questions

### Q1. When the input is an image, what exactly goes into the request?

The precise thing being hunted: **does anything here put an image and a live web search into the
same model call?** Shin cannot currently do it, nobody has confirmed the Gemini API permits it,
and Shin's whole one-call-versus-two-calls design turns on the answer. So:

- Find where the image is attached (inline base64, file upload, a Part, a `file_uri`).
- Find whether a tool or grounding config is on that same request (`googleSearch`,
  `google_search_retrieval`, `tools:`, `grounding_config`, Vertex grounding, an MCP search call).
- If image and search are on the same request, **quote the request construction verbatim** and
  name the model id and SDK version. That is the single highest value finding available here.
- If they are on separate calls, say what is passed between the two calls (raw text? a structured
  object? the image again?) and who decides the second call happens.
- Note what is sent alongside: resolution or token hints (`media_resolution`), thinking budget,
  temperature, system instruction, whether the image is cropped or resized first.

### Q2. How does it stop being wrong?

Shin accepts the first thing the model says. Look for anything that does not:

- A second search or second query when the first is weak, and the exact condition that triggers it.
- A confidence gate, a refusal path, a "not sure" branch, an enum band rather than a free number.
- Cross checking two sources against each other before answering, and what happens on a conflict.
- Retries, and whether a retry changes the prompt or just repeats it.
- A budget or cap that ends the loop, and what it returns when the budget runs out.
- Citation or grounding metadata being checked, not just displayed. Does anything verify the
  answer is actually supported by the retrieved source, or drop a claim that is not?
- For anything price shaped: how a number is pulled off a page, whether currency, unit and date
  are captured with it, and how a stale or wrong number is caught.

### Q3. What forces the output into the same shape every run?

- A response schema, and whether it is a real API level schema or a shape spelled out in the prompt.
- Enums rather than free strings, required fields, nulls allowed or not.
- A validator that rejects and re-asks, and how many times.
- Whether schema and search grounding are used **together** on the same call, and on which model
  id. Shin believes they are mutually exclusive on Gemini 2.5 and allowed on 3.x. Confirm or break
  that belief with a line of code.
- Prompt assembly: template files versus inline strings, few shot examples, how variables are
  substituted, anything that pins the model to transcribe visible text before it names a thing.

## What to write

One file, `<repo-name>.md`, in this directory. Structure:

```
# <owner/repo>
One line: what it actually is, from the source, not the description.
Read depth: which directories and files you opened, and what you deliberately did not.

## Q1 image plus search
## Q2 stopping being wrong
## Q3 same shape every time
## Nothing here on
## Dead or unwired
```

Under each question, one bullet per mechanism: what it does, `file:line`, and one clause on why it
matters for a product that photographs a grocery item and must name it and price it. Be concrete
about numbers, thresholds, timeouts and model ids. Quote short snippets where the snippet is the
evidence.

## Clone hygiene

Clone into `C:\Users\xujam\AppData\Local\Temp\claude\shin-repo-scan\<name>` with `--depth 1`.
For the two very large Google repos, do not clone. Use the GitHub API to list the tree, then fetch
only the grounding and multimodal notebooks with raw.githubusercontent.com.
