import { useState, useEffect, useCallback, useRef } from "react";
import { GameState, MonitorChannel, OrderType, OrderSide } from "./game/types";
import { createInitialState } from "./game/state";
import { tick, buyStock, sellStock, shortStock, coverShort, openMarket, placeOrder, cancelOrder, getMilestone, draftStock, togglePinStock, acquireUpgrade, upgradeCount, hasUpgrade, buyOption, sellOption, closeOption, getOptionsValue, isBossDayCheck } from "./game/engine";
import { acquireRestaurantUpgrade, createRestaurantState, draftMenuItem, finishRestaurantDay, restaurantTick, MENU } from "./game/restaurant-engine";
import { RestaurantState } from "./game/restaurant-types";
import { RESTAURANT_UPGRADE_POOL } from "./game/restaurant-upgrades";
import { UPGRADE_POOL } from "./game/upgrades";
import { selectDailyChallenges, evaluateChallenges, getTicketsEarned, ALL_CHALLENGES } from "./game/challenges";
import { useMultiplayer } from "./multiplayer";
import { MultiplayerLobby } from "./components/MultiplayerLobby";
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

const GAME_VERSION = "0.0.9";

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
  const [eodPhase, setEodPhase] = useState<"summary" | "challenges" | "upgrades" | "stocks" | "restaurant-upgrades" | "menu-draft">("summary");
  const [restaurantState, setRestaurantState] = useState<RestaurantState | null>(null);
  const [activeMonitorId, setActiveMonitorId] = useState(0);
  const [showTransition, setShowTransition] = useState<"restaurant" | null>(null);
  const [titleTutorial, setTitleTutorial] = useState<"pick" | "trading" | "restaurant" | null>(null);
  const [menuFocusIndex, setMenuFocusIndex] = useState(-1);
  const [showLoanOffer, setShowLoanOffer] = useState<{ amount: number; interestRate: number; dueDay: number; isEmergency: boolean } | null>(null);
  const [bossDay, setBossDay] = useState(false);
  const [bossView, setBossView] = useState<"trading" | "restaurant">("trading");
  const [bossResult, setBossResult] = useState<{ passed: boolean; tradingProfit: number; missedOrders: number; requiredProfit: number; maxMissed: number } | null>(null);
  const [showBossIntro, setShowBossIntro] = useState<{ requiredProfit: number; maxMissed: number } | null>(null);
  const [skipNextRestaurant, setSkipNextRestaurant] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugFF, setDebugFF] = useState(false);
  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState(false);

  // Multiplayer hook
  const [mpState, mpActions] = useMultiplayer(
    () => gameState,
    (updater) => setGameState(updater),
    () => restaurantState,
    (updater) => setRestaurantState(updater),
    () => eodPhase,
    () => paused,
    () => speed,
    () => bossDay,
    () => bossView,
    {
      onViewInsider: () => setGameState((prev) => prev.insiderViewed ? prev : { ...prev, insiderViewed: true, insiderViewedTick: prev.timeOfDay, insiderSnapshotHoldings: prev.portfolio.map((p) => ({ symbol: p.symbol, shares: p.shares, avgCost: p.avgCost })), insiderSnapshotShorts: prev.shorts.map((s) => ({ symbol: s.symbol, shares: s.shares, entryPrice: s.entryPrice })) }),
      onAcceptLoan: () => {
        if (showLoanOffer) {
          setGameState((prev) => ({ ...prev, cash: prev.cash + showLoanOffer.amount, loans: [...prev.loans, { amount: showLoanOffer.amount, dueDay: showLoanOffer.dueDay, interestRate: showLoanOffer.interestRate }] }));
          setShowLoanOffer(null);
        }
      },
      onDeclineLoan: () => setShowLoanOffer(null),
      onSetSpeed: setSpeed,
      onTogglePause: () => setPaused((p) => !p),
      onChooseUpgrade: (id) => { const nextState = acquireUpgrade(gameState, id); if (nextState.stockDraftOptions.length > 0) { setGameState(nextState); setEodPhase("stocks"); } else { setGameState(nextState); setEodPhase("summary"); } },
      onChooseStock: (symbol) => { setGameState(draftStock(gameState, symbol)); setEodPhase("summary"); },
      onChooseRestaurantUpgrade: (id) => { const nextState = acquireRestaurantUpgrade(gameState, id); setGameState(nextState); if (nextState.menuDraftOptions.length > 0) setEodPhase("menu-draft"); else setEodPhase("summary"); },
      onChooseMenuItem: (name) => { setGameState(draftMenuItem(gameState, name)); setEodPhase("summary"); },
      onChangeChannel: (monitorId, channel) => setGameState((prev) => ({ ...prev, monitors: prev.monitors.map((m) => m.id === monitorId ? { ...m, channel: channel as MonitorChannel } : m) })),
      onSelectStock: (monitorId, symbol) => setGameState((prev) => ({ ...prev, monitors: prev.monitors.map((m) => m.id === monitorId ? { ...m, selectedStock: symbol } : m) })),
    },
  );
  const isMultiplayer = mpState.role !== "none";
  const isPeer = mpState.role === "peer";

  useEffect(() => {
    document.documentElement.style.fontSize = `${textSize}%`;
    localStorage.setItem("rogue-day-trader-text-size", String(textSize));
  }, [textSize]);

  // Peer: apply synced state from host
  useEffect(() => {
    if (!isPeer) return;
    if (mpState.syncedGameState) setGameState(mpState.syncedGameState);
    if (mpState.syncedRestaurantState !== undefined) setRestaurantState(mpState.syncedRestaurantState);
    if (mpState.syncedEodPhase !== null) setEodPhase(mpState.syncedEodPhase as any);
    if (mpState.syncedPaused !== null) setPaused(mpState.syncedPaused);
    if (mpState.syncedSpeed !== null) setSpeed(mpState.syncedSpeed);
    if (mpState.syncedBossDay !== null) setBossDay(mpState.syncedBossDay);
    if (mpState.syncedBossView !== null) setBossView(mpState.syncedBossView as any);
  }, [isPeer, mpState.syncedGameState, mpState.syncedRestaurantState, mpState.syncedEodPhase, mpState.syncedPaused, mpState.syncedSpeed, mpState.syncedBossDay, mpState.syncedBossView]);

  useEffect(() => {
    if (isPeer) return; // Peers don't tick - host sends state
    if (gameState.gameOver || !gameState.marketOpen || paused || titleTutorial || showLoanOffer || showBossIntro) return;
    const interval = setInterval(() => setGameState((prev) => tick(prev)), 1000 / speed);
    return () => clearInterval(interval);
  }, [gameState.marketOpen, gameState.gameOver, speed, paused, titleTutorial, showLoanOffer, showBossIntro, isPeer]);

  // Boss day: tick restaurant alongside trading
  const lastBossEarningsRef = useRef(0);
  useEffect(() => {
    if (isPeer) return; // Peers don't tick
    if (!bossDay || !restaurantState || paused || !gameState.marketOpen || restaurantState.shiftOver || showBossIntro) return;
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
  }, [bossDay, restaurantState, paused, gameState.marketOpen, speed, showBossIntro, isPeer]);

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
          handleTogglePause();
        }
        return;
      }

      // Debug menu toggle
      if (e.key === "n" && paused && !showDebug) {
        setShowDebug(true);
        return;
      }

      // Debug fast-forward toggle (while not paused)
      if (e.key === "n" && !paused && (gameState.marketOpen || (restaurantState && !restaurantState.shiftOver))) {
        setDebugFF(true);
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
        const newChannel = CHANNEL_KEYS[num - 1];
        setGameState((prev) => {
          let tracker = prev.challengeTracker;
          if (["business_news", "global_news", "social_media"].includes(newChannel)) {
            tracker = { ...tracker, viewedNews: true };
          }
          return {
            ...prev,
            monitors: prev.monitors.map((m) => (m.id === activeMonitorId ? { ...m, channel: newChannel } : m)),
            challengeTracker: tracker,
          };
        });
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

  const NEWS_CHANNELS: MonitorChannel[] = ["business_news", "global_news", "social_media"];

  const handleChangeChannel = useCallback((monitorId: number, channel: MonitorChannel) => {
    if (isPeer) { mpActions.sendAction({ type: "change_channel", monitorId, channel }); return; }
    setGameState((prev) => {
      let tracker = prev.challengeTracker;
      if (NEWS_CHANNELS.includes(channel)) {
        tracker = { ...tracker, viewedNews: true };
      }
      return {
        ...prev,
        monitors: prev.monitors.map((m) => (m.id === monitorId ? { ...m, channel } : m)),
        challengeTracker: tracker,
      };
    });
  }, [isPeer, mpActions]);

  const handleSelectStock = useCallback((monitorId: number, symbol: string) => {
    if (isPeer) { mpActions.sendAction({ type: "select_stock", monitorId, symbol }); return; }
    setGameState((prev) => ({
      ...prev,
      monitors: prev.monitors.map((m) => (m.id === monitorId ? { ...m, selectedStock: symbol } : m)),
    }));
  }, [isPeer, mpActions]);

  const handleBuy = useCallback((symbol: string, shares: number) => {
    if (isPeer) { mpActions.sendAction({ type: "buy_stock", symbol, shares }); return; }
    setGameState((prev) => buyStock(prev, symbol, shares));
  }, [isPeer, mpActions]);
  const handleSell = useCallback((symbol: string, shares: number) => {
    if (isPeer) { mpActions.sendAction({ type: "sell_stock", symbol, shares }); return; }
    setGameState((prev) => sellStock(prev, symbol, shares));
  }, [isPeer, mpActions]);
  const handleShort = useCallback((symbol: string, shares: number) => {
    if (isPeer) { mpActions.sendAction({ type: "short_stock", symbol, shares }); return; }
    setGameState((prev) => shortStock(prev, symbol, shares));
  }, [isPeer, mpActions]);
  const handleCover = useCallback((symbol: string, shares: number) => {
    if (isPeer) { mpActions.sendAction({ type: "cover_short", symbol, shares }); return; }
    setGameState((prev) => coverShort(prev, symbol, shares));
  }, [isPeer, mpActions]);
  const handleTogglePin = useCallback((symbol: string) => setGameState((prev) => togglePinStock(prev, symbol)), []);
  const handleToggleStopLoss = useCallback(() => setGameState((prev) => ({ ...prev, stopLossEnabled: !prev.stopLossEnabled })), []);
  const handlePlaceOrder = useCallback((symbol: string, side: OrderSide, shares: number, orderType: OrderType, limitPrice?: number, stopPrice?: number) => {
    if (isPeer) { mpActions.sendAction({ type: "place_order", symbol, side, shares, orderType, limitPrice, stopPrice }); return; }
    setGameState((prev) => placeOrder(prev, symbol, side, shares, orderType, limitPrice, stopPrice));
  }, [isPeer, mpActions]);
  const handleCancelOrder = useCallback((orderId: string) => {
    if (isPeer) { mpActions.sendAction({ type: "cancel_order", orderId }); return; }
    setGameState((prev) => cancelOrder(prev, orderId));
  }, [isPeer, mpActions]);
  const handleBuyOption = useCallback((symbol: string, type: "call" | "put", strike: number, days: number, contracts: number) => {
    if (isPeer) { mpActions.sendAction({ type: "buy_option", symbol, optionType: type, strikePrice: strike, expirationDays: days, contracts }); return; }
    setGameState((prev) => buyOption(prev, symbol, type, strike, days, contracts));
  }, [isPeer, mpActions]);
  const handleSellOption = useCallback((symbol: string, type: "call" | "put", strike: number, days: number, contracts: number) => {
    if (isPeer) { mpActions.sendAction({ type: "sell_option", symbol, optionType: type, strikePrice: strike, expirationDays: days, contracts }); return; }
    setGameState((prev) => sellOption(prev, symbol, type, strike, days, contracts));
  }, [isPeer, mpActions]);
  const handleCloseOption = useCallback((optionId: string) => {
    if (isPeer) { mpActions.sendAction({ type: "close_option", optionId }); return; }
    setGameState((prev) => closeOption(prev, optionId));
  }, [isPeer, mpActions]);

  const handleSetSpeed = useCallback((s: number) => {
    if (isPeer) { mpActions.sendAction({ type: "set_speed", speed: s }); return; }
    setSpeed(s);
  }, [isPeer, mpActions]);

  const handleTogglePause = useCallback(() => {
    if (isPeer) { mpActions.sendAction({ type: "toggle_pause" }); return; }
    setPaused((p) => !p);
  }, [isPeer, mpActions]);

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
      const milestoneNum = nextState.day / 4;
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

      // Boss day failure = game over
      const gameOverState = passed ? finalState : { ...finalState, day: nextState.day, gameOver: true };
      setGameState(gameOverState);
      setRestaurantState(null);
      setBossDay(false);
      setSkipNextRestaurant(true);
      setEodPhase("summary");
      saveGame(gameOverState);
      if (passed && gameOverState.restaurantUpgradeDraftOptions.length > 0) setEodPhase("restaurant-upgrades");
      else if (passed && gameOverState.menuDraftOptions.length > 0) setEodPhase("menu-draft");
      return;
    }

    // After boss day EOD (day already incremented by finishRestaurantDay), skip restaurant once
    // After trading (market just closed), go to Shwendy's
    if (!nextState.marketOpen && restaurantState === null && !skipNextRestaurant) {
      setGameState(nextState);
      setShowTransition("restaurant");
      setEodPhase("summary");
      return;
    }

    // After Shwendy's (or starting a new day), open the market
    setRestaurantState(null);
    setSkipNextRestaurant(false);
    setSpeed(1);
    const marketState = openMarket(nextState);

    // Check if this is a boss day and select daily challenges
    const isBossDay = isBossDayCheck(marketState.day);
    const challenges = selectDailyChallenges(marketState.day, isBossDay, false);
    setGameState({ ...marketState, activeChallenges: challenges });
    setEodPhase("summary");

    setBossDay(isBossDay);
    setBossView("trading");
    if (isBossDay) {
      lastBossEarningsRef.current = 0;
      const rs = createRestaurantState(marketState);
      setRestaurantState({ ...rs, shiftTimeRemaining: 100 });
      const milestoneNum = marketState.day / 4;
      const requiredProfit = 300 + (milestoneNum - 1) * 100;
      const maxMissed = Math.max(2, 5 - Math.floor((milestoneNum - 1) / 2));
      setShowBossIntro({ requiredProfit, maxMissed });
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
    // On boss day, skip upgrades/stocks — go straight to boss day evaluation
    if (bossDay) {
      beginScheduledDay();
      return;
    }
    // Evaluate challenges and show results
    const evaluated = evaluateChallenges(
      gameState.activeChallenges,
      gameState.challengeTracker,
      gameState,
      restaurantState?.challengeTracker,
    );
    const earned = getTicketsEarned(evaluated);
    setGameState((prev) => ({
      ...prev,
      activeChallenges: evaluated,
      tickets: prev.tickets + earned,
    }));
    setEodPhase("challenges");
  }, [beginScheduledDay, gameState, bossDay, restaurantState]);

  const handleChallengesContinue = useCallback(() => {
    // After challenges, proceed to upgrades/stocks/restaurant-upgrades/menu-draft or next day
    if (gameState.upgradeDraftOptions.length > 0) setEodPhase("upgrades");
    else if (gameState.stockDraftOptions.length > 0) setEodPhase("stocks");
    else if (gameState.restaurantUpgradeDraftOptions.length > 0) setEodPhase("restaurant-upgrades");
    else if (gameState.menuDraftOptions.length > 0) setEodPhase("menu-draft");
    else {
      setRestaurantState(null);
      beginScheduledDay();
    }
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
    // Evaluate challenges (restaurant challenges use the restaurant tracker)
    const evaluated = evaluateChallenges(
      nextState.activeChallenges,
      nextState.challengeTracker,
      nextState,
      restaurantState?.challengeTracker,
    );
    const earned = getTicketsEarned(evaluated);
    const challengedState = { ...nextState, activeChallenges: evaluated, tickets: nextState.tickets + earned };
    setGameState(challengedState);
    saveGame(challengedState);
    setRestaurantState(null);
    // Show challenge results before restaurant upgrades
    setEodPhase("challenges");
  }, [beginScheduledDay, gameState, restaurantState]);

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

  // Multiplayer lobby overlay — but close it when game starts for peers
  if (showMultiplayerLobby && !(isPeer && mpState.gameStarted)) {
    return (
      <MultiplayerLobby
        onHost={(name) => mpActions.hostGame(name)}
        onJoin={(code, name) => mpActions.joinGame(code, name)}
        onCancel={() => {
          mpActions.disconnect();
          setShowMultiplayerLobby(false);
        }}
        connecting={mpState.connecting}
        error={mpState.error}
        roomCode={mpState.roomCode}
        players={mpState.players}
        isHost={mpState.role === "host"}
        onStart={() => {
          mpActions.startGame();
          setShowMultiplayerLobby(false);
          setShowTitle(false);
          setGameState(createInitialState());
        }}
      />
    );
  }

  // Peer: when host starts the game, close title and lobby
  if (isPeer && mpState.gameStarted && showTitle) {
    setShowTitle(false);
    setShowMultiplayerLobby(false);
  }

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
          <button className="title-start-btn title-tutorial-btn" onClick={() => { setShowMultiplayerLobby(true); setMenuFocusIndex(-1); (document.activeElement as HTMLElement)?.blur(); }}>MULTIPLAYER</button>
          <button className="title-start-btn title-tutorial-btn" onClick={() => { setShowOptions("title"); setMenuFocusIndex(-1); (document.activeElement as HTMLElement)?.blur(); }}>OPTIONS</button>
        </div>
        <div className="title-version">v{GAME_VERSION}</div>
      </div>
    );
  }

  if (showTransition === "restaurant") {
    const startShift = () => {
      setShowTransition(null);
      setSpeed(1);
      setRestaurantState(createRestaurantState(gameState));
      // Select restaurant challenges for this shift
      const challenges = selectDailyChallenges(gameState.day, false, true);
      setGameState((prev) => ({ ...prev, activeChallenges: challenges }));
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
          {gameState.activeChallenges.length > 0 && gameState.marketOpen && (
            <div className="challenge-indicators">
              {gameState.activeChallenges.map((ch) => {
                const def = ALL_CHALLENGES.find((d) => d.id === ch.id);
                if (!def) return null;
                return (
                  <span key={ch.id} className={`challenge-pip ${ch.completed ? "done" : ""}`} data-tooltip={`${def.name}: ${def.description} (${def.tickets}🎟️)`}>
                    {def.icon}
                  </span>
                );
              })}
              <span className="ticket-count">🎟️ {gameState.tickets}</span>
            </div>
          )}
          <div className="header-controls">
            <div className="time-bar">
              <div className="time-fill" style={{ width: `${gameState.timeOfDay}%` }} />
              <span className="time-label">{paused ? "⏸ PAUSED" : gameState.marketOpen ? `Day ${gameState.day} — ${formatMarketTime(gameState.timeOfDay)}` : "Market Closed"}</span>
            </div>
            <div className="speed-controls">
              <button className={speed === 1 ? "active" : ""} onClick={() => handleSetSpeed(1)}>1x</button>
              <button className={speed === 2 ? "active" : ""} onClick={() => handleSetSpeed(2)}>2x</button>
              <button className={speed === 5 ? "active" : ""} onClick={() => handleSetSpeed(5)}>5x</button>
              <button className={speed === 10 ? "active" : ""} onClick={() => handleSetSpeed(10)}>10x</button>
              {debugFF && <button className="debug-ff-btn" onClick={() => {
                setGameState((prev) => {
                  let state = prev;
                  let safety = 200;
                  while (state.marketOpen && safety-- > 0) {
                    state = tick(state);
                  }
                  return state;
                });
                setDebugFF(false);
              }}>⏭</button>}
            </div>
            {bossDay && restaurantState && (
              <button className="boss-toggle-btn" onClick={() => setBossView((v) => v === "trading" ? "restaurant" : "trading")}>
                {bossView === "trading" ? "🍔 Kitchen" : "📈 Trading"} <kbd>/</kbd>
              </button>
            )}
            {bossDay && restaurantState && (() => {
              const milestoneNum = gameState.day / 4;
              const requiredProfit = 300 + (milestoneNum - 1) * 100;
              const maxMissed = Math.max(2, 5 - Math.floor((milestoneNum - 1) / 2));
              const currentProfit = (gameState.cash + gameState.portfolio.reduce((sum: number, pos) => { const s = gameState.stocks.find((st) => st.symbol === pos.symbol); return sum + (s ? s.price * pos.shares : 0); }, 0) + gameState.shorts.reduce((sum: number, pos) => sum + pos.entryPrice * pos.shares, 0) - gameState.shorts.reduce((sum: number, sp) => { const s = gameState.stocks.find((st) => st.symbol === sp.symbol); return sum + (s ? s.price * sp.shares : 0); }, 0) + getOptionsValue(gameState)) - gameState.dayStartNetWorth;
              return (
                <div className="boss-stats">
                  <span className={`boss-stat ${currentProfit >= requiredProfit ? "ok" : ""}`}>💰 ${currentProfit.toFixed(0)}/${requiredProfit}</span>
                  <span className={`boss-stat ${restaurantState.failedOrders >= maxMissed ? "danger" : ""}`}>❌ {restaurantState.failedOrders}/{maxMissed}</span>
                </div>
              );
            })()}
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
              onSkipToDay={(day, cash) => {
                const updated = { ...gameState, day, cash, marketOpen: false, loans: [], milestonePayment: null };
                const marketState = openMarket(updated);
                const isBoss = isBossDayCheck(day);
                const challenges = selectDailyChallenges(day, isBoss, false);
                setGameState({ ...marketState, activeChallenges: challenges });
                setBossDay(isBoss);
                setBossView("trading");
                if (isBoss) {
                  lastBossEarningsRef.current = 0;
                  const rs = createRestaurantState(marketState);
                  setRestaurantState({ ...rs, shiftTimeRemaining: 100 });
                  const milestoneNum = day / 4;
                  const requiredProfit = 300 + (milestoneNum - 1) * 100;
                  const maxMissed = Math.max(2, 5 - Math.floor((milestoneNum - 1) / 2));
                  setShowBossIntro({ requiredProfit, maxMissed });
                } else {
                  setRestaurantState(null);
                }
                setShowDebug(false);
                setPaused(false);
                setEodPhase("summary");
              }}
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
            {bossResult && !bossResult.passed ? (
              <>
                <h2>⚠️ FIRED FROM SHWENDY'S</h2>
                <p>You failed the boss day shift!</p>
                <div className="eod-stats" style={{ margin: "12px 0" }}>
                  <div className="eod-stat-row"><span>Trading profit</span><span className={bossResult.tradingProfit >= bossResult.requiredProfit ? "up" : "danger"}>${bossResult.tradingProfit.toFixed(2)} (need ${bossResult.requiredProfit})</span></div>
                  <div className="eod-stat-row"><span>Missed orders</span><span className={bossResult.missedOrders <= bossResult.maxMissed ? "up" : "danger"}>{bossResult.missedOrders} (max {bossResult.maxMissed})</span></div>
                </div>
                <p>You survived {gameState.day} days</p>
              </>
            ) : (
              <>
                <h2>💸 MARGIN CALLED</h2>
                <p>You survived {gameState.day} days</p>
                <p>Total P&L: ${gameState.totalProfit.toFixed(2)}</p>
              </>
            )}
            <button onClick={() => { setBossResult(null); handleRestart(); }}>Try Again</button>
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
          onSpeedChange={handleSetSpeed}
          acquiredRestaurantUpgrades={gameState.acquiredRestaurantUpgrades}
          activeChallenges={gameState.activeChallenges}
          tickets={gameState.tickets}
          debugFF={debugFF}
          onDebugFF={() => {
            setRestaurantState((prev) => prev ? { ...prev, shiftTimeRemaining: 0, shiftOver: true } : prev);
            setDebugFF(false);
          }}
          isPeer={isPeer}
          onPeerKey={(key) => mpActions.sendAction({ type: "restaurant_key", key })}
          onPeerKeyUp={(key) => mpActions.sendAction({ type: "restaurant_key_up", key })}
          onPeerMouse={(x, y) => mpActions.sendAction({ type: "restaurant_mouse", x, y })}
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

          {!gameState.marketOpen && !gameState.gameOver && eodPhase === "challenges" && (
            <div className="end-of-day-overlay">
              <div className="end-of-day challenge-results">
                <h2>🎯 Daily Challenges</h2>
                <div className="challenge-list">
                  {gameState.activeChallenges.map((ch) => {
                    const def = ALL_CHALLENGES.find((d) => d.id === ch.id);
                    if (!def) return null;
                    return (
                      <div key={ch.id} className={`challenge-row ${ch.completed ? "completed" : "failed"}`}>
                        <span className="challenge-icon">{def.icon}</span>
                        <div className="challenge-info">
                          <span className="challenge-name">{def.name}</span>
                          <span className="challenge-desc">{def.description}</span>
                        </div>
                        <span className="challenge-reward">
                          {ch.completed ? `+${def.tickets} 🎟️` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const earned = getTicketsEarned(gameState.activeChallenges);
                  return earned > 0 ? (
                    <div className="challenge-total">
                      <span>Tickets earned: <strong>+{earned} 🎟️</strong></span>
                      <span className="challenge-balance">Total: {gameState.tickets} 🎟️</span>
                    </div>
                  ) : (
                    <div className="challenge-total">
                      <span>No challenges completed</span>
                      <span className="challenge-balance">Total: {gameState.tickets} 🎟️</span>
                    </div>
                  );
                })()}
                <button onClick={handleChallengesContinue}>Continue →</button>
              </div>
            </div>
          )}

          {!gameState.marketOpen && !gameState.gameOver && eodPhase === "upgrades" && (
            <div className="end-of-day-overlay">
              {isPeer ? (
                <div className="upgrade-draft"><h2>⏳ Waiting for host...</h2><p className="upgrade-draft-sub">Host is choosing an upgrade</p></div>
              ) : (
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
              )}
            </div>
          )}

          {!gameState.marketOpen && !gameState.gameOver && eodPhase === "stocks" && (
            <div className="end-of-day-overlay">
              {isPeer ? (
                <div className="stock-draft"><h2>⏳ Waiting for host...</h2><p className="stock-draft-sub">Host is choosing a new stock</p></div>
              ) : (
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
              )}
            </div>
          )}

          {bossDay && restaurantState && bossView === "restaurant" ? (
            <div className="boss-restaurant-wrap">
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
              onSpeedChange={handleSetSpeed}
              acquiredRestaurantUpgrades={gameState.acquiredRestaurantUpgrades}
              isBossDay={true}
              activeChallenges={gameState.activeChallenges}
              tickets={gameState.tickets}
              debugFF={debugFF}
              onDebugFF={() => {
                setGameState((prev) => {
                  let state = prev;
                  let safety = 200;
                  while (state.marketOpen && safety-- > 0) {
                    state = tick(state);
                  }
                  return state;
                });
                setDebugFF(false);
              }}
              isPeer={isPeer}
              onPeerKey={(key) => mpActions.sendAction({ type: "restaurant_key", key })}
          onPeerKeyUp={(key) => mpActions.sendAction({ type: "restaurant_key_up", key })}
              onPeerMouse={(x, y) => mpActions.sendAction({ type: "restaurant_mouse", x, y })}
            />
            </div>
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
          {isPeer ? (
            <div className="upgrade-draft"><h2>⏳ Waiting for host...</h2><p className="upgrade-draft-sub">Host is choosing a restaurant upgrade</p></div>
          ) : (
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
          )}
        </div>
      )}

      {!gameState.marketOpen && !gameState.gameOver && eodPhase === "menu-draft" && (
        <div className="end-of-day-overlay">
          {isPeer ? (
            <div className="stock-draft"><h2>⏳ Waiting for host...</h2><p className="stock-draft-sub">Host is choosing a menu item</p></div>
          ) : (
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
          )}
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

      {showBossIntro && (
        <div className="end-of-day-overlay">
          <div className="end-of-day boss-intro">
            <h2>⚠️ BOSS DAY: Day Shift!</h2>
            <p className="boss-intro-desc">Your boss scheduled you for the day shift. You need to handle kitchen orders AND make money trading at the same time!</p>
            <div className="boss-intro-reqs">
              <div className="boss-intro-req">
                <span className="boss-intro-icon">💰</span>
                <span>Make at least <strong>${showBossIntro.requiredProfit}</strong> trading profit</span>
              </div>
              <div className="boss-intro-req">
                <span className="boss-intro-icon">❌</span>
                <span>Miss no more than <strong>{showBossIntro.maxMissed}</strong> kitchen orders</span>
              </div>
            </div>
            <p className="boss-intro-tip">Press <kbd>/</kbd> to switch between Trading and Kitchen</p>
            <button className="pause-menu-btn resume" onClick={() => setShowBossIntro(null)}>Let's Go! →</button>
          </div>
        </div>
      )}

      {/* Multiplayer action feed */}
      {isMultiplayer && mpState.actionFeed.length > 0 && (
        <div className="mp-feed">
          {mpState.actionFeed.slice(0, 5).map((item, i) => (
            <div key={`${item.timestamp}-${i}`} className="mp-feed-item">
              <span className="mp-feed-name" style={{ color: mpState.players.find((p) => p.id === item.playerId)?.color ?? "#ccc" }}>{item.playerName}</span>
              {item.description.replace(item.playerName + " ", "")}
            </div>
          ))}
        </div>
      )}

      {/* Multiplayer player indicators in header */}
      {isMultiplayer && mpState.players.length > 1 && (
        <div className="mp-player-indicators" style={{ position: "fixed", top: 8, right: 12, zIndex: 100, display: "flex", gap: 4, alignItems: "center" }}>
          {mpState.players.map((p) => (
            <span key={p.id} className="mp-player-pip" style={{ backgroundColor: p.color, width: 10, height: 10, borderRadius: "50%", display: "inline-block" }} title={p.name} />
          ))}
        </div>
      )}

    </div>
  );
}

export default App;
