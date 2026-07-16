-- ============================================================
-- BankServer  (Script)
-- Place in: ServerScriptService
--
-- The backend for NovalOS > Browser > Little World Bank.
--   - Send money to another player in the server:
--       * recipient receives 90% of the amount
--       * 5% bank fee + 5% economy tax  -> Department of Economy (DOE) global pool
--   - Savings account (4.25% APY, deposit / withdraw vs checking)
--   - Global stock market (5 companies, buy/sell by dollar amount, DRIP)
--   - Full transaction history per player (incl. car purchases via BankLog)
--   - DOE global pool + DOE ledger, visible ONLY to "D2Here4game"
--
-- Auto-creates its own remotes so there is nothing to place by hand:
--   ReplicatedStorage > RemoteFunction "BankRequest"
--   ReplicatedStorage > RemoteEvent    "BankNotify"
--   ReplicatedStorage > BindableEvent  "BankLog"   (other scripts fire this
--       to log a transaction: BankLog:Fire(userId, {desc=, cat=, amt=}))
--
-- Requires: leaderstats.Money (MoneyServer), ReplicatedStorage.StockMarket
-- ============================================================

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService  = game:GetService("DataStoreService")

local StockMarket = require(ReplicatedStorage:WaitForChild("StockMarket"))

local DOE_OWNER = "D2Here4game"    -- only this user sees the DOE panel
local SEND_FEE_BANK = 0.05         -- 5% bank fee
local SEND_FEE_DOE  = 0.05         -- 5% economy tax
local SAVINGS_APY   = 0.0425       -- 4.25%
local ACCRUE_EVERY  = 300          -- seconds between interest/dividend runs
local MAX_TX        = 60           -- transactions kept per player

-- ===== remotes (auto-create) =====
local function ensure(className, name)
	local inst = ReplicatedStorage:FindFirstChild(name)
	if not inst then
		inst = Instance.new(className)
		inst.Name = name
		inst.Parent = ReplicatedStorage
	end
	return inst
end
local bankRequest = ensure("RemoteFunction", "BankRequest")
local bankNotify  = ensure("RemoteEvent",    "BankNotify")
local bankLog     = ensure("BindableEvent",  "BankLog")

-- ===== DataStores =====
local bankStore = DataStoreService:GetDataStore("BankData_v1")
local doeStore  = DataStoreService:GetDataStore("DOE_Global_v1")

-- in-memory: [userId] = { savings=, holdings={id=shares}, drip=bool, tx={...} }
local data = {}

local function blank()
	return { savings = 0, holdings = {}, drip = false, tx = {} }
end

local function load(player)
	local d = nil
	local ok = pcall(function() d = bankStore:GetAsync("Bank_" .. player.UserId) end)
	if ok and type(d) == "table" then
		d.savings  = tonumber(d.savings) or 0
		d.holdings = d.holdings or {}
		d.drip     = d.drip and true or false
		d.tx       = d.tx or {}
		data[player.UserId] = d
	else
		data[player.UserId] = blank()
	end
end

local function save(player)
	local d = data[player.UserId]
	if not d then return end
	pcall(function() bankStore:SetAsync("Bank_" .. player.UserId, d) end)
end

Players.PlayerAdded:Connect(load)
Players.PlayerRemoving:Connect(function(p) save(p) data[p.UserId] = nil end)
game:BindToClose(function()
	for _, p in ipairs(Players:GetPlayers()) do save(p) end
end)
for _, p in ipairs(Players:GetPlayers()) do load(p) end

-- ===== money helpers =====
local function moneyOf(player)
	local ls = player:FindFirstChild("leaderstats")
	return ls and ls:FindFirstChild("Money")
end
local function checking(player)
	local m = moneyOf(player)
	return m and m.Value or 0
end

local function commas(n)
	local s = tostring(math.floor(math.abs(n)))
	s = s:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", "")
	return (n < 0 and "-" or "") .. s
end

-- ===== transactions =====
local function addTx(userId, desc, cat, amt)
	local d = data[userId]
	if not d then return end
	local player = Players:GetPlayerByUserId(userId)
	local bal = player and checking(player) or 0
	table.insert(d.tx, 1, {
		t = os.time(),
		desc = desc,
		cat = cat or "General",
		amt = amt,
		bal = bal,
	})
	while #d.tx > MAX_TX do table.remove(d.tx) end
end

-- other server scripts (e.g. DealershipServer) log here
bankLog.Event:Connect(function(userId, entry)
	if type(entry) ~= "table" then return end
	addTx(userId, tostring(entry.desc or "Transaction"), entry.cat, tonumber(entry.amt) or 0)
end)

