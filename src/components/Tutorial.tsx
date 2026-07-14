import { useState, useEffect, useCallback, useRef } from "react";
import type { MonitorChannel } from "../game/types";

interface TutorialStep {
  title: string;
  body: string;
  icon: string;
  selector?: string;
  position?: "bottom" | "top" | "left" | "right";
  channel?: MonitorChannel;
  action?: string; // Custom action key handled by parent // Switch monitor to this channel on enter
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
    body: "This is your monitor — your window to the market. It shows different channels of information to help you make trading decisions.",
    selector: ".monitor-bezel",
    position: "right",
    channel: "stock_ticker",
  },
  {
    icon: "📊",
    title: "Stock Ticker (Key: 1)",
    body: "The Stocks channel shows live price charts. Click a stock tab to view it, use the search bar to filter by name or tag, and use the Buy/Sell/Short/Cover buttons to trade.",
    selector: ".monitor-content",
    position: "right",
    channel: "stock_ticker",
  },
  {
    icon: "📰",
    title: "Business News (Key: 2)",
    body: "Earnings reports, acquisitions, and company news appear here. Each story shows its market impact — which stocks are affected, how strong, and how long the effect lasts.",
    selector: ".monitor-content",
    position: "right",
    channel: "business_news",
  },
  {
    icon: "🌍",
    title: "Global News (Key: 3)",
    body: "Trade wars, interest rates, and geopolitical events move entire sectors. Watch the impact info to see which tags (tech, energy, etc.) are being affected.",
    selector: ".monitor-content",
    position: "right",
    channel: "global_news",
  },
  {
    icon: "💬",
    title: "Social Media (Key: 4)",
    body: "r/WallStreetYOLOs — retail traders pump stocks here. Viral posts can cause big swings. The impact info shows exactly what each post does to the market.",
    selector: ".monitor-content",
    position: "right",
    channel: "social_media",
  },
  {
    icon: "🤫",
    title: "Insider Tips (Key: 5)",
    body: "Anonymous contacts send insider tips. Viewing them gives you advance knowledge, but trading on them risks SEC fines! Use at your own risk.",
    selector: ".monitor-content",
    position: "right",
    channel: "insider",
  },
  {
    icon: "🎛️",
    title: "Channel Buttons",
    body: "Use these buttons at the bottom (or press keys 1-5) to switch between all five channels anytime.",
    selector: ".monitor-controls",
    position: "top",
    channel: "stock_ticker",
  },
  {
    icon: "💰",
    title: "Trading Panel",
    body: "Your portfolio, cash balance, and positions are shown here. This is your financial overview — watch your net worth grow!",
    selector: ".sidebar",
    position: "left",
    channel: "stock_ticker",
  },
  {
    icon: "📋",
    title: "Orders Panel",
    body: "This opens the Orders panel where you can place advanced orders that execute automatically.",
    selector: ".orders-tab-strip",
    position: "left",
    action: "open-orders",
  },
  {
    icon: "📝",
    title: "Limit & Stop Orders",
    body: "Set a Limit Order to buy/sell at a specific price, or a Stop Order to trigger when price hits a threshold. You can also trade Options — buy Calls if you think a stock will rise, or Puts if it will drop. Options use Black-Scholes pricing and trade in contracts of 100 shares.",
    selector: ".orders-flyout",
    position: "left",
    action: "open-orders",
  },
  {
    icon: "⏱️",
    title: "Time & Speed",
    body: "The time bar shows how much of the trading day is left. Use the speed buttons (1x, 2x, 5x, 10x) to control how fast time passes. Press ESC to pause.",
    selector: ".header-controls",
    position: "bottom",
  },
  {
    icon: "🎯",
    title: "Milestones & Goal",
    body: "Every 3 days, your net worth is checked against a milestone. The targets grow each period — start at $1,500 and increase from there. Every evening, you'll work at Shwendy's restaurant to earn extra cash.",
    selector: ".milestone-stat",
    position: "bottom",
  },
  {
    icon: "🏆",
    title: "Daily Challenges",
    body: "Each day you'll receive a challenge — like making a certain profit or trading a specific stock. Complete it to earn restaurant tickets (🍔) that you can spend in the shop on Shwendy's consumable items!",
  },
  {
    icon: "🎒",
    title: "Consumable Items (Key: 6)",
    body: "Press 6 to open your Items channel. Here you can use one-time consumable items during trading — things like free stock purchases, doubled price movement, or rewinding time. Buy them in the shop with your tickets. Good luck, trader!",
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
    title: "Order Queue",
    body: "Orders appear in these slots. Press the slot number (1-5) or click to start working on an order. Each order has a patience timer — complete it before the customer leaves!",
    selector: ".restaurant-queue",
    position: "bottom",
  },
  {
    icon: "🔥",
    title: "Active Work Area",
    body: "This is where you prepare the active order. Steps include grilling (watch for the green flip zone!), chopping (alternate ← → arrows), mixing (swirl your mouse), and more.",
    selector: ".restaurant-work-area",
    position: "top",
  },
  {
    icon: "⚠️",
    title: "Order Modifications",
    body: "Some customers want modifications — like \"No lettuce\". Read the order ticket carefully! If you add an unwanted ingredient or skip a wanted one, the order will be marked incorrect and you won't get a tip.",
    selector: ".order-slot:first-child",
    position: "bottom",
    action: "setup-modification",
  },
  {
    icon: "✅",
    title: "Serving & Multitasking",
    body: "When an order is done, press its number, Enter, or click to serve. While one order preps automatically, switch to another to multitask!",
    selector: ".order-slot:first-child",
    position: "bottom",
    action: "setup-completed",
  },
  {
    icon: "🏆",
    title: "Daily Challenges",
    body: "Each shift has a challenge — like completing a number of orders or earning enough tips. Complete it to earn trading tickets (📈) that you can spend in the shop on day trading consumable items!",
  },
  {
    icon: "🎒",
    title: "Consumable Items",
    body: "During your shift, you can use consumable items from your inventory — like slowing patience timers, boosting tips, or auto-completing prep. Press the item buttons in the header to activate them. At shift end, you'll pick a kitchen upgrade and new menu item. Good luck, chef!",
  },
];

