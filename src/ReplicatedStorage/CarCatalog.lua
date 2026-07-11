--!strict
-- ============================================================
-- CarCatalog  (ModuleScript)
-- Place in: ReplicatedStorage
--
-- THE ONE FILE YOU EDIT to manage the dealership.
--
-- Cars live in ServerStorage/DealerCars (server-only, so their vehicle
-- scripts never run on clients = no camera glitches). The shop shows a
-- still THUMBNAIL image per car.
--
-- HOW STATUS WORKS:
--   - If a car's name is a KEY in CARS below -> it's ON SALE (buyable).
--   - If a car MODEL exists in ServerStorage/DealerCars but its name is
--     NOT in CARS below -> code auto-marks it OFF-SALE (badge, not buyable).
--     Players who already own it keep it (ownership saved separately).
--
-- BADGES (optional per car): "Limited", "PreRelease".
--   Off-Sale is automatic.
--
-- CAR TYPES (NEW): every car has a `carType`. Valid values are defined in
--   CarCatalog.CAR_TYPES below. The dealership shows a dropdown on the right
--   to filter by these. If a car has no carType, it defaults to "Normal".
-- ============================================================

local CarCatalog = {}

-- ============================================================
-- CAR TYPES
-- The ids here drive the right-side type filter dropdown.
-- Order = the order they appear in the dropdown.
-- "All" is added by the UI automatically at the top.
-- ============================================================
CarCatalog.CAR_TYPES = { "Normal", "Sports", "Classic", "PublicService", "Funny" }

-- pretty labels shown in the dropdown + on each card
CarCatalog.CAR_TYPE_LABELS = {
	Normal        = "Normal",
	Sports        = "Sports",
	Classic       = "Classic",
	PublicService = "Public Service",
	Funny         = "Funny",
}

-- optional per-type text color for the little label on each card
CarCatalog.CAR_TYPE_COLORS = {
	Normal        = Color3.fromRGB(160, 165, 175),
	Sports        = Color3.fromRGB(235, 120, 120),
	Classic       = Color3.fromRGB(235, 200, 120),
	PublicService = Color3.fromRGB(110, 170, 235),
	Funny         = Color3.fromRGB(200, 140, 235),
}