-- ===== DOE global pool (atomic across servers) =====
local function doeAdd(amount, ledgerEntry)
	pcall(function()
		doeStore:UpdateAsync("DOE", function(old)
			old = (type(old) == "table") and old or { pool = 0, tx = {} }
			old.pool = (tonumber(old.pool) or 0) + amount
			old.tx = old.tx or {}
			if ledgerEntry then
				table.insert(old.tx, 1, ledgerEntry)
				while #old.tx > 120 do table.remove(old.tx) end
			end
			return old
		end)
	end)
end
local function doeGet()
	local d = nil
	pcall(function() d = doeStore:GetAsync("DOE") end)
	if type(d) == "table" then
		d.pool = tonumber(d.pool) or 0
		d.tx = d.tx or {}
		return d
	end
	return { pool = 0, tx = {} }
end

-- ===== portfolio value =====
local function portfolioValue(userId)
	local d = data[userId]
	if not d then return 0 end
	local total = 0
	for id, shares in pairs(d.holdings) do
		local c = StockMarket.get(id)
		if c then total = total + shares * StockMarket.priceAt(c, workspace:GetServerTimeNow()) end
	end
	return total
end

-- ===== snapshot the client renders =====
local function snapshot(player)
	local d = data[player.UserId]
	if not d then return { ok = false, msg = "No account." } end

	local holdings = {}
	for id, shares in pairs(d.holdings) do
		if shares and shares > 0.0000001 then holdings[id] = shares end
	end

	local snap = {
		ok = true,
		name = player.DisplayName,
		checking = checking(player),
		savings = d.savings,
		portfolio = portfolioValue(player.UserId),
		holdings = holdings,
		drip = d.drip,
		tx = d.tx,
		isDOE = (player.Name == DOE_OWNER),
		savingsAPY = SAVINGS_APY,
		feeBank = SEND_FEE_BANK,
		feeDOE = SEND_FEE_DOE,
	}
	if snap.isDOE then
		snap.doe = doeGet()
	end
	return snap
end

