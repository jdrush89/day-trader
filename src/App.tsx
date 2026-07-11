import { useState, useEffect, useCallback, useRef } from "react";
import { GameState, MonitorChannel, OrderType, OrderSide } from "./game/types";
import { createInitialState } from "./game/state";
import { tick, buyStock, sellStock, shortStock, coverShort, openMarket, placeOrder, cancelOrder, getMilestone, draftStock, togglePinStock, acquireUpgrade, upgradeCount, hasUpgrade, buyOption, sellOption, closeOption, getOptionsValue } from "./game/engine";
import { acquireRestaurantUpgrade, createRestaurantState, draftMenuItem, finishRestaurantDay, restaurantTick, MENU } from "./game/restaurant-engine";
import { RestaurantState } from "./game/restaurant-types";
import { RESTAURANT_UPGRADE_POOL } from "./game/restaurant-upgrades";
import { UPGRADE_POOL } from "./game/upgrades";
import { Monitor } from "./components/Monitor";
import { TradingPanel } from "./components/TradingPanel";
import { OrdersPanel } from "./components/OrdersPanel";
import { Restaurant } from "./components/Restaurant";
import { SecWheel } from "./components/SecWheel";
import { DebugPanel } from "./components/DebugPanel";
import { Tutorial, TRADING_STEPS, RESTAURANT_STEPS, type TutorialStep } from "./components/Tutorial";
import { saveGame, loadGame, deleteSave } from "./game/save";
import titleScreen from "./assets/title-screen.png";
import shwendysExterior from "./assets/shwendys-exterior.png";

