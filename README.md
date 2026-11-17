# Nina Fit

A personal planner and fitness app for the iPhone home screen: a calendar and to-do list, habits,
a food diary with barcode scanning and photo calorie estimates, workout tracking, progress, steps
and readiness from an Oura ring, and an AI coach.

It is a plain web app (no build step) served by one Cloudflare Worker with one D1 database.

## Putting it live

1. Upload everything in this folder to the GitHub repository (replace the old files).
2. Cloudflare redeploys by itself. The database is created automatically on the first deploy,
   and its tables are created automatically the first time the app is opened.

That is the whole deploy. There are no database IDs to paste and no secrets to set.

If the first deploy fails with a message about the D1 database, create one by hand in the
Cloudflare dashboard (Storage & Databases > D1 > Create, name it `nina-fit`), copy its ID, and add
`"database_id": "<that ID>"` next to `"database_name"` in `wrangler.jsonc`.

## First-time setup in the app (about five minutes)

Open the app, go to **Settings** (the sliders button on the Today screen).

1. **Create account.** The first account ever created is the *owner* account. It sees an extra
   card called **App setup (owner)**. Pick a passcode you will remember: there is no reset.
2. **Invite code.** In the owner card, set an invite code (any word). Anyone else creating an
   account, including Nina, types that code. With no code set, new sign-ups are closed.
3. **Coach and meal photos (optional).** Make an API key at <https://console.anthropic.com>
   (add a few dollars of credit), paste it into the owner card and tap Save. This switches on the
   coach, the photo calorie estimate and "Describe it".
4. **Oura (optional).** At <https://cloud.ouraring.com/oauth/applications> create an application.
   For the redirect address, copy the one shown in the owner card. Paste the Client ID and Client
   secret into the owner card and tap Save. Then each person taps **Connect Oura** in their own
   Settings and approves it on Oura's page.

Everything else works without steps 3 and 4.

## Loading a plan (e.g. Road to 120)

A plan is a separate `.json` file, kept **out of this repository** because it holds personal
details. In the app: Settings > Your plan > Load a plan file. The plan then lives in that
person's own data (synced to their account) and drives daily calories and macros by phase,
off days and treat days, weekly targets, the split on Today, the evening check-in, the
pre-workout glucose reminder and what the coach knows. Loading an updated file replaces it.

## What is where

| File | What it does |
| --- | --- |
| `index.html`, `styles.css` | The page shell and the whole look |
| `js/app.js` | Start-up, tabs, the + menu, welcome tour |
| `js/home.js` | Today screen |
| `js/plan.js` | Calendar, to-dos, habits, notes |
| `js/food.js`, `js/foods-db.js`, `js/scan.js` | Food diary, built-in foods, barcode scanner |
| `js/train.js`, `js/workout.js`, `js/exercises.js` | Workout templates and live workout tracking |
| `js/progress.js` | Weight, measurements, strength, photos |
| `js/coach.js` | The AI coach chat |
| `js/oura.js` | Oura steps and readiness (kept apart from the coach on purpose) |
| `js/program.js`, `js/road.js` | A loaded plan: the day-by-day rules, and its screens |
| `js/settings.js`, `js/sync.js`, `js/store.js` | Settings, account and sync, on-phone storage |
| `worker.js` | The server: accounts, sync, food lookup, AI, Oura |
| `vendor/barcode/` | The barcode decoder, bundled so scanning has no outside dependency |

## Privacy rules built into the code

- **Progress photos** never leave the phone. They are not synced, not in backup files, and not
  visible to the coach.
- **Oura data is never sent to the AI.** Oura's API agreement forbids it. The Oura cache lives
  outside the app's main data, the readiness note is plain if/else rules, and `coach.js` never
  imports `oura.js` (or `road.js`, which reads Oura steps). Keep it that way when changing things.
- API keys are stored on the server and are never sent back to a phone.

## Limits worth knowing

- Sync is "last write wins" per account. It suits one person on one or two devices.
- There is no passcode reset. A forgotten passcode means a new account name.
- Barcode and product search use Open Food Facts, a volunteer database. US coverage is good but
  not complete, and entries can be wrong, so check against the label. Anything missing can be
  added by hand once and is remembered.
- Photo and description estimates are estimates. Expect them to be in the right range, not exact.
- Each account can send up to 120 coach messages and 40 meal estimates a day.
- Apple Health cannot be read by a web app, so steps come from Oura or are typed in.

- The AI model in use (Claude Sonnet 5.5) rejects forced tool calls, so meal estimates use
  structured output (`output_config.format`). Keep that in mind if the model is changed.

## Testing locally

```
npx wrangler dev --local
```

Then open http://localhost:8787.
