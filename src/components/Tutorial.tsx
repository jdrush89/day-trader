import { useState } from "react";

interface TutorialStep {
  title: string;
  body: string;
  icon: string;
}

const TRADING_STEPS: TutorialStep[] = [
  {
    icon: "📈",
    title: "Welcome to Rogue Day Trader!",
    body: "You've taken out a loan to start day trading. Your goal is to grow your net worth by buying low and selling high. Every 3 days, you'll need to hit a milestone net worth — fail and it's game over!",
  },
  {
    icon: "🖥️",
    title: "Your Monitor",
    body: "Your monitor is your window to the market. Use the number keys 1-5 to switch between channels. When you have multiple monitors, use Shift+Number to select which monitor to control.",
  },
  {
    icon: "📊",
    title: "Stock Ticker (Key: 1)",
    body: "This is your main view. Browse available stocks, view price charts, and execute trades. Click a stock tab to view its chart, or use the search bar to filter by name or tag.",
  },
  {
    icon: "📰",
    title: "Business News (Key: 2)",
    body: "Earnings reports, acquisitions, and company news appear here. Each story shows a debug panel with its market impact — which stocks or sectors are affected, how strong, and how long.",
  },
  {
    icon: "🌍",
    title: "Global News (Key: 3)",
    body: "Trade wars, interest rates, and geopolitical events move entire sectors. Watch the debug info to see which tags (tech, energy, etc.) are being impacted.",
  },
  {
    icon: "💬",
    title: "Social Media (Key: 4)",
    body: "r/WallStreetYOLOs — retail traders pump stocks here. Viral posts can cause big swings. The debug info shows exactly what impact each post has on the market.",
  },
  {
    icon: "🤫",
    title: "Insider Tips (Key: 5)",
    body: "Anonymous contacts send insider tips. Viewing them gives you advance knowledge, but trading on them risks SEC fines! The debug info shows the direction and probability.",
  },
  {
    icon: "💰",
    title: "Buying & Selling",
    body: "On the stock chart, use the Buy and Sell buttons to trade shares. You can also Short stocks (betting the price drops) and Cover to close short positions. The sidebar shows your portfolio and positions.",
  },
  {
    icon: "📋",
    title: "Orders Panel",
    body: "Click the Orders tab on the right to place limit orders, stop orders, and trade options (calls and puts). These execute automatically when price conditions are met.",
  },
  {
    icon: "🎯",
    title: "Milestones & Goal",
    body: "Every 3 days, your net worth is checked against a milestone. The targets grow each period — start at $1,500 and increase from there. Miss a milestone and it's game over! On even days, you'll work at Shwendy's restaurant to earn extra cash.",
  },
  {
    icon: "⏸️",
    title: "Controls",
    body: "Press ESC to pause. Use the speed controls (1x, 2x, 5x) to control how fast time moves. Good luck, trader!",
  },
];

const RESTAURANT_STEPS: TutorialStep[] = [
  {
    icon: "🍔",
    title: "Welcome to Shwendy's!",
    body: "Every other day, you work a shift at Shwendy's restaurant. Complete orders to earn cash for your next day of trading!",
  },
  {
    icon: "📋",
    title: "Taking Orders",
    body: "Orders appear in slots at the top. Press the slot number (1-5) to start working on that order, or click it. Each order has a patience timer — complete it before the customer leaves!",
  },
  {
    icon: "🔥",
    title: "Prep Steps — Grilling & Frying",
    body: "Some items need grilling or frying. A progress bar fills automatically. Watch for the green zone — press F to flip at the right time! Don't wait too long or the food will burn.",
  },
  {
    icon: "🔪",
    title: "Prep Steps — Chopping",
    body: "Chopping requires pressing the left and right arrow keys in quick alternation. Keep going until the progress bar fills up!",
  },
  {
    icon: "🥄",
    title: "Prep Steps — Mixing",
    body: "Mixing is done by moving your mouse in circles. You need to do multiple full rotations to complete the mix — keep swirling!",
  },
  {
    icon: "🎵",
    title: "Prep Steps — Rhythm, Hold & Memorize",
    body: "Advanced recipes have special steps. Rhythm: press keys on the beat. Hold: hold a key and release in the green zone. Memorize: watch a sequence, then repeat it from memory.",
  },
  {
    icon: "🍞",
    title: "Assembling Ingredients",
    body: "After prep, assemble the order by pressing the key for each ingredient. Press the correct key to add it, or press Space to skip to the next ingredient.",
  },
  {
    icon: "⚠️",
    title: "Order Modifications",
    body: "Some customers want modifications — like \"No lettuce\" or \"No tomato\". Read the order ticket carefully! If you add an unwanted ingredient or skip a wanted one, the order will be marked incorrect and you won't get a tip.",
  },
  {
    icon: "✅",
    title: "Serving Orders",
    body: "When an order is complete, press the slot number, press Enter, or click the order to serve it. Faster service = bigger tips!",
  },
  {
    icon: "🔀",
    title: "Multitasking",
    body: "While prep is happening on one order, switch to another by pressing its number. Work on multiple orders at once to maximize your earnings! At the end of the shift, you'll pick a restaurant upgrade and a new menu item. Good luck, chef!",
  },
];

interface TutorialProps {
  steps: TutorialStep[];
  onComplete: () => void;
}

export function Tutorial({ steps, onComplete }: TutorialProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-card">
        <div className="tutorial-progress">
          {steps.map((_, i) => (
            <div key={i} className={`tutorial-dot ${i === stepIndex ? "active" : i < stepIndex ? "done" : ""}`} />
          ))}
        </div>
        <div className="tutorial-icon">{step.icon}</div>
        <h2 className="tutorial-title">{step.title}</h2>
        <p className="tutorial-body">{step.body}</p>
        <div className="tutorial-buttons">
          <button className="tutorial-skip" onClick={onComplete}>Skip Tutorial</button>
          <div className="tutorial-nav">
            {stepIndex > 0 && <button className="tutorial-back" onClick={() => setStepIndex(stepIndex - 1)}>← Back</button>}
            <button className="tutorial-next" onClick={isLast ? onComplete : () => setStepIndex(stepIndex + 1)}>
              {isLast ? "Let's Go! →" : "Next →"}
            </button>
          </div>
        </div>
        <div className="tutorial-counter">{stepIndex + 1} / {steps.length}</div>
      </div>
    </div>
  );
}

export { TRADING_STEPS, RESTAURANT_STEPS };