function App() {
  const [showTitle, setShowTitle] = useState(true);
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [speed, setSpeed] = useState<number>(1);
  const [paused, setPaused] = useState(false);
  const [showOptions, setShowOptions] = useState<"title" | "pause" | null>(null);
  const [textSize, setTextSize] = useState<number>(() => {
    const saved = localStorage.getItem("rogue-day-trader-text-size");
    return saved ? parseFloat(saved) : 100;
  });

  const [ordersOpen, setOrdersOpen] = useState(false);
  const [eodPhase, setEodPhase] = useState<"summary" | "upgrades" | "stocks" | "restaurant-upgrades" | "menu-draft">("summary");
  const [restaurantState, setRestaurantState] = useState<RestaurantState | null>(null);
  const [activeMonitorId, setActiveMonitorId] = useState(0);
  const [showTransition, setShowTransition] = useState<"restaurant" | null>(null);
  const [titleTutorial, setTitleTutorial] = useState<"pick" | "trading" | "restaurant" | null>(null);
  const [menuFocusIndex, setMenuFocusIndex] = useState(-1);
  const [showLoanOffer, setShowLoanOffer] = useState<{ amount: number; interestRate: number; dueDay: number; isEmergency: boolean } | null>(null);
  const [bossDay, setBossDay] = useState(false);
  const [bossView, setBossView] = useState<"trading" | "restaurant">("trading");
  const [bossResult, setBossResult] = useState<{ passed: boolean; tradingProfit: number; missedOrders: number; requiredProfit: number; maxMissed: number } | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    document.documentElement.style.fontSize = `${textSize}%`;
    localStorage.setItem("rogue-day-trader-text-size", String(textSize));
  }, [textSize]);

  useEffect(() => {
    if (gameState.gameOver || !gameState.marketOpen || paused || titleTutorial || showLoanOffer) return;
    const interval = setInterval(() => setGameState((prev) => tick(prev)), 1000 / speed);
    return () => clearInterval(interval);
  }, [gameState.marketOpen, gameState.gameOver, speed, paused, titleTutorial, showLoanOffer]);

  // Boss day: tick restaurant alongside trading
  const lastBossEarningsRef = useRef(0);
  useEffect(() => {
    if (!bossDay || !restaurantState || paused || !gameState.marketOpen || restaurantState.shiftOver) return;
    const interval = setInterval(() => {
      setRestaurantState((prev) => {
        if (!prev) return prev;
        const next = restaurantTick(prev, 0.05 * speed);
        // Sync restaurant earnings to cash in real-time during boss day
        const earningsDelta = next.totalEarnings - lastBossEarningsRef.current;
        if (earningsDelta > 0) {
          lastBossEarningsRef.current = next.totalEarnings;
          setGameState((gs) => ({ ...gs, cash: Math.round((gs.cash + earningsDelta) * 100) / 100 }));
        }
        return next;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [bossDay, restaurantState, paused, gameState.marketOpen, speed]);

  const CHANNEL_KEYS: MonitorChannel[] = ["stock_ticker", "business_news", "global_news", "social_media", "insider"];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showTitle) {
        if (titleTutorial && titleTutorial !== "pick") return;
        const buttons = Array.from(document.querySelectorAll('.title-menu-bottom .title-start-btn')) as HTMLButtonElement[];
        if (buttons.length === 0) return;
        e.preventDefault();

        if (e.key === "ArrowDown" || e.key === "Tab" || e.key === "ArrowRight") {
          e.preventDefault();
          setMenuFocusIndex((prev) => {
            const next = prev < 0 ? 0 : (prev + 1) % buttons.length;
            buttons[next]?.focus();
            return next;
          });
          return;
        }

        if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          setMenuFocusIndex((prev) => {
            const next = prev <= 0 ? buttons.length - 1 : prev - 1;
            buttons[next]?.focus();
            return next;
          });
          return;
        }

        if (e.key === "Enter") {
          const idx = menuFocusIndex >= 0 ? menuFocusIndex : 0;
          buttons[idx]?.click();
          return;
        }

        // Any other key: focus the first button
        if (menuFocusIndex < 0) {
          setMenuFocusIndex(0);
          buttons[0]?.focus();
        }
        return;
      }

      if (e.key === "Escape") {
        if (showDebug) {
          setShowDebug(false);
        } else if (showOptions === "pause") {
          setShowOptions(null);
        } else {
          setShowOptions(null);
          setPaused((p) => !p);
        }
        return;
      }

      // Debug menu toggle
      if (e.key === "n" && paused && !showDebug) {
        setShowDebug(true);
        return;
      }

      // Boss day: toggle between trading and restaurant views
      if (e.key === "/" && bossDay) {
        e.preventDefault();
        setBossView((v) => v === "trading" ? "restaurant" : "trading");
        return;
      }

      if (restaurantState && !bossDay) return;
      if (bossDay && bossView === "restaurant") return;

      // Shift+number selects which monitor is active
      if (e.shiftKey && /^[1-3]$/.test(e.key)) {
        const monitorIdx = parseInt(e.key, 10) - 1;
        if (monitorIdx < gameState.monitors.length) {
          e.preventDefault();
          setActiveMonitorId(gameState.monitors[monitorIdx].id);
        }
        return;
      }

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= CHANNEL_KEYS.length) {
        const active = document.activeElement;
        const tag = active?.tagName.toLowerCase();
        const isStockSearch = active?.classList.contains("stock-search-input");
        const isStockNav = active?.closest(".stock-ticker-view") && tag === "button";
        if ((tag === "input" || tag === "select" || tag === "textarea") && !isStockSearch) return;
        if (isStockNav) return;
        e.preventDefault();
        setGameState((prev) => ({
          ...prev,
          monitors: prev.monitors.map((m) => (m.id === activeMonitorId ? { ...m, channel: CHANNEL_KEYS[num - 1] } : m)),
        }));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeMonitorId, restaurantState, showTitle, titleTutorial, menuFocusIndex, bossDay, bossView, paused, showDebug, showOptions]);

  useEffect(() => {
    if (gameState.marketOpen) setEodPhase("summary");
    // Auto-save when market closes (end of trading day)
    if (!gameState.marketOpen && !gameState.gameOver) saveGame(gameState);
  }, [gameState.marketOpen]);

  const handleChangeChannel = useCallback((monitorId: number, channel: MonitorChannel) => {
    setGameState((prev) => ({
      ...prev,
      monitors: prev.monitors.map((m) => (m.id === monitorId ? { ...m, channel } : m)),
    }));
  }, []);

  const handleSelectStock = useCallback((monitorId: number, symbol: string) => {
    setGameState((prev) => ({
      ...prev,
      monitors: prev.monitors.map((m) => (m.id === monitorId ? { ...m, selectedStock: symbol } : m)),
    }));
  }, []);

  const handleBuy = useCallback((symbol: string, shares: number) => setGameState((prev) => buyStock(prev, symbol, shares)), []);
  const handleSell = useCallback((symbol: string, shares: number) => setGameState((prev) => sellStock(prev, symbol, shares)), []);
  const handleShort = useCallback((symbol: string, shares: number) => setGameState((prev) => shortStock(prev, symbol, shares)), []);
  const handleCover = useCallback((symbol: string, shares: number) => setGameState((prev) => coverShort(prev, symbol, shares)), []);
  const handleTogglePin = useCallback((symbol: string) => setGameState((prev) => togglePinStock(prev, symbol)), []);
  const handleToggleStopLoss = useCallback(() => setGameState((prev) => ({ ...prev, stopLossEnabled: !prev.stopLossEnabled })), []);
  const handlePlaceOrder = useCallback((symbol: string, side: OrderSide, shares: number, orderType: OrderType, limitPrice?: number, stopPrice?: number) => {
    setGameState((prev) => placeOrder(prev, symbol, side, shares, orderType, limitPrice, stopPrice));
  }, []);
  const handleCancelOrder = useCallback((orderId: string) => setGameState((prev) => cancelOrder(prev, orderId)), []);
  const handleBuyOption = useCallback((symbol: string, type: "call" | "put", strike: number, days: number, contracts: number) => {
    setGameState((prev) => buyOption(prev, symbol, type, strike, days, contracts));
  }, []);
  const handleSellOption = useCallback((symbol: string, type: "call" | "put", strike: number, days: number, contracts: number) => {
    setGameState((prev) => sellOption(prev, symbol, type, strike, days, contracts));
  }, []);
  const handleCloseOption = useCallback((optionId: string) => {
    setGameState((prev) => closeOption(prev, optionId));
  }, []);

  const handleTradingTutorialStep = useCallback((step: TutorialStep) => {
    // Handle actions
    if (step.action === "open-orders") {
      setOrdersOpen(true);
    } else {
      setOrdersOpen(false);
    }

    if (!step.channel && !step.action) return;
    // Switch the monitor channel to match the tutorial step
    if (step.channel) {
      setGameState((prev) => {
        let news = prev.news;
        // Seed sample news if empty so the tutorial channels aren't blank
        if (news.length === 0) {
          const stock = prev.stocks[0];
          news = [
            {
              id: "tutorial-biz", headline: `${stock.symbol} Posts Record Q3 Earnings`, body: `${stock.name} has exceeded analyst expectations with a 15% revenue increase.`,
              category: "business", timestamp: Date.now(), affectedStocks: [stock.symbol], sentiment: "positive" as const,
              earnings: { revenue: "$4.2B", profit: "$890M", growth: "+15%", spending: "$1.1B", guidance: "Strong" },
              impact: { description: `${stock.symbol} earnings beat → stock likely to rise`, effects: [{ symbol: stock.symbol, direction: "up" as const, strength: "moderate" as const }], probability: 0.8, delay: 5, duration: 20, ticksRemaining: 25 },
            },
            {
              id: "tutorial-global", headline: "Fed Signals Rate Cuts Amid Cooling Inflation", body: "",
              category: "global", timestamp: Date.now(), sentiment: "positive" as const, affectedTags: ["finance", "banking"],
              impact: { description: "Rate cuts bullish for finance sector", effects: [{ tag: "finance", direction: "up" as const, strength: "moderate" as const }], probability: 0.7, delay: 5, duration: 20, ticksRemaining: 25 },
            },
            {
              id: "tutorial-social", headline: `$${stock.symbol} is about to MOON 🚀🚀🚀`, body: `I just YOLO'd my entire portfolio into ${stock.name}. This stock is going to the stratosphere. Trust me bro.`,
              category: "social", timestamp: Date.now(), affectedStocks: [stock.symbol], sentiment: "positive" as const,
              author: "DiamondHands420", upvotes: 847, commentCount: 156,
              impact: { description: `Retail hype pumping ${stock.symbol}`, effects: [{ symbol: stock.symbol, direction: "up" as const, strength: "weak" as const }], probability: 0.5, delay: 0, duration: 15, ticksRemaining: 15 },
            },
          ];
        }
        return {
          ...prev,
          news,
          monitors: prev.monitors.map((m, i) => i === 0 ? { ...m, channel: step.channel! } : m),
        };
      });
    }
  }, []);

  const handleRestaurantTutorialStep = useCallback((step: TutorialStep) => {
    if (step.action === "setup-modification") {
      setRestaurantState((prev) => {
        if (!prev) return prev;
        const burger = MENU.find((m) => m.name === "Classic Burger") ?? MENU[0];
        const order = {
          id: 9000,
          menuItem: burger,
          currentStepIndex: 0,
          prepProgress: 0,
          prepStarted: false,
          flipped: false,
          burnt: false,
          chopCount: 0,
          lastChopKey: null as "left" | "right" | null,
          mixProgress: 0,
          lastMousePos: null,
          assembleIndex: 0,
          rhythmHitIndex: 0,
          rhythmHits: 0,
          rhythmResults: [] as ("pending" | "hit" | "miss")[],
          holdStartTick: null,
          holdProgress: 0,
          holdReleased: false,
          memorizeSequence: [] as string[],
          memorizeRevealed: false,
          memorizeRevealTimer: 0,
          memorizeInputIndex: 0,
          startTime: Date.now(),
          patienceRemaining: burger.patience,
          completed: false,
          served: false,
          failed: false,
          failedTimer: 0,
          customizations: { 1: [true, false, true, true, true] } as Record<number, boolean[]>,
          orderCorrect: true,
        };
        const slots = [...prev.orderSlots];
        slots[0] = order;
        return { ...prev, orderSlots: slots, activeOrderId: 9000 };
      });
    } else if (step.action === "setup-completed") {
      setRestaurantState((prev) => {
        if (!prev) return prev;
        const burger = MENU.find((m) => m.name === "Classic Burger") ?? MENU[0];
        const order = {
          id: 9001,
          menuItem: burger,
          currentStepIndex: burger.steps.length,
          prepProgress: 0,
          prepStarted: false,
          flipped: false,
          burnt: false,
          chopCount: 0,
          lastChopKey: null as "left" | "right" | null,
          mixProgress: 0,
          lastMousePos: null,
          assembleIndex: 0,
          rhythmHitIndex: 0,
          rhythmHits: 0,
          rhythmResults: [] as ("pending" | "hit" | "miss")[],
          holdStartTick: null,
          holdProgress: 0,
          holdReleased: false,
          memorizeSequence: [] as string[],
          memorizeRevealed: false,
          memorizeRevealTimer: 0,
          memorizeInputIndex: 0,
          startTime: Date.now(),
          patienceRemaining: burger.patience,
          completed: true,
          served: false,
          failed: false,
          failedTimer: 0,
          customizations: {} as Record<number, boolean[]>,
          orderCorrect: true,
        };
        const slots = [...prev.orderSlots];
        slots[0] = order;
        return { ...prev, orderSlots: slots, activeOrderId: 9001 };
      });
    }
  }, []);

  const beginScheduledDay = useCallback((stateOverride?: GameState) => {
    const nextState = stateOverride ?? gameState;

    // Boss day: when market closes, day is done (restaurant was running alongside)
    if (bossDay && !nextState.marketOpen) {
      const missedOrders = restaurantState?.failedOrders ?? 0;
      // Earnings already added to cash in real-time, pass 0
      const finalState = finishRestaurantDay(nextState, 0);

      // Difficulty scales with milestone number (boss day follows milestone day)
      const milestoneNum = Math.floor((finalState.day - 1) / 3);
      const requiredProfit = 300 + (milestoneNum - 1) * 100;
      const maxMissed = Math.max(2, 5 - Math.floor((milestoneNum - 1) / 2));

      // Calculate trading profit for the day
      const portfolioValue = finalState.portfolio.reduce((sum: number, pos) => {
        const s = finalState.stocks.find((st) => st.symbol === pos.symbol);
        return sum + (s ? s.price * pos.shares : 0);
      }, 0);
      const shortLiability = finalState.shorts.reduce((sum: number, pos) => {
        const s = finalState.stocks.find((st) => st.symbol === pos.symbol);
        return sum + (s ? s.price * pos.shares : 0);
      }, 0);
      const shortCollateral = finalState.shorts.reduce((sum: number, pos) => sum + pos.entryPrice * pos.shares, 0);
      const optionsVal = getOptionsValue(finalState);
      const currentNetWorth = finalState.cash + portfolioValue + shortCollateral - shortLiability + optionsVal;
      const tradingProfit = currentNetWorth - finalState.dayStartNetWorth;

      const passed = tradingProfit >= requiredProfit && missedOrders <= maxMissed;
      setBossResult({ passed, tradingProfit, missedOrders, requiredProfit, maxMissed });

      setGameState(finalState);
      setRestaurantState(null);
      setBossDay(false);
      setEodPhase("summary");
      saveGame(finalState);
      if (finalState.restaurantUpgradeDraftOptions.length > 0) setEodPhase("restaurant-upgrades");
      else if (finalState.menuDraftOptions.length > 0) setEodPhase("menu-draft");
      return;
    }

    // After trading (market just closed), go to Shwendy's
    if (!nextState.marketOpen && restaurantState === null) {
      setGameState(nextState);
      setShowTransition("restaurant");
      setEodPhase("summary");
      return;
    }

    // After Shwendy's (or starting a new day), open the market
    setRestaurantState(null);
    setSpeed(1);
    const marketState = openMarket(nextState);
    setGameState(marketState);
    setEodPhase("summary");

    // Check if this is a boss day (day after a milestone)
    const isBossDay = marketState.day > 3 && (marketState.day - 1) % 3 === 0;
    setBossDay(isBossDay);
    setBossView("trading");
    if (isBossDay) {
      lastBossEarningsRef.current = 0;
      const rs = createRestaurantState(marketState);
      // Boss day: restaurant runs until market closes, not on its own timer
      setRestaurantState({ ...rs, shiftTimeRemaining: 9999 });
    }

    // Offer a loan after day 1, but not on boss days
    if (marketState.day > 1 && !isBossDay) {
      const milestone = getMilestone(marketState.day);
      const nextMilestoneDay = milestone?.checkDay ?? marketState.day + 3;
      const dueDay = nextMilestoneDay <= marketState.day ? nextMilestoneDay + 3 : nextMilestoneDay;

      if (marketState.cash < 0) {
        // Emergency loan: fixed high rate
        const amount = Math.abs(marketState.cash) + 500;
        setShowLoanOffer({ amount: Math.round(amount * 100) / 100, interestRate: 0.35, dueDay, isEmergency: true });
      } else {
        // Normal loan: random 20-100% of milestone target, random 5-30% interest
        const milestoneTarget = milestone?.required ?? 2000;
        const pct = 0.2 + Math.random() * 0.8;
        const amount = Math.round(milestoneTarget * pct);
        const interestRate = Math.round((0.05 + Math.random() * 0.25) * 100) / 100;
        setShowLoanOffer({ amount, interestRate, dueDay, isEmergency: false });
      }
    }
  }, [gameState, restaurantState, bossDay]);

  const handleNewDay = useCallback(() => {
    if (gameState.upgradeDraftOptions.length > 0) setEodPhase("upgrades");
    else if (gameState.stockDraftOptions.length > 0) setEodPhase("stocks");
    else beginScheduledDay();
  }, [beginScheduledDay, gameState]);

  const restaurantUpgradeCount = useCallback(
    (upgradeId: string) => gameState.acquiredRestaurantUpgrades.filter((id) => id === upgradeId).length,
    [gameState.acquiredRestaurantUpgrades],
  );

  const handleAcquireUpgrade = useCallback((upgradeId: string) => {
    const nextState = acquireUpgrade(gameState, upgradeId);
    if (nextState.stockDraftOptions.length > 0) {
      setGameState(nextState);
      setEodPhase("stocks");
      return;
    }

    beginScheduledDay(nextState);
  }, [beginScheduledDay, gameState]);

  const handleDraftStock = useCallback((symbol: string) => {
    beginScheduledDay(draftStock(gameState, symbol));
  }, [beginScheduledDay, gameState]);

  const handleAcquireRestaurantUpgrade = useCallback((upgradeId: string) => {
    const nextState = acquireRestaurantUpgrade(gameState, upgradeId);
    setGameState(nextState);
    if (nextState.menuDraftOptions.length > 0) setEodPhase("menu-draft");
    else {
      setRestaurantState(null);
      beginScheduledDay(nextState);
    }
  }, [beginScheduledDay, gameState]);

  const handleDraftMenuItem = useCallback((itemName: string) => {
    setRestaurantState(null);
    beginScheduledDay(draftMenuItem(gameState, itemName));
  }, [beginScheduledDay, gameState]);

  const handleRestaurantFinish = useCallback((earnings: number) => {
    const nextState = finishRestaurantDay(gameState, earnings);
    setGameState(nextState);
    saveGame(nextState);
    if (nextState.restaurantUpgradeDraftOptions.length > 0) setEodPhase("restaurant-upgrades");
    else if (nextState.menuDraftOptions.length > 0) setEodPhase("menu-draft");
    else {
      setRestaurantState(null);
      beginScheduledDay(nextState);
    }
  }, [beginScheduledDay, gameState]);

  const handleViewInsider = useCallback(() => {
    setGameState((prev) => {
      if (prev.insiderViewed) return prev;
      return {
        ...prev,
        insiderViewed: true,
        insiderViewedTick: prev.timeOfDay,
        insiderSnapshotHoldings: prev.portfolio.map((p) => ({ symbol: p.symbol, shares: p.shares, avgCost: p.avgCost })),
        insiderSnapshotShorts: prev.shorts.map((p) => ({ symbol: p.symbol, shares: p.shares, entryPrice: p.entryPrice })),
      };
    });
  }, []);

  const handleSECWheelResult = useCallback((caught: boolean) => {
    setGameState((prev) => {
      if (!prev.pendingSECCheck) return prev;
      const check = prev.pendingSECCheck;
      if (caught) {
        return {
          ...prev,
          cash: Math.round((prev.cash - check.fineAmount) * 100) / 100,
          secFines: [...prev.secFines, { amount: check.fineAmount, symbol: check.symbol, profit: check.profit, day: prev.day }],
          pendingSECCheck: null,
        };
      }
      return { ...prev, pendingSECCheck: null };
    });
  }, []);

  const handleAcceptLoan = useCallback(() => {
    setGameState((prev) => {
      if (!showLoanOffer) return prev;
      const { amount, interestRate, dueDay } = showLoanOffer;
      return {
        ...prev,
        cash: Math.round((prev.cash + amount) * 100) / 100,
        loans: [...prev.loans, { amount: Math.round(amount * 100) / 100, dueDay, interestRate }],
      };
    });
    setShowLoanOffer(null);
  }, [showLoanOffer]);

  const handleDeclineLoan = useCallback(() => {
    setShowLoanOffer(null);
  }, []);

  const handleRestart = useCallback(() => {
    deleteSave();
    setGameState(createInitialState());
    setRestaurantState(null);
    setBossDay(false);
    setBossResult(null);
    setShowTitle(true);
    setTitleTutorial(null);
    setMenuFocusIndex(-1);
    setEodPhase("summary");
  }, []);

  const formatMarketTime = (pct: number): string => {
    const startMinutes = 570;
    const endMinutes = 960;
    const totalMinutes = startMinutes + (pct / 100) * (endMinutes - startMinutes);
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.floor(totalMinutes % 60);
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHour = hours > 12 ? hours - 12 : hours;
    return `${displayHour}:${mins.toString().padStart(2, "0")} ${ampm}`;
  };

  const showAnalystRating = hasUpgrade(gameState, "analyst_ratings");
  const showDarkPool = hasUpgrade(gameState, "dark_pool");
  const isRestaurantShift = restaurantState !== null && !bossDay;

  if (showTitle) {
    const savedGame = loadGame();
    const handleResume = () => {
      if (savedGame) {
        setGameState(savedGame);
        setShowTitle(false);
      }
    };

    if (titleTutorial === "trading") {
      // Force market open so EOD overlay doesn't show during tutorial
      setGameState((prev) => prev.marketOpen ? prev : { ...prev, marketOpen: true });
      setShowTitle(false);
      return;
    }

    if (titleTutorial === "restaurant") {
      // Start restaurant UI so tutorial can highlight elements
      setShowTitle(false);
      setRestaurantState(createRestaurantState(gameState));
      return;
    }

    if (titleTutorial === "pick") {
      return (
        <div className="title-screen">
          <img src={titleScreen} alt="Day Trader" className="title-screen-bg" />
          <div className="title-screen-overlay title-menu-bottom">
            <h2 className="tutorial-pick-title">📖 Choose a Tutorial</h2>
            <button className="title-start-btn" onClick={() => setTitleTutorial("trading")}>📈 Day Trading</button>
            <button className="title-start-btn" onClick={() => setTitleTutorial("restaurant")}>🍔 Shwendy's Kitchen</button>
            <button className="title-start-btn title-back-btn" onClick={() => { setTitleTutorial(null); setMenuFocusIndex(-1); (document.activeElement as HTMLElement)?.blur(); }}>← Back</button>
          </div>
        </div>
      );
    }

    if (showOptions === "title") {
      return (
        <div className="title-screen">
          <img src={titleScreen} alt="Day Trader" className="title-screen-bg" />
          <div className="title-screen-overlay title-menu-bottom">
            <h2 className="tutorial-pick-title">⚙️ Options</h2>
            <div className="options-row">
              <label className="options-label">Text Size</label>
              <div className="options-slider-wrap">
                <input type="range" min="60" max="150" step="5" value={textSize} onChange={(e) => setTextSize(Number(e.target.value))} className="options-slider" />
                <span className="options-value">{textSize}%</span>
              </div>
            </div>
            <button className="title-start-btn title-back-btn" onClick={() => { setShowOptions(null); setMenuFocusIndex(-1); (document.activeElement as HTMLElement)?.blur(); }}>← Back</button>
          </div>
        </div>
      );
    }

    return (
      <div className="title-screen">
        <img src={titleScreen} alt="Day Trader" className="title-screen-bg" />
        <div className="title-screen-overlay title-menu-bottom">
          {savedGame && (
            <button className="title-start-btn title-resume-btn" onClick={handleResume}>
              RESUME (Day {savedGame.day})
            </button>
          )}
          <button className="title-start-btn" onClick={() => { if (savedGame) deleteSave(); setGameState(createInitialState()); setShowTitle(false); }}>
            {savedGame ? "NEW GAME" : "START TRADING"}
          </button>
          <button className="title-start-btn title-tutorial-btn" onClick={() => { setTitleTutorial("pick"); setMenuFocusIndex(-1); (document.activeElement as HTMLElement)?.blur(); }}>VIEW TUTORIAL</button>
          <button className="title-start-btn title-tutorial-btn" onClick={() => { setShowOptions("title"); setMenuFocusIndex(-1); (document.activeElement as HTMLElement)?.blur(); }}>OPTIONS</button>
        </div>
      </div>
    );
  }

  if (showTransition === "restaurant") {
    const startShift = () => {
      setShowTransition(null);
      setSpeed(1);
      setRestaurantState(createRestaurantState(gameState));
    };
    return (
      <div className="title-screen" onClick={startShift} onKeyDown={startShift} tabIndex={0} ref={(el) => el?.focus()}>
        <img src={shwendysExterior} alt="Shwendy's Restaurant" className="title-screen-bg" />
        <div className="title-screen-overlay transition-overlay">
          <h1 className="transition-title">🍔 Shwendy's</h1>
          <p className="transition-sub">Day {gameState.day} — Evening Shift</p>
          <button className="title-start-btn" onClick={startShift}>START SHIFT</button>
          <p className="title-hint">Press any key to start</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
     {titleTutorial === "trading" && (
       <Tutorial steps={TRADING_STEPS} onComplete={() => {
         setTitleTutorial(null);
         setOrdersOpen(false);
         setShowTitle(true);
         // Restore saved game state (tutorial may have modified it)
         const saved = loadGame();
         setGameState(saved ?? createInitialState());
       }} onStepChange={handleTradingTutorialStep} />
     )}

     {titleTutorial === "restaurant" && (
       <Tutorial steps={RESTAURANT_STEPS} onComplete={() => {
         setTitleTutorial(null);
         setRestaurantState(null);
         setShowTitle(true);
       }} onStepChange={handleRestaurantTutorialStep} />
     )}

     {!isRestaurantShift && (
        <header className="game-header">
          <h1>{bossDay ? "⚠️ BOSS DAY: Day Shift!" : "📈 Day Trader"}</h1>
          {gameState.acquiredUpgrades.length > 0 && (
            <div className="upgrade-icons">
              {[...new Set(gameState.acquiredUpgrades)].map((id) => {
                const card = UPGRADE_POOL.find((u) => u.id === id);
                if (!card) return null;
                const count = gameState.acquiredUpgrades.filter((u) => u === id).length;
                return (
                  <span key={id} className="upgrade-icon" data-tooltip={`${card.name}${count > 1 ? ` x${count}` : ""}: ${card.description}`}>
                    {card.icon}
                  </span>
                );
              })}
            </div>
          )}
          <div className="header-controls">
            <div className="time-bar">
              <div className="time-fill" style={{ width: `${gameState.timeOfDay}%` }} />
              <span className="time-label">{paused ? "⏸ PAUSED" : gameState.marketOpen ? `Day ${gameState.day} — ${formatMarketTime(gameState.timeOfDay)}` : "Market Closed"}</span>
            </div>
            <div className="speed-controls">
              <button className={speed === 1 ? "active" : ""} onClick={() => setSpeed(1)}>1x</button>
              <button className={speed === 2 ? "active" : ""} onClick={() => setSpeed(2)}>2x</button>
              <button className={speed === 5 ? "active" : ""} onClick={() => setSpeed(5)}>5x</button>
              <button className={speed === 10 ? "active" : ""} onClick={() => setSpeed(10)}>10x</button>
            </div>
            {bossDay && restaurantState && (
              <button className="boss-toggle-btn" onClick={() => setBossView((v) => v === "trading" ? "restaurant" : "trading")}>
                {bossView === "trading" ? "🍔 Kitchen" : "📈 Trading"} <kbd>/</kbd>
              </button>
            )}
            {bossDay && restaurantState && (
              <div className="boss-stats">
                <span className={`boss-stat ${restaurantState.failedOrders >= 5 ? "danger" : ""}`}>❌ {restaurantState.failedOrders}/5</span>
              </div>
            )}
          </div>
        </header>
      )}

      {paused && (
        <div className="pause-overlay">
          {showDebug ? (
            <DebugPanel
              gameState={gameState}
              setGameState={(updater) => setGameState(updater)}
              onClose={() => setShowDebug(false)}
            />
          ) : showOptions === "pause" ? (
            <div className="pause-menu">
              <h2>⚙️ Options</h2>
              <div className="options-row">
                <label className="options-label">Text Size</label>
                <div className="options-slider-wrap">
                  <input type="range" min="60" max="150" step="5" value={textSize} onChange={(e) => setTextSize(Number(e.target.value))} className="options-slider" />
                  <span className="options-value">{textSize}%</span>
                </div>
              </div>
              <button className="pause-menu-btn" onClick={() => setShowOptions(null)}>← Back</button>
            </div>
          ) : (
            <div className="pause-menu">
              <h2>⏸ Paused</h2>
              <button className="pause-menu-btn resume" onClick={() => { setShowOptions(null); setPaused(false); }}>Resume</button>
              <button className="pause-menu-btn" onClick={() => setShowOptions("pause")}>Options</button>
            <button className="pause-menu-btn save-quit" onClick={() => { saveGame(gameState); setPaused(false); setRestaurantState(null); setShowTitle(true); setMenuFocusIndex(-1); }}>Save & Quit</button>
            <button className="pause-menu-btn restart" onClick={() => { setPaused(false); handleRestart(); }}>Start Over</button>
            <p className="pause-hint">Press ESC to resume</p>
          </div>
          )}
        </div>
      )}

      {gameState.gameOver && (
        <div className="game-over-overlay">
          <div className="game-over">
            <h2>💸 MARGIN CALLED</h2>
            <p>You survived {gameState.day} days</p>
            <p>Total P&L: ${gameState.totalProfit.toFixed(2)}</p>
            <button onClick={handleRestart}>Try Again</button>
          </div>
        </div>
      )}

      {isRestaurantShift && restaurantState && !gameState.gameOver ? (
        <Restaurant
          day={gameState.day}
          paused={paused || titleTutorial === "restaurant"}
          state={restaurantState}
          setRestaurantState={setRestaurantState}
          onFinish={handleRestaurantFinish}
          milestoneTarget={(() => {
            const m = getMilestone(gameState.day);
            if (!m) return null;
            const loansDue = gameState.loans.filter((l) => l.dueDay <= m.checkDay).reduce((sum, l) => sum + l.amount * (1 + l.interestRate), 0);
            return Math.round(m.required + loansDue);
          })()}
          milestoneDaysLeft={getMilestone(gameState.day) ? getMilestone(gameState.day)!.checkDay - gameState.day : 0}
          netWorth={gameState.cash + gameState.portfolio.reduce((sum: number, pos) => { const s = gameState.stocks.find((st) => st.symbol === pos.symbol); return sum + (s ? s.price * pos.shares : 0); }, 0) + gameState.shorts.reduce((sum: number, pos) => sum + pos.entryPrice * pos.shares, 0) - gameState.shorts.reduce((sum: number, sp) => { const s = gameState.stocks.find((st) => st.symbol === sp.symbol); return sum + (s ? s.price * sp.shares : 0); }, 0) + getOptionsValue(gameState)}
          speed={speed}
          onSpeedChange={setSpeed}
          acquiredRestaurantUpgrades={gameState.acquiredRestaurantUpgrades}
        />
      ) : (
        <>
          {!gameState.marketOpen && !gameState.gameOver && eodPhase === "summary" && (() => {
            const ranked = [...gameState.stocks].map((s) => ({ ...s, change: s.price - s.openPrice, changePct: ((s.price - s.openPrice) / s.openPrice) * 100 })).sort((a, b) => b.changePct - a.changePct);
            const winners = ranked.filter((s) => s.changePct > 0);
            const losers = ranked.filter((s) => s.changePct < 0).reverse();
            const portfolioValue = gameState.portfolio.reduce((sum, pos) => {
              const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
              return sum + (stock ? stock.price * pos.shares : 0);
            }, 0);
            const shortLiability = gameState.shorts.reduce((sum, pos) => {
              const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
              return sum + (stock ? stock.price * pos.shares : 0);
            }, 0);
            const shortCollateral = gameState.shorts.reduce((sum, pos) => sum + pos.entryPrice * pos.shares, 0);
            const optionsVal = getOptionsValue(gameState);
            const currentNetWorth = gameState.cash + portfolioValue + shortCollateral - shortLiability + optionsVal;
            const dailyPnL = currentNetWorth - gameState.dayStartNetWorth;
            const completedDay = gameState.day;

            return (
              <div className="end-of-day-overlay">
                <div className="end-of-day">
                  <h2>📋 End of Day {completedDay}</h2>
                  <div className="eod-pnl-hero">
                    <span className="eod-pnl-label">Today's P&L</span>
                    <span className={`eod-pnl-value ${dailyPnL >= 0 ? "up" : "down"}`}>{dailyPnL >= 0 ? "+$" : "-$"}{Math.abs(dailyPnL).toFixed(2)}</span>
                  </div>
                  <div className="eod-stats">
                    <div className="eod-stat-row"><span>Net worth</span><span>${currentNetWorth.toFixed(2)}</span></div>
                    <div className="eod-stat-row"><span>Cash</span><span>${gameState.cash.toFixed(2)}</span></div>
                    <div className="eod-stat-row"><span>Portfolio value</span><span>${portfolioValue.toFixed(2)}</span></div>
                    {gameState.goldenParachutes > 0 && <div className="eod-stat-row"><span>Golden Parachutes</span><span>{gameState.goldenParachutes}</span></div>}
                  </div>
                  {gameState.milestonePayment && (() => {
                    const { milestoneAmount, loanRepayment, total } = gameState.milestonePayment;
                    const passed = !gameState.gameOver;
                    return (
                      <div className={`milestone-check ${passed ? "passed" : "failed"}`}>
                        <div className="milestone-header">{passed ? "✅ Milestone Passed!" : "❌ Milestone Failed!"}</div>
                        <div className="milestone-body">
                          Milestone payment: ${milestoneAmount.toLocaleString()}
                          {loanRepayment > 0 && <><br />Loan repayment: ${loanRepayment.toFixed(2)}</>}
                          <br /><strong>Total deducted: ${total.toFixed(2)}</strong>
                          <br />Cash remaining: <span className={gameState.cash >= 0 ? "up" : "danger"}>${gameState.cash.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="eod-movers">
                    <div className="eod-column">
                      <h3 className="eod-winners-title">📈 Winners</h3>
                      {winners.length === 0 && <span className="eod-none">None</span>}
                      {winners.map((s) => <div key={s.symbol} className="eod-mover-row"><span className="eod-symbol">{s.symbol}</span><span className="eod-price">${s.price.toFixed(2)}</span><span className="eod-change up">+${s.change.toFixed(2)} (+{s.changePct.toFixed(1)}%)</span></div>)}
                    </div>
                    <div className="eod-column">
                      <h3 className="eod-losers-title">📉 Losers</h3>
                      {losers.length === 0 && <span className="eod-none">None</span>}
                      {losers.map((s) => <div key={s.symbol} className="eod-mover-row"><span className="eod-symbol">{s.symbol}</span><span className="eod-price">${s.price.toFixed(2)}</span><span className="eod-change down">-${Math.abs(s.change).toFixed(2)} ({s.changePct.toFixed(1)}%)</span></div>)}
                    </div>
                  </div>
                  {gameState.secFines.filter((f) => f.day === gameState.day).map((fine, i) => (
                    <div key={i} className="sec-fine-alert">
                      <div className="sec-fine-header">🚨 SEC ENFORCEMENT ACTION 🚨</div>
                      <div className="sec-fine-body">
                        You have been fined for insider trading on <strong>${fine.symbol}</strong>.
                        <br />Illegal profit detected: <span className="up">${fine.profit.toFixed(2)}</span>
                        <br />Fine imposed: <span className="danger">-${fine.amount.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                  {bossResult && (
                    <div className={`milestone-check ${bossResult.passed ? "passed" : "failed"}`}>
                      <div className="milestone-header">{bossResult.passed ? "✅ Boss Stage Cleared!" : "❌ Boss Stage Failed!"}</div>
                      <div className="milestone-body">
                        Trading profit: <span className={bossResult.tradingProfit >= bossResult.requiredProfit ? "up" : "danger"}>${bossResult.tradingProfit.toFixed(2)}</span> (need ${bossResult.requiredProfit})
                        <br />Missed orders: <span className={bossResult.missedOrders <= bossResult.maxMissed ? "up" : "danger"}>{bossResult.missedOrders}</span> (max {bossResult.maxMissed})
                      </div>
                    </div>
                  )}
                  <button onClick={() => { setBossResult(null); handleNewDay(); }}>Continue →</button>
                </div>
              </div>
            );
          })()}

          {!gameState.marketOpen && !gameState.gameOver && eodPhase === "upgrades" && (
            <div className="end-of-day-overlay">
              <div className="upgrade-draft">
                <h2>⬆️ Choose an Upgrade</h2>
                <p className="upgrade-draft-sub">Pick one upgrade to keep for the rest of the run</p>
                <div className="upgrade-draft-options">
                  {gameState.upgradeDraftOptions.map((id) => {
                    const card = UPGRADE_POOL.find((u) => u.id === id);
                    if (!card) return null;
                    const owned = upgradeCount(gameState, id);
                    return (
                      <button key={id} className="upgrade-draft-card" onClick={() => handleAcquireUpgrade(id)}>
                        <div className="upgrade-card-icon">{card.icon}</div>
                        <div className="upgrade-card-name">{card.name}</div>
                        <div className="upgrade-card-desc">{card.description}</div>
                        <div className="upgrade-card-category">{card.category}</div>
                        {owned > 0 && <div className="upgrade-card-owned">Owned: {owned}/{card.maxStacks}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!gameState.marketOpen && !gameState.gameOver && eodPhase === "stocks" && (
            <div className="end-of-day-overlay">
              <div className="stock-draft">
                <h2>📊 New Stock Available</h2>
                <p className="stock-draft-sub">Choose a company to add to the market for Day {gameState.day}</p>
                <div className="stock-draft-options">
                  {gameState.stockDraftOptions.map((stock) => (
                    <button key={stock.symbol} className="stock-draft-card" onClick={() => handleDraftStock(stock.symbol)}>
                      <div className="draft-card-symbol">{stock.symbol}</div>
                      <div className="draft-card-name">{stock.name}</div>
                      <div className="draft-card-price">${stock.price.toFixed(2)}</div>
                      <div className="draft-card-tags">{stock.tags.map((tag) => <span key={tag} className="stock-tag">{tag}</span>)}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {bossDay && restaurantState && bossView === "restaurant" ? (
            <Restaurant
              day={gameState.day}
              paused={paused}
              state={restaurantState}
              setRestaurantState={setRestaurantState}
              onFinish={() => {}}
              milestoneTarget={null}
              milestoneDaysLeft={0}
              netWorth={0}
              speed={speed}
              onSpeedChange={setSpeed}
              acquiredRestaurantUpgrades={gameState.acquiredRestaurantUpgrades}
            />
          ) : (
          <div className="main-layout">
            <div className="monitors-area">
              {gameState.monitors.map((monitor, idx) => (
                <Monitor
                  key={monitor.id}
                  monitor={monitor}
                  monitorIndex={idx}
                  isActive={monitor.id === activeMonitorId}
                  totalMonitors={gameState.monitors.length}
                  gameState={gameState}
                  paused={paused}
                  showAnalystRating={showAnalystRating}
                  showDarkPool={showDarkPool}
                  onChangeChannel={handleChangeChannel}
                  onSelectStock={handleSelectStock}
                  onViewInsider={handleViewInsider}
                  onBuy={handleBuy}
                  onSell={handleSell}
                  onShort={handleShort}
                  onCover={handleCover}
                />
              ))}
            </div>
            <aside className="sidebar-area">
              <OrdersPanel gameState={gameState} open={ordersOpen} onClose={() => setOrdersOpen(false)} onPlaceOrder={handlePlaceOrder} onCancelOrder={handleCancelOrder} onBuyOption={handleBuyOption} onSellOption={handleSellOption} onCloseOption={handleCloseOption} />
              <button className={`orders-tab-strip ${ordersOpen ? "active" : ""}`} onClick={() => setOrdersOpen((o) => !o)} title="Custom Orders">
                <span className="orders-tab-icon">📋</span>
                <span className="orders-tab-label">O R D E R S</span>
                {(gameState.pendingOrders.length + gameState.optionsPositions.length) > 0 && <span className="orders-tab-badge">{gameState.pendingOrders.length + gameState.optionsPositions.length}</span>}
              </button>
              <div className="sidebar">
                <TradingPanel gameState={gameState} onBuy={handleBuy} onSell={handleSell} onShort={handleShort} onCover={handleCover} onTogglePin={handleTogglePin} onToggleStopLoss={handleToggleStopLoss} />
              </div>
            </aside>
          </div>
          )}
        </>
      )}

      {!gameState.marketOpen && !gameState.gameOver && eodPhase === "restaurant-upgrades" && (
        <div className="end-of-day-overlay">
          <div className="upgrade-draft">
            <h2>🍽️ Choose a Restaurant Upgrade</h2>
            <p className="upgrade-draft-sub">Pick one kitchen upgrade for every future Shwendy's shift</p>
            <div className="upgrade-draft-options">
              {gameState.restaurantUpgradeDraftOptions.map((id) => {
                const card = RESTAURANT_UPGRADE_POOL.find((upgrade) => upgrade.id === id);
                if (!card) return null;
                const owned = restaurantUpgradeCount(id);
                return (
                  <button key={id} className="upgrade-draft-card" onClick={() => handleAcquireRestaurantUpgrade(id)}>
                    <div className="upgrade-card-icon">{card.icon}</div>
                    <div className="upgrade-card-name">{card.name}</div>
                    <div className="upgrade-card-desc">{card.description}</div>
                    <div className="upgrade-card-category">{card.category}</div>
                    {owned > 0 && <div className="upgrade-card-owned">Owned: {owned}/{card.maxStacks}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!gameState.marketOpen && !gameState.gameOver && eodPhase === "menu-draft" && (
        <div className="end-of-day-overlay">
          <div className="stock-draft">
            <h2>🧾 Add a New Menu Item</h2>
            <p className="stock-draft-sub">Choose one recipe to add to Shwendy's permanent menu for Day {gameState.day}</p>
            <div className="stock-draft-options">
              {gameState.menuDraftOptions.map((item) => (
                <button key={item.name} className="stock-draft-card" onClick={() => handleDraftMenuItem(item.name)}>
                  <div className="draft-card-symbol">{item.icon}</div>
                  <div className="draft-card-name">{item.name}</div>
                  <div className="draft-card-price">${item.basePay.toFixed(2)} • {item.patience}s patience</div>
                  <div className="draft-card-tags">{item.steps.map((step, index) => <span key={`${item.name}-${step.type}-${index}`} className="stock-tag">{step.type}</span>)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {gameState.pendingSECCheck && !gameState.marketOpen && (
        <SecWheel
          catchChance={gameState.pendingSECCheck.catchChance}
          fineAmount={gameState.pendingSECCheck.fineAmount}
          profit={gameState.pendingSECCheck.profit}
          symbol={gameState.pendingSECCheck.symbol}
          onResult={handleSECWheelResult}
        />
      )}

      {showLoanOffer && (
        <div className="end-of-day-overlay">
          <div className="end-of-day">
            <h2>{showLoanOffer.isEmergency ? "🏦 Emergency Loan Available" : "🏦 Loan Available"}</h2>
            {showLoanOffer.isEmergency && (
              <p style={{ marginBottom: "12px" }}>Your cash balance is <span className="danger">${gameState.cash.toFixed(2)}</span>. You can't trade without capital.</p>
            )}
            <p style={{ marginBottom: "16px" }}>
              A loan of <strong>${showLoanOffer.amount.toFixed(2)}</strong> is available at <strong>{Math.round(showLoanOffer.interestRate * 100)}% interest</strong> (repay <strong>${(showLoanOffer.amount * (1 + showLoanOffer.interestRate)).toFixed(2)}</strong>), due at the next milestone (Day {showLoanOffer.dueDay}).
            </p>
            {gameState.loans.length > 0 && (
              <p style={{ marginBottom: "12px", color: "var(--text-dim)" }}>
                Outstanding loans: {gameState.loans.map((l, i) => <span key={i}>${l.amount.toFixed(2)} due Day {l.dueDay} </span>)}
              </p>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button className="pause-menu-btn" onClick={handleAcceptLoan}>💰 Take the Loan</button>
              <button className="pause-menu-btn" onClick={handleDeclineLoan}>🚫 Decline</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
