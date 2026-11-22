Jamin: the welcome flow is switched back on (`FLAGS.onboarding` true), on Aurik's word 2026-11-22, as a five-screen cut of the Cal AI onboarding: welcome, gender (optional), how often you grocery shop, where you shop, camera and location. Then a four-card "How Pexi works" walkthrough, then the camera. Your 2026-09-21 call switched the 30-step version off; this is the short one, inside the UX doc's five-screen ceiling (R-77). docs/decisions.md has the entry.

Two things need you:
1. **Privacy policy (EN and FR):** it must name the welcome answers, gender above all, as collected (tied to the device id, used for product and marketing research, stoppable with You, Share usage data). Gender is personal information under Quebec Law 25 and Apple 5.1.1. It is optional on screen ("Prefer not to say", and Skip). Please add it before a store build goes out with this.
2. **Server side:** the answers arrive as `onboarding_answer` events (step, key, value) through the usual queue. If the funnel report should split by them, that is yours.

Not seen on a phone. Delete this file once read.