interface TutorialProps {
  steps: TutorialStep[];
  onComplete: () => void;
  onStepChange?: (step: TutorialStep, index: number) => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function Tutorial({ steps, onComplete, onStepChange }: TutorialProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Notify parent when step changes (including initial render)
  useEffect(() => {
    onStepChange?.(steps[stepIndex], stepIndex);
  }, [stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const measureElement = useCallback(() => {
    if (!step.selector) {
      setSpotlight(null);
      return;
    }
    const el = document.querySelector(step.selector);
    if (!el) {
      setSpotlight(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 8;
    setSpotlight({
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    });
  }, [step.selector]);

  // Re-measure after a short delay to let channel switch render
  useEffect(() => {
    measureElement();
    const timer = setTimeout(measureElement, 50);
    window.addEventListener("resize", measureElement);
    return () => {
      window.removeEventListener("resize", measureElement);
      clearTimeout(timer);
    };
  }, [measureElement]);

  const getCardStyle = (): React.CSSProperties => {
    if (!spotlight || !step.selector) {
      return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }

    const pos = step.position || "bottom";
    const gap = 16;
    const cardWidth = 380;

    switch (pos) {
      case "bottom":
        return {
          position: "fixed",
          top: spotlight.top + spotlight.height + gap,
          left: Math.max(16, Math.min(spotlight.left + spotlight.width / 2 - cardWidth / 2, window.innerWidth - cardWidth - 16)),
          maxWidth: cardWidth,
        };
      case "top":
        return {
          position: "fixed",
          bottom: window.innerHeight - spotlight.top + gap,
          left: Math.max(16, Math.min(spotlight.left + spotlight.width / 2 - cardWidth / 2, window.innerWidth - cardWidth - 16)),
          maxWidth: cardWidth,
        };
      case "left":
        return {
          position: "fixed",
          top: Math.max(16, spotlight.top + spotlight.height / 2 - 100),
          right: window.innerWidth - spotlight.left + gap,
          maxWidth: cardWidth,
        };
      case "right":
        return {
          position: "fixed",
          top: Math.max(16, spotlight.top + spotlight.height / 2 - 100),
          left: spotlight.left + spotlight.width + gap,
          maxWidth: cardWidth,
        };
    }
  };

  return (
    <div className="tutorial-overlay">
      <svg className="tutorial-spotlight-svg" width="100%" height="100%">
        <defs>
          <mask id="tutorial-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlight && (
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx="10"
                ry="10"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#tutorial-mask)"
        />
        {spotlight && (
          <rect
            x={spotlight.left}
            y={spotlight.top}
            width={spotlight.width}
            height={spotlight.height}
            rx="10"
            ry="10"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            className="tutorial-spotlight-border"
          />
        )}
      </svg>

      <div ref={cardRef} className="tutorial-card" style={getCardStyle()}>
        <div className="tutorial-progress">
          {steps.map((_, i) => (
            <div key={i} className={`tutorial-dot ${i === stepIndex ? "active" : i < stepIndex ? "done" : ""}`} />
          ))}
        </div>
        <div className="tutorial-card-header">
          <span className="tutorial-icon">{step.icon}</span>
          <h2 className="tutorial-title">{step.title}</h2>
        </div>
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
export type { TutorialStep };

