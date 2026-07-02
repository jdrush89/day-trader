// Pool of fictional companies that can be drafted into the game.
// Each entry defines the template; price and history are generated at draft time.

export interface StockCandidate {
  symbol: string;
  name: string;
  tags: string[];
  priceRange: [number, number]; // min/max starting price
  volatility: number; // daily price volatility (0.01 = calm, 0.05 = wild)
  historyDays: number; // how many trading days of fake history to generate
}

export const STOCK_POOL: StockCandidate[] = [
  // Tech
  { symbol: "BYTE", name: "ByteForge Systems", tags: ["mid-cap", "tech", "cloud"], priceRange: [40, 120], volatility: 0.025, historyDays: 504 },
  { symbol: "CHIP", name: "ChipWorks Semiconductors", tags: ["large-cap", "tech", "semiconductor"], priceRange: [80, 200], volatility: 0.022, historyDays: 1260 },
  { symbol: "ALGO", name: "AlgoNet AI", tags: ["mid-cap", "tech", "ai"], priceRange: [30, 90], volatility: 0.035, historyDays: 252 },
  { symbol: "SYNC", name: "SyncWave Communications", tags: ["mid-cap", "tech", "telecom"], priceRange: [25, 70], volatility: 0.02, historyDays: 756 },
  { symbol: "PXEL", name: "PixelDream Studios", tags: ["small-cap", "tech", "gaming", "entertainment"], priceRange: [8, 35], volatility: 0.04, historyDays: 252 },
  { symbol: "HACK", name: "HackShield Cyber", tags: ["mid-cap", "tech", "cybersecurity"], priceRange: [45, 110], volatility: 0.025, historyDays: 504 },
  { symbol: "NETZ", name: "NetZero Cloud", tags: ["mid-cap", "tech", "cloud", "green"], priceRange: [20, 65], volatility: 0.03, historyDays: 378 },
  { symbol: "QUBT", name: "QuBit Computing", tags: ["small-cap", "tech", "speculative", "ai"], priceRange: [5, 25], volatility: 0.05, historyDays: 126 },
  { symbol: "DIGI", name: "DigiVault Inc", tags: ["mid-cap", "tech", "fintech"], priceRange: [30, 85], volatility: 0.028, historyDays: 504 },
  { symbol: "ROBO", name: "RoboCore Industries", tags: ["mid-cap", "tech", "ai", "manufacturing"], priceRange: [50, 130], volatility: 0.025, historyDays: 756 },
  { symbol: "STRM", name: "StreamBox Media", tags: ["mid-cap", "tech", "entertainment", "social-media"], priceRange: [15, 55], volatility: 0.032, historyDays: 378 },
  { symbol: "BLOK", name: "BlockLedger Corp", tags: ["small-cap", "tech", "fintech", "speculative"], priceRange: [3, 20], volatility: 0.045, historyDays: 189 },
  { symbol: "WIRE", name: "WireFrame VR", tags: ["small-cap", "tech", "gaming", "speculative"], priceRange: [6, 30], volatility: 0.042, historyDays: 126 },
  { symbol: "CODA", name: "Coda Software", tags: ["mid-cap", "tech", "enterprise", "cloud"], priceRange: [35, 95], volatility: 0.022, historyDays: 756 },
  { symbol: "BITZ", name: "Bitz Data Systems", tags: ["mid-cap", "tech", "cloud", "enterprise"], priceRange: [25, 75], volatility: 0.024, historyDays: 504 },
  { symbol: "VRTX", name: "Vertex Logic", tags: ["small-cap", "tech", "semiconductor", "ai"], priceRange: [10, 45], volatility: 0.038, historyDays: 252 },
  { symbol: "FLUX", name: "FluxNet Technologies", tags: ["mid-cap", "tech", "telecom", "cloud"], priceRange: [22, 68], volatility: 0.026, historyDays: 504 },
  { symbol: "GRID", name: "GridPoint Computing", tags: ["large-cap", "tech", "cloud", "enterprise"], priceRange: [90, 220], volatility: 0.02, historyDays: 1260 },

  // Healthcare / Pharma / Biotech
  { symbol: "CURE", name: "CureGen Therapeutics", tags: ["mid-cap", "healthcare", "biotech"], priceRange: [30, 100], volatility: 0.035, historyDays: 504 },
  { symbol: "GENO", name: "GenoTech Labs", tags: ["small-cap", "healthcare", "biotech", "speculative"], priceRange: [5, 25], volatility: 0.05, historyDays: 189 },
  { symbol: "VITA", name: "VitaWell Health", tags: ["mid-cap", "healthcare", "consumer"], priceRange: [20, 60], volatility: 0.02, historyDays: 756 },
  { symbol: "MDEX", name: "MedEx Diagnostics", tags: ["mid-cap", "healthcare", "pharma"], priceRange: [40, 110], volatility: 0.025, historyDays: 756 },
  { symbol: "STEM", name: "StemCell Dynamics", tags: ["small-cap", "healthcare", "biotech", "speculative"], priceRange: [8, 40], volatility: 0.045, historyDays: 252 },
  { symbol: "HLTH", name: "HealthBridge Systems", tags: ["mid-cap", "healthcare", "tech"], priceRange: [35, 85], volatility: 0.022, historyDays: 504 },
  { symbol: "RXCO", name: "RxCorp Pharma", tags: ["large-cap", "healthcare", "pharma"], priceRange: [70, 180], volatility: 0.018, historyDays: 1260 },
  { symbol: "NERF", name: "NerveLink Bio", tags: ["small-cap", "healthcare", "biotech", "speculative"], priceRange: [4, 18], volatility: 0.055, historyDays: 126 },
  { symbol: "IMUN", name: "ImmunoVax Inc", tags: ["mid-cap", "healthcare", "pharma", "biotech"], priceRange: [25, 75], volatility: 0.03, historyDays: 504 },
  { symbol: "DENT", name: "DentaCare Holdings", tags: ["mid-cap", "healthcare", "consumer"], priceRange: [30, 70], volatility: 0.018, historyDays: 756 },

  // Finance
  { symbol: "LEDG", name: "LedgerPrime Capital", tags: ["mid-cap", "finance", "fintech"], priceRange: [30, 80], volatility: 0.022, historyDays: 504 },
  { symbol: "INSV", name: "InvestCo Group", tags: ["large-cap", "finance", "banking"], priceRange: [50, 140], volatility: 0.018, historyDays: 1260 },
  { symbol: "CRED", name: "CreditStack Financial", tags: ["mid-cap", "finance", "fintech"], priceRange: [20, 55], volatility: 0.025, historyDays: 378 },
  { symbol: "BOND", name: "BondHaven Trust", tags: ["large-cap", "finance", "banking"], priceRange: [60, 120], volatility: 0.015, historyDays: 1260 },
  { symbol: "MINT", name: "MintPay Solutions", tags: ["mid-cap", "finance", "fintech", "tech"], priceRange: [15, 50], volatility: 0.03, historyDays: 378 },
  { symbol: "FUND", name: "FundVault Asset Management", tags: ["mid-cap", "finance"], priceRange: [40, 95], volatility: 0.02, historyDays: 756 },
  { symbol: "RISK", name: "RiskMetrics Analytics", tags: ["mid-cap", "finance", "tech"], priceRange: [25, 70], volatility: 0.022, historyDays: 504 },
  { symbol: "LEND", name: "LendWise Corp", tags: ["mid-cap", "finance", "fintech"], priceRange: [18, 55], volatility: 0.024, historyDays: 504 },

  // Energy
  { symbol: "VOLT", name: "VoltGrid Energy", tags: ["mid-cap", "energy", "renewable", "green"], priceRange: [20, 70], volatility: 0.028, historyDays: 504 },
  { symbol: "FUSE", name: "FusionPower Corp", tags: ["small-cap", "energy", "speculative", "green"], priceRange: [5, 22], volatility: 0.045, historyDays: 189 },
  { symbol: "PETR", name: "PetroDyne Oil & Gas", tags: ["large-cap", "energy", "oil"], priceRange: [45, 120], volatility: 0.025, historyDays: 1260 },
  { symbol: "SOLR", name: "SolarVista Inc", tags: ["mid-cap", "energy", "renewable", "green"], priceRange: [25, 75], volatility: 0.028, historyDays: 504 },
  { symbol: "WATT", name: "WattWorks Utilities", tags: ["large-cap", "energy"], priceRange: [50, 100], volatility: 0.015, historyDays: 1260 },
  { symbol: "LITM", name: "LithiumMax Mining", tags: ["mid-cap", "energy", "mining", "green"], priceRange: [15, 55], volatility: 0.035, historyDays: 378 },
  { symbol: "GASS", name: "GasFlow International", tags: ["mid-cap", "energy", "oil"], priceRange: [30, 80], volatility: 0.022, historyDays: 756 },
  { symbol: "WIND", name: "WindForce Energy", tags: ["mid-cap", "energy", "renewable", "green"], priceRange: [18, 60], volatility: 0.026, historyDays: 504 },
  { symbol: "NUKR", name: "NukeClear Power", tags: ["mid-cap", "energy", "speculative"], priceRange: [12, 45], volatility: 0.035, historyDays: 252 },

  // Consumer / Retail
  { symbol: "SHOP", name: "ShopStream Retail", tags: ["mid-cap", "consumer", "retail", "tech"], priceRange: [25, 80], volatility: 0.025, historyDays: 504 },
  { symbol: "LUXE", name: "Luxe Brands International", tags: ["large-cap", "consumer", "retail"], priceRange: [60, 180], volatility: 0.018, historyDays: 1260 },
  { symbol: "GRUB", name: "GrubDash Delivery", tags: ["mid-cap", "consumer", "food", "tech"], priceRange: [15, 50], volatility: 0.03, historyDays: 378 },
  { symbol: "FIZZ", name: "FizzPop Beverages", tags: ["mid-cap", "consumer", "food"], priceRange: [30, 75], volatility: 0.018, historyDays: 756 },
  { symbol: "PETS", name: "PetPlanet Co", tags: ["mid-cap", "consumer", "retail"], priceRange: [20, 55], volatility: 0.022, historyDays: 504 },
  { symbol: "WEAR", name: "WearTech Apparel", tags: ["mid-cap", "consumer", "retail"], priceRange: [15, 45], volatility: 0.025, historyDays: 378 },
  { symbol: "MEAL", name: "MealBox Holdings", tags: ["small-cap", "consumer", "food", "tech"], priceRange: [8, 30], volatility: 0.035, historyDays: 252 },
  { symbol: "TOYS", name: "ToyVerse Entertainment", tags: ["mid-cap", "consumer", "entertainment"], priceRange: [18, 50], volatility: 0.025, historyDays: 504 },
  { symbol: "JAVA", name: "JavaHut Coffee Chain", tags: ["mid-cap", "consumer", "food", "retail"], priceRange: [22, 65], volatility: 0.02, historyDays: 756 },
  { symbol: "AUTO", name: "AutoDrive Motors", tags: ["large-cap", "consumer", "manufacturing", "tech"], priceRange: [55, 160], volatility: 0.025, historyDays: 1260 },
  { symbol: "SNAX", name: "SnackStack Foods", tags: ["mid-cap", "consumer", "food"], priceRange: [18, 48], volatility: 0.018, historyDays: 504 },
  { symbol: "DRIP", name: "DripWear Athletics", tags: ["mid-cap", "consumer", "retail"], priceRange: [20, 60], volatility: 0.024, historyDays: 504 },

  // Manufacturing / Industrial
  { symbol: "BOLT", name: "BoltWorks Manufacturing", tags: ["mid-cap", "manufacturing"], priceRange: [30, 80], volatility: 0.02, historyDays: 756 },
  { symbol: "ARMO", name: "ArmorTech Defense", tags: ["large-cap", "manufacturing", "defense"], priceRange: [70, 200], volatility: 0.018, historyDays: 1260 },
  { symbol: "SHIP", name: "ShipLane Logistics", tags: ["mid-cap", "manufacturing", "logistics"], priceRange: [25, 70], volatility: 0.022, historyDays: 504 },
  { symbol: "RUST", name: "RustBelt Steel", tags: ["mid-cap", "manufacturing", "mining"], priceRange: [20, 55], volatility: 0.025, historyDays: 756 },
  { symbol: "PRNT", name: "PrintForge 3D", tags: ["small-cap", "manufacturing", "tech", "speculative"], priceRange: [6, 28], volatility: 0.04, historyDays: 189 },
  { symbol: "DOCK", name: "DockYard Shipping", tags: ["mid-cap", "manufacturing", "logistics"], priceRange: [30, 75], volatility: 0.02, historyDays: 756 },
  { symbol: "RAIL", name: "RailBridge Transport", tags: ["large-cap", "manufacturing", "logistics"], priceRange: [55, 130], volatility: 0.016, historyDays: 1260 },

  // Real Estate
  { symbol: "REIT", name: "RealVest Properties", tags: ["large-cap", "real-estate"], priceRange: [50, 120], volatility: 0.015, historyDays: 1260 },
  { symbol: "HOME", name: "HomeNest Builders", tags: ["mid-cap", "real-estate", "consumer"], priceRange: [25, 70], volatility: 0.022, historyDays: 504 },
  { symbol: "LAND", name: "LandGrab Holdings", tags: ["mid-cap", "real-estate"], priceRange: [30, 80], volatility: 0.02, historyDays: 756 },
  { symbol: "BLDG", name: "BuildCo Construction", tags: ["mid-cap", "real-estate", "manufacturing"], priceRange: [20, 55], volatility: 0.024, historyDays: 504 },

  // Entertainment / Media
  { symbol: "PLAY", name: "PlayHaven Studios", tags: ["mid-cap", "entertainment", "gaming"], priceRange: [20, 65], volatility: 0.03, historyDays: 504 },
  { symbol: "REEL", name: "ReelTime Pictures", tags: ["mid-cap", "entertainment"], priceRange: [15, 50], volatility: 0.028, historyDays: 378 },
  { symbol: "TUNE", name: "TuneWave Music", tags: ["mid-cap", "entertainment", "tech", "social-media"], priceRange: [18, 55], volatility: 0.025, historyDays: 504 },
  { symbol: "CAST", name: "CastNet Broadcasting", tags: ["large-cap", "entertainment"], priceRange: [40, 100], volatility: 0.018, historyDays: 1260 },
  { symbol: "LIVE", name: "LivePulse Events", tags: ["small-cap", "entertainment", "speculative"], priceRange: [5, 20], volatility: 0.04, historyDays: 189 },

  // Social Media / Internet
  { symbol: "BUZZ", name: "BuzzHive Social", tags: ["mid-cap", "tech", "social-media"], priceRange: [15, 55], volatility: 0.032, historyDays: 378 },
  { symbol: "CHAT", name: "ChatSphere Inc", tags: ["mid-cap", "tech", "social-media"], priceRange: [20, 60], volatility: 0.028, historyDays: 504 },
  { symbol: "LINK", name: "LinkUp Networks", tags: ["mid-cap", "tech", "social-media", "enterprise"], priceRange: [30, 80], volatility: 0.024, historyDays: 756 },
  { symbol: "TRNZ", name: "TrendZone Media", tags: ["small-cap", "tech", "social-media", "speculative"], priceRange: [4, 18], volatility: 0.048, historyDays: 126 },

  // Mining / Materials
  { symbol: "GOLD", name: "GoldRush Mining", tags: ["mid-cap", "mining"], priceRange: [25, 75], volatility: 0.025, historyDays: 756 },
  { symbol: "RARE", name: "RareEarth Minerals", tags: ["small-cap", "mining", "speculative"], priceRange: [8, 30], volatility: 0.04, historyDays: 252 },
  { symbol: "COPX", name: "CopperLine Resources", tags: ["mid-cap", "mining"], priceRange: [20, 60], volatility: 0.025, historyDays: 504 },
  { symbol: "TMBR", name: "TimberCrest Forestry", tags: ["mid-cap", "mining", "green"], priceRange: [18, 50], volatility: 0.02, historyDays: 756 },

  // Aerospace / Defense
  { symbol: "ORBT", name: "OrbitX Aerospace", tags: ["mid-cap", "tech", "defense", "speculative"], priceRange: [15, 60], volatility: 0.035, historyDays: 378 },
  { symbol: "SKYY", name: "SkyCraft Aviation", tags: ["large-cap", "manufacturing", "defense"], priceRange: [60, 170], volatility: 0.018, historyDays: 1260 },
  { symbol: "DRON", name: "DroneVista Corp", tags: ["small-cap", "tech", "defense", "speculative"], priceRange: [7, 28], volatility: 0.042, historyDays: 189 },
  { symbol: "SPCX", name: "SpaceCraft Industries", tags: ["mid-cap", "tech", "defense"], priceRange: [30, 90], volatility: 0.03, historyDays: 504 },

  // Agriculture / Food Production
  { symbol: "SEED", name: "SeedCorp AgriTech", tags: ["mid-cap", "consumer", "food", "green"], priceRange: [20, 55], volatility: 0.02, historyDays: 756 },
  { symbol: "FARM", name: "FarmLink Holdings", tags: ["mid-cap", "consumer", "food"], priceRange: [25, 65], volatility: 0.018, historyDays: 756 },
  { symbol: "MEAT", name: "MeatWorks Protein", tags: ["mid-cap", "consumer", "food"], priceRange: [18, 48], volatility: 0.022, historyDays: 504 },
  { symbol: "LEAF", name: "LeafGreen Organics", tags: ["small-cap", "consumer", "food", "green"], priceRange: [8, 28], volatility: 0.03, historyDays: 252 },

  // Education / SaaS
  { symbol: "EDTK", name: "EduTech Learning", tags: ["mid-cap", "tech", "enterprise"], priceRange: [20, 60], volatility: 0.022, historyDays: 504 },
  { symbol: "SAAS", name: "SaaSify Platform", tags: ["mid-cap", "tech", "cloud", "enterprise"], priceRange: [30, 85], volatility: 0.025, historyDays: 504 },
  { symbol: "CLSS", name: "ClassPass Digital", tags: ["small-cap", "tech", "consumer"], priceRange: [10, 35], volatility: 0.03, historyDays: 252 },

  // Cannabis / Vice
  { symbol: "WEED", name: "GreenLeaf Cannabis", tags: ["small-cap", "consumer", "speculative"], priceRange: [3, 15], volatility: 0.05, historyDays: 189 },
  { symbol: "VAPE", name: "VaporTech Inc", tags: ["small-cap", "consumer", "speculative"], priceRange: [4, 18], volatility: 0.045, historyDays: 189 },
  { symbol: "BETS", name: "BetStack Gaming", tags: ["mid-cap", "entertainment", "gaming", "speculative"], priceRange: [10, 40], volatility: 0.035, historyDays: 378 },

  // Travel / Hospitality
  { symbol: "TRIP", name: "TripWire Travel", tags: ["mid-cap", "consumer", "tech"], priceRange: [20, 65], volatility: 0.025, historyDays: 504 },
  { symbol: "HOTL", name: "HotelChain Global", tags: ["large-cap", "consumer", "real-estate"], priceRange: [50, 130], volatility: 0.018, historyDays: 1260 },
  { symbol: "CRUZ", name: "CruiseWave Lines", tags: ["mid-cap", "consumer", "entertainment"], priceRange: [20, 60], volatility: 0.025, historyDays: 504 },
  { symbol: "FLYX", name: "FlyExpress Airlines", tags: ["mid-cap", "consumer", "logistics"], priceRange: [15, 50], volatility: 0.028, historyDays: 378 },

  // Insurance
  { symbol: "INSR", name: "InsureAll Group", tags: ["large-cap", "finance"], priceRange: [45, 110], volatility: 0.016, historyDays: 1260 },
  { symbol: "SAFE", name: "SafeGuard Insurance", tags: ["mid-cap", "finance"], priceRange: [30, 75], volatility: 0.018, historyDays: 756 },

  // Misc / Weird
  { symbol: "YOLO", name: "YOLO Ventures", tags: ["small-cap", "speculative"], priceRange: [2, 10], volatility: 0.06, historyDays: 63 },
  { symbol: "MOON", name: "MoonShot Holdings", tags: ["small-cap", "speculative"], priceRange: [1, 8], volatility: 0.065, historyDays: 63 },
  { symbol: "DOGE", name: "DogeDAO Inc", tags: ["small-cap", "fintech", "speculative", "social-media"], priceRange: [0.5, 5], volatility: 0.07, historyDays: 63 },
  { symbol: "APE", name: "ApeStrong Capital", tags: ["small-cap", "finance", "speculative", "social-media"], priceRange: [2, 12], volatility: 0.06, historyDays: 63 },
  { symbol: "HODL", name: "HODL Asset Management", tags: ["small-cap", "finance", "speculative"], priceRange: [3, 15], volatility: 0.055, historyDays: 126 },
  { symbol: "FOMO", name: "FOMO Technologies", tags: ["small-cap", "tech", "speculative"], priceRange: [2, 10], volatility: 0.055, historyDays: 63 },

  // More tech to keep variety going
  { symbol: "DEEP", name: "DeepMind Analytics", tags: ["mid-cap", "tech", "ai", "enterprise"], priceRange: [35, 95], volatility: 0.028, historyDays: 504 },
  { symbol: "EDGE", name: "EdgeNode Computing", tags: ["mid-cap", "tech", "cloud"], priceRange: [20, 60], volatility: 0.025, historyDays: 378 },
  { symbol: "SCAN", name: "ScanVision Optics", tags: ["mid-cap", "tech", "healthcare"], priceRange: [25, 70], volatility: 0.024, historyDays: 504 },
  { symbol: "DASH", name: "DashPay Financial", tags: ["mid-cap", "fintech", "tech"], priceRange: [18, 55], volatility: 0.028, historyDays: 378 },
  { symbol: "LOCK", name: "LockBit Security", tags: ["mid-cap", "tech", "cybersecurity", "enterprise"], priceRange: [30, 80], volatility: 0.024, historyDays: 504 },
  { symbol: "NANO", name: "NanoScale Materials", tags: ["small-cap", "tech", "manufacturing", "speculative"], priceRange: [6, 25], volatility: 0.04, historyDays: 189 },
  { symbol: "PLAT", name: "Platinum Data Corp", tags: ["mid-cap", "tech", "enterprise"], priceRange: [40, 100], volatility: 0.022, historyDays: 756 },
  { symbol: "WAVE", name: "WaveSignal 5G", tags: ["mid-cap", "tech", "telecom"], priceRange: [22, 65], volatility: 0.026, historyDays: 504 },
  { symbol: "LENS", name: "LensAR Technologies", tags: ["small-cap", "tech", "healthcare", "ai"], priceRange: [8, 32], volatility: 0.038, historyDays: 252 },
  { symbol: "NODE", name: "NodeForge Infrastructure", tags: ["mid-cap", "tech", "cloud", "enterprise"], priceRange: [28, 78], volatility: 0.023, historyDays: 504 },

  // More finance
  { symbol: "SWAP", name: "SwapNet Exchange", tags: ["mid-cap", "finance", "fintech"], priceRange: [15, 50], volatility: 0.028, historyDays: 378 },
  { symbol: "VEST", name: "VestWell Advisors", tags: ["mid-cap", "finance"], priceRange: [30, 75], volatility: 0.02, historyDays: 756 },
  { symbol: "FISC", name: "FiscalEdge Analytics", tags: ["mid-cap", "finance", "tech"], priceRange: [22, 60], volatility: 0.022, historyDays: 504 },

  // More energy
  { symbol: "HYDR", name: "HydroGen Power", tags: ["small-cap", "energy", "renewable", "speculative", "green"], priceRange: [5, 22], volatility: 0.04, historyDays: 189 },
  { symbol: "COAL", name: "CoalFire Resources", tags: ["mid-cap", "energy", "mining"], priceRange: [15, 45], volatility: 0.025, historyDays: 756 },
  { symbol: "PIPE", name: "PipeWorks Energy", tags: ["mid-cap", "energy", "oil"], priceRange: [25, 65], volatility: 0.022, historyDays: 756 },

  // More healthcare
  { symbol: "XRAY", name: "XRay Imaging Corp", tags: ["mid-cap", "healthcare", "tech"], priceRange: [25, 70], volatility: 0.022, historyDays: 504 },
  { symbol: "VAXN", name: "VaxNova Biologics", tags: ["small-cap", "healthcare", "biotech", "speculative"], priceRange: [6, 25], volatility: 0.048, historyDays: 126 },
  { symbol: "CARE", name: "CareBridge Health", tags: ["mid-cap", "healthcare"], priceRange: [30, 75], volatility: 0.02, historyDays: 756 },

  // More consumer
  { symbol: "WINE", name: "VineYard Spirits", tags: ["mid-cap", "consumer", "food"], priceRange: [22, 58], volatility: 0.02, historyDays: 756 },
  { symbol: "GEAR", name: "GearUp Outdoors", tags: ["mid-cap", "consumer", "retail"], priceRange: [18, 50], volatility: 0.022, historyDays: 504 },
  { symbol: "BABY", name: "BabyBoom Products", tags: ["mid-cap", "consumer", "retail"], priceRange: [15, 42], volatility: 0.02, historyDays: 504 },
  { symbol: "MUSC", name: "MuscleTech Nutrition", tags: ["small-cap", "consumer", "food"], priceRange: [8, 28], volatility: 0.03, historyDays: 252 },

  // Additional stocks for long games
  { symbol: "APEX", name: "Apex Dynamics", tags: ["mid-cap", "tech", "ai"], priceRange: [30, 85], volatility: 0.028, historyDays: 504 },
  { symbol: "ZERO", name: "ZeroPoint Labs", tags: ["small-cap", "tech", "speculative"], priceRange: [3, 15], volatility: 0.05, historyDays: 126 },
  { symbol: "NOVA2", name: "NovaLink Satellite", tags: ["mid-cap", "tech", "telecom", "defense"], priceRange: [25, 70], volatility: 0.028, historyDays: 378 },
  { symbol: "FOAM", name: "FoamCore Materials", tags: ["small-cap", "manufacturing"], priceRange: [8, 25], volatility: 0.025, historyDays: 252 },
  { symbol: "APEX2", name: "ApexTrade Brokerage", tags: ["mid-cap", "finance", "fintech"], priceRange: [20, 60], volatility: 0.024, historyDays: 504 },
  { symbol: "HIVE", name: "HiveMind Robotics", tags: ["small-cap", "tech", "ai", "speculative"], priceRange: [5, 22], volatility: 0.042, historyDays: 189 },
  { symbol: "SILK", name: "SilkRoad Commerce", tags: ["mid-cap", "consumer", "retail", "tech"], priceRange: [18, 55], volatility: 0.025, historyDays: 504 },
  { symbol: "AQUA", name: "AquaPure Utilities", tags: ["mid-cap", "energy", "green"], priceRange: [25, 65], volatility: 0.016, historyDays: 756 },
  { symbol: "SALT", name: "SaltLake Mining", tags: ["mid-cap", "mining"], priceRange: [15, 45], volatility: 0.025, historyDays: 504 },
  { symbol: "VOID", name: "VoidSpace Games", tags: ["small-cap", "entertainment", "gaming", "speculative"], priceRange: [4, 18], volatility: 0.045, historyDays: 126 },
  { symbol: "PALM", name: "PalmTree Resorts", tags: ["mid-cap", "consumer", "real-estate"], priceRange: [20, 55], volatility: 0.022, historyDays: 504 },
  { symbol: "ECHO", name: "EchoWave Audio", tags: ["small-cap", "tech", "consumer"], priceRange: [10, 35], volatility: 0.03, historyDays: 252 },
  { symbol: "DYNM", name: "Dynamo Electric", tags: ["mid-cap", "energy", "manufacturing"], priceRange: [25, 70], volatility: 0.022, historyDays: 504 },
  { symbol: "PINE", name: "PineValley Timber", tags: ["mid-cap", "mining", "green"], priceRange: [18, 48], volatility: 0.018, historyDays: 756 },
  { symbol: "OPAL", name: "Opal Gemstones Ltd", tags: ["small-cap", "mining", "consumer"], priceRange: [8, 30], volatility: 0.03, historyDays: 252 },
  { symbol: "RISE", name: "RiseUp Fitness", tags: ["small-cap", "consumer", "retail"], priceRange: [6, 22], volatility: 0.032, historyDays: 189 },
  { symbol: "CUBE", name: "CubeData Storage", tags: ["mid-cap", "tech", "cloud", "enterprise"], priceRange: [30, 80], volatility: 0.024, historyDays: 504 },
  { symbol: "MINT2", name: "MintFresh Consumer", tags: ["mid-cap", "consumer", "food"], priceRange: [15, 40], volatility: 0.02, historyDays: 504 },
  { symbol: "AERO", name: "AeroJet Propulsion", tags: ["mid-cap", "manufacturing", "defense"], priceRange: [35, 90], volatility: 0.022, historyDays: 756 },
  { symbol: "ZOOM", name: "ZoomLens Optics", tags: ["mid-cap", "tech", "healthcare"], priceRange: [20, 55], volatility: 0.025, historyDays: 378 },
  { symbol: "TUSK", name: "TuskIvory Capital", tags: ["mid-cap", "finance"], priceRange: [25, 65], volatility: 0.02, historyDays: 504 },
  { symbol: "BOLT2", name: "BoltCharge EV", tags: ["mid-cap", "consumer", "tech", "green"], priceRange: [15, 50], volatility: 0.032, historyDays: 378 },
  { symbol: "REEF", name: "ReefLine Marine", tags: ["mid-cap", "consumer", "entertainment"], priceRange: [18, 48], volatility: 0.022, historyDays: 504 },
  { symbol: "CROW", name: "CrowBar Security", tags: ["mid-cap", "tech", "cybersecurity"], priceRange: [22, 60], volatility: 0.024, historyDays: 504 },
  { symbol: "IRON", name: "IronClad Defense", tags: ["large-cap", "manufacturing", "defense"], priceRange: [55, 140], volatility: 0.018, historyDays: 1260 },
  { symbol: "NEON", name: "NeonPulse Lighting", tags: ["small-cap", "manufacturing", "green"], priceRange: [6, 22], volatility: 0.03, historyDays: 252 },
  { symbol: "PAWN", name: "PawnStar Exchange", tags: ["small-cap", "finance", "speculative"], priceRange: [3, 12], volatility: 0.045, historyDays: 126 },
  { symbol: "FURY", name: "FuryGames Studio", tags: ["small-cap", "entertainment", "gaming"], priceRange: [8, 30], volatility: 0.035, historyDays: 252 },
  { symbol: "CLAW", name: "ClawMachine Arcade", tags: ["small-cap", "entertainment", "consumer"], priceRange: [5, 18], volatility: 0.035, historyDays: 189 },
  { symbol: "RUST2", name: "RustBucket Auto Parts", tags: ["mid-cap", "consumer", "manufacturing"], priceRange: [15, 42], volatility: 0.022, historyDays: 504 },
  { symbol: "SNAP", name: "SnapShot Cameras", tags: ["mid-cap", "tech", "consumer"], priceRange: [18, 50], volatility: 0.025, historyDays: 378 },
  { symbol: "BARK", name: "BarkBox Pet Supply", tags: ["mid-cap", "consumer", "retail"], priceRange: [12, 38], volatility: 0.024, historyDays: 378 },
  { symbol: "JADE", name: "JadeStone Jewelry", tags: ["small-cap", "consumer", "mining"], priceRange: [8, 28], volatility: 0.028, historyDays: 252 },
  { symbol: "MAZE", name: "MazeRunner Analytics", tags: ["mid-cap", "tech", "ai", "enterprise"], priceRange: [25, 68], volatility: 0.026, historyDays: 504 },
  { symbol: "GULF", name: "GulfStream Energy", tags: ["mid-cap", "energy", "oil"], priceRange: [28, 72], volatility: 0.024, historyDays: 756 },
  { symbol: "PUMA", name: "PumaCode Software", tags: ["mid-cap", "tech", "enterprise"], priceRange: [22, 60], volatility: 0.024, historyDays: 504 },
  { symbol: "COZY", name: "CozyNest Furniture", tags: ["mid-cap", "consumer", "retail"], priceRange: [15, 42], volatility: 0.02, historyDays: 504 },
  { symbol: "BLZR", name: "Blazer Sportswear", tags: ["mid-cap", "consumer", "retail"], priceRange: [18, 50], volatility: 0.022, historyDays: 504 },
  { symbol: "CRYO", name: "CryoGen Biotech", tags: ["small-cap", "healthcare", "biotech", "speculative"], priceRange: [4, 20], volatility: 0.05, historyDays: 126 },
  { symbol: "SAGE", name: "SagePoint Advisory", tags: ["mid-cap", "finance"], priceRange: [30, 70], volatility: 0.018, historyDays: 756 },
  { symbol: "DUSK", name: "DuskWave Studios", tags: ["small-cap", "entertainment", "gaming"], priceRange: [6, 24], volatility: 0.035, historyDays: 189 },
  { symbol: "PIER", name: "PierPort Logistics", tags: ["mid-cap", "manufacturing", "logistics"], priceRange: [20, 55], volatility: 0.02, historyDays: 504 },
  { symbol: "KIWI", name: "KiwiTech Solutions", tags: ["small-cap", "tech", "cloud"], priceRange: [8, 28], volatility: 0.03, historyDays: 252 },
  { symbol: "LYNX", name: "LynxEye Surveillance", tags: ["mid-cap", "tech", "defense", "cybersecurity"], priceRange: [25, 65], volatility: 0.026, historyDays: 504 },
  { symbol: "NOVA3", name: "NovaPlus Healthcare", tags: ["mid-cap", "healthcare", "tech"], priceRange: [22, 60], volatility: 0.024, historyDays: 504 },
  { symbol: "FLUX2", name: "FluxBio Genetics", tags: ["small-cap", "healthcare", "biotech"], priceRange: [6, 25], volatility: 0.04, historyDays: 189 },
  { symbol: "HEAT", name: "HeatWave HVAC", tags: ["mid-cap", "manufacturing", "consumer"], priceRange: [18, 48], volatility: 0.02, historyDays: 504 },
  { symbol: "OINK", name: "PiggyBank Savings", tags: ["small-cap", "finance", "fintech"], priceRange: [5, 18], volatility: 0.032, historyDays: 189 },
  { symbol: "DUNE", name: "DuneRock Mining", tags: ["mid-cap", "mining", "energy"], priceRange: [15, 45], volatility: 0.025, historyDays: 504 },
  { symbol: "FIZZ2", name: "FizzWorks Chemicals", tags: ["mid-cap", "manufacturing"], priceRange: [20, 55], volatility: 0.02, historyDays: 504 },
  { symbol: "WREN", name: "WrenBird Airlines", tags: ["mid-cap", "consumer", "logistics"], priceRange: [12, 38], volatility: 0.028, historyDays: 378 },
  { symbol: "SWAN", name: "SwanLake Properties", tags: ["mid-cap", "real-estate"], priceRange: [25, 65], volatility: 0.018, historyDays: 756 },
  { symbol: "COIN", name: "CoinForge Digital", tags: ["small-cap", "fintech", "speculative"], priceRange: [3, 15], volatility: 0.055, historyDays: 126 },
  { symbol: "GLOW", name: "GlowTech Displays", tags: ["mid-cap", "tech", "consumer"], priceRange: [18, 50], volatility: 0.025, historyDays: 378 },
  { symbol: "TACO", name: "TacoVille Restaurants", tags: ["mid-cap", "consumer", "food", "retail"], priceRange: [15, 42], volatility: 0.022, historyDays: 504 },
  { symbol: "BEAR", name: "BearMarket Insurance", tags: ["mid-cap", "finance"], priceRange: [28, 68], volatility: 0.018, historyDays: 756 },
  { symbol: "HAWK", name: "HawkEye Drones", tags: ["small-cap", "tech", "defense", "speculative"], priceRange: [5, 22], volatility: 0.04, historyDays: 189 },
  { symbol: "MOSS", name: "MossGreen Organics", tags: ["small-cap", "consumer", "food", "green"], priceRange: [6, 20], volatility: 0.028, historyDays: 252 },
  { symbol: "RUBY", name: "RubyRed Cosmetics", tags: ["mid-cap", "consumer", "retail"], priceRange: [15, 42], volatility: 0.022, historyDays: 504 },
  { symbol: "NEST", name: "NestEgg Retirement", tags: ["large-cap", "finance"], priceRange: [50, 110], volatility: 0.016, historyDays: 1260 },
  { symbol: "COLT", name: "ColtSpeed Internet", tags: ["mid-cap", "tech", "telecom"], priceRange: [20, 55], volatility: 0.024, historyDays: 504 },
  { symbol: "PEAK", name: "PeakView Analytics", tags: ["mid-cap", "tech", "enterprise", "ai"], priceRange: [28, 75], volatility: 0.026, historyDays: 504 },
  { symbol: "TIDE", name: "TidePool Marine Bio", tags: ["small-cap", "healthcare", "biotech", "green"], priceRange: [6, 22], volatility: 0.038, historyDays: 189 },
  { symbol: "BULL", name: "BullRun Capital", tags: ["mid-cap", "finance", "speculative"], priceRange: [12, 40], volatility: 0.035, historyDays: 378 },
  { symbol: "ZINC", name: "ZincWorks Metals", tags: ["mid-cap", "mining", "manufacturing"], priceRange: [15, 42], volatility: 0.025, historyDays: 504 },
  { symbol: "CLAY", name: "ClayWorks Ceramics", tags: ["small-cap", "manufacturing", "consumer"], priceRange: [8, 25], volatility: 0.022, historyDays: 252 },
  { symbol: "FERN", name: "FernValley AgriTech", tags: ["mid-cap", "consumer", "food", "green", "tech"], priceRange: [18, 50], volatility: 0.024, historyDays: 504 },
  { symbol: "ONYX", name: "OnyxGuard Cyber", tags: ["mid-cap", "tech", "cybersecurity"], priceRange: [25, 65], volatility: 0.026, historyDays: 504 },
  { symbol: "SHLD", name: "ShieldWall Security", tags: ["mid-cap", "tech", "defense"], priceRange: [30, 78], volatility: 0.022, historyDays: 756 },
  { symbol: "GRIT", name: "GritStone Construction", tags: ["mid-cap", "real-estate", "manufacturing"], priceRange: [18, 48], volatility: 0.02, historyDays: 504 },
];
