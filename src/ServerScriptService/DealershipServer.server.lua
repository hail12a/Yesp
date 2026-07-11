-- ============================================================
-- DealershipServer  (Script)
-- Place in: ServerScriptService
--
-- Handles: buying, selling, ownership saving (JSON list of car names),
-- and reporting each car's status (OnSale / Limited / Off-Sale) to clients.
--
-- SETUP:
--   ReplicatedStorage > ModuleScript "CarCatalog"
--   ServerStorage    > Folder "DealerCars"  (car Models, PrimaryPart set)
--   ReplicatedStorage > RemoteFunction "DealerRequest"   (buy/sell/getdata)
--   ReplicatedStorage > RemoteEvent    "DealerNotify"    (server -> client msg)
--   Money system (leaderstats.Money) must already exist.
-- ============================================================

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage     = game:GetService("ServerStorage")
local DataStoreService  = game:GetService("DataStoreService")
local HttpService       = game:GetService("HttpService")

print("[Dealer] server starting...")

local CarCatalog  = require(ReplicatedStorage:WaitForChild("CarCatalog"))
print("[Dealer] got CarCatalog")

local dealerCars  = ServerStorage:WaitForChild("DealerCars", 15)
if not dealerCars then
	warn("[Dealer] DealerCars NOT FOUND in ServerStorage after 15s - server cannot work.")
	return
end
print("[Dealer] got DealerCars folder")

local requestFn   = ReplicatedStorage:WaitForChild("DealerRequest", 15)
if not requestFn then warn("[Dealer] DealerRequest missing!") return end

local notifyEvent = ReplicatedStorage:WaitForChild("DealerNotify", 15)
if not notifyEvent then warn("[Dealer] DealerNotify missing!") return end

print("[Dealer] all remotes found, handler will be set up")

local ownStore = DataStoreService:GetDataStore("CarOwnership_v1")

-- in-memory ownership: [userId] = { ["Car Name"] = purchasePrice }
local owned = {}

-- ===== Load / save ownership (stored as JSON) =====
local function loadOwnership(player)
	local data = nil
	local ok, err = pcall(function()
		data = ownStore:GetAsync("Own_" .. player.UserId)
	end)
	if not ok then warn("[Dealer] load failed:", err) end
	if data then
		local decoded = nil
		pcall(function() decoded = HttpService:JSONDecode(data) end)
		owned[player.UserId] = decoded or {}
	else
		owned[player.UserId] = {}
	end
end

local function saveOwnership(player)
	local tbl = owned[player.UserId]
	if not tbl then return end
	local json = HttpService:JSONEncode(tbl)
	local ok, err = pcall(function()
		ownStore:SetAsync("Own_" .. player.UserId, json)
	end)
	if not ok then warn("[Dealer] save failed:", err) end
end

Players.PlayerAdded:Connect(loadOwnership)
Players.PlayerRemoving:Connect(function(player)
	saveOwnership(player)
	owned[player.UserId] = nil
end)
game:BindToClose(function()
	for _, player in ipairs(Players:GetPlayers()) do
		saveOwnership(player)
	end
end)

-- ===== Admin grant hook: give a car and SAVE it as owned =====
local grantEvent = ReplicatedStorage:FindFirstChild("AdminGrantCar")
if not grantEvent then
	grantEvent = Instance.new("BindableEvent")
	grantEvent.Name = "AdminGrantCar"
	grantEvent.Parent = ReplicatedStorage
end
grantEvent.Event:Connect(function(targetPlayer, carName)
	if not targetPlayer or not targetPlayer.Parent then return end
	local tbl = owned[targetPlayer.UserId]
	if not tbl then return end
	local entry = CarCatalog.CARS[carName]
	tbl[carName] = entry and entry.price or 0
	saveOwnership(targetPlayer)
	if notifyEvent then
		notifyEvent:FireClient(targetPlayer, "You received a car: " .. carName .. "!")
	end
end)

-- ===== Money helpers =====
local function getMoney(player)
	local ls = player:FindFirstChild("leaderstats")
	local m = ls and ls:FindFirstChild("Money")
	return m
end

