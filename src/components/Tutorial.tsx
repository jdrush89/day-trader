import { useState, useEffect, useCallback, useRef } from "react";

interface TutorialStep {
  title: string;
  body: string;
  icon: string;
  selector?: string; // CSS selector to highlight
  position?: "bottom" | "top" | "left" | "right"; // tooltip position relative to element
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
  },
  {
    icon: "🎛️",
    title: "Channel Buttons",
    body: "Use these buttons (or press keys 1-5) to switch between channels: Stocks, Business News, Global News, Social Media, and Insider Tips.",
    selector: ".monitor-controls",
    position: "top",
  },
  {
    icon: "📊",
    title: "Stock Ticker",
    body: "The Stocks channel shows price charts. Click a stock tab to view it, use the search bar to filter, and use the Buy/Sell buttons to trade.",
    selector: ".monitor-content",
    position: "right",
  },
  {
    icon: "💰",
    title: "Trading Panel",
    body: "Your portfolio, cash balance, and positions are shown here. This is your financial overview — watch your net worth grow!",
    selector: ".sidebar",
    position: "left",
  },
  {
    icon: "📋",
    title: "Orders Panel",
    body: "Click this tab to open the Orders panel. Place limit orders, stop orders, and trade options (calls and puts). These execute automatically when conditions are met.",
    selector: ".orders-tab-strip",
    position: "left",
  },
  {
    icon: "⏱️",
    title: "Time & Speed",
    body: "The time bar shows how much of the trading day is left. Use the speed buttons (1x, 2x, 5x) to control how fast time passes. Press ESC to pause.",
    selector: ".header-controls",
    position: "bottom",
  },
  {
    icon: "🎯",
    title: "Milestones & Goal",
    body: "Every 3 days, your net worth is checked against a milestone. The targets grow each period — start at $1,500 and increase from there. On even days, you'll work at Shwendy's restaurant to earn extra cash. Good luck, trader!",
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
  },
  {
    icon: "✅",
    title: "Serving & Multitasking",
    body: "When an order is done, press its number, Enter, or click to serve. While one order preps automatically, switch to another to multitask! At shift end, you'll pick a kitchen upgrade and new menu item. Good luck, chef!",
  },
];

interface TutorialProps {
  steps: TutorialStep[];
  onComplete: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function Tutorial({ steps, onComplete }: TutorialProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

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

  useEffect(() => {
    measureElement();
    window.addEventListener("resize", measureElement);
    return () => window.removeEventListener("resize", measureElement);
  }, [measureElement]);

  // Compute tooltip position
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
      {/* SVG overlay with cutout */}
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

      {/* Tooltip card */}
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

