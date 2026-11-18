# Token Radar — pre-token protocols ranked by implied launch value

[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/Ladangcuan578/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/Ladangcuan578/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard)

A web dashboard that answers one question: **which pre-token protocol is worth farming next, and what do I do about it?** It reads a sealed snapshot of the protocol universe (DefiLlama, 758 protocols at or above $5M TVL, as of 2026-11-14), ranks the protocols that record no token by what their launch would be worth, and gives each one a concrete farm plan. An entry for make.fun's [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty.

## What it shows

- **The board**: 200 pre-token protocols ranked by implied value — all 40 watchlist protocols (TVL at or above the $50M floor, no token on record) plus 160 early pre-token protocols below the floor, by TVL. Sortable by rank, TVL, 7-day growth and age; filterable by search, category, chain, and watchlist-only.
- **A detail view per protocol**: click any row for the model's own breakdown (every multiplier, recomputed in the page and checked against the board) and its 7-step farm plan, each step with what it costs and how long it takes.
- **A Live token view**: the 24 largest live-token protocols, set aside with their market caps — the market's own values, never mixed into the pre-token ranking.

Implied value is this entry's own claim, never make.fun's, and never a prediction of whether or when a token is issued. A protocol "records no token" in the snapshot; that is DefiLlama's record, not proof it has none.

## The value model (radar-2)

Every row is scored by one function of the snapshot's own figures. No protocol name is special-cased, and no row is hand-picked.

```
implied = round( tvl_usd x 0.25
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (1 + max(0, min(change_7d - 20, 80)) / 100 x 0.25)
  x (0.7 + min(age_days, 1460) / 1460 x 0.3)
  x (1 + 0.03 x min(chains - 1, 5)) )
```

| Constant | Value | What it means |
| --- | --- | --- |
| Base multiple of TVL | 0.25 | A launch is worth a quarter of the value already locked |
| Growth weight | 0.5 | Seven-day TVL change, clamped to -60%…+120% |
| Momentum above / cap / weight | +20% / +80% / 0.25 | A premium only for accelerating growth: capital arriving fast is a stronger signal than capital sitting still |
| Maturity floor / range | 0.7 / 0.3 | How long it has run with no token, saturating at 1,460 days (4 years) |
| Chain step / cap | 0.03 / 5 | Distribution breadth: each extra chain adds 3%, up to 5 |
| Unknown age | 365 days | Used when the snapshot carries no listing date |

**Farm plans** are derived from each protocol's own record — category, chains, TVL and age — never from a hand-written list of names. Capital is sized by TVL tier ($50–$250), the hold period by age (30–60 days), the gas token by chain, and a multi-chain protocol gets a second-chain position while a single-chain one gets a deeper position on its own chain. Each plan has 7 steps: wallet setup, the category action, a weekly qualifying action, the second position, the hold, the points check, and the farm log with launch discipline.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to the kit's input/snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes `board.json` (200 rows) and `data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` with the vendored `vendor/makefun-board.ts`. The dashboard is a static page with no network: `dashboard/index.html`, `app.css` and `app.js` read the `data.js` beside the page. The dashboard source is 44,339 bytes, so the judge reads it whole.

## Top of the board (snapshot 2026-11-14)

1. Steakhouse Financial — $635,533,245
2. Gauntlet — $378,508,185
3. Veda — $357,547,619
4. USDD — $227,735,357
5. Upshift — $126,418,034

## License

MIT — see [LICENSE](LICENSE).
