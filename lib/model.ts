// Token Radar's model, version radar-2: one snapshot of the protocol universe in, one ranked
// board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol
// is pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown with the market's own values, never mixed
// into the ranked board.
//
// Implied value follows only from the snapshot's own figures, five factors of one function:
//
//   base      = tvl_usd x BASE_MULTIPLE                         (size)
//   growth    = clamp(change_7d, -60, 120) per cent            (seven-day change)
//   growthMult    = 1 + growth / 100 x GROWTH_WEIGHT
//   momentumMult  = 1 + max(0, min(growth - 20, 80)) / 100 x MOMENTUM_WEIGHT
//                   (a premium only for accelerating growth: TVL arriving fast)
//   maturityMult  = MATURITY_FLOOR + min(age_days, 1460) / 1460 x MATURITY_RANGE
//                   (how long it has run with no token; age unknown: 365 days)
//   chainMult     = 1 + CHAIN_STEP x min(chains - 1, 5)        (distribution breadth)
//   implied   = max(1, round(base x growthMult x momentumMult x maturityMult x chainMult))
//
// The constants are the radar-2 model's, stated in the dashboard and in the README. No protocol
// name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the README lists them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  momentum_threshold: number;
  momentum_cap: number;
  momentum_weight: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  chain_step: number;
  chain_cap: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  momentum_threshold: 20,
  momentum_cap: 80,
  momentum_weight: 0.25,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1460,
  chain_step: 0.03,
  chain_cap: 5,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the README quotes it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    momentum_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  momentum_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The five multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): {
  implied: number;
  growthPct: number;
  growthMult: number;
  momentumMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const above = Math.max(0, Math.min(growthPct - model.momentum_threshold, model.momentum_cap));
  const momentumMult = 1 + (above / 100) * model.momentum_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap);
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * momentumMult * maturityMult * chainMult));
  return { implied, growthPct, growthMult, momentumMult, maturityMult, chainMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      momentum_multiplier: round4(s.momentumMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The gas token of a chain as the snapshot names it; a chain the map does not know falls back. */
export function gasToken(chain: string): string {
  const map: Record<string, string> = {
    Ethereum: 'ETH',
    Solana: 'SOL',
    Bitcoin: 'BTC',
    Binance: 'BNB',
    Arbitrum: 'ETH',
    Base: 'ETH',
    Avalanche: 'AVAX',
    Polygon: 'POL',
    Optimism: 'ETH',
    Monad: 'MON',
    'Hyperliquid L1': 'HYPE',
    Tron: 'TRX',
    Ripple: 'XRP',
    Plasma: 'XPL',
    Sui: 'SUI',
    Cardano: 'ADA',
    'Robinhood Chain': 'ETH',
    Linea: 'ETH',
    Sonic: 'S',
    Berachain: 'BERA',
    Litecoin: 'LTC',
    TON: 'TON',
    Doge: 'DOGE',
    Stellar: 'XLM',
    Flare: 'FLR',
    Unichain: 'ETH',
    Scroll: 'ETH',
    Mantle: 'MNT',
    Arc: 'USDC',
    Starknet: 'STRK',
    'Plume Mainnet': 'PLUME',
    Algorand: 'ALGO',
    Aptos: 'APT',
    'zkSync Era': 'ETH',
    Katana: 'ETH',
    Polkadot: 'DOT',
    Fantom: 'FTM',
    Sei: 'SEI',
    Hemi: 'ETH',
    Near: 'NEAR',
    EOS: 'EOS',
    Ink: 'ETH',
    Morph: 'ETH',
    Celo: 'CELO',
    CORE: 'CORE',
    TAC: 'TON',
    Pharos: 'PHRS',
    Cosmos: 'ATOM',
    XDC: 'XDC',
    Kava: 'KAVA',
    'World Chain': 'ETH',
    BOB: 'ETH',
    Zcash: 'ZEC',
    Bittensor: 'TAO',
    Klaytn: 'KAIA',
    Astar: 'ASTR',
    Stable: 'USDT0',
    Tempo: 'USD',
    RSK: 'RBTC',
    'X Layer': 'OKB',
    Blast: 'ETH',
    Hedera: 'HBAR',
    MegaETH: 'ETH',
    Cronos: 'CRO',
    Stacks: 'STX',
    Metis: 'METIS',
    Taiko: 'ETH',
    Manta: 'MANTA',
    Ronin: 'RON',
    Provenance: 'HASH',
    Op_Bnb: 'BNB',
    Mezo: 'BTC',
    Citrea: 'BTC',
    Etherlink: 'XTZ',
    Fluent: 'ETH',
    Telos: 'TLOS',
    'Babylon Genesis': 'BABY',
    'Bifrost Network': 'BFC',
    Tezos: 'XTZ',
    Elrond: 'EGLD',
    EthereumClassic: 'ETC',
    Injective: 'INJ',
    Filecoin: 'FIL',
    ICP: 'ICP',
    Canton: 'CC',
    Celestia: 'TIA',
    Qubic: 'QUBIC',
    Thorchain: 'RUNE',
    dYdX: 'DYDX',
    XION: 'XION',
    Proton: 'XPR',
    'Bittensor EVM': 'TAO',
    ZIGChain: 'ZIG',
    BSquared: 'BTC',
    RISE: 'ETH',
    Fraxtal: 'frxETH',
    Lisk: 'LSK',
    'Elysium Kinetiq': 'HYPE',
    Noble: 'USDC',
    Sophon: 'SOPH',
    OKExChain: 'OKB',
    Mode: 'ETH',
    Zircuit: 'ETH',
    'Polygon zkEVM': 'ETH',
    Moonbeam: 'GLMR',
    ZetaChain: 'ZETA',
    Saga: 'SAGA',
    Soneium: 'ETH',
    Goat: 'GOAT',
    Bitlayer: 'BTC',
    Zilliqa: 'ZIL',
    'Pi Network': 'PI',
    Kaspa: 'KAS',
    'BSV Blockchain': 'BSV',
    Arweave: 'AR',
    Conflux: 'CFX',
    Terra: 'LUNA',
    Allora: 'ALLO',
    Oasis: 'ROSE',
    Mina: 'MINA',
    'Fetch Hub': 'FET',
    Nervos: 'CKB',
    Alephium: 'ALPH',
    Kusama: 'KSM',
    PlatON: 'LAT',
    Massa: 'MAS',
    Neo3: 'NEO',
    Ontology: 'ONT',
    Orai: 'ORAI',
    Mantra: 'OM',
    Osmosis: 'OSMO',
    BandChain: 'BAND',
    Bitcoincash: 'BCH',
    Harmony: 'ONE',
    Initia: 'INIT',
    VeChain: 'VET',
    Dash: 'DASH',
    'Arbitrum Nova': 'ETH',
    '0G': '0G',
    'HashKey Chain': 'HSK',
    Shibarium: 'BONE',
    Chiliz: 'CHZ',
    EthereumPoW: 'ETHW',
    Aleo: 'ALEO',
    Endurance: 'ACE',
    Mixin: 'XIN',
    Hibachi: 'ETH',
    'XRPL EVM': 'XRP',
    Kucoin: 'KCS',
    Rayls: 'RLS',
    Plume: 'PLUME',
    Swellchain: 'ETH',
    'Reya Network': 'ETH',
    Anubis: 'ETH',
    HeLa: 'HLUSD',
    Corn: 'BTCN',
    Nibiru: 'NIBI',
    ApeChain: 'APE',
    zkLink: 'ZKL',
    Evmos: 'EVMOS',
    ThunderCore: 'TT',
    Strato: 'STRAX',
    Flow: 'FLOW',
    Peaq: 'PEAQ',
    Pulse: 'PLS',
    MetalL2: 'ETH',
    Wanchain: 'WAN',
    Moonriver: 'MOVR',
    FunctionX: 'FX',
    Bitrock: 'BROCK',
    Energi: 'NRG',
    Odyssey: 'ETH',
    Songbird: 'SGB',
    WEMIX: 'WEMIX',
    Story: 'IP',
  };
  return map[chain] ?? 'the chain’s gas token';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's first action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized'))
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm') || c.includes('liquidity manager'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading') || c.includes('options vault'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} into ${name}'s top vault on ${chain} and keep the shares.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC onto ${name}'s chain and use its native app on ${chain}.`;
  if (c.includes('payment') || c.includes('card')) return `Load $${capital} onto ${name} and make one payment through it.`;
  if (c.includes('governance')) return `Lock $${capital} of the governance asset through ${name} and vote on one proposal.`;
  if (c.includes('privacy')) return `Deposit $${capital} through ${name}'s private pool on ${chain}.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action: the repeatable step that keeps the wallet active. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized'))
    return `Borrow $10 against your supply on ${name} and repay it in the same week, so the wallet shows borrowing as well as supplying.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm') || c.includes('liquidity manager'))
    return `Swap $25 through ${name}'s main pool on ${chain} once a week, so the wallet shows trading as well as liquidity.`;
  if (c.includes('bridge')) return `Bridge $25 back across ${name} once a week, so the wallet shows movement in both directions.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim the staking rewards from ${name} once a week and restake them in the same transaction.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading') || c.includes('options vault'))
    return `Close the hedge on ${name} once a week and open a fresh one, so the wallet shows regular trading.`;
  if (c.includes('prediction')) return `Settle one small market position on ${name} each week and place a new one.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $25 more into the ${name} vault once a week, so the position grows instead of sitting still.`;
  if (c.includes('stable')) return `Mint $25 more of the stable asset through ${name} once a week.`;
  if (c.includes('rwa')) return `Buy $25 more of the yield asset through ${name} once a week.`;
  if (c.includes('insurance')) return `Check the cover from ${name} once a week and top it up before it lapses.`;
  if (c.includes('yield aggregator')) return `Harvest the yield from ${name} once a week and redeposit it into the same vault.`;
  if (c.includes('chain')) return `Make one transaction on ${name}'s chain each week, so the wallet stays active on it.`;
  if (c.includes('payment') || c.includes('card')) return `Make one payment a week through ${name}, even a small one.`;
  if (c.includes('governance')) return `Vote on one proposal a week through ${name}.`;
  if (c.includes('privacy')) return `Make one private transfer a week through ${name}.`;
  if (c.includes('index')) return `Add $25 to the ${name} index once a week.`;
  return `Make one qualifying action each week, such as a deposit, a swap or a vote on ${name}.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Step 4 differs by chain count: a multi-chain protocol gets a second-chain position, a
 * single-chain one gets a second, different action on the same chain.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasToken(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const step4: FarmStep =
    secondChain !== null
      ? {
          text: `Repeat the deposit on ${secondChain} with $${Math.max(25, Math.round(capital / 2))} so the position is visible on both chains.`,
          cost: `$${Math.max(25, Math.round(capital / 2))} of capital and about $2 of gas`,
          time: '15 minutes',
        }
      : {
          text: `Deepen the position: add $${Math.max(25, Math.round(capital / 2))} more to the ${p.name} position on ${chain} so the activity is not a single deposit.`,
          cost: `$${Math.max(25, Math.round(capital / 2))} of capital and about $2 of gas`,
          time: '15 minutes',
        };
  return [
    {
      text: `Open a fresh wallet for this farm and load it with $10 of ${gas} on ${chain} for gas, keeping the seed phrase offline.`,
      cost: `$10 of ${gas} plus about $${chain === 'Ethereum' ? 8 : 2} of gas to set up`,
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p, chain),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    step4,
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, watch the protocol's own announcements for a launch, and claim only from links the protocol itself publishes.`,
      cost: 'nothing but the log',
      time: '5 minutes a week',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    momentum_multiplier: row.model.momentum_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watch)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
