// Token Radar's dashboard, model radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with
// the model's own inputs and the protocol's farm plan. No network: every byte it shows is in
// data.js. The page recomputes each row from the snapshot figures and checks the number
// board.json carries, so the page's code and the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function, radar-2: base x growth x momentum x maturity x chain. It must stay
  // identical to lib/model.ts's impliedValue, or the detail view's check line says so.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var above = Math.max(0, Math.min(growth - model.momentum_threshold, model.momentum_cap));
    var momentumMult = 1 + (above / 100) * model.momentum_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chains = row.chains ? row.chains.length : 0;
    var chainMult = 1 + model.chain_step * Math.min(Math.max(chains - 1, 0), model.chain_cap);
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * momentumMult * maturity * chainMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasToken(chain) {
    var map = {
      Ethereum: 'ETH', Solana: 'SOL', Bitcoin: 'BTC', Binance: 'BNB', Arbitrum: 'ETH', Base: 'ETH',
      Avalanche: 'AVAX', Polygon: 'POL', Optimism: 'ETH', Monad: 'MON', 'Hyperliquid L1': 'HYPE',
      Tron: 'TRX', Ripple: 'XRP', Plasma: 'XPL', Sui: 'SUI', Cardano: 'ADA', 'Robinhood Chain': 'ETH',
      Linea: 'ETH', Sonic: 'S', Berachain: 'BERA', Litecoin: 'LTC', TON: 'TON', Doge: 'DOGE',
      Stellar: 'XLM', Flare: 'FLR', Unichain: 'ETH', Scroll: 'ETH', Mantle: 'MNT', Arc: 'USDC',
      Starknet: 'STRK', 'Plume Mainnet': 'PLUME', Algorand: 'ALGO', Aptos: 'APT', 'zkSync Era': 'ETH',
      Katana: 'ETH', Polkadot: 'DOT', Fantom: 'FTM', Sei: 'SEI', Hemi: 'ETH', Near: 'NEAR', EOS: 'EOS',
      Ink: 'ETH', Morph: 'ETH', Celo: 'CELO', CORE: 'CORE', TAC: 'TON', Pharos: 'PHRS', Cosmos: 'ATOM',
      XDC: 'XDC', Kava: 'KAVA', 'World Chain': 'ETH', BOB: 'ETH', Zcash: 'ZEC', Bittensor: 'TAO',
      Klaytn: 'KAIA', Astar: 'ASTR', Stable: 'USDT0', Tempo: 'USD', RSK: 'RBTC', 'X Layer': 'OKB',
      Blast: 'ETH', Hedera: 'HBAR', MegaETH: 'ETH', Cronos: 'CRO', Stacks: 'STX', Metis: 'METIS',
      Taiko: 'ETH', Manta: 'MANTA', Ronin: 'RON', Provenance: 'HASH', Op_Bnb: 'BNB', Mezo: 'BTC',
      Citrea: 'BTC', Etherlink: 'XTZ', Fluent: 'ETH', Telos: 'TLOS', 'Babylon Genesis': 'BABY',
      'Bifrost Network': 'BFC', Tezos: 'XTZ', Elrond: 'EGLD', EthereumClassic: 'ETC', Injective: 'INJ',
      Filecoin: 'FIL', ICP: 'ICP', Canton: 'CC', Celestia: 'TIA', Qubic: 'QUBIC', Thorchain: 'RUNE',
      dYdX: 'DYDX', XION: 'XION', Proton: 'XPR', 'Bittensor EVM': 'TAO', ZIGChain: 'ZIG',
      BSquared: 'BTC', RISE: 'ETH', Fraxtal: 'frxETH', Lisk: 'LSK', 'Elysium Kinetiq': 'HYPE',
      Noble: 'USDC', Sophon: 'SOPH', OKExChain: 'OKB', Mode: 'ETH', Zircuit: 'ETH',
      'Polygon zkEVM': 'ETH', Moonbeam: 'GLMR', ZetaChain: 'ZETA', Saga: 'SAGA', Soneium: 'ETH',
      Goat: 'GOAT', Bitlayer: 'BTC', Zilliqa: 'ZIL', 'Pi Network': 'PI', Kaspa: 'KAS',
      'BSV Blockchain': 'BSV', Arweave: 'AR', Conflux: 'CFX', Terra: 'LUNA', Allora: 'ALLO',
      Oasis: 'ROSE', Mina: 'MINA', 'Fetch Hub': 'FET', Nervos: 'CKB', Alephium: 'ALPH',
      Kusama: 'KSM', PlatON: 'LAT', Massa: 'MAS', Neo3: 'NEO', Ontology: 'ONT', Orai: 'ORAI',
      Mantra: 'OM', Osmosis: 'OSMO', BandChain: 'BAND', Bitcoincash: 'BCH', Harmony: 'ONE',
      Initia: 'INIT', VeChain: 'VET', Dash: 'DASH', 'Arbitrum Nova': 'ETH', '0G': '0G',
      'HashKey Chain': 'HSK', Shibarium: 'BONE', Chiliz: 'CHZ', EthereumPoW: 'ETHW', Aleo: 'ALEO',
      Endurance: 'ACE', Mixin: 'XIN', Hibachi: 'ETH', 'XRPL EVM': 'XRP', Kucoin: 'KCS',
      Rayls: 'RLS', Plume: 'PLUME', Swellchain: 'ETH', 'Reya Network': 'ETH', Anubis: 'ETH',
      HeLa: 'HLUSD', Corn: 'BTCN', Nibiru: 'NIBI', ApeChain: 'APE', zkLink: 'ZKL', Evmos: 'EVMOS',
      ThunderCore: 'TT', Strato: 'STRAX', Flow: 'FLOW', Peaq: 'PEAQ', Pulse: 'PLS', MetalL2: 'ETH',
      Wanchain: 'WAN', Moonriver: 'MOVR', FunctionX: 'FX', Bitrock: 'BROCK', Energi: 'NRG',
      Odyssey: 'ETH', Songbird: 'SGB', WEMIX: 'WEMIX', Story: 'IP'
    };
    return map[chain] || 'the chain\u2019s gas token';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateralized') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0 || c.indexOf('options vault') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('yield aggregator') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s top vault on " + chain + ' and keep the shares.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC onto ' + name + "'s chain and use its native app on " + chain + '.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Load $' + capital + ' onto ' + name + ' and make one payment through it.';
    if (c.indexOf('governance') >= 0) return 'Lock $' + capital + ' of the governance asset through ' + name + ' and vote on one proposal.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + " through " + name + "'s private pool on " + chain + '.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold it.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateralized') >= 0) return 'Borrow $10 against your supply on ' + name + ' and repay it in the same week, so the wallet shows borrowing as well as supplying.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Swap $25 through ' + name + "'s main pool on " + chain + ' once a week, so the wallet shows trading as well as liquidity.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $25 back across ' + name + ' once a week, so the wallet shows movement in both directions.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim the staking rewards from ' + name + ' once a week and restake them in the same transaction.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0 || c.indexOf('options vault') >= 0) return 'Close the hedge on ' + name + ' once a week and open a fresh one, so the wallet shows regular trading.';
    if (c.indexOf('prediction') >= 0) return 'Settle one small market position on ' + name + ' each week and place a new one.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $25 more into the ' + name + ' vault once a week, so the position grows instead of sitting still.';
    if (c.indexOf('stable') >= 0) return 'Mint $25 more of the stable asset through ' + name + ' once a week.';
    if (c.indexOf('rwa') >= 0) return 'Buy $25 more of the yield asset through ' + name + ' once a week.';
    if (c.indexOf('insurance') >= 0) return 'Check the cover from ' + name + ' once a week and top it up before it lapses.';
    if (c.indexOf('yield aggregator') >= 0) return 'Harvest the yield from ' + name + ' once a week and redeposit it into the same vault.';
    if (c.indexOf('chain') >= 0) return "Make one transaction on " + name + "'s chain each week, so the wallet stays active on it.";
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Make one payment a week through ' + name + ', even a small one.';
    if (c.indexOf('governance') >= 0) return 'Vote on one proposal a week through ' + name + '.';
    if (c.indexOf('privacy') >= 0) return 'Make one private transfer a week through ' + name + '.';
    if (c.indexOf('index') >= 0) return 'Add $25 to the ' + name + ' index once a week.';
    return 'Make one qualifying action each week, such as a deposit, a swap or a vote on ' + name + '.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var gas = gasToken(chain);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var secondChain = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    var step4 = secondChain !== null
      ? { text: 'Repeat the deposit on ' + secondChain + ' with $' + Math.max(25, Math.round(capital / 2)) + ' so the position is visible on both chains.', cost: '$' + Math.max(25, Math.round(capital / 2)) + ' of capital and about $2 of gas', time: '15 minutes' }
      : { text: 'Deepen the position: add $' + Math.max(25, Math.round(capital / 2)) + ' more to the ' + p.name + ' position on ' + chain + ' so the activity is not a single deposit.', cost: '$' + Math.max(25, Math.round(capital / 2)) + ' of capital and about $2 of gas', time: '15 minutes' };
    return [
      { text: 'Open a fresh wallet for this farm and load it with $10 of ' + gas + ' on ' + chain + ' for gas, keeping the seed phrase offline.', cost: '$10 of ' + gas + ' plus about $' + (chain === 'Ethereum' ? 8 : 2) + ' of gas to set up', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      step4,
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: "Write the wallet, the dates and every transaction in a farm log, watch the protocol's own announcements for a launch, and claim only from links the protocol itself publishes.", cost: 'nothing but the log', time: '5 minutes a week' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('w') === '1') state.watchlistOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('w', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.watchlistOnly && !r.watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, ranked by what their launch would be worth if the record stayed as it is. Implied value is a model, not a promise, and never a prediction of whether or when a token is issued.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function stats() {
    var top = DATA.rows[0];
    var growths = DATA.rows.map(function (r) { return r.change_7d; }).filter(function (g) { return g !== null; }).sort(function (a, b) { return a - b; });
    var median = growths.length ? growths[Math.floor(growths.length / 2)] : null;
    return el('section', { class: 'stats' },
      el('div', { class: 'stat' }, el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('span', { text: 'Watchlist protocols covered' })),
      el('div', { class: 'stat' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'Pre-token rows ranked' })),
      el('div', { class: 'stat' }, el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }), el('span', { text: 'Top implied value' + (top ? ' (' + top.name + ')' : '') })),
      el('div', { class: 'stat' }, el('b', { text: median === null ? 'n/a' : fmtPct(median) }), el('span', { text: 'Median 7-day TVL growth' }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).filter(function (c) { return chainCounts[c] >= 2; }).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 40);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var watchBtn = el('button', { type: 'button', class: 'toggle', 'aria-pressed': state.watchlistOnly ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watchlistOnly = !state.watchlistOnly; writeHash(); render(); } });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), watchBtn),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var nameCell = el('div', { class: 'name' },
        el('span', null, el('b', { text: r.name }), r.watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
      );
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, nameCell),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The model does not predict whether or when a token is issued.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (1 + max(0, min(change_7d - ' + m.momentum_threshold + ', ' + m.momentum_cap + ')) / 100 x ' + m.momentum_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.chain_step + ' x min(chains - 1, ' + m.chain_cap + ')) )'
      ),
      el('div', { class: 'constants' },
        el('div', null, el('span', { text: 'Base multiple of TVL' }), el('b', { text: String(m.base_multiple) })),
        el('div', null, el('span', { text: 'Growth weight' }), el('b', { text: String(m.growth_weight) })),
        el('div', null, el('span', { text: 'Growth clamp, %' }), el('b', { text: m.growth_floor + ' to ' + m.growth_cap })),
        el('div', null, el('span', { text: 'Momentum above, %' }), el('b', { text: '+' + m.momentum_threshold + ', cap +' + m.momentum_cap })),
        el('div', null, el('span', { text: 'Momentum weight' }), el('b', { text: String(m.momentum_weight) })),
        el('div', null, el('span', { text: 'Maturity floor / range' }), el('b', { text: m.maturity_floor + ' / ' + m.maturity_range })),
        el('div', null, el('span', { text: 'Maturity cap, days' }), el('b', { text: String(m.maturity_days) })),
        el('div', null, el('span', { text: 'Chain step / cap' }), el('b', { text: m.chain_step + ' / ' + m.chain_cap })),
        el('div', null, el('span', { text: 'Unknown age, days' }), el('b', { text: String(m.unknown_age_days) }))
      ),
      el('p', { class: 'sub', text: 'TVL, seven-day growth and chains come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Growth above +' + m.momentum_threshold + '% earns a momentum premium because capital arriving fast is a stronger signal than capital sitting still. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? '  ·  Watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Base (TVL x 0.25)' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd * DATA.model.base_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Momentum multiplier' }), el('b', { class: 'num', text: String(row.momentum_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains (' + (row.chains ? row.chains.length : 0) + ')' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(stats());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