-- ===== request handler =====
bankRequest.OnServerInvoke = function(player, action, arg1, arg2)
	local d = data[player.UserId]
	if not d then load(player) d = data[player.UserId] end

	if action == "getdata" then
		return snapshot(player)
	end

	-- ---- SEND MONEY ----
	if action == "send" then
		local target = nil
		if type(arg1) == "string" then
			for _, p in ipairs(Players:GetPlayers()) do
				if p.Name:lower() == arg1:lower() or p.DisplayName:lower() == arg1:lower() then target = p break end
			end
		end
		if not target then return { ok = false, msg = "Player not in server." } end
		if target == player then return { ok = false, msg = "You can't send to yourself." } end
		local amount = math.floor(tonumber(arg2) or 0)
		if amount <= 0 then return { ok = false, msg = "Enter a valid amount." } end
		local myM = moneyOf(player)
		if not myM then return { ok = false, msg = "No account." } end
		if myM.Value < amount then return { ok = false, msg = "Insufficient funds." } end

		local feeBank = math.floor(amount * SEND_FEE_BANK)
		local feeDOE  = math.floor(amount * SEND_FEE_DOE)
		local received = amount - feeBank - feeDOE
		local tgtM = moneyOf(target)
		if not tgtM then return { ok = false, msg = "Recipient has no account." } end

		myM.Value = myM.Value - amount
		tgtM.Value = tgtM.Value + received

		addTx(player.UserId, "Transfer to " .. target.DisplayName, "Transfer", -amount)
		addTx(target.UserId, "Transfer from " .. player.DisplayName, "Transfer", received)

		-- route both 5% cuts to the DOE global pool, logged separately
		doeAdd(feeBank + feeDOE, {
			t = os.time(),
			from = player.Name,
			to = target.Name,
			bank = feeBank,
			economy = feeDOE,
			amount = amount,
		})

		bankNotify:FireClient(target, ("You received $%s from %s"):format(commas(received), player.DisplayName))
		bankNotify:FireClient(player, ("Sent $%s to %s (fees $%s)"):format(commas(received), target.DisplayName, commas(feeBank + feeDOE)))
		return {
			ok = true,
			msg = ("Sent $%s (fees $%s)"):format(commas(received), commas(feeBank + feeDOE)),
			data = snapshot(player),
		}
	end

	-- ---- SAVINGS ----
	if action == "deposit" or action == "withdraw" then
		local amount = math.floor(tonumber(arg1) or 0)
		if amount <= 0 then return { ok = false, msg = "Enter a valid amount." } end
		local m = moneyOf(player)
		if not m then return { ok = false, msg = "No account." } end
		if action == "deposit" then
			if m.Value < amount then return { ok = false, msg = "Insufficient checking funds." } end
			m.Value = m.Value - amount
			d.savings = d.savings + amount
			addTx(player.UserId, "Transfer to Savings", "Savings", -amount)
		else
			if d.savings < amount then return { ok = false, msg = "Insufficient savings." } end
			d.savings = d.savings - amount
			m.Value = m.Value + amount
			addTx(player.UserId, "Transfer from Savings", "Savings", amount)
		end
		return { ok = true, msg = "Transfer complete.", data = snapshot(player) }
	end

	-- ---- STOCKS ----
	if action == "buystock" then
		local c = StockMarket.get(tostring(arg1))
		if not c then return { ok = false, msg = "Unknown stock." } end
		local dollars = math.floor(tonumber(arg2) or 0)
		if dollars <= 0 then return { ok = false, msg = "Enter a valid amount." } end
		local m = moneyOf(player)
		if not m then return { ok = false, msg = "No account." } end
		if m.Value < dollars then return { ok = false, msg = "Insufficient funds." } end
		local price = StockMarket.priceAt(c, workspace:GetServerTimeNow())
		local shares = dollars / price
		m.Value = m.Value - dollars
		d.holdings[c.id] = (d.holdings[c.id] or 0) + shares
		addTx(player.UserId, ("Bought %s (%.3f sh @ $%.2f)"):format(c.id, shares, price), "Invest", -dollars)
		return { ok = true, msg = ("Bought %.3f %s"):format(shares, c.id), data = snapshot(player) }
	end

	if action == "sellstock" then
		local c = StockMarket.get(tostring(arg1))
		if not c then return { ok = false, msg = "Unknown stock." } end
		local have = d.holdings[c.id] or 0
		if have <= 0 then return { ok = false, msg = "You don't own " .. c.id .. "." } end
		local price = StockMarket.priceAt(c, workspace:GetServerTimeNow())
		local sharesToSell
		if tonumber(arg2) and tonumber(arg2) > 0 then
			sharesToSell = math.min(have, tonumber(arg2) / price)  -- arg2 = dollar amount
		else
			sharesToSell = have                                     -- sell all
		end
		local proceeds = math.floor(sharesToSell * price)
		d.holdings[c.id] = have - sharesToSell
		if d.holdings[c.id] < 0.0000001 then d.holdings[c.id] = nil end
		local m = moneyOf(player)
		if m then m.Value = m.Value + proceeds end
		addTx(player.UserId, ("Sold %s (%.3f sh @ $%.2f)"):format(c.id, sharesToSell, price), "Invest", proceeds)
		return { ok = true, msg = ("Sold for $%s"):format(commas(proceeds)), data = snapshot(player) }
	end

	if action == "drip" then
		d.drip = (tonumber(arg1) == 1)
		return { ok = true, msg = d.drip and "Dividend reinvest ON." or "Dividend reinvest OFF.", data = snapshot(player) }
	end

	-- ---- DOE (owner only) ----
	if action == "doedata" then
		if player.Name ~= DOE_OWNER then return { ok = false, msg = "Access denied." } end
		return { ok = true, doe = doeGet() }
	end

	return { ok = false, msg = "Unknown action." }
end

-- ============================================================
-- Interest + dividends accrual loop
-- ============================================================
task.spawn(function()
	while true do
		task.wait(ACCRUE_EVERY)
		local now = workspace:GetServerTimeNow()
		local yearFrac = ACCRUE_EVERY / 31557600
		for _, p in ipairs(Players:GetPlayers()) do
			local d = data[p.UserId]
			if d then
				-- savings interest
				local interest = d.savings * SAVINGS_APY * yearFrac
				-- stock dividends
				local dividends = 0
				for id, shares in pairs(d.holdings) do
					local c = StockMarket.get(id)
					if c then
						local price = StockMarket.priceAt(c, now)
						local div = shares * price * c.div * yearFrac
						dividends = dividends + div
						if d.drip and div > 0 then
							d.holdings[id] = shares + (div / price)  -- reinvest
						end
					end
				end
				if not d.drip then
					d.savings = d.savings + dividends
				end
				d.savings = d.savings + interest
				local gain = interest + (d.drip and 0 or dividends)
				if gain >= 0.5 then
					addTx(p.UserId, "Interest & dividends", "Income", math.floor(gain))
					bankNotify:FireClient(p, ("Earned $%s in interest & dividends"):format(commas(math.floor(gain))))
				end
			end
		end
	end
end)
