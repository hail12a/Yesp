--!strict
-- ============================================================
-- AdminConfig  (ModuleScript)
-- Place in: ReplicatedStorage
--
-- EDIT THIS to control who is an admin.
-- Add UserIds (numbers) OR usernames (strings). UserIds are safer
-- (usernames can be changed by the player). The game creator is
-- always an admin automatically.
-- ============================================================

local AdminConfig = {}

-- Add admins here. Numbers = UserId, strings = username.
AdminConfig.ADMINS = {
	-- 123456789,          -- example: your UserId
	-- "YourUsername",     -- example: your username
	"D2Here4game",
	"JunkoProblem",
}

-- Optional: a higher tier that can use dangerous actions (ban, etc.).
-- If empty, all admins can use everything.
AdminConfig.SUPER_ADMINS = {
	"D2Here4game",
}

return AdminConfig
