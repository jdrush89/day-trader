import { useState, useEffect, useCallback, useRef } from "react";
import { GameState, MonitorChannel, OrderType, OrderSide } from "./game/types";
import { createInitialState } from "./game/state";
import { tick, buyStock, sellStock, shortStock, coverShort, openMarket, placeOrder, cancelOrder, getMilestone, draftStock, togglePinStock, acquireUpgrade, hasUpgrade, buyOption, sellOption, closeOption, getOptionsValue, isBossDayCheck, generateDraftOptions, generateUpgradeDraft, applyMilestoneCheck, isMilestoneDay } from "./game/engine";
import { acquireRestaurantUpgrade, createRestaurantState, draftMenuItem, finishRestaurantDay, restaurantTick, MENU, generateRestaurantUpgradeDraft, generateMenuDraft } from "./game/restaurant-engine";
import { RestaurantState } from "./game/restaurant-types";
import { RESTAURANT_UPGRADE_POOL } from "./game/restaurant-upgrades";
import { UPGRADE_POOL } from "./game/upgrades";
import { selectDailyChallenges, evaluateChallenges, getTicketsEarned, ALL_CHALLENGES } from "./game/challenges";
import { generateShopOffering, getConsumable, addConsumable, removeConsumable, activateBuff, hasActiveBuff, tickBuffs, type ConsumableItem } from "./game/consumables";
import { useMultiplayer } from "./multiplayer";
import { MultiplayerLobby } from "./components/MultiplayerLobby";
import { Monitor } from "./components/Monitor";
import { TradingPanel } from "./components/TradingPanel";
import { OrdersPanel } from "./components/OrdersPanel";
import { Restaurant } from "./components/Restaurant";
import { SecWheel } from "./components/SecWheel";
import { DebugPanel } from "./components/DebugPanel";
import { Tutorial, TRADING_STEPS, RESTAURANT_STEPS, type TutorialStep } from "./components/Tutorial";
import { saveGame, loadGame, deleteSave, saveMpGame, loadAllMpSaves, deleteMpSave } from "./game/save";
import type { MpSaveData, PlayerSaveData } from "./game/save";
import { createTradeTracker, recordBuy, recordSell, recordShort, recordCover, recordOptionBuy, recordOptionSell, recordOptionClose, computeEODUnrealized, buildPnLSeries, type TradeTracker, type PlayerPnLSeries } from "./game/trade-log";
import { PnLGraph } from "./components/PnLGraph";
import titleScreen from "./assets/title-screen.png";
import shwendysExterior from "./assets/shwendys-exterior.png";
import tradingMorning from "./assets/trading-morning.jpg";