-- price, year (for age filter), badges, carType, image (thumbnail asset id or nil)
CarCatalog.CARS = {
	["2025 Volkswagen Golf R"]            = { price = 48000,  year = 2025, badges = {}, carType = "Sports", added = "2026-07-08" },
	["2010 Nissan March"]                 = { price = 8200,   year = 2010, badges = {}, carType = "Normal", image = nil },
	["M2CS Rose"]               = { price = 110000,  year = 2007, badges = {}, carType = "Normal", image = nil },
	["1982 Pontiac Firebird S/E"]         = { price = 24500,  year = 1982, badges = {}, carType = "Classic", image = nil },
	["Ford F-150"] = {
		price = 4800, year = 2005, badges = {}, carType = "Normal",
		variants = {
			{ model = "2005 Ford F-150",           price = 4800,  desc = "Base work truck." },
			{ model = "2005 Ford F-150 Diesel",    price = 6000, desc = "Turbodiesel — low-end torque, tall gearing." },
			{ model = "2012 Ford F150 SVT Raptor", price = 35000, desc = "n/a" },
		},
	},
	-- ===== Real-name performance list (realistic prices) =====
	["1979 BMW M1"]                        = { price = 88000,   year = 1979, badges = {}, carType = "Sports", image = nil },
	["1995 Ford Crown Victoria LX"]        = { price = 2500,    year = 1995, badges = {}, carType = "Normal", added = "2026-07-08" },
	["1995 McLaren F1 LM"]                 = { price = 950000,  year = 1995, badges = {"Limited"}, carType = "Sports", image = nil },
	["1999 Ferrari 360 Modena"]            = { price = 120000,  year = 1999, badges = {}, carType = "Sports", image = nil },
	["2003 Dodge Viper SRT10"]             = { price = 95000,   year = 2003, badges = {}, carType = "Sports", image = nil },
	["2003 Mercedes-Benz SLR McLaren"]     = { price = 300000,  year = 2003, badges = {}, carType = "Sports", image = nil },
	["2006 Subaru Impreza WRX STI"]        = { price = 45000,   year = 2006, badges = {}, carType = "Sports", image = nil },
	["2007 Dodge Grand Caravan"]           = { price = 6500,    year = 2007, badges = {}, carType = "Normal", image = nil },
	["2010 Gumpert Apollo S"]              = { price = 450000,  year = 2010, badges = {"Limited"}, carType = "Sports", image = nil },
	["2011 Lincoln Town Car Signature L"]  = { price = 32000,   year = 2011, badges = {}, carType = "Normal", image = nil },
	["2011 Ford Crown Victoria"]           = { price = 3400,    year = 2011, badges = {}, carType = "Normal", image = nil },
	["2013 Chevrolet Caprice PPV"]           = { price = 28000,   year = 2013, badges = {}, carType = "Normal", added = "2026-07-09" },
	["2014 Abarth 500 1.4 16v"]            = { price = 28000,   year = 2014, badges = {}, carType = "Sports", image = nil },
	["2014 Aston Martin Vanquish"]         = { price = 190000,  year = 2014, badges = {}, carType = "Sports", image = nil },
	["2014 Mercedes-Benz SLS AMG Black Series"] = { price = 275000, year = 2014, badges = {}, carType = "Sports", image = nil },
	["2015 Mazda MX-5"]                    = { price = 32000,   year = 2015, badges = {}, carType = "Sports", image = nil },
	["2016 Ferrari F12tdf"]                = { price = 750000,  year = 2016, badges = {"Limited"}, carType = "Sports", image = nil },
	["2017 Chevrolet Corvette C7 Grand Sport"] = { price = 68000, year = 2017, badges = {}, carType = "Sports", image = nil },
	["2018 Bentley Continental GT"]        = { price = 230000,  year = 2018, badges = {}, carType = "Sports", image = nil },
	["2018 Maserati GranTurismo"]          = { price = 145000,  year = 2018, badges = {}, carType = "Sports", image = nil },
	["2018 Porsche 718 Cayman GTS"]        = { price = 86000,   year = 2018, badges = {}, carType = "Sports", image = nil },
	["2018 Ford Explorer Police Interceptor Utility"] = { price = 13000, year = 2018, badges = {}, carType = "PublicService", added = "2026-07-08" },
	["2014 Chevrolet Tahoe PPV"]           = { price = 25000,   year = 2014, badges = {}, carType = "PublicService", added = "2026-07-08" },
	["2019 Audi R8 LMS GT3"]               = { price = 525000,  year = 2019, badges = {"Limited"}, carType = "Sports", image = nil },
	["2019 Chevrolet Blazer RS"]           = { price = 42000,   year = 2019, badges = {}, carType = "Normal", image = nil },
	["2020 Audi S5 Cabriolet TFSI"]        = { price = 72000,   year = 2020, badges = {}, carType = "Sports", image = nil },
	["2020 BMW M2 CS"]                     = { price = 100000,   year = 2020, badges = {}, carType = "Sports", added = "2026-07-08" },
	["2020 Jeep Gladiator"]                = { price = 48000,   year = 2020, badges = {}, carType = "Normal", image = nil },
	["2020 Mercedes-AMG GT3"]              = { price = 560000,  year = 2020, badges = {"Limited"}, carType = "Sports", image = nil },
	["2020 Polestar 1"]                    = { price = 155000,  year = 2020, badges = {}, carType = "Sports", image = nil },
	["2020 Polestar 2"]                    = { price = 60000,   year = 2020, badges = {}, carType = "Normal", image = nil },
	["2021 Porsche 911 Targa 4S Heritage Design (992)"] = { price = 175000, year = 2021, badges = {"Limited"}, carType = "Sports", image = nil },
	["2022 Ford Focus ST-Line"]            = { price = 35000,   year = 2022, badges = {}, carType = "Normal", image = nil },
--  ["2022 Ford Supervan 4"]               = { price = 400000,  year = 2022, badges = {"Limited"}, carType = "Funny", image = nil },
	["2024 Kia Picanto GT-Line"]           = { price = 22000,   year = 2024, badges = {}, carType = "Normal", image = nil },
	["2024 Peugeot 9X8 Hybrid Hypercar LMH"] = { price = 900000, year = 2024, badges = {"Limited"}, carType = "Sports", image = nil },
	["2025 Aston Martin Valiant"]          = { price = 850000,  year = 2025, badges = {"Limited"}, carType = "Sports", image = nil },
	["2025 Aston Martin Vantage"]          = { price = 195000,  year = 2025, badges = {}, carType = "Sports", image = nil },
	["2026 Genesis GMR-001 LMD"]           = { price = 1200000, year = 2026, badges = {"Limited"}, carType = "Sports", image = nil },
	["2018 Ford Explorer[storm chaser]"]   = { price = 17000,   year = 2018, badges = {"Limited"}, carType = "PublicService", added = "2026-07-08" },
}


