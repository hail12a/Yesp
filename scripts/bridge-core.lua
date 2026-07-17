--[[
	Bridge Core — ServerScriptService
	---------------------------------
	The base connector that links the game to the Yesp website.
	Exposes say() (game -> site) and a command poll loop (site -> game).
	Paste this first; other scripts can reuse the same pattern.
	Requires HttpService enabled.
]]

local HttpService = game:GetService("HttpService")
local Players     = game:GetService("Players")

local ENDPOINT = "http://78.108.218.209:8098"
local ROOM     = "battlefeuer"

local function say(from, text, data)
	pcall(function()
		HttpService:PostAsync(
			ENDPOINT .. "/api/say",
			HttpService:JSONEncode({ room = ROOM, from = from, text = text, data = data or {} }),
			Enum.HttpContentType.ApplicationJson
		)
	end)
end

local function poll()
	local ok, res = pcall(function()
		return HttpService:GetAsync(ENDPOINT .. "/api/commands?room=" .. ROOM)
	end)
	if not ok then return {} end
	local okj, list = pcall(HttpService.JSONDecode, HttpService, res)
	return okj and list or {}
end

say("game", "bridge online")
Players.PlayerAdded:Connect(function(p) say("game", p.Name .. " joined") end)
Players.PlayerRemoving:Connect(function(p) say("game", p.Name .. " left") end)

while task.wait(1) do
	for _, cmd in ipairs(poll()) do
		say("game", "ran command: " .. tostring(cmd.text))
		if cmd.text == "ping" then say("game", "pong " .. os.time()) end
	end
end
