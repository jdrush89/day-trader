export interface UpgradeCard {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "profit" | "info" | "risk" | "trading" | "passive" | "ui";
  maxStacks: number;
}

export const UPGRADE_POOL: UpgradeCard[] = [
  { id: "super_chip", name: "Super Chip", description: "Tech stocks +15% profits", icon: "💻", category: "profit", maxStacks: 1 },
  { id: "penny_picker", name: "Penny Stock Picker", description: "Speculative stocks +20% profits", icon: "🎰", category: "profit", maxStacks: 1 },
  { id: "green_thumb", name: "Green Thumb", description: "Green/renewable stocks +15% profits", icon: "🌱", category: "profit", maxStacks: 1 },
  { id: "pharma_bro", name: "Pharma Bro", description: "Healthcare stocks +15% profits", icon: "💊", category: "profit", maxStacks: 1 },
  { id: "war_profiteer", name: "War Profiteer", description: "Defense stocks +15% profits", icon: "⚔️", category: "profit", maxStacks: 1 },
  { id: "loan_shark", name: "Loan Shark", description: "+15% profits from shorting finance stocks", icon: "🦈", category: "profit", maxStacks: 1 },
  { id: "day_trader", name: "Day Trader Badge", description: "+5% on all trades closed same day they're opened", icon: "📅", category: "profit", maxStacks: 1 },
  { id: "rumor_mill", name: "Rumor Mill", description: "See social media posts 5 ticks before they affect prices", icon: "👂", category: "info", maxStacks: 1 },
  { id: "analyst_ratings", name: "Analyst Ratings", description: "See bull/bear consensus on each stock", icon: "📊", category: "info", maxStacks: 1 },
  { id: "dark_pool", name: "Dark Pool Access", description: "See institutional orders before they execute", icon: "🏦", category: "info", maxStacks: 1 },
  { id: "insider_rolodex", name: "Insider Rolodex", description: "Get 2 insider tips per day instead of 1", icon: "📇", category: "info", maxStacks: 1 },
  { id: "ipo_access", name: "IPO Access", description: "Drafted stocks start 10% below market price", icon: "🎟️", category: "info", maxStacks: 1 },
  { id: "small_biz_medal", name: "Small Business Medal", description: "Negate 20% of losses from small-cap stocks", icon: "🏅", category: "risk", maxStacks: 1 },
  { id: "stop_loss_ins", name: "Stop Loss Insurance", description: "Auto-sell positions that drop 15% (toggleable)", icon: "🛡️", category: "risk", maxStacks: 1 },
  { id: "golden_parachute", name: "Golden Parachute", description: "One free milestone retry (consumed on use)", icon: "🪂", category: "risk", maxStacks: 3 },
  { id: "hedge_fund", name: "Hedge Fund", description: "Losses from shorts reduced by 25%", icon: "🏗️", category: "risk", maxStacks: 1 },
  { id: "bail_out", name: "Bail Out", description: "SEC fines reduced by 20%", icon: "⚖️", category: "risk", maxStacks: 1 },
  { id: "diversification", name: "Diversification Bonus", description: "+2% end-of-day bonus per unique sector held", icon: "🌈", category: "risk", maxStacks: 1 },
  { id: "margin", name: "Margin Account", description: "Use 50% of portfolio value as extra buying power", icon: "📈", category: "trading", maxStacks: 2 },
  { id: "bogo", name: "BOGO Deal", description: "4% chance to get a free stock per stock bought", icon: "🎁", category: "trading", maxStacks: 1 },
  { id: "limit_order_pro", name: "Limit Order Pro", description: "Limit orders persist across days", icon: "📋", category: "trading", maxStacks: 1 },
  { id: "block_trade", name: "Block Trade", description: "Quick buy gets a 100 button", icon: "📦", category: "trading", maxStacks: 1 },
  { id: "dividends", name: "Dividends", description: "Get 2% of held stock value at end of day", icon: "💰", category: "passive", maxStacks: 1 },
  { id: "interest", name: "Interest Account", description: "Earn 0.5% interest on idle cash at end of day", icon: "🏧", category: "passive", maxStacks: 1 },
  { id: "staking", name: "Staking Rewards", description: "Stocks held 3+ days earn 1% per day bonus", icon: "⏳", category: "passive", maxStacks: 1 },
  { id: "royalties", name: "Royalties", description: "Earn $5 per entertainment stock held, per tick", icon: "👑", category: "passive", maxStacks: 1 },
  { id: "monitor", name: "Extra Monitor", description: "Gain another monitor (max 3)", icon: "🖥️", category: "ui", maxStacks: 2 },
];
