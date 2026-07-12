--[[
	BlockCraft Modern - Sprinting (TEMPORARILY DISABLED)

	Sprinting was applying set_physics_override / set_fov every time the player
	changed forward input. While stabilising reported movement bugs, this mod
	is disabled so the player uses plain, reliable default movement. Once
	movement is confirmed working again we can re-enable a simpler version.
]]

core.log("action", "[bc_sprint] disabled during movement stabilisation")