-- Sell refund fraction (player loses 25% of purchase price)
CarCatalog.SELL_REFUND = 0.75

-- Badge colors (RGB). Off-Sale is added automatically for models not in CARS.
CarCatalog.BADGE_COLORS = {
	Limited     = Color3.fromRGB(220, 170, 40),
	PreRelease  = Color3.fromRGB(150, 90, 220),
	OffSale     = Color3.fromRGB(200, 60, 60),
	Dev         = Color3.fromRGB(255, 60, 210),
	Classic     = Color3.fromRGB(255, 196, 90),
	Legendary   = Color3.fromRGB(180, 70, 255),
	Wunderwaffe = Color3.fromRGB(120, 20, 20),
	New         = Color3.fromRGB(60, 200, 110),
}

CarCatalog.BADGE_LABELS = {
	Limited     = "Limited",
	PreRelease  = "Pre-Release",
	OffSale     = "Off-Sale",
	Dev         = "DEV",
	Classic     = "Classic",
	Legendary   = "Legendary",
	Wunderwaffe = "Wunderwaffe",
	New         = "NEW",
}

-- Per-badge visual STYLE. The dealership UI reads these to make each tag
-- special: gradients, glow, animated shimmer, outlines.
CarCatalog.BADGE_STYLES = {
	Dev = {
		gradient  = { Color3.fromRGB(255, 90, 230), Color3.fromRGB(120, 60, 255) },
		textColor = Color3.fromRGB(255, 255, 255),
		glow = true, shimmer = true,
		stroke = { Color3.fromRGB(255, 255, 255), 1 },
	},
	Legendary = {
		gradient  = { Color3.fromRGB(255, 210, 90), Color3.fromRGB(180, 70, 255) },
		textColor = Color3.fromRGB(255, 255, 255),
		glow = true, shimmer = true,
		stroke = { Color3.fromRGB(255, 240, 180), 1 },
	},
	Classic = {
		gradient  = { Color3.fromRGB(255, 224, 150), Color3.fromRGB(200, 140, 60) },
		textColor = Color3.fromRGB(60, 35, 10),
		glow = false, shimmer = false,
		stroke = { Color3.fromRGB(120, 80, 30), 1 },
	},
	Wunderwaffe = {
		gradient  = { Color3.fromRGB(200, 40, 40), Color3.fromRGB(60, 0, 0) },
		textColor = Color3.fromRGB(255, 220, 220),
		glow = true, shimmer = true,
		stroke = { Color3.fromRGB(255, 120, 120), 1 },
	},
	Limited = {
		gradient  = { Color3.fromRGB(255, 200, 70), Color3.fromRGB(200, 150, 20) },
		textColor = Color3.fromRGB(50, 35, 0),
	},
	PreRelease = {
		gradient  = { Color3.fromRGB(180, 120, 240), Color3.fromRGB(120, 70, 200) },
		textColor = Color3.fromRGB(255, 255, 255),
	},
	OffSale = {
		gradient  = { Color3.fromRGB(210, 80, 80), Color3.fromRGB(150, 40, 40) },
		textColor = Color3.fromRGB(255, 235, 235),
	},
	New = {
		gradient  = { Color3.fromRGB(120, 230, 140), Color3.fromRGB(40, 170, 90) },
		textColor = Color3.fromRGB(255, 255, 255),
		glow = true, shimmer = true,
		stroke = { Color3.fromRGB(200, 255, 210), 1 },
	},
}

-- ===== Auto "NEW" badge =====
CarCatalog.NEW_DAYS = 14

function CarCatalog.isNew(entry)
	if not entry or not entry.added then return false end
	local y, m, d = tostring(entry.added):match("(%d+)-(%d+)-(%d+)")
	if not y then return false end
	local addedTime = os.time({ year = tonumber(y), month = tonumber(m), day = tonumber(d) })
	local ageDays = (os.time() - addedTime) / 86400
	return ageDays >= 0 and ageDays <= CarCatalog.NEW_DAYS
end

-- helper the UI/server use to read a car's type safely (defaults to Normal)
function CarCatalog.getType(entry)
	if entry and entry.carType then return entry.carType end
	return "Normal"
end

return CarCatalog