-- Build the full catalog snapshot the client needs to render the shop.
local function buildCatalogSnapshot()
	local list = {}
	local seenModels = {}   -- track which DealerCars models are represented

	-- 1) catalog entries (on-sale, may have variants)
	for carName, entry in pairs(CarCatalog.CARS) do
		local badges = {}
		if CarCatalog.isNew and CarCatalog.isNew(entry) then table.insert(badges, "New") end
		for _, b in ipairs(entry.badges or {}) do table.insert(badges, b) end

		local card = {
			name = carName,
			status = "OnSale",
			badges = badges,
			price = entry.price,
			year = entry.year,
			carType = CarCatalog.getType(entry),   -- NEW: car type for filtering
		}

		if entry.variants then
			card.variants = {}
			for _, v in ipairs(entry.variants) do
				table.insert(card.variants, {
					model = v.model,
					price = v.price or entry.price,
					desc  = v.desc,
					year  = v.year or entry.year,
				})
				seenModels[v.model] = true
			end
			card.previewModel = entry.variants[1] and entry.variants[1].model or carName
		else
			card.previewModel = carName
			seenModels[carName] = true
		end

		table.insert(list, card)
	end

	-- 2) DealerCars models not in the catalog -> Off-Sale cards
	for _, model in ipairs(dealerCars:GetChildren()) do
		if model:IsA("Model") and not seenModels[model.Name] and not CarCatalog.CARS[model.Name] then
			table.insert(list, {
				name = model.Name,
				status = "OffSale",
				badges = { "OffSale" },
				previewModel = model.Name,
				carType = "Normal",   -- off-sale cars default to Normal for filtering
			})
		end
	end

	print("[Dealer] snapshot built with", #list, "cards")
	return list
end

-- ============================================================
-- PREVIEW SHELLS
-- ============================================================
local previewFolder = ReplicatedStorage:FindFirstChild("PreviewCars")
if not previewFolder then
	previewFolder = Instance.new("Folder")
	previewFolder.Name = "PreviewCars"
	previewFolder.Parent = ReplicatedStorage
end

local function stripToVisual(model)
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("Script") or d:IsA("LocalScript") or d:IsA("ModuleScript")
			or d:IsA("Sound") or d:IsA("ProximityPrompt") then
			pcall(function() d:Destroy() end)
		end
	end
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") then
			d.Anchored = true
			d.CanCollide = false
		end
	end
end

local function buildPreviewShells()
	for _, c in ipairs(previewFolder:GetChildren()) do c:Destroy() end
	for _, model in ipairs(dealerCars:GetChildren()) do
		if model:IsA("Model") then
			local shell = model:Clone()
			stripToVisual(shell)
			shell.Parent = previewFolder
		end
	end
	print("[Dealer] built", #previewFolder:GetChildren(), "preview shells")
end

buildPreviewShells()
dealerCars.ChildAdded:Connect(function() task.wait(0.2) buildPreviewShells() end)
dealerCars.ChildRemoved:Connect(function() task.wait(0.2) buildPreviewShells() end)

-- ===== Request handler (buy / sell / getdata) =====
requestFn.OnServerInvoke = function(player, action, carName)
	print("[Dealer] request from", player.Name, "action:", action)
	if action == "getdata" then
		return {
			catalog = buildCatalogSnapshot(),
			owned = owned[player.UserId] or {},
			sellRefund = CarCatalog.SELL_REFUND,
		}
	end

	if type(carName) ~= "string" then return { ok = false, msg = "Invalid car." } end

	if action == "buy" then
		local buyName = carName
		local buyPrice = nil

		local entry = CarCatalog.CARS[carName]
		if entry and not entry.variants then
			buyPrice = entry.price
		else
			for _, e in pairs(CarCatalog.CARS) do
				if e.variants then
					for _, v in ipairs(e.variants) do
						if v.model == carName then
							buyPrice = v.price or e.price
							break
						end
					end
				end
				if buyPrice then break end
			end
		end

		local model = dealerCars:FindFirstChild(carName)
		if not model then return { ok = false, msg = "That car doesn't exist." } end
		if not buyPrice then return { ok = false, msg = "This car is Off-Sale." } end
		local ownedTbl = owned[player.UserId]
		if ownedTbl[buyName] then return { ok = false, msg = "You already own this car." } end
		local m = getMoney(player)
		if not m then return { ok = false, msg = "Money not found." } end
		if m.Value < buyPrice then
			return { ok = false, msg = "Not enough money." }
		end
		m.Value = m.Value - buyPrice
		ownedTbl[buyName] = buyPrice
		saveOwnership(player)
		return { ok = true, msg = "Car bought — enjoy your " .. buyName .. "!" }

	elseif action == "sell" then
		local ownedTbl = owned[player.UserId]
		local paid = ownedTbl[carName]
		if not paid then return { ok = false, msg = "You don't own that car." } end
		local refund = math.floor(paid * CarCatalog.SELL_REFUND)
		local m = getMoney(player)
		if not m then return { ok = false, msg = "Money not found." } end
		m.Value = m.Value + refund
		ownedTbl[carName] = nil
		saveOwnership(player)
		return { ok = true, msg = "Sold for $" .. refund .. " (25% loss).", refund = refund }
	end

	return { ok = false, msg = "Unknown action." }
end