const GAME_VERSION = "0.0.69";

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
  const [eodPhase, setEodPhase] = useState<"summary" | "challenges" | "shop" | "upgrades" | "stocks" | "restaurant-upgrades" | "menu-draft">("summary");
  const [restaurantState, setRestaurantState] = useState<RestaurantState | null>(null);
  const [activeMonitorId, setActiveMonitorId] = useState(0);
  const [showTransition, setShowTransition] = useState<"restaurant" | "trading" | null>(null);
  const [showChallengeIntro, setShowChallengeIntro] = useState<"trading" | "restaurant" | null>(null);
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
  const [disconnectedPlayer, setDisconnectedPlayer] = useState<string | null>(null);
  const [eodChoiceMade, setEodChoiceMade] = useState(false); // local player submitted their EOD choice
  const [mpUpgradeChoice, setMpUpgradeChoice] = useState<string | null>(null); // track upgrade pick locally in MP
  const [myCounter, setMyCounter] = useState(0); // which restaurant counter the local player is viewing
  const [peerActiveOrderId, setPeerActiveOrderId] = useState<number | null>(null); // peer's local active order
  const [localUpgrades, setLocalUpgrades] = useState<string[]>([]); // per-player trading upgrades (MP only)
  const [localRestaurantUpgrades, setLocalRestaurantUpgrades] = useState<string[]>([]); // per-player restaurant upgrades (MP only)
  const [challengeReadyPlayers, setChallengeReadyPlayers] = useState<Set<string>>(new Set()); // players who clicked "start" on challenge intro
  const [resumeReadyPlayers, setResumeReadyPlayers] = useState<Set<string>>(new Set()); // players who clicked "resume" after pause
  const [mpSaveId, setMpSaveId] = useState<string | null>(null); // current MP save ID for auto-save
  const mpSaveIdRef = useRef<string | null>(null);
  mpSaveIdRef.current = mpSaveId;
  const [mpResumeData, setMpResumeData] = useState<MpSaveData | null>(null); // MP save being resumed (waiting for players)
  const [localEodInfoStep, setLocalEodInfoStep] = useState<"summary" | "challenges" | "shop" | "waiting" | null>(null); // per-player EOD info screen navigation (MP only)
  const [eodInfoReadyPlayers, setEodInfoReadyPlayers] = useState<Set<string>>(new Set()); // players done with info screens
  const [shopOffering, setShopOffering] = useState<ConsumableItem[]>([]); // current shop items for sale
  const [tradeTracker, setTradeTracker] = useState<TradeTracker>(createTradeTracker);
  const [pnlSeries, setPnlSeries] = useState<PlayerPnLSeries[]>([]);
  const tradeTrackerRef = useRef<TradeTracker>(createTradeTracker());
  tradeTrackerRef.current = tradeTracker;
  const beginScheduledDayRef = useRef<(state?: GameState, opts?: { skipRestaurantTransition?: boolean; skipTradingTransition?: boolean }) => void>(() => {});
  const goToShopOrNextDayRef = useRef<() => void>(() => {});

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
    () => showTransition,
    () => showChallengeIntro,
    () => showLoanOffer,
    () => mpResumeData?.players,
    () => mpSaveIdRef.current ?? undefined,
    {
      onViewInsider: () => setGameState((prev) => prev.insiderViewed ? prev : { ...prev, insiderViewed: true, insiderViewedTick: prev.timeOfDay, insiderSnapshotHoldings: prev.portfolio.map((p) => ({ symbol: p.symbol, shares: p.shares, avgCost: p.avgCost })), insiderSnapshotShorts: prev.shorts.map((s) => ({ symbol: s.symbol, shares: s.shares, entryPrice: s.entryPrice })) }),
      onAcceptLoan: () => {
        if (showLoanOffer) {
          setGameState((prev) => ({ ...prev, cash: prev.cash + showLoanOffer.amount, loans: [...prev.loans, { amount: showLoanOffer.amount, dueDay: showLoanOffer.dueDay, interestRate: showLoanOffer.interestRate }] }));
          setShowLoanOffer(null);
          setShowChallengeIntro("trading");
        }
      },
      onDeclineLoan: () => { setShowLoanOffer(null); setShowChallengeIntro("trading"); },
      onDismissTransition: () => {
        const currentTransition = showTransition;
        if (!currentTransition) return; // Already dismissed (race between host/peer clicks)
        setShowTransition(null);
        if (currentTransition === "trading") {
          beginScheduledDayRef.current(gameState, { skipTradingTransition: true, skipRestaurantTransition: true });
        } else {
          setSpeed(1);
          setMyCounter(0);
          setRestaurantState(createRestaurantState(gameState, mpState.players.length));
          setShowChallengeIntro("restaurant");
        }
      },
      onDismissChallengeIntro: (playerId: string) => {
        setChallengeReadyPlayers((prev) => {
          const next = new Set(prev);
          next.add(playerId);
          return next;
        });
      },
      onResumeReady: (playerId: string) => {
        setResumeReadyPlayers((prev) => {
          const next = new Set(prev);
          next.add(playerId);
          return next;
        });
      },
      onEodInfoDone: (playerId: string) => {
        setEodInfoReadyPlayers((prev) => {
          const next = new Set(prev);
          next.add(playerId);
          return next;
        });
      },
      onUseConsumable: (consumableId: string) => {
        // Determine which handler based on the item's phase
        const c = getConsumable(consumableId);
        if (!c) return;
        if (c.phase === "trading") handleUseTradingItem(consumableId);
        else handleUseRestaurantItem(consumableId);
      },
      onBuyConsumable: (consumableId: string) => {
        handleBuyConsumable(consumableId);
      },
      onRecordTrade: (playerId: string, playerName: string, action: "buy" | "sell" | "short" | "cover" | "buy_option" | "sell_option" | "close_option", symbol: string, shares: number, price: number, timestamp: number) => {
        setTradeTracker((t) => {
          switch (action) {
            case "buy": return recordBuy(t, playerId, playerName, symbol, shares, price, timestamp);
            case "sell": return recordSell(t, playerId, playerName, symbol, shares, price, timestamp);
            case "short": return recordShort(t, playerId, playerName, symbol, shares, price, timestamp);
            case "cover": return recordCover(t, playerId, playerName, symbol, shares, price, timestamp);
            case "buy_option": return recordOptionBuy(t, playerId, playerName, symbol, "call", shares, price, timestamp);
            case "sell_option": return recordOptionSell(t, playerId, playerName, symbol, "call", shares, price, timestamp);
            case "close_option": return recordOptionClose(t, playerId, playerName, symbol, price, timestamp);
            default: return t;
          }
        });
      },
      onSetSpeed: setSpeed,
      onTogglePause: () => {
        // In MP, toggle_pause only pauses. Unpausing requires all players to click resume.
        setPaused(true);
      },
      onChooseUpgrade: (id) => { const nextState = acquireUpgrade(gameState, id); if (nextState.stockDraftOptions.length > 0) { setGameState(nextState); setEodPhase("stocks"); } else { setGameState(nextState); setEodPhase("summary"); } },
      onChooseStock: (symbol) => { setGameState(draftStock(gameState, symbol)); setEodPhase("summary"); },
      onChooseRestaurantUpgrade: (id) => { const nextState = acquireRestaurantUpgrade(gameState, id); setGameState(nextState); if (nextState.menuDraftOptions.length > 0) setEodPhase("menu-draft"); else setEodPhase("summary"); },
      onChooseMenuItem: (name) => { setGameState(draftMenuItem(gameState, name)); setEodPhase("summary"); },
      onChangeChannel: (monitorId, channel) => setGameState((prev) => ({ ...prev, monitors: prev.monitors.map((m) => m.id === monitorId ? { ...m, channel: channel as MonitorChannel } : m) })),
      onSelectStock: (monitorId, symbol) => setGameState((prev) => ({ ...prev, monitors: prev.monitors.map((m) => m.id === monitorId ? { ...m, selectedStock: symbol } : m) })),
      onPeerStateSync: (sync) => {
        // Apply synced game state directly, preserving local monitors and local draft options during EOD
        setGameState((prev) => {
          const merged = { ...sync.gameState, monitors: prev.monitors };
          // Preserve local draft options during multiplayer EOD picking
          if (!prev.marketOpen && (prev.upgradeDraftOptions.length > 0 || prev.stockDraftOptions.length > 0)) {
            merged.upgradeDraftOptions = prev.upgradeDraftOptions;
            merged.stockDraftOptions = prev.stockDraftOptions;
          }
          // Preserve local restaurant/menu draft options during picking
          if (prev.restaurantUpgradeDraftOptions.length > 0) {
            merged.restaurantUpgradeDraftOptions = prev.restaurantUpgradeDraftOptions;
          }
          if (prev.menuDraftOptions.length > 0) {
            merged.menuDraftOptions = prev.menuDraftOptions;
          }
          return merged;
        });
        if (sync.restaurantState !== undefined) setRestaurantState(sync.restaurantState);
        // Don't override local EOD phase during upgrade/stock/restaurant picking or info screen navigation
        setEodPhase((prev) => {
          const localPicking = prev === "upgrades" || prev === "stocks" || prev === "restaurant-upgrades" || prev === "menu-draft";
          const hostPicking = sync.eodPhase === "upgrades" || sync.eodPhase === "stocks" || sync.eodPhase === "restaurant-upgrades" || sync.eodPhase === "menu-draft";
          // If peer is locally picking, only accept phase change if host moves to a non-picking phase (e.g., summary = next day started)
          if (localPicking && hostPicking) return prev;
          // Don't sync informational phases (summary, challenges, shop) — peers navigate those locally
          const hostInfoPhase = sync.eodPhase === "summary" || sync.eodPhase === "challenges" || sync.eodPhase === "shop";
          if (hostInfoPhase && localEodInfoStep !== null) return prev;
          // When host advances to a pick phase, clear local info step
          if (hostPicking) setLocalEodInfoStep(null);
          // When host syncs shop phase and local step is null (post-picks), set local step to shop
          if (sync.eodPhase === "shop" && localEodInfoStep === null) {
            setLocalEodInfoStep("shop");
            setShopOffering(generateShopOffering());
            setEodInfoReadyPlayers(new Set());
          }
          if (prev !== sync.eodPhase) setEodChoiceMade(false);
          return sync.eodPhase as any;
        });
        // Sync showTransition so peer sees Shwendy's start screen
        if (sync.showTransition !== undefined) setShowTransition(sync.showTransition as any);
        if (sync.showChallengeIntro !== undefined) setShowChallengeIntro(sync.showChallengeIntro as any);
        if (sync.showLoanOffer !== undefined) setShowLoanOffer(sync.showLoanOffer);
        setPaused(sync.paused);
        setSpeed(sync.speed);
        setBossDay(sync.bossDay);
        // Don't sync bossView — each player toggles independently
        // Update peer's local activeOrderId from host's tracking
        if (sync.playerActiveOrders && mpState.localPlayer) {
          const myActiveOrder = sync.playerActiveOrders[mpState.localPlayer.id];
          if (myActiveOrder !== undefined) setPeerActiveOrderId(myActiveOrder);
        }
        // Restore per-player upgrades on resume sync
        if (sync.playerSaves && mpState.localPlayer) {
          const myName = mpState.players.find((p) => p.id === mpState.localPlayer!.id)?.name;
          const mySave = sync.playerSaves.find((p) => p.name === myName);
          if (mySave) {
            setLocalUpgrades(mySave.upgrades);
            setLocalRestaurantUpgrades(mySave.restaurantUpgrades);
          }
        }
        // Sync save ID from host so peer uses same save slot
        if (sync.mpSaveId && !mpSaveIdRef.current) {
          mpSaveIdRef.current = sync.mpSaveId;
          setMpSaveId(sync.mpSaveId);
        }
      },
      onEodAllReady: () => {
        // All players have chosen — unblock the peer's EOD state so sync can resume
        setEodChoiceMade(false);
        setEodPhase("summary"); // will be overwritten by next sync from host
      },
      onPlayerDisconnected: (playerName: string) => {
        setDisconnectedPlayer(playerName);
        setPaused(true);
      },
      onAllUpgradesChosen: (_choices) => {
        // Upgrades are now stored locally in handleDraftStock — nothing to do here
      },
      onAllStocksChosen: (choices) => {
        // Apply all stocks, then move to restaurant-upgrades/menu-draft/shop or next phase
        setGameState((prev) => {
          let state = prev;
          for (const { symbol } of choices) {
            state = draftStock(state, symbol);
          }
          if (state.restaurantUpgradeDraftOptions.length > 0) {
            setTimeout(() => { setEodPhase("restaurant-upgrades"); mpActions.resetEodGate(); }, 0);
          } else if (state.menuDraftOptions.length > 0) {
            setTimeout(() => { setEodPhase("menu-draft"); mpActions.resetEodGate(); }, 0);
          } else if (restaurantState !== null && (state.tradingTickets > 0 || state.restaurantTickets > 0)) {
            setTimeout(() => { setShopOffering(generateShopOffering()); setEodPhase("shop"); setLocalEodInfoStep("shop"); setEodInfoReadyPlayers(new Set()); }, 0);
          } else {
            setRestaurantState(null);
            setTimeout(() => beginScheduledDayRef.current(state), 0);
          }
          return state;
        });
        setEodChoiceMade(false);
      },
      onAllRestaurantUpgradesChosen: (_choices) => {
        // Restaurant upgrades are now stored locally in handleAcquireRestaurantUpgrade
      },
      onAllMenuItemsChosen: (choices) => {
        // All menu items get added to shared pool, then go to shop or next day
        setGameState((prev) => {
          let state = prev;
          for (const { itemName } of choices) {
            state = draftMenuItem(state, itemName);
          }
          if (state.tradingTickets > 0 || state.restaurantTickets > 0) {
            setTimeout(() => { setShopOffering(generateShopOffering()); setEodPhase("shop"); setLocalEodInfoStep("shop"); setEodInfoReadyPlayers(new Set()); }, 0);
          } else {
            setRestaurantState(null);
            setTimeout(() => beginScheduledDayRef.current(state, { skipRestaurantTransition: true }), 0);
          }
          return state;
        });
        setEodChoiceMade(false);
      },
    },
  );
  const isMultiplayer = mpState.role !== "none";
  const isPeer = mpState.role === "peer";

  // Peer: generate local draft options when entering EOD upgrades phase (so each player gets different choices)
  const peerDraftGenerated = useRef<number>(0); // track which day's draft was generated
  useEffect(() => {
    if (!isPeer) return;
    if (eodPhase !== "upgrades") return;
    if (peerDraftGenerated.current === gameState.day) return; // already generated for this day
    peerDraftGenerated.current = gameState.day;
    // Generate our own random draft options
    setGameState((prev) => generateDraftOptions(generateUpgradeDraft(prev)));
  }, [isPeer, eodPhase, gameState.day]);

  // Peer: generate local restaurant upgrade draft options (different from host)
  const peerRestaurantDraftGenerated = useRef<number>(0);
  useEffect(() => {
    if (!isPeer) return;
    if (eodPhase !== "restaurant-upgrades") return;
    if (peerRestaurantDraftGenerated.current === gameState.day) return;
    peerRestaurantDraftGenerated.current = gameState.day;
    setGameState((prev) => generateRestaurantUpgradeDraft(prev));
  }, [isPeer, eodPhase, gameState.day]);

  // Peer: generate local menu draft options (different from host)
  const peerMenuDraftGenerated = useRef<number>(0);
  useEffect(() => {
    if (!isPeer) return;
    if (eodPhase !== "menu-draft") return;
    if (peerMenuDraftGenerated.current === gameState.day) return;
    peerMenuDraftGenerated.current = gameState.day;
    setGameState((prev) => generateMenuDraft(prev));
  }, [isPeer, eodPhase, gameState.day]);

  // Reset challenge ready state when a new challenge intro appears
  useEffect(() => {
    if (showChallengeIntro) setChallengeReadyPlayers(new Set());
  }, [showChallengeIntro]);

  // Challenge intro gate: when all players clicked "start", dismiss the challenge intro
  useEffect(() => {
    if (!isMultiplayer || !showChallengeIntro) return;
    const totalPlayers = mpState.players.length;
    if (totalPlayers < 2) return;
    if (challengeReadyPlayers.size >= totalPlayers) {
      setShowChallengeIntro(null);
      setPaused(false);
      setChallengeReadyPlayers(new Set());
    }
  }, [challengeReadyPlayers, isMultiplayer, showChallengeIntro, mpState.players.length]);

  // Resume gate: reset when pause starts, unpause when all players click resume
  useEffect(() => {
    if (isMultiplayer && paused && !showChallengeIntro && !showLoanOffer && !disconnectedPlayer) {
      setResumeReadyPlayers(new Set());
    }
  }, [paused]);

  useEffect(() => {
    if (!isMultiplayer || !paused) return;
    const totalPlayers = mpState.players.length;
    if (totalPlayers < 2) return;
    if (resumeReadyPlayers.size >= totalPlayers) {
      setPaused(false);
      setResumeReadyPlayers(new Set());
    }
  }, [resumeReadyPlayers, isMultiplayer, paused, mpState.players.length]);

  // Multiplayer: auto-trigger restaurant finish when shift ends (host only)
  const restaurantFinishTriggered = useRef<number>(0);
  useEffect(() => {
    if (!isMultiplayer || isPeer || !restaurantState?.shiftOver) return;
    if (restaurantFinishTriggered.current === gameState.day) return; // already triggered this day
    restaurantFinishTriggered.current = gameState.day;
    // Replicate handleRestaurantFinish logic: finishRestaurantDay + evaluate challenges
    const tradingDay = gameState.day;
    const nextState = finishRestaurantDay(gameState, restaurantState.totalEarnings);
    const milestoneState = isMilestoneDay(tradingDay) ? applyMilestoneCheck(nextState, tradingDay) : nextState;
    const evaluated = evaluateChallenges(
      milestoneState.activeChallenges,
      milestoneState.challengeTracker,
      milestoneState,
      restaurantState.challengeTracker,
    );
    const earned = getTicketsEarned(evaluated);
    const challengedState = {
      ...milestoneState,
      activeChallenges: evaluated,
      tickets: milestoneState.tickets + earned.tradingTickets + earned.restaurantTickets,
      tradingTickets: milestoneState.tradingTickets + earned.tradingTickets,
      restaurantTickets: milestoneState.restaurantTickets + earned.restaurantTickets,
    };
    setGameState(challengedState);
    doSave(challengedState);
    setEodPhase("challenges");
  }, [isMultiplayer, isPeer, restaurantState?.shiftOver]);

  // Multiplayer: EOD info screens gate — when all players are done, advance to picks/next day
  useEffect(() => {
    if (!isMultiplayer) return;
    const totalPlayers = mpState.players.length;
    if (totalPlayers < 2) return;
    if (eodInfoReadyPlayers.size < totalPlayers) return;
    // All players done with info screens — advance to picks or next day
    setEodInfoReadyPlayers(new Set());
    setLocalEodInfoStep(null);
    if (!isPeer) {
      // Host: determine what comes next (same logic as handleChallengesContinue but without challenge eval)
      if (gameState.upgradeDraftOptions.length > 0) {
        setEodPhase("upgrades");
        setEodChoiceMade(false);
        setMpUpgradeChoice(null);
        mpActions.resetEodGate();
      } else if (gameState.stockDraftOptions.length > 0) {
        setEodPhase("stocks");
        setEodChoiceMade(false);
        mpActions.resetEodGate();
      } else if (gameState.restaurantUpgradeDraftOptions.length > 0) {
        setEodPhase("restaurant-upgrades");
        setEodChoiceMade(false);
        mpActions.resetEodGate();
      } else if (gameState.menuDraftOptions.length > 0) {
        setEodPhase("menu-draft");
        setEodChoiceMade(false);
        mpActions.resetEodGate();
      } else {
        // Shop was already shown locally via localEodInfoStep — go to next day
        setRestaurantState(null);
        beginScheduledDayRef.current(undefined, restaurantState !== null ? { skipRestaurantTransition: true } : undefined);
      }
    }
  }, [eodInfoReadyPlayers, isMultiplayer, mpState.players.length]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${textSize}%`;
    localStorage.setItem("rogue-day-trader-text-size", String(textSize));
  }, [textSize]);

  useEffect(() => {
    if (isPeer) return; // Peers don't tick - host sends state
    if (gameState.gameOver || !gameState.marketOpen || paused || titleTutorial || showLoanOffer || showBossIntro) return;
    const interval = setInterval(() => setGameState((prev) => {
      let next = tick(prev);
      // Apply Scale buff: double stock movement
      if (hasActiveBuff(prev.consumableInventory, "scale")) {
        next = {
          ...next,
          stocks: next.stocks.map((s, i) => {
            const prevPrice = prev.stocks[i]?.price ?? s.price;
            const delta = s.price - prevPrice;
            return { ...s, price: Math.max(0.01, prevPrice + delta * 2) };
          }),
        };
      }
      // Apply Bubble buffs
      next = {
        ...next,
        stocks: next.stocks.map((s) => {
          const riseKey = `bubble_rise_${s.symbol}`;
          const crashKey = `bubble_crash_${s.symbol}`;
          if (hasActiveBuff(prev.consumableInventory, riseKey)) {
            return { ...s, price: s.price * 1.02 }; // 2% rise per tick
          }
          if (hasActiveBuff(prev.consumableInventory, crashKey)) {
            return { ...s, price: Math.max(0.01, s.price * 0.97) }; // 3% crash per tick
          }
          return s;
        }),
      };
      // Tick consumable buffs
      const tickedInv = tickBuffs(next.consumableInventory);
      // Check if a bubble rise just expired → start crash phase
      const newBuffs = [...tickedInv.activeBuffs];
      for (const b of prev.consumableInventory.activeBuffs) {
        if (b.consumableId.startsWith("bubble_rise_") && b.remainingTicks <= 1) {
          const sym = b.consumableId.replace("bubble_rise_", "");
          newBuffs.push({ consumableId: `bubble_crash_${sym}`, remainingTicks: 50 });
        }
      }
      next = { ...next, consumableInventory: { ...tickedInv, activeBuffs: newBuffs } };
      return next;
    }), 1000 / speed);
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
        const buffIds = gameState.consumableInventory.activeBuffs.map((b) => b.consumableId);
        const next = restaurantTick(prev, 0.05 * speed, buffIds);
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

  // Tick consumable buffs during restaurant shifts (standalone, not boss day)
  useEffect(() => {
    if (isPeer) return;
    const isRestaurant = restaurantState !== null && !bossDay;
    if (!isRestaurant || paused || restaurantState.shiftOver) return;
    if (gameState.consumableInventory.activeBuffs.length === 0) return;
    const interval = setInterval(() => {
      setGameState((prev) => ({ ...prev, consumableInventory: tickBuffs(prev.consumableInventory) }));
    }, 50);
    return () => clearInterval(interval);
  }, [restaurantState, bossDay, paused, isPeer, gameState.consumableInventory.activeBuffs.length]);

  const CHANNEL_KEYS: MonitorChannel[] = ["stock_ticker", "business_news", "global_news", "social_media", "insider", "items"];

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

  // MP-aware save helper
  const doSave = useCallback((gs: GameState, type: "auto" | "manual" = "auto") => {
    if (isMultiplayer) {
      const playerSaves: PlayerSaveData[] = mpState.players.map((p) => ({
        name: p.name,
        upgrades: p.id === (mpState.localPlayer?.id ?? "host") ? localUpgrades : [],
        restaurantUpgrades: p.id === (mpState.localPlayer?.id ?? "host") ? localRestaurantUpgrades : [],
      }));
      const id = saveMpGame(gs, playerSaves, mpSaveIdRef.current ?? undefined, type);
      if (!mpSaveIdRef.current) {
        mpSaveIdRef.current = id;
        setMpSaveId(id);
      }
    } else {
      saveGame(gs);
    }
  }, [isMultiplayer, mpState.players, mpState.localPlayer, localUpgrades, localRestaurantUpgrades]);

  useEffect(() => {
    if (gameState.marketOpen) {
      setEodPhase("summary");
      setLocalEodInfoStep(null);
      setEodInfoReadyPlayers(new Set());
      // Reset trade tracker at start of new trading day
      setTradeTracker(createTradeTracker());
      setPnlSeries([]);
    }
    // Auto-save when market closes (end of trading day) — only host saves in MP
    if (!gameState.marketOpen && !gameState.gameOver && !isPeer) doSave(gameState);
    // Build P&L series when market closes
    if (!gameState.marketOpen && !gameState.gameOver) {
      const tracker = tradeTrackerRef.current;
      // Add unrealized P&L for open positions
      const eodEntries = computeEODUnrealized(tracker, gameState.stocks, 100);
      const fullLog = [...tracker.log, ...eodEntries];
      // Get players list (solo = single player)
      const players = isMultiplayer
        ? mpState.players.map((p) => ({ id: p.id, name: p.name, color: p.color }))
        : [{ id: mpState.localPlayer?.id ?? "player", name: mpState.localPlayer?.name ?? "You", color: "#4fc3f7" }];
      const series = buildPnLSeries(fullLog, players, 100);
      setPnlSeries(series);
      // In multiplayer, auto-evaluate trading challenges when market closes (host only)
      // so challenge data is ready before any player navigates to the challenges screen
      if (isMultiplayer && !isPeer) {
        const evaluated = evaluateChallenges(
          gameState.activeChallenges,
          gameState.challengeTracker,
          gameState,
          undefined,
        );
        const earned = getTicketsEarned(evaluated);
        setGameState((prev) => ({
          ...prev,
          activeChallenges: evaluated,
          tickets: prev.tickets + earned.tradingTickets + earned.restaurantTickets,
          tradingTickets: prev.tradingTickets + earned.tradingTickets,
          restaurantTickets: prev.restaurantTickets + earned.restaurantTickets,
        }));
      }
      // Set local info step for MP navigation
      if (isMultiplayer) {
        setLocalEodInfoStep("summary");
      }
    }
  }, [gameState.marketOpen]);

  const NEWS_CHANNELS: MonitorChannel[] = ["business_news", "global_news", "social_media"];

  const handleChangeChannel = useCallback((monitorId: number, channel: MonitorChannel) => {
    // Channel changes are always local (each player has their own monitor views)
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
  }, []);

  const handleSelectStock = useCallback((monitorId: number, symbol: string) => {
    // Stock selection is always local (each player views their own stocks)
    setGameState((prev) => ({
      ...prev,
      monitors: prev.monitors.map((m) => (m.id === monitorId ? { ...m, selectedStock: symbol } : m)),
    }));
  }, []);

  const handleBuy = useCallback((symbol: string, shares: number) => {
    if (isPeer) { mpActions.sendAction({ type: "buy_stock", symbol, shares }); return; }
    const playerId = mpState.localPlayer?.id ?? "player";
    const playerName = mpState.localPlayer?.name ?? "You";
    setGameState((prev) => {
      const stock = prev.stocks.find((s) => s.symbol === symbol);
      if (!stock) return prev;
      if (prev.freeNextStock) {
        const existing = prev.portfolio.find((p) => p.symbol === symbol);
        setTradeTracker((t) => recordBuy(t, playerId, playerName, symbol, 1, stock.price, prev.timeOfDay));
        return {
          ...prev,
          freeNextStock: false,
          portfolio: existing
            ? prev.portfolio.map((p) => p.symbol === symbol ? { ...p, shares: p.shares + 1, avgCost: (p.avgCost * p.shares + stock.price) / (p.shares + 1) } : p)
            : [...prev.portfolio, { symbol, shares: 1, avgCost: stock.price, dayAcquired: prev.day }],
        };
      }
      const next = buyStock(prev, symbol, shares);
      if (next !== prev) {
        setTradeTracker((t) => recordBuy(t, playerId, playerName, symbol, shares, stock.price, prev.timeOfDay));
      }
      return next;
    });
  }, [isPeer, mpActions, mpState.localPlayer]);
  const handleSell = useCallback((symbol: string, shares: number) => {
    if (isPeer) { mpActions.sendAction({ type: "sell_stock", symbol, shares }); return; }
    const playerId = mpState.localPlayer?.id ?? "player";
    const playerName = mpState.localPlayer?.name ?? "You";
    setGameState((prev) => {
      const stock = prev.stocks.find((s) => s.symbol === symbol);
      if (!stock) return prev;
      const next = sellStock(prev, symbol, shares);
      if (next !== prev) {
        setTradeTracker((t) => recordSell(t, playerId, playerName, symbol, shares, stock.price, prev.timeOfDay));
      }
      // Golden Coin: negate loss
      if (hasActiveBuff(prev.consumableInventory, "golden_coin") && next.cash < prev.cash) {
        const negated = { ...next, cash: prev.cash, consumableInventory: { ...next.consumableInventory, activeBuffs: next.consumableInventory.activeBuffs.filter((b) => b.consumableId !== "golden_coin") } };
        return negated;
      }
      return next;
    });
  }, [isPeer, mpActions, mpState.localPlayer]);
  const handleShort = useCallback((symbol: string, shares: number) => {
    if (isPeer) { mpActions.sendAction({ type: "short_stock", symbol, shares }); return; }
    const playerId = mpState.localPlayer?.id ?? "player";
    const playerName = mpState.localPlayer?.name ?? "You";
    setGameState((prev) => {
      const stock = prev.stocks.find((s) => s.symbol === symbol);
      if (!stock) return prev;
      const next = shortStock(prev, symbol, shares);
      if (next !== prev) {
        setTradeTracker((t) => recordShort(t, playerId, playerName, symbol, shares, stock.price, prev.timeOfDay));
      }
      return next;
    });
  }, [isPeer, mpActions, mpState.localPlayer]);
  const handleCover = useCallback((symbol: string, shares: number) => {
    if (isPeer) { mpActions.sendAction({ type: "cover_short", symbol, shares }); return; }
    const playerId = mpState.localPlayer?.id ?? "player";
    const playerName = mpState.localPlayer?.name ?? "You";
    setGameState((prev) => {
      const stock = prev.stocks.find((s) => s.symbol === symbol);
      if (!stock) return prev;
      const next = coverShort(prev, symbol, shares);
      if (next !== prev) {
        setTradeTracker((t) => recordCover(t, playerId, playerName, symbol, shares, stock.price, prev.timeOfDay));
      }
      // Golden Coin: negate loss
      if (hasActiveBuff(prev.consumableInventory, "golden_coin") && next.cash < prev.cash) {
        const negated = { ...next, cash: prev.cash, consumableInventory: { ...next.consumableInventory, activeBuffs: next.consumableInventory.activeBuffs.filter((b) => b.consumableId !== "golden_coin") } };
        return negated;
      }
      return next;
    });
  }, [isPeer, mpActions, mpState.localPlayer]);
  const handleTogglePin = useCallback((symbol: string) => setGameState((prev) => togglePinStock(prev, symbol)), []);
  const handleToggleStopLoss = useCallback(() => setGameState((prev) => ({ ...prev, stopLossEnabled: !prev.stopLossEnabled })), []);

  const handleUseTradingItem = useCallback((itemId: string) => {
    const item = getConsumable(itemId);
    if (!item || !gameState.consumableInventory.items.includes(itemId)) return;
    if (isPeer) { mpActions.sendAction({ type: "use_consumable", consumableId: itemId } as any); return; }

    const TICKS_PER_SEC = 10; // game runs at ~10 ticks/sec at 1x speed

    switch (itemId) {
      case "scale": {
        // Double stock movement for 10 seconds
        setGameState((prev) => ({
          ...prev,
          consumableInventory: activateBuff(removeConsumable(prev.consumableInventory, itemId), itemId, 10 * TICKS_PER_SEC),
        }));
        break;
      }
      case "rewinder": {
        // Rewind time by 10 seconds (move timeOfDay back)
        setGameState((prev) => ({
          ...prev,
          timeOfDay: Math.max(0, prev.timeOfDay - 10 * TICKS_PER_SEC),
          consumableInventory: removeConsumable(prev.consumableInventory, itemId),
        }));
        break;
      }
      case "golden_coin": {
        // Activate buff that negates loss on next sell/cover
        setGameState((prev) => ({
          ...prev,
          consumableInventory: activateBuff(removeConsumable(prev.consumableInventory, itemId), itemId, 9999),
        }));
        break;
      }
      case "stock_ticket": {
        // Make the next stock purchase free
        setGameState((prev) => ({
          ...prev,
          freeNextStock: true,
          consumableInventory: removeConsumable(prev.consumableInventory, itemId),
        }));
        break;
      }
      case "quantum_encryption": {
        // View insider without SEC risk — activate buff, then trigger view
        setGameState((prev) => ({
          ...prev,
          consumableInventory: activateBuff(removeConsumable(prev.consumableInventory, itemId), itemId, 9999),
        }));
        // Auto-view insider tip
        handleViewInsider();
        break;
      }
      case "bubble": {
        // Pick a random stock and create a bubble effect (rapid rise then crash)
        const stocks = gameState.stocks.filter((s) => s.price > 5);
        const target = stocks[Math.floor(Math.random() * stocks.length)];
        if (target) {
          setGameState((prev) => ({
            ...prev,
            consumableInventory: activateBuff(removeConsumable(prev.consumableInventory, itemId), `bubble_rise_${target.symbol}`, 5 * TICKS_PER_SEC),
          }));
        }
        break;
      }
      case "upvote_bots": {
        // Boost the most recent social media post
        setGameState((prev) => {
          const socialNews = prev.news.filter((n) => n.category === "social" && n.impact && n.impact.ticksRemaining > 0);
          if (socialNews.length === 0) return prev;
          const latest = socialNews[socialNews.length - 1];
          return {
            ...prev,
            news: prev.news.map((n) => n.id === latest.id ? {
              ...n,
              upvotes: (n.upvotes ?? 0) + 500,
              impact: n.impact ? { ...n.impact, duration: n.impact.duration * 2, ticksRemaining: n.impact.ticksRemaining + n.impact.duration } : n.impact,
            } : n),
            consumableInventory: removeConsumable(prev.consumableInventory, itemId),
          };
        });
        break;
      }
    }
  }, [gameState, isPeer, mpActions]);

  const handleUseRestaurantItem = useCallback((itemId: string) => {
    const item = getConsumable(itemId);
    if (!item || !gameState.consumableInventory.items.includes(itemId)) return;
    if (isPeer) { mpActions.sendAction({ type: "use_consumable", consumableId: itemId } as any); return; }

    const TICKS_PER_SEC = 20; // restaurant ticks at 50ms = 20 ticks/sec

    switch (itemId) {
      case "tablet":
        // 50% patience loss rate for 25 sec
        setGameState((prev) => ({
          ...prev,
          consumableInventory: activateBuff(removeConsumable(prev.consumableInventory, itemId), itemId, 25 * TICKS_PER_SEC),
        }));
        break;
      case "live_band":
        // 50% more tips for 25 sec
        setGameState((prev) => ({
          ...prev,
          consumableInventory: activateBuff(removeConsumable(prev.consumableInventory, itemId), itemId, 25 * TICKS_PER_SEC),
        }));
        break;
      case "birthday_chant":
        // Stop patience loss for 10 sec
        setGameState((prev) => ({
          ...prev,
          consumableInventory: activateBuff(removeConsumable(prev.consumableInventory, itemId), itemId, 10 * TICKS_PER_SEC),
        }));
        break;
      case "ad_buy":
        // Increase customer rate for 20 sec
        setGameState((prev) => ({
          ...prev,
          consumableInventory: activateBuff(removeConsumable(prev.consumableInventory, itemId), itemId, 20 * TICKS_PER_SEC),
        }));
        break;
      case "lighter":
        // Cook twice as fast for 30 sec
        setGameState((prev) => ({
          ...prev,
          consumableInventory: activateBuff(removeConsumable(prev.consumableInventory, itemId), itemId, 30 * TICKS_PER_SEC),
        }));
        break;
      case "assistant":
        // All prep handled for 25 sec
        setGameState((prev) => ({
          ...prev,
          consumableInventory: activateBuff(removeConsumable(prev.consumableInventory, itemId), itemId, 25 * TICKS_PER_SEC),
        }));
        break;
      case "new_hire":
        // All chores handled for 25 sec
        setGameState((prev) => ({
          ...prev,
          consumableInventory: activateBuff(removeConsumable(prev.consumableInventory, itemId), itemId, 25 * TICKS_PER_SEC),
        }));
        break;
    }
  }, [gameState, isPeer, mpActions]);

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
    const pid = mpState.localPlayer?.id ?? "player";
    const pname = mpState.localPlayer?.name ?? "You";
    setGameState((prev) => {
      const next = buyOption(prev, symbol, type, strike, days, contracts);
      if (next !== prev) {
        const newOpt = next.optionsPositions.find((o) => !prev.optionsPositions.some((po) => po.id === o.id));
        const premium = newOpt ? newOpt.premium : 0;
        setTradeTracker((t) => recordOptionBuy(t, pid, pname, symbol, type, contracts, premium, prev.timeOfDay));
      }
      return next;
    });
  }, [isPeer, mpActions, mpState.localPlayer]);
  const handleSellOption = useCallback((symbol: string, type: "call" | "put", strike: number, days: number, contracts: number) => {
    if (isPeer) { mpActions.sendAction({ type: "sell_option", symbol, optionType: type, strikePrice: strike, expirationDays: days, contracts }); return; }
    const pid = mpState.localPlayer?.id ?? "player";
    const pname = mpState.localPlayer?.name ?? "You";
    setGameState((prev) => {
      const next = sellOption(prev, symbol, type, strike, days, contracts);
      if (next !== prev) {
        const newOpt = next.optionsPositions.find((o) => !prev.optionsPositions.some((po) => po.id === o.id));
        const premium = newOpt ? newOpt.premium : 0;
        setTradeTracker((t) => recordOptionSell(t, pid, pname, symbol, type, contracts, premium, prev.timeOfDay));
      }
      return next;
    });
  }, [isPeer, mpActions, mpState.localPlayer]);
  const handleCloseOption = useCallback((optionId: string) => {
    if (isPeer) { mpActions.sendAction({ type: "close_option", optionId }); return; }
    const pid = mpState.localPlayer?.id ?? "player";
    const pname = mpState.localPlayer?.name ?? "You";
    setGameState((prev) => {
      const next = closeOption(prev, optionId);
      if (next !== prev) {
        const opt = prev.optionsPositions.find((o) => o.id === optionId);
        const realizedPnL = opt ? next.cash - prev.cash : 0;
        setTradeTracker((t) => recordOptionClose(t, pid, pname, opt?.symbol ?? "?", realizedPnL, prev.timeOfDay));
      }
      return next;
    });
  }, [isPeer, mpActions, mpState.localPlayer]);

  const handleSetSpeed = useCallback((s: number) => {
    if (isPeer) { mpActions.sendAction({ type: "set_speed", speed: s }); return; }
    setSpeed(s);
  }, [isPeer, mpActions]);

  const handleTogglePause = useCallback(() => {
    if (isMultiplayer) {
      if (isPeer) {
        // Peer can only pause (sends to host) or signal resume ready
        if (!paused) {
          mpActions.sendAction({ type: "toggle_pause" });
        } else {
          // Peer clicks resume — signal ready
          mpActions.sendAction({ type: "resume_ready" });
          setResumeReadyPlayers((prev) => {
            const next = new Set(prev);
            next.add(mpState.localPlayer?.id ?? "");
            return next;
          });
        }
      } else {
        // Host: pause or signal resume ready
        if (!paused) {
          setPaused(true);
        } else {
          setResumeReadyPlayers((prev) => {
            const next = new Set(prev);
            next.add("host");
            return next;
          });
        }
      }
      return;
    }
    setPaused((p) => !p);
  }, [isPeer, isMultiplayer, mpActions, paused, mpState.localPlayer]);

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

  const beginScheduledDay = useCallback((stateOverride?: GameState, opts?: { skipRestaurantTransition?: boolean; skipTradingTransition?: boolean }) => {
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
      if (!isPeer) doSave(gameOverState);
      if (passed && gameOverState.restaurantUpgradeDraftOptions.length > 0) setEodPhase("restaurant-upgrades");
      else if (passed && gameOverState.menuDraftOptions.length > 0) setEodPhase("menu-draft");
      return;
    }

    // After boss day EOD (day already incremented by finishRestaurantDay), skip restaurant once
    // After trading (market just closed), go to Shwendy's
    if (!nextState.marketOpen && restaurantState === null && !skipNextRestaurant && !opts?.skipRestaurantTransition) {
      const challenges = selectDailyChallenges(nextState.day, false, true, gameState.runSeed);
      setGameState({ ...nextState, activeChallenges: challenges });
      setShowTransition("restaurant");
      setEodPhase("summary");
      return;
    }

    // After Shwendy's (or starting a new day), show trading morning screen (day > 1, non-boss)
    setRestaurantState(null);
    setSkipNextRestaurant(false);
    setSpeed(1);

    // Show morning transition on day 2+ (non-boss). Day 1 goes straight to market.
    const pendingDay = nextState.day ?? (gameState.day + 1);
    if (pendingDay > 1 && !isBossDayCheck(pendingDay) && !opts?.skipTradingTransition) {
      setGameState(nextState);
      setShowTransition("trading");
      setEodPhase("summary");
      return;
    }

    const marketState = openMarket(nextState);

    // Check if this is a boss day and select daily challenges
    const isBossDay = isBossDayCheck(marketState.day);
    const challenges = selectDailyChallenges(marketState.day, isBossDay, false, gameState.runSeed);
    setGameState({ ...marketState, activeChallenges: challenges });
    setEodPhase("summary");

    setBossDay(isBossDay);
    setBossView("trading");
    if (isBossDay) {
      lastBossEarningsRef.current = 0;
      const rs = createRestaurantState(marketState, isMultiplayer ? mpState.players.length : 1);
      setRestaurantState({ ...rs, shiftTimeRemaining: 100 });
      const milestoneNum = marketState.day / 4;
      const requiredProfit = 300 + (milestoneNum - 1) * 100;
      const maxMissed = Math.max(2, 5 - Math.floor((milestoneNum - 1) / 2));
      setShowBossIntro({ requiredProfit, maxMissed });
    }

    // Offer a loan after day 1, but not on boss days
    // Always offered if net worth < 0, otherwise 30% chance
    let hasLoanOffer = false;
    if (marketState.day > 1 && !isBossDay) {
      const portfolioVal = marketState.portfolio.reduce((sum, pos) => {
        const s = marketState.stocks.find((st) => st.symbol === pos.symbol);
        return sum + (s ? s.price * pos.shares : 0);
      }, 0);
      const shortCol = marketState.shorts.reduce((sum, pos) => sum + pos.entryPrice * pos.shares, 0);
      const shortLiab = marketState.shorts.reduce((sum, pos) => {
        const s = marketState.stocks.find((st) => st.symbol === pos.symbol);
        return sum + (s ? s.price * pos.shares : 0);
      }, 0);
      const netWorth = marketState.cash + portfolioVal + shortCol - shortLiab;
      const shouldOffer = netWorth < 0 || Math.random() < 0.3;

      if (shouldOffer) {
        const milestone = getMilestone(marketState.day);
        const nextMilestoneDay = milestone?.checkDay ?? marketState.day + 3;
        const dueDay = nextMilestoneDay <= marketState.day ? nextMilestoneDay + 3 : nextMilestoneDay;

        if (netWorth < 0) {
          const amount = Math.abs(netWorth) + 500;
          setShowLoanOffer({ amount: Math.round(amount * 100) / 100, interestRate: 0.35, dueDay, isEmergency: true });
          hasLoanOffer = true;
        } else {
          const milestoneTarget = milestone?.required ?? 2000;
          const pct = 0.2 + Math.random() * 0.8;
          const amount = Math.round(milestoneTarget * pct);
          const interestRate = Math.round((0.05 + Math.random() * 0.25) * 100) / 100;
          setShowLoanOffer({ amount, interestRate, dueDay, isEmergency: false });
          hasLoanOffer = true;
        }
      }
    }

    if (!isBossDay && !hasLoanOffer) {
      setShowChallengeIntro("trading");
      setPaused(true);
    } else if (!isBossDay && hasLoanOffer) {
      // Loan shows first; challenge intro shown only after loan is dismissed
      setShowChallengeIntro(null);
      setPaused(true);
    }
  }, [gameState, restaurantState, bossDay]);
  beginScheduledDayRef.current = beginScheduledDay;

  const handleNewDay = useCallback(() => {
    // On boss day, skip upgrades/stocks — go straight to boss day evaluation
    if (bossDay) {
      beginScheduledDay();
      return;
    }
    // In multiplayer, challenges are auto-evaluated on market close / shift end
    if (isMultiplayer) {
      setEodPhase("challenges");
      return;
    }
    // Single player: evaluate challenges and show results
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
      tickets: prev.tickets + earned.tradingTickets + earned.restaurantTickets,
      tradingTickets: prev.tradingTickets + earned.tradingTickets,
      restaurantTickets: prev.restaurantTickets + earned.restaurantTickets,
    }));
    setEodPhase("challenges");
  }, [beginScheduledDay, gameState, bossDay, restaurantState, isMultiplayer]);

  const goToShopOrNextDay = useCallback(() => {
    // Shop only shows after restaurant/boss day (last phase of the full day) and if player has any tickets
    const hasAnyTickets = gameState.tradingTickets > 0 || gameState.restaurantTickets > 0;
    if ((restaurantState !== null || bossDay) && hasAnyTickets) {
      setShopOffering(generateShopOffering());
      setEodPhase("shop");
    } else {
      // After trading-only EOD or no tickets — proceed to next phase
      setRestaurantState(null);
      beginScheduledDay();
    }
  }, [restaurantState, bossDay, gameState.tradingTickets, gameState.restaurantTickets, beginScheduledDay]);
  goToShopOrNextDayRef.current = goToShopOrNextDay;

  const handleShopContinue = useCallback(() => {
    // Shop is the final EOD step (after restaurant/boss day) — skip back to trading
    setRestaurantState(null);
    beginScheduledDay(undefined, { skipRestaurantTransition: true });
  }, [beginScheduledDay]);

  const handleChallengesContinue = useCallback(() => {
    // After challenges, go to upgrades/stocks/restaurant-upgrades/menu-draft or shop
    if (gameState.upgradeDraftOptions.length > 0) {
      setEodPhase("upgrades");
      setEodChoiceMade(false);
      setMpUpgradeChoice(null);
      if (isMultiplayer) mpActions.resetEodGate();
    } else if (gameState.stockDraftOptions.length > 0) {
      setEodPhase("stocks");
      setEodChoiceMade(false);
      if (isMultiplayer) mpActions.resetEodGate();
    } else if (gameState.restaurantUpgradeDraftOptions.length > 0) {
      setEodPhase("restaurant-upgrades");
      setEodChoiceMade(false);
      if (isMultiplayer) mpActions.resetEodGate();
    } else if (gameState.menuDraftOptions.length > 0) {
      setEodPhase("menu-draft");
      setEodChoiceMade(false);
      if (isMultiplayer) mpActions.resetEodGate();
    } else {
      goToShopOrNextDay();
    }
  }, [gameState, isMultiplayer, mpActions, goToShopOrNextDay]);

  // Multiplayer: local EOD info screen navigation (each player advances independently)
  const handleLocalEodContinue = useCallback(() => {
    if (localEodInfoStep === "summary") {
      // Boss day: skip challenges/shop, go directly to waiting for next day
      if (bossDay) {
        setLocalEodInfoStep("waiting");
        const myId = mpState.localPlayer?.id ?? "host";
        setEodInfoReadyPlayers((prev) => { const n = new Set(prev); n.add(myId); return n; });
        if (isPeer) mpActions.sendAction({ type: "eod_info_done" });
        return;
      }
      setLocalEodInfoStep("challenges");
    } else if (localEodInfoStep === "challenges") {
      // Check if shop should show (has tickets + restaurant or boss day)
      const hasAnyTickets = gameState.tradingTickets > 0 || gameState.restaurantTickets > 0;
      if ((restaurantState !== null || bossDay) && hasAnyTickets) {
        setShopOffering(generateShopOffering());
        setLocalEodInfoStep("shop");
      } else {
        setLocalEodInfoStep("waiting");
        // Signal readiness
        const myId = mpState.localPlayer?.id ?? "host";
        setEodInfoReadyPlayers((prev) => { const n = new Set(prev); n.add(myId); return n; });
        if (isPeer) mpActions.sendAction({ type: "eod_info_done" });
      }
    } else if (localEodInfoStep === "shop") {
      setLocalEodInfoStep("waiting");
      // Signal readiness
      const myId = mpState.localPlayer?.id ?? "host";
      setEodInfoReadyPlayers((prev) => { const n = new Set(prev); n.add(myId); return n; });
      if (isPeer) mpActions.sendAction({ type: "eod_info_done" });
    }
  }, [localEodInfoStep, gameState.tradingTickets, gameState.restaurantTickets, restaurantState, bossDay, isPeer, mpActions, mpState.localPlayer]);

  const handleBuyConsumable = useCallback((itemId: string) => {
    const item = getConsumable(itemId);
    if (!item) return;
    // Trading items cost tradingTickets, restaurant items cost restaurantTickets
    const ticketPool = item.phase === "trading" ? gameState.tradingTickets : gameState.restaurantTickets;
    if (ticketPool < item.tier) return;
    if (isPeer) { mpActions.sendAction({ type: "buy_consumable", consumableId: itemId }); return; }
    setGameState((prev) => {
      const ticketField = item.phase === "trading" ? "tradingTickets" : "restaurantTickets";
      return {
        ...prev,
        tickets: prev.tickets - item.tier,
        [ticketField]: prev[ticketField] - item.tier,
        consumableInventory: addConsumable(prev.consumableInventory, itemId),
      };
    });
  }, [gameState.tradingTickets, gameState.restaurantTickets, isPeer, mpActions]);


  const handleAcquireUpgrade = useCallback((upgradeId: string) => {
    if (isMultiplayer) {
      // Save upgrade choice locally and immediately show stock picker
      setMpUpgradeChoice(upgradeId);
      setEodPhase("stocks");
      return;
    }
    const nextState = acquireUpgrade(gameState, upgradeId);
    if (nextState.stockDraftOptions.length > 0) {
      setGameState(nextState);
      setEodPhase("stocks");
      return;
    }
    setGameState(nextState);
    if (nextState.restaurantUpgradeDraftOptions.length > 0) {
      setEodPhase("restaurant-upgrades");
    } else if (nextState.menuDraftOptions.length > 0) {
      setEodPhase("menu-draft");
    } else {
      goToShopOrNextDay();
    }
  }, [gameState, isMultiplayer, goToShopOrNextDay]);

  const handleDraftStock = useCallback((symbol: string) => {
    if (isMultiplayer) {
      // Submit both upgrade + stock choices together
      const upgradeId = mpUpgradeChoice;
      // Store upgrade locally (per-player) immediately
      if (upgradeId) {
        setLocalUpgrades((prev) => [...prev, upgradeId]);
        // Handle special upgrades that affect shared state
        if (upgradeId === "monitor") {
          setGameState((prev) => prev.monitors.length < 3 ? { ...prev, monitors: [...prev.monitors, { id: prev.monitors.length, channel: "business_news" as any }] } : prev);
        }
        if (upgradeId === "golden_parachute") {
          setGameState((prev) => ({ ...prev, goldenParachutes: prev.goldenParachutes + 1 }));
        }
      }
      if (isPeer) {
        if (upgradeId) mpActions.sendAction({ type: "choose_upgrade", upgradeId });
        mpActions.sendAction({ type: "choose_stock", symbol });
      } else {
        if (upgradeId) mpActions.submitHostChoice("upgrades", upgradeId);
        mpActions.submitHostChoice("stocks", symbol);
      }
      setEodChoiceMade(true);
      setMpUpgradeChoice(null);
      return;
    }
    const nextState = draftStock(gameState, symbol);
    setGameState(nextState);
    if (nextState.restaurantUpgradeDraftOptions.length > 0) {
      setEodPhase("restaurant-upgrades");
    } else if (nextState.menuDraftOptions.length > 0) {
      setEodPhase("menu-draft");
    } else {
      goToShopOrNextDay();
    }
  }, [gameState, isMultiplayer, isPeer, mpActions, mpUpgradeChoice, goToShopOrNextDay]);

  const handleAcquireRestaurantUpgrade = useCallback((upgradeId: string) => {
    if (isMultiplayer) {
      // Store upgrade locally (per-player) and move to menu-draft immediately
      setLocalRestaurantUpgrades((prev) => [...prev, upgradeId]);
      // Notify host of choice (for tracking only, no gate)
      if (isPeer) {
        mpActions.sendAction({ type: "choose_restaurant_upgrade", upgradeId });
      }
      setEodPhase("menu-draft");
      if (isMultiplayer) mpActions.resetEodGate();
      return;
    }
    const nextState = acquireRestaurantUpgrade(gameState, upgradeId);
    setGameState(nextState);
    if (nextState.menuDraftOptions.length > 0) setEodPhase("menu-draft");
    else {
      goToShopOrNextDay();
    }
  }, [gameState, isMultiplayer, isPeer, mpActions, goToShopOrNextDay]);

  const handleDraftMenuItem = useCallback((itemName: string) => {
    if (isMultiplayer) {
      if (isPeer) {
        mpActions.sendAction({ type: "choose_menu_item", itemName });
      } else {
        mpActions.submitHostChoice("menu-draft", itemName);
      }
      setEodChoiceMade(true);
      return;
    }
    const nextState = draftMenuItem(gameState, itemName);
    setGameState(nextState);
    setRestaurantState(null);
    goToShopOrNextDay();
  }, [gameState, isMultiplayer, isPeer, mpActions, goToShopOrNextDay]);

  const handleRestaurantFinish = useCallback((earnings: number) => {
    // In multiplayer, game state changes are auto-triggered when shiftOver becomes true.
    // Just advance local info step so the player can navigate challenges/shop independently.
    if (isMultiplayer) {
      setLocalEodInfoStep("challenges");
      return;
    }
    // Single player: evaluate challenges and update game state
    const tradingDay = gameState.day;
    const nextState = finishRestaurantDay(gameState, earnings);
    // Apply milestone check now (after Shwendy's)
    const milestoneState = isMilestoneDay(tradingDay) ? applyMilestoneCheck(nextState, tradingDay) : nextState;
    // Evaluate challenges (restaurant challenges use the restaurant tracker)
    const evaluated = evaluateChallenges(
      milestoneState.activeChallenges,
      milestoneState.challengeTracker,
      milestoneState,
      restaurantState?.challengeTracker,
    );
    const earned = getTicketsEarned(evaluated);
    const challengedState = {
      ...milestoneState,
      activeChallenges: evaluated,
      tickets: milestoneState.tickets + earned.tradingTickets + earned.restaurantTickets,
      tradingTickets: milestoneState.tradingTickets + earned.tradingTickets,
      restaurantTickets: milestoneState.restaurantTickets + earned.restaurantTickets,
    };
    setGameState(challengedState);
    doSave(challengedState);
    // Show challenge results before restaurant upgrades
    setEodPhase("challenges");
  }, [beginScheduledDay, gameState, restaurantState, isMultiplayer]);

  const handleViewInsider = useCallback(() => {
    setGameState((prev) => {
      if (prev.insiderViewed) return prev;
      // Quantum Encryption: view insider without SEC risk (no position snapshots)
      if (hasActiveBuff(prev.consumableInventory, "quantum_encryption")) {
        const inv = { ...prev.consumableInventory, activeBuffs: prev.consumableInventory.activeBuffs.filter((b) => b.consumableId !== "quantum_encryption") };
        return { ...prev, insiderViewed: true, insiderViewedTick: prev.timeOfDay, consumableInventory: inv };
      }
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
    if (isMultiplayer && isPeer) {
      // Peer sends action to host; host handles it and syncs state back
      mpActions.sendAction({ type: "accept_loan" });
      return;
    }
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
    setShowChallengeIntro("trading");
  }, [showLoanOffer, isMultiplayer, isPeer, mpActions]);

  const handleDeclineLoan = useCallback(() => {
    if (isMultiplayer && isPeer) {
      mpActions.sendAction({ type: "decline_loan" });
      return;
    }
    setShowLoanOffer(null);
    setShowChallengeIntro("trading");
  }, [isMultiplayer, isPeer, mpActions]);

  const handleRestart = useCallback(() => {
    deleteSave();
    mpActions.disconnect();
    setGameState(createInitialState());
    setRestaurantState(null);
    setBossDay(false);
    setBossResult(null);
    setShowTitle(true);
    setTitleTutorial(null);
    setMenuFocusIndex(-1);
    setEodPhase("summary");
    setShowOptions(null);
    setShowChallengeIntro(null);
    setPaused(false);
    setShowMultiplayerLobby(false);
    setDisconnectedPlayer(null);
    setLocalUpgrades([]);
    setLocalRestaurantUpgrades([]);
    setMpSaveId(null);
    mpSaveIdRef.current = null;
    setMpResumeData(null);
  }, [mpActions]);

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

  const isRestaurantShift = restaurantState !== null && !bossDay;

  // In multiplayer, use per-player upgrades; in single-player, use shared state
  const effectiveUpgrades = isMultiplayer ? localUpgrades : gameState.acquiredUpgrades;
  const effectiveRestaurantUpgrades = isMultiplayer ? localRestaurantUpgrades : gameState.acquiredRestaurantUpgrades;
  const effectiveHasUpgrade = (id: string) => effectiveUpgrades.includes(id);
  const effectiveUpgradeCount = (id: string) => effectiveUpgrades.filter((u) => u === id).length;
  const effectiveRestaurantUpgradeCount = (id: string) => effectiveRestaurantUpgrades.filter((u) => u === id).length;

  const showAnalystRating = isMultiplayer ? effectiveHasUpgrade("analyst_ratings") : hasUpgrade(gameState, "analyst_ratings");
  const showDarkPool = isMultiplayer ? effectiveHasUpgrade("dark_pool") : hasUpgrade(gameState, "dark_pool");

  // Multiplayer lobby overlay — but close it when game starts for peers
  if (showMultiplayerLobby && !(isPeer && mpState.gameStarted)) {
    return (
      <MultiplayerLobby
        onHost={(name) => mpActions.hostGame(name)}
        onJoin={(code, name) => mpActions.joinGame(code, name)}
        onCancel={() => {
          mpActions.disconnect();
          setShowMultiplayerLobby(false);
          setMpResumeData(null);
        }}
        onReset={() => mpActions.disconnect()}
        connecting={mpState.connecting}
        error={mpState.error}
        roomCode={mpState.roomCode}
        players={mpState.players}
        isHost={mpState.role === "host"}
        mpSaves={loadAllMpSaves()}
        resumeData={mpResumeData}
        onResume={async (save, playerName) => {
          setMpResumeData(save);
          setMpSaveId(save.id);
          mpSaveIdRef.current = save.id;
          await mpActions.hostGame(playerName);
          mpActions.setRequiredNames(save.players.map((p) => p.name));
        }}
        onDeleteSave={(id) => {
          deleteMpSave(id);
        }}
        onStart={() => {
          mpActions.startGame();
          setShowMultiplayerLobby(false);
          setShowTitle(false);
          if (mpResumeData) {
            // Resume from saved game
            const gs = mpResumeData.gameState;
            setGameState(gs);
            // Find this player's upgrades by name
            const myName = mpState.players.find((p) => p.id === (mpState.localPlayer?.id ?? "host"))?.name;
            const mySave = mpResumeData.players.find((p) => p.name === myName);
            if (mySave) {
              setLocalUpgrades(mySave.upgrades);
              setLocalRestaurantUpgrades(mySave.restaurantUpgrades);
            }
            // Check if resuming on a boss day
            const isBoss = isBossDayCheck(gs.day);
            setBossDay(isBoss);
            setBossView("trading");
            if (isBoss) {
              lastBossEarningsRef.current = 0;
              const rs = createRestaurantState(gs, mpState.players.length);
              setRestaurantState({ ...rs, shiftTimeRemaining: 100 });
              const milestoneNum = gs.day / 4;
              const requiredProfit = 300 + (milestoneNum - 1) * 100;
              const maxMissed = Math.max(2, 5 - Math.floor((milestoneNum - 1) / 2));
              setShowBossIntro({ requiredProfit, maxMissed });
            } else {
              setShowChallengeIntro("trading");
              setPaused(true);
            }
          } else {
            setGameState(createInitialState());
            setShowChallengeIntro("trading");
            setPaused(true);
          }
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
          <button className="title-start-btn" onClick={() => { if (savedGame) deleteSave(); const s = createInitialState(); setGameState(s); setShowTitle(false); setShowChallengeIntro("trading"); setPaused(true); }}>
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

  if (showTransition === "trading") {
    const startTrading = () => {
      if (isMultiplayer && isPeer) {
        mpActions.sendAction({ type: "dismiss_transition" } as any);
        return;
      }
      setShowTransition(null);
      beginScheduledDayRef.current(gameState, { skipTradingTransition: true, skipRestaurantTransition: true });
    };
    return (
      <div className="title-screen" onClick={startTrading} onKeyDown={startTrading} tabIndex={0} ref={(el) => el?.focus()}>
        <img src={tradingMorning} alt="Trading desk at sunrise" className="title-screen-bg" />
        <div className="title-screen-overlay transition-overlay">
          <h1 className="transition-title">🏠 Home</h1>
          <p className="transition-sub">Day {gameState.day} — Morning</p>
          <button className="title-start-btn" onClick={startTrading}>START TRADING</button>
          <p className="title-hint">Press any key to start</p>
        </div>
      </div>
    );
  }

  if (showTransition === "restaurant") {
    const startShift = () => {
      if (isMultiplayer && isPeer) {
        // Peer sends action to host to dismiss transition
        mpActions.sendAction({ type: "dismiss_transition" } as any);
        return;
      }
      setShowTransition(null);
      setSpeed(1);
      setMyCounter(0);
      setRestaurantState(createRestaurantState(gameState, isMultiplayer ? mpState.players.length : 1));
      setShowChallengeIntro("restaurant");
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
          {effectiveUpgrades.length > 0 && (
            <div className="upgrade-icons">
              {[...new Set(effectiveUpgrades)].map((id) => {
                const card = UPGRADE_POOL.find((u) => u.id === id);
                if (!card) return null;
                const count = effectiveUpgrades.filter((u) => u === id).length;
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
                  <span key={ch.id} className={`challenge-pip ${ch.completed ? "done" : ""}`} data-tooltip={`${def.name}: ${def.description} (${def.tickets}${def.type === "trading" ? "🍔" : "📈"})`}>
                    {def.icon}
                  </span>
                );
              })}
              <span className="ticket-count">📈{gameState.tradingTickets} 🍔{gameState.restaurantTickets}</span>
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

      {paused && !showChallengeIntro && !disconnectedPlayer && !showLoanOffer && (
        <div className="pause-overlay">
          {showDebug ? (
            <DebugPanel
              gameState={gameState}
              setGameState={(updater) => setGameState(updater)}
              onClose={() => setShowDebug(false)}
              onSkipToDay={(day, cash, tradingTix, restaurantTix, phase) => {
                const updated = { ...gameState, day, cash, tradingTickets: tradingTix, restaurantTickets: restaurantTix, tickets: tradingTix + restaurantTix, marketOpen: false, loans: [], milestonePayment: null };
                const isBoss = isBossDayCheck(day);

                if (phase === "restaurant" && !isBoss) {
                  // Skip to restaurant phase of the day
                  const marketState = openMarket(updated);
                  const challenges = selectDailyChallenges(day, false, true, gameState.runSeed);
                  setGameState({ ...marketState, activeChallenges: challenges, marketOpen: false });
                  setBossDay(false);
                  setRestaurantState(createRestaurantState(marketState, isMultiplayer ? mpState.players.length : 1));
                  setShowDebug(false);
                  setPaused(false);
                  setEodPhase("summary");
                  setShowChallengeIntro("restaurant");
                  return;
                }

                const marketState = openMarket(updated);
                const challenges = selectDailyChallenges(day, isBoss, false, gameState.runSeed);
                setGameState({ ...marketState, activeChallenges: challenges });
                setBossDay(isBoss);
                setBossView("trading");
                if (isBoss) {
                  lastBossEarningsRef.current = 0;
                  const rs = createRestaurantState(marketState, isMultiplayer ? mpState.players.length : 1);
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
              <button className="pause-menu-btn resume" onClick={() => {
                setShowOptions(null);
                if (isMultiplayer) {
                  handleTogglePause(); // signals resume ready
                } else {
                  setPaused(false);
                }
              }}>{isMultiplayer && resumeReadyPlayers.has(isPeer ? (mpState.localPlayer?.id ?? "") : "host") ? "Waiting for players..." : "Resume"}</button>
              <button className="pause-menu-btn" onClick={() => setShowOptions("pause")}>Options</button>
            <button className="pause-menu-btn save-quit" onClick={() => {
              doSave(gameState, "manual");
              if (isMultiplayer) mpActions.disconnect();
              setPaused(false); setRestaurantState(null); setShowTitle(true); setMenuFocusIndex(-1);
            }}>Save & Quit</button>
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
        <>
        <Restaurant
          day={gameState.day}
          paused={paused || titleTutorial === "restaurant" || restaurantState.shiftOver || showChallengeIntro === "restaurant"}
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
          acquiredRestaurantUpgrades={effectiveRestaurantUpgrades}
          activeChallenges={gameState.activeChallenges}
          tradingTickets={gameState.tradingTickets} restaurantTickets={gameState.restaurantTickets}
          debugFF={debugFF}
          onDebugFF={() => {
            setRestaurantState((prev) => prev ? { ...prev, shiftTimeRemaining: 0, shiftOver: true } : prev);
            setDebugFF(false);
          }}
          isPeer={isPeer}
          onPeerKey={(key) => mpActions.sendAction({ type: "restaurant_key", key })}
          onPeerKeyUp={(key) => mpActions.sendAction({ type: "restaurant_key_up", key })}
          onPeerMouse={(x, y) => mpActions.sendAction({ type: "restaurant_mouse", x, y })}
          onPeerChoreClick={(nx, ny) => mpActions.sendAction({ type: "restaurant_chore_click", nx, ny })}
          currentCounter={myCounter}
          onSwitchCounter={(c) => {
            setMyCounter(c);
            if (isPeer) mpActions.sendAction({ type: "switch_counter", counter: c });
          }}
          localActiveOrderId={isPeer ? peerActiveOrderId : undefined}
          consumableInventory={gameState.consumableInventory}
          onUseRestaurantItem={handleUseRestaurantItem}
          localPlayerId={mpState.localPlayer?.id ?? "player"}
          localPlayerName={mpState.localPlayer?.name ?? "You"}
          players={isMultiplayer ? mpState.players.map((p) => ({ id: p.id, name: p.name, color: p.color })) : undefined}
          hideShiftSummary={isMultiplayer && localEodInfoStep !== null}
        />
        {/* Post-shift overlays render on top of restaurant UI */}
        {showChallengeIntro === "restaurant" && (
          <div className="end-of-day-overlay">
            <div className="end-of-day challenge-intro">
              <h2>🎯 Daily Challenge</h2>
              <div className="challenge-intro-list">
                {gameState.activeChallenges.map((ch) => {
                  const def = ALL_CHALLENGES.find((d) => d.id === ch.id);
                  if (!def) return null;
                  return (
                    <div key={ch.id} className="challenge-intro-item">
                      <span className="challenge-intro-icon">{def.icon}</span>
                      <div className="challenge-intro-info">
                        <span className="challenge-intro-name">{def.name}</span>
                        <span className="challenge-intro-desc">{def.description}</span>
                      </div>
                      <span className="challenge-intro-reward">+{def.tickets} {def.type === "trading" ? "🍔" : "📈"}</span>
                    </div>
                  );
                })}
              </div>
              <button className="pause-menu-btn resume" onClick={() => {
                if (isMultiplayer) {
                  const myId = mpState.localPlayer?.id ?? "host";
                  setChallengeReadyPlayers((prev) => { const n = new Set(prev); n.add(myId); return n; });
                  if (isPeer) {
                    mpActions.sendAction({ type: "dismiss_challenge_intro" } as any);
                  }
                } else {
                  setShowChallengeIntro(null);
                }
              }}>{isMultiplayer && challengeReadyPlayers.has(mpState.localPlayer?.id ?? "host") ? "Waiting for players..." : "Start Cooking →"}</button>
            </div>
          </div>
        )}
        {(isMultiplayer ? localEodInfoStep === "challenges" : eodPhase === "challenges") && (
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
                        {ch.completed ? `+${def.tickets} ${def.type === "trading" ? "🍔" : "📈"}` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const earned = getTicketsEarned(gameState.activeChallenges);
                const totalEarned = earned.tradingTickets + earned.restaurantTickets;
                return totalEarned > 0 ? (
                  <div className="challenge-total">
                    <span>Tickets earned: {earned.tradingTickets > 0 && <strong>+{earned.tradingTickets} 📈</strong>} {earned.restaurantTickets > 0 && <strong>+{earned.restaurantTickets} 🍔</strong>}</span>
                    <span className="challenge-balance">📈 {gameState.tradingTickets} | 🍔 {gameState.restaurantTickets}</span>
                  </div>
                ) : (
                  <div className="challenge-total">
                    <span>No challenges completed</span>
                    <span className="challenge-balance">📈 {gameState.tradingTickets} | 🍔 {gameState.restaurantTickets}</span>
                  </div>
                );
              })()}
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
              <button onClick={isMultiplayer ? handleLocalEodContinue : handleChallengesContinue}>Continue →</button>
            </div>
          </div>
        )}
        {(isMultiplayer ? localEodInfoStep === "shop" : eodPhase === "shop") && (
          <div className="shop-phase">
            <h2>🎪 Ticket Shop</h2>
            <p className="shop-balance">📈 Trading tickets: <strong>{gameState.tradingTickets}</strong> | 🍔 Restaurant tickets: <strong>{gameState.restaurantTickets}</strong></p>
            <div className="shop-items">
              {shopOffering.map((item) => {
                const pool = item.phase === "trading" ? gameState.tradingTickets : gameState.restaurantTickets;
                return (
                <button key={item.id} className={`shop-item-card ${pool < item.tier ? "disabled" : ""}`} onClick={() => handleBuyConsumable(item.id)} disabled={pool < item.tier}>
                  <div className="shop-item-icon">{item.icon}</div>
                  <div className="shop-item-name">{item.name}</div>
                  <div className="shop-item-desc">{item.description}</div>
                  <div className="shop-item-cost">{item.tier} {item.phase === "trading" ? "📈" : "🍔"}</div>
                  <div className="shop-item-phase">{item.phase === "trading" ? "📈 Trading item" : "🍔 Kitchen item"}</div>
                </button>
                );
              })}
            </div>
            <div className="shop-inventory">
              {gameState.consumableInventory.items.length > 0 && (
                <div className="shop-owned">
                  <span className="shop-owned-label">🎒 Inventory:</span>
                  {[...new Set(gameState.consumableInventory.items)].map((id) => {
                    const c = getConsumable(id);
                    if (!c) return null;
                    const count = gameState.consumableInventory.items.filter((i) => i === id).length;
                    return <span key={id} className="shop-owned-item" title={c.description}>{c.icon} {c.name}{count > 1 ? ` x${count}` : ""}</span>;
                  })}
                </div>
              )}
            </div>
            <button onClick={isMultiplayer ? handleLocalEodContinue : handleShopContinue}>Continue →</button>
          </div>
        )}
        {/* Multiplayer: waiting for other players after restaurant info screens */}
        {isMultiplayer && localEodInfoStep === "waiting" && (
          <div className="end-of-day-overlay">
            <div className="end-of-day">
              <h2>⏳ Waiting for other players...</h2>
              <p style={{ color: "rgba(255,255,255,0.6)" }}>Everyone needs to finish reviewing before continuing</p>
            </div>
          </div>
        )}
        {eodPhase === "restaurant-upgrades" && (
          <div className="end-of-day-overlay">
            {eodChoiceMade ? (
              <div className="upgrade-draft"><h2>⏳ Waiting for other players...</h2><p className="upgrade-draft-sub">You've chosen your upgrade</p></div>
            ) : (
            <div className="upgrade-draft">
              <h2>🍽️ Choose a Restaurant Upgrade</h2>
              <p className="upgrade-draft-sub">Pick one kitchen upgrade for every future Shwendy's shift</p>
              <div className="upgrade-draft-options">
                {gameState.restaurantUpgradeDraftOptions.map((id) => {
                  const card = RESTAURANT_UPGRADE_POOL.find((upgrade) => upgrade.id === id);
                  if (!card) return null;
                  const owned = effectiveRestaurantUpgradeCount(id);
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
        {eodPhase === "menu-draft" && (
          <div className="end-of-day-overlay">
            {eodChoiceMade ? (
              <div className="stock-draft"><h2>⏳ Waiting for other players...</h2><p className="stock-draft-sub">You've chosen your recipe</p></div>
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
        </>
      ) : (
        <>
          {!gameState.marketOpen && !gameState.gameOver && (isMultiplayer ? localEodInfoStep === "summary" : eodPhase === "summary") && (() => {
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
                    {gameState.shorts.length > 0 && <div className="eod-stat-row"><span>Short P&L</span><span className={shortCollateral - shortLiability >= 0 ? "up" : "down"}>${(shortCollateral - shortLiability).toFixed(2)}</span></div>}
                    {optionsVal !== 0 && <div className="eod-stat-row"><span>Options value</span><span>${optionsVal.toFixed(2)}</span></div>}
                    {gameState.goldenParachutes > 0 && <div className="eod-stat-row"><span>Golden Parachutes</span><span>{gameState.goldenParachutes}</span></div>}
                  </div>
                  {pnlSeries.length > 0 && pnlSeries.some((s) => s.data.length > 1) && (
                    <div className="eod-pnl-graph-section">
                      <h3 className="eod-graph-title">📊 Trading Activity</h3>
                      <PnLGraph series={pnlSeries} width={420} height={180} />
                    </div>
                  )}
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
                  <button onClick={() => { setBossResult(null); isMultiplayer ? handleLocalEodContinue() : handleNewDay(); }}>Continue →</button>
                </div>
              </div>
            );
          })()}

          {!gameState.marketOpen && !gameState.gameOver && (isMultiplayer ? localEodInfoStep === "challenges" : eodPhase === "challenges") && (
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
                          {ch.completed ? `+${def.tickets} ${def.type === "trading" ? "🍔" : "📈"}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const earned = getTicketsEarned(gameState.activeChallenges);
                  const totalEarned = earned.tradingTickets + earned.restaurantTickets;
                  return totalEarned > 0 ? (
                    <div className="challenge-total">
                      <span>Tickets earned: {earned.tradingTickets > 0 && <strong>+{earned.tradingTickets} 📈</strong>} {earned.restaurantTickets > 0 && <strong>+{earned.restaurantTickets} 🍔</strong>}</span>
                      <span className="challenge-balance">📈 {gameState.tradingTickets} | 🍔 {gameState.restaurantTickets}</span>
                    </div>
                  ) : (
                    <div className="challenge-total">
                      <span>No challenges completed</span>
                      <span className="challenge-balance">📈 {gameState.tradingTickets} | 🍔 {gameState.restaurantTickets}</span>
                    </div>
                  );
                })()}
                <button onClick={isMultiplayer ? handleLocalEodContinue : handleChallengesContinue}>Continue →</button>
              </div>
            </div>
          )}

          {!gameState.marketOpen && !gameState.gameOver && (isMultiplayer ? localEodInfoStep === "shop" : eodPhase === "shop") && (
            <div className="shop-phase">
              <h2>🎪 Ticket Shop</h2>
              <p className="shop-balance">📈 Trading tickets: <strong>{gameState.tradingTickets}</strong> | 🍔 Restaurant tickets: <strong>{gameState.restaurantTickets}</strong></p>
              <div className="shop-items">
                {shopOffering.map((item) => {
                  const pool = item.phase === "trading" ? gameState.tradingTickets : gameState.restaurantTickets;
                  return (
                  <button key={item.id} className={`shop-item-card ${pool < item.tier ? "disabled" : ""}`} onClick={() => handleBuyConsumable(item.id)} disabled={pool < item.tier}>
                    <div className="shop-item-icon">{item.icon}</div>
                    <div className="shop-item-name">{item.name}</div>
                    <div className="shop-item-desc">{item.description}</div>
                    <div className="shop-item-cost">{item.tier} {item.phase === "trading" ? "📈" : "🍔"}</div>
                    <div className="shop-item-phase">{item.phase === "trading" ? "📈 Trading item" : "🍔 Kitchen item"}</div>
                  </button>
                  );
                })}
              </div>
              <div className="shop-inventory">
                {gameState.consumableInventory.items.length > 0 && (
                  <div className="shop-owned">
                    <span className="shop-owned-label">🎒 Inventory:</span>
                    {[...new Set(gameState.consumableInventory.items)].map((id) => {
                      const c = getConsumable(id);
                      if (!c) return null;
                      const count = gameState.consumableInventory.items.filter((i) => i === id).length;
                      return <span key={id} className="shop-owned-item" title={c.description}>{c.icon} {c.name}{count > 1 ? ` x${count}` : ""}</span>;
                    })}
                  </div>
                )}
              </div>
              <button onClick={isMultiplayer ? handleLocalEodContinue : handleShopContinue}>Continue →</button>
            </div>
          )}

          {/* Multiplayer: waiting for other players after info screens */}
          {isMultiplayer && localEodInfoStep === "waiting" && !gameState.marketOpen && !gameState.gameOver && (
            <div className="end-of-day-overlay">
              <div className="end-of-day">
                <h2>⏳ Waiting for other players...</h2>
                <p style={{ color: "rgba(255,255,255,0.6)" }}>Everyone needs to finish reviewing before continuing</p>
              </div>
            </div>
          )}

          {!gameState.marketOpen && !gameState.gameOver && eodPhase === "upgrades" && (
            <div className="end-of-day-overlay">
              <div className="upgrade-draft">
                <h2>⬆️ Choose an Upgrade</h2>
                <p className="upgrade-draft-sub">Pick one upgrade to keep for the rest of the run</p>
                <div className="upgrade-draft-options">
                  {gameState.upgradeDraftOptions.map((id) => {
                    const card = UPGRADE_POOL.find((u) => u.id === id);
                    if (!card) return null;
                    const owned = effectiveUpgradeCount(id);
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
              {isMultiplayer && eodChoiceMade ? (
                <div className="stock-draft">
                  <h2>⏳ Waiting for other players...</h2>
                  <p className="stock-draft-sub">
                    {mpState.eodWaitingFor.length > 0
                      ? `Still choosing: ${mpState.eodWaitingFor.join(", ")}`
                      : "Processing..."}
                  </p>
                </div>
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
              acquiredRestaurantUpgrades={effectiveRestaurantUpgrades}
              isBossDay={true}
              activeChallenges={gameState.activeChallenges}
              tradingTickets={gameState.tradingTickets} restaurantTickets={gameState.restaurantTickets}
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
              onPeerChoreClick={(nx, ny) => mpActions.sendAction({ type: "restaurant_chore_click", nx, ny })}
              currentCounter={myCounter}
              onSwitchCounter={(c) => {
                setMyCounter(c);
                if (isPeer) mpActions.sendAction({ type: "switch_counter", counter: c });
              }}
              localActiveOrderId={isPeer ? peerActiveOrderId : undefined}
              consumableInventory={gameState.consumableInventory}
              onUseRestaurantItem={handleUseRestaurantItem}
              localPlayerId={mpState.localPlayer?.id ?? "player"}
              localPlayerName={mpState.localPlayer?.name ?? "You"}
              players={isMultiplayer ? mpState.players.map((p) => ({ id: p.id, name: p.name, color: p.color })) : undefined}
              hideShiftSummary={isMultiplayer && localEodInfoStep !== null}
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
                  onUseItem={handleUseTradingItem}
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

      {showChallengeIntro === "trading" && !showLoanOffer && (
        <div className="end-of-day-overlay">
          <div className="end-of-day challenge-intro">
            <h2>🎯 Daily Challenge</h2>
            <div className="challenge-intro-list">
              {gameState.activeChallenges.map((ch) => {
                const def = ALL_CHALLENGES.find((d) => d.id === ch.id);
                if (!def) return null;
                return (
                  <div key={ch.id} className="challenge-intro-item">
                    <span className="challenge-intro-icon">{def.icon}</span>
                    <div className="challenge-intro-info">
                      <span className="challenge-intro-name">{def.name}</span>
                      <span className="challenge-intro-desc">{def.description}</span>
                    </div>
                    <span className="challenge-intro-reward">+{def.tickets} {def.type === "trading" ? "🍔" : "📈"}</span>
                  </div>
                );
              })}
            </div>
            <button className="pause-menu-btn resume" onClick={() => {
              if (isMultiplayer) {
                const myId = mpState.localPlayer?.id ?? "host";
                setChallengeReadyPlayers((prev) => { const n = new Set(prev); n.add(myId); return n; });
                if (isPeer) {
                  mpActions.sendAction({ type: "dismiss_challenge_intro" } as any);
                }
              } else {
                setShowChallengeIntro(null);
                setPaused(false);
              }
            }}>{isMultiplayer && challengeReadyPlayers.has(mpState.localPlayer?.id ?? "host") ? "Waiting for players..." : "Start Trading →"}</button>
          </div>
        </div>
      )}

      {disconnectedPlayer && (
        <div className="end-of-day-overlay">
          <div className="end-of-day challenge-intro">
            <h2>⚠️ Player Disconnected</h2>
            <p style={{ margin: "16px 0", color: "rgba(255,255,255,0.8)" }}><strong>{disconnectedPlayer}</strong> has left the game.</p>
            <p style={{ margin: "0 0 16px", color: "rgba(255,255,255,0.6)", fontSize: "0.9rem" }}>The game cannot continue without all players.</p>
            <button className="pause-menu-btn resume" onClick={() => {
              doSave(gameState, "manual");
              setDisconnectedPlayer(null);
              mpActions.disconnect();
              setPaused(false);
              setRestaurantState(null);
              setShowTitle(true);
              setMenuFocusIndex(-1);
            }}>Save & Return to Menu</button>
            <button className="pause-menu-btn restart" style={{ marginTop: "8px" }} onClick={() => {
              setDisconnectedPlayer(null);
              mpActions.disconnect();
              setPaused(false);
              setRestaurantState(null);
              setShowTitle(true);
              setMenuFocusIndex(-1);
            }}>Return to Menu (Don't Save)</button>
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
