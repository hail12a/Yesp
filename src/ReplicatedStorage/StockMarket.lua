--!strict
-- ============================================================
-- StockMarket  (ModuleScript)
-- Place in: ReplicatedStorage
--
-- A GLOBAL, deterministic stock market. Prices are a pure function of
-- server time (workspace:GetServerTimeNow()), so every server AND the
-- client compute the exact same price at the same instant — no syncing,
-- no DataStore needed for prices. The server is still the source of
-- truth for trades (it recomputes the price when you buy/sell).
--
-- 5 places to invest. Each has its own volatility / dividend yield.
-- ============================================================

local StockMarket = {}

-- 5 investable companies. `seed` makes each move independently.
StockMarket.COMPANIES = {
	{ id = "LWB",  name = "Little World Bank",   base = 42,   vol = 0.5, div = 0.045, seed = 11, color = Color3.fromRGB(60, 150, 235) },
	{ id = "NOVA", name = "Novalis Media",       base = 88,   vol = 1.5, div = 0.010, seed = 27, color = Color3.fromRGB(236, 64, 170) },
	{ id = "AUTO", name = "AutoWorks Motors",    base = 63,   vol = 1.1, div = 0.020, seed = 39, color = Color3.fromRGB(235, 150, 60) },
	{ id = "DOEX", name = "Dept. of Economy ETF", base = 120, vol = 0.7, div = 0.030, seed = 53, color = Color3.fromRGB(90, 200, 130) },
	{ id = "RBLX", name = "Roblux Holdings",     base = 250,  vol = 0.9, div = 0.008, seed = 71, color = Color3.fromRGB(150, 90, 245) },
}

local byId = {}
for _, c in ipairs(StockMarket.COMPANIES) do byId[c.id] = c end

function StockMarket.get(id)
	return byId[id]
end

-- deterministic xorshift noise -> [0,1)  (shift/xor only = identical on all platforms)
local function rand01(n)
	n = bit32.band(n, 0xffffffff)
	n = bit32.bxor(n, bit32.lshift(n, 13))
	n = bit32.bxor(n, bit32.rshift(n, 17))
	n = bit32.bxor(n, bit32.lshift(n, 5))
	return bit32.band(n, 0xffffffff) / 4294967296
end

-- smooth interpolated noise between 20s buckets so the price wiggles naturally
local function smoothNoise(t, seed)
	local bucket = 20
	local b = t / bucket
	local b0 = math.floor(b)
	local frac = b - b0
	local n0 = rand01(b0 + seed)
	local n1 = rand01(b0 + 1 + seed)
	local s = frac * frac * (3 - 2 * frac)   -- smoothstep
	return n0 + (n1 - n0) * s                 -- 0..1
end

-- Price of a company at server-time t.
function StockMarket.priceAt(company, t)
	if type(company) == "string" then company = byId[company] end
	if not company then return 0 end
	local vol = company.vol
	local noise = (smoothNoise(t, company.seed) - 0.5) * 0.10 * vol      -- +/- ~5% * vol, jittery
	local fast  = math.sin(t / 70  + company.seed * 3) * 0.03 * vol       -- fast intraday wave
	local slow  = math.sin(t / 1800 + company.seed) * 0.06                -- ~30 min trend +/-6%
	local drift = math.sin(t / 21600 + company.seed * 0.5) * 0.05         -- ~6h slow drift
	local pct = noise + fast + slow + drift
	return math.max(1, company.base * (1 + pct))
end

-- Convenience: price right now (uses synced server time; works on client too).
function StockMarket.priceNow(company)
	return StockMarket.priceAt(company, workspace:GetServerTimeNow())
end

-- % change over the last `window` seconds (default 10 min) — for the up/down arrow.
function StockMarket.changePct(company, window)
	window = window or 600
	local now = workspace:GetServerTimeNow()
	local a = StockMarket.priceAt(company, now)
	local b = StockMarket.priceAt(company, now - window)
	if b <= 0 then return 0 end
	return (a - b) / b * 100
end

return StockMarket
