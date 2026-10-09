# Cal AI's setup flow: what it does and why it works (2026-10-09)

Jamin, 2026-10-09: *"i really like cal ai's setup screen. It should be saved in the shin repo."*
This is the screen-by-screen record of Cal AI's onboarding as it ships in 2026, the mechanism
behind it, and how Shin's own 31-step setup (`app/public/js/onboarding-flow.js`, built 2026-09-16/17
from his Google Doc tab of Cal AI's screens with his replacement text) lines up against it.

**Source and its limits.** screensdesign.com, Cal AI app page and showcase page
(https://screensdesign.com/apps/cal-ai-calorie-tracker/ , https://screensdesign.com/showcase/cal-ai-calorie-tracker),
screenshots dated April 2026, fetched 2026-10-09. Headlines below are the library's captions, not
verbatim copy. Prices in dollars and exact paywall headlines were not visible. Mobbin, Page Flows
and the App Store listing were not opened. The showcase page counts "28 onboarding steps"; the
listing counts 147 screens; the walk below has 42 because it includes system sheets and modals.

## The 42 screens, in order

| # | Screen | Input | Job |
|---|---|---|---|
| 1 | Splash: icon and name | none | brand |
| 2 | Intro with scanner mockup, Get Started | button | promise |
| 3 | Gender | single choice | data |
| 4 | Workouts per week | single choice | data |
| 5 | Where you heard about the app | single choice | attribution |
| 6 | Tried other calorie apps? | yes/no | sets up screen 7 |
| 7 | Results comparison graph (with the app vs without) | chart | motivation |
| 8 | Height and weight | picker wheels | data |
| 9 | Date of birth | date picker | data |
| 10 | Work with a coach or nutritionist? | yes/no | data |
| 11 | Goal (three options) | single choice | the user names the target |
| 12 | Desired weight | ruler slider | the user sizes the target |
| 13 | Goal message | info | validation of the target |
| 14 | Pace | slider | the user sets the effort |
| 15 | Comparison chart | chart | projection of 11 to 14 |
| 16 | Obstacles to your goal | single choice | names the enemy |
| 17 | Diet (four options) | single choice | data |
| 18 | Health goal (four options) | single choice | data |
| 19 | Weight transition graph | chart | projection again |
| 20 | Privacy notice | info | trust |
| 21 | Connect Apple Health, Continue or Skip | soft ask | pre-permission |
| 22 | Apple Health sheet | system | permission |
| 23 | Add calories burned to goal? | yes/no | setting |
| 24 | Calorie rollover? | yes/no | setting |
| 25 | Rating prompt and modal | system | social proof, at peak optimism |
| 26 | Reviews, write-a-review modal | info | social proof |
| 27 | Notifications pre-screen | soft ask | pre-permission |
| 28 | Notifications sheet | system | permission |
| 29 | Referral code, skippable | text | growth |
| 30 | "All done", Continue builds the plan | button | commitment |
| 31 | App Tracking Transparency | system | permission |
| 32 | Building your plan, 97%, gradient bar, checklist | loading | labour made visible |
| 33 | Custom plan summary with health score | info | the payoff |
| 34 | Instructional cards with citations | info | credibility |
| 35 | Save your progress: Apple, Google, email | sign-up | the plan is the hostage |
| 36 | Email magic link | system | sign-up |
| 37 | Email verification, 30 s resend | system | sign-up |
| 38 | Free trial offer, annual, "Try Now" | paywall | money |
| 39 | Paywall with reminder notification and first-charge date, "Continue for FREE" | paywall | fear removal |
| 40 | 3-day trial, monthly and annual cards, annual preselected | paywall | money |
| 41 | App Store subscription sheet | system | purchase |
| 42 | Purchase success | modal | close |

Order facts: sign-up (35) comes before the paywall (38). The only progress bar seen is the 97%
bar on screen 32 plus an indicator on the sign-up screen; the library shows none on the question
screens. One third-party article says the paywall is A/B tested (eesel, undated, unconfirmed).

## Why it works, read off the structure

1. **Thirty-seven screens of investment before any ask for money.** Every tap is one choice,
   no typing until the optional referral code (29) and the email (36). Length is not the enemy
   when each step costs one tap; the answers are what make the final plan feel like the user's.
2. **A fixed rhythm: three or four questions, then a payoff.** Charts at 7, 15 and 19, a message
   at 13. The user is never more than four taps from being shown something about themselves.
3. **"Tried other apps?" is immediately answered by "this time is different" (6 then 7).**
4. **The user authors the target, then sees it projected (11, 12, 14, then 15).** Goal, size,
   pace, chart. Commitment and hope in four screens. The app never set the goal.
5. **The obstacle is named before the plan (16).** The plan can then be seen to answer it.
6. **Permissions come late and each is pre-framed by a soft screen (21 then 22, 27 then 28).**
   By then the app has earned them.
7. **The rating prompt lands before first use (25), riding peak optimism.**
8. **"All done" then a loading screen with a checklist (30, 32).** The plan is seen being built.
9. **The payoff is free and visible (33, 34): a summary with a score, then cited cards.**
   Citations are the credibility move; the plan looks computed, not asserted.
10. **Sign-up is to save the plan (35), not to start.** The paywall comes only after the plan
    exists, as a trial with the first-charge date and a reminder shown (38 to 40).

## Shin's 31 steps against the original

Shin's flow already carries the skeleton: welcome and promise (1, 2), four to five questions,
figure (8), threshold authored by the user (9, 10), figures (17, 19, 21), thanks (18), preparing
(20), sign-in before trial (22, 23), permissions (24), plans (25), tip cards (26 to 29), then the
first scan's evaluating screen (31). Differences worth knowing, not defects:

- Cal AI's figure screens show its own result claims; Shin's figure screens are hidden until the
  number is real (`needs`, `PUBLISHED_FIGURES`), by his 2026-09-18 ruling on placeholders. Same
  structure, honest fill. This is the rule any sibling app of his copies.
- Cal AI pre-frames each system permission with a soft screen; Shin has one permissions step
  (24). Two soft screens cost nothing and are where Cal AI earns its opt-in rate.
- Cal AI asks the rating before first use (25). Shin has no rating step. His call; Apple allows
  the native prompt three times a year.
- Cal AI's cited cards (34) sit between the payoff and sign-up. Shin's tip cards (26 to 29) sit
  after plans. Moving them before sign-in mirrors the original's credibility-before-commitment order.
- Cal AI's rhythm is question, question, question, chart. Shin runs 3 to 7 as five questions
  before the first figure. One figure earlier would match the original's cadence.
- Cal AI's single visible progress bar is the 97% build screen; Shin's preparing step (20) is
  the equivalent. Keep the checklist naming real work the app does.

Nothing here is a ruling; RULINGS.md "Localization and onboarding" governs the flow.
