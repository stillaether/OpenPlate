# 🍽️ OpenPlate

**A fully open-source meal planner** — an open alternative to Mealime, built for Canada. Plain HTML, CSS and JavaScript.
No frameworks. No build step. No servers. No accounts. No ads. No paywalls.

## Features

- **Fully offline — 861 recipes with real photos bundled** — the complete open libraries (TheMealDB + DummyJSON) ship inside the app as compressed data (~25 MB total, images recompressed to ~29 KB each). No network needed to browse, search, plan or cook. Optional one-tap "check for new recipes" when online.
- **Instant, typo-tolerant search** — the whole offline database is indexed up-front (normalized tokens + trigram fuzzy matching). Results appear **as you type** with no loading spinner, matching across names, ingredients, cuisines and tags. "chiken curry" finds chicken curry. The search input never loses focus.
- **Canadian grocery prices (estimates, CAD)** — every recipe card, recipe detail, plan meal and grocery item shows an estimated price compiled from typical 2025 Canadian shelf prices. Clearly labelled as estimates — actual store prices vary.
- **Price cap ("budget mode")** — set a max $/serving in Settings (or a custom number). The plan generator then skips pricey meals automatically. Want an expensive meal anyway? Open that meal's ⋯ menu and toggle **💎 splurge** — just for that meal, that day.
- **Plan day by day** — tap the **＋** next to any day in your plan to fill just that day: auto-pick recipes for the slots you want, or choose them yourself from the instant-search picker. The full wizard still handles whole weeks (1–7 days, breakfast/lunch/dinner combos, append mode fills free slots).
- **Pantry-aware planning** — keep a pantry list (what's already at home). Pantry items are left off your shopping list, and three planning modes change how recipes are picked: **✨ Best variety**, **🫙 Use what I have** (ranks by how much you already own), **💰 Spend least** (minimizes the cost of new groceries). After shopping, check items off and tap "Add checked to pantry" — the next plan stops asking you to buy them.
- **Canadian grocery stores** — the shopping sheet opens any list item pre-filled in the store's own search: Walmart Canada, Real Canadian Superstore, Loblaws, No Frills, Metro, Food Basics, Sobeys, FreshCo, Instacart and Costco Canada. Star your preferred stores, copy the whole list, or add your own links. OpenPlate earns nothing from these.
- **Smart, customizable meal plans** — days (1–7), meals per day (any combination), servings per meal (type any number, e.g. 5), start day, slot-matched recipes (real breakfasts at breakfast), protein variety, per-meal swap/move/re-scale.
- **Shadowban ("Hidden & blocked")** — hide a recipe, an ingredient ("anything with cilantro"), or a whole food type ("Seafood") from Discover, search and the plan generator — for 7 days or forever. Expired bans clear themselves. Manage everything in Settings.
- **Real photos everywhere** — every bundled recipe has a real photo; your own recipes get photo upload (compressed on-device); the only placeholders left are elegant initial-letter tiles.
- **Servings your way** — every servings control is a stepper + direct number input (1–24): onboarding, plan generator, per-meal overrides and the recipe detail scaler.
- **Auto grocery list** — ingredients merged and de-duplicated across meals, converted to one base unit (cups↔tbsp↔ml, oz↔lb↔g) and sorted into store aisles, with estimated CAD prices and a running total. Pantry staples are filtered out automatically; pantry-covered items are shown separately ("Covered by your pantry") with a one-tap "I'm out" to put them back.
- **Cook Mode** — full-screen step-by-step cooking with auto-detected timers ("simmer for 20 minutes" → tap for a real timer with a bell), ingredient checklist, screen wake-lock, and progress tracking.
- **Cook with what you have** — pick what's in your fridge; recipes are ranked by how much you already own, with the missing items listed.
- **Food-waste impact** — honest, documented estimate of food kept out of the bin, with charts. Adjust the model in Settings.
- **Nutrition estimates** — offline estimator (~100-ingredient table), no API keys, no accounts.
- **Custom recipes** — your own recipe box with photos; joins the planner and grocery list like any other recipe.
- **Offline-ready PWA** — service worker + bundled data. Install it to your home screen; it keeps working without internet.
- **Privacy by design** — every byte lives in your browser's localStorage. Export/import JSON backups or wipe everything anytime.
- **Dark mode, US/metric units, weekly reminders** — all free, forever.

## Run it locally

A static server is needed (the app uses ES modules, which browsers block on `file://`). From the folder containing this README:

```bash
# Option 1 — Python (preinstalled on macOS/Linux)
python3 -m http.server 8000

# Option 2 — Node
npx serve .
```

Then open **http://localhost:8000** in your browser.

The app works from any sub-path too (e.g. `http://localhost:8000/openplate/`) — all asset paths are relative.

To host it publicly: copy this folder to GitHub Pages, Netlify, Cloudflare Pages — anything static.

## Sources & licenses

| Source | What | License |
|---|---|---|
| Built-in library (`js/data-local.js`) | 18 original recipes + staples | CC0 / public domain |
| TheMealDB API | community recipe database | open database, free API |
| DummyJSON recipes | open sample recipe dataset | open, free API |

Grocery prices are OpenPlate's own planning estimates (compiled from typical national shelf prices); store links go straight to each retailer. OpenPlate itself: **MIT License** — fork it, ship it, make it yours.

## Architecture

```
index.html            app shell
css/styles.css        design system
js/util.js            qty parsing, unit conversion, aisles, allergens
js/data-local.js      built-in open recipes (CC0)
js/nutrition.js       offline nutrition estimator
js/prices.js          CAD price estimates + Canadian store deep links
js/sources.js         source adapters + offline pack + instant fuzzy search index
js/store.js           localStorage state layer (plan, groceries, pantry, bans, budget)
js/planner.js         plan generation: modes, price cap, pantry scoring, variety
js/views-*.js         rendering
js/app.js             router + interactions
sw.js                 offline shell
```
