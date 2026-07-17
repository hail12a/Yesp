--[[
	Live Telemetry — ServerScriptService
	------------------------------------
	Streams every player's position and speed to the website once a second.
	Turns the live game into a real-time sensor feed (room = "telemetry").
	Paste below Bridge Core, or set ENDPOINT here and run standalone.
	Requires HttpService enabled.
]]

local Players     = game:GetService("Players")
local HttpService = game:GetService("HttpService")

local ENDPOINT = "http://78.108.218.209:8098"
local ROOM     = "telemetry"

local function say(from, text, data)
	pcall(function()
		HttpService:PostAsync(
			ENDPOINT .. "/api/say",
			HttpService:JSONEncode({ room = ROOM, from = from, text = text, data = data or {} }),
			Enum.HttpContentType.ApplicationJson
		)
	end)
end

while task.wait(1) do
	for _, p in ipairs(Players:GetPlayers()) do
		local hrp = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
		if hrp then
			say("telemetry", p.Name, {
				pos   = { math.floor(hrp.Position.X), math.floor(hrp.Position.Y), math.floor(hrp.Position.Z) },
				speed = math.floor(hrp.AssemblyLinearVelocity.Magnitude),
			})
		end
	end
end
