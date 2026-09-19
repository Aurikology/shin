# Parked list

Things that need to be worked on. **Nothing here is worked on automatically.** It is only stored.
An item leaves this list when Jamin says to work on it; it does not move on its own, and no builder,
lane or session picks from it unasked. Newest last. Each item keeps his words and what is known, and
marks what is a question, so an idea is never read as a decision.

## P1 · Find a way to send barcodes in (2026-09-19)

**His words:** "find a way to send barcodes in (currently just sending the code does not work. Is
there any easier way to send the barcode. Can it be sent as code that gemini can properly
interpret?)"

**What is known**
- The app reads the barcode on the phone and sends the digits. That is what does not work.
- Evidence that digits alone fail: a real scan of a barcode Shin's own catalogue does not have was
  sent through the production barcode wording with search on, and Gemini declined every field (name,
  brand, size) and said it found no public record for that number. Honest, but no answer. Source:
  the Gemini website test, piece 3, on the Notion page "Shin: who is working on what" (commit 3389b1d
  holds the fixture).

**Questions to answer (not decided)**
- Is there an easier way to send a barcode than the digits alone?
- Can a barcode be sent as something Gemini can interpret properly, for example the picture of it, or
  digits together with the picture, or the code with its format named?
- What does the phone's reader already know that is thrown away before the scan (symbology, the frame
  it read from)?

**Constraint that still applies:** one Gemini call per scan.
