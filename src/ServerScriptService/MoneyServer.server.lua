-- ============================================================
-- MoneyServer  (Script)
-- Place in: ServerScriptService
--
-- - Money stored in leaderstats (shows on Roblox leaderboard)
-- - Saved with DataStore (persists between joins)
-- - 50,000 starter cash for brand-new players
-- - +650 every 5 minutes
-- ============================================================

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

local moneyStore = DataStoreService:GetDataStore("MoneyStore_v1")

local STARTER_CASH = 50000
local PAYOUT_AMOUNT = 650
local PAYOUT_INTERVAL = 300  -- 5 minutes in seconds

-- ===== Load / setup a player =====
local function onPlayerAdded(player)
	-- leaderstats folder
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	leaderstats.Parent = player

	local money = Instance.new("IntValue")
	money.Name = "Money"
	money.Parent = leaderstats

	-- try to load saved money
	local saved = nil
	local ok, err = pcall(function()
		saved = moneyStore:GetAsync("Player_" .. player.UserId)
	end)
	if not ok then
		warn("[Money] load failed for", player.Name, ":", err)
	end

	if saved ~= nil then
		money.Value = saved
	else
		-- brand new player
		money.Value = STARTER_CASH
	end
end

-- ===== Save a player =====
local function savePlayer(player)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then return end
	local money = leaderstats:FindFirstChild("Money")
	if not money then return end

	local ok, err = pcall(function()
		moneyStore:SetAsync("Player_" .. player.UserId, money.Value)
	end)
	if not ok then
		warn("[Money] save failed for", player.Name, ":", err)
	end
end

Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(savePlayer)

-- save all on shutdown (so nobody loses cash on server close)
game:BindToClose(function()
	for _, player in ipairs(Players:GetPlayers()) do
		savePlayer(player)
	end
end)

-- ===== Timed payout: +650 every 5 minutes =====
task.spawn(function()
	while true do
		task.wait(PAYOUT_INTERVAL)
		for _, player in ipairs(Players:GetPlayers()) do
			local leaderstats = player:FindFirstChild("leaderstats")
			if leaderstats then
				local money = leaderstats:FindFirstChild("Money")
				if money then
					money.Value = money.Value + PAYOUT_AMOUNT
				end
			end
		end
	end
end)
