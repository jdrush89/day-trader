# Day Trader 📈

A roguelike day trading simulator built with TypeScript, React, and Tauri.

## Concept

Each day you receive a loan and must pay back interest. Use your profits to buy upgrades that give you an information edge. Start with one monitor and upgrade to multi-monitor setups to watch news and charts simultaneously.

### Channels
- **Stock Ticker** — Live charts for each stock, select which to view
- **Business News** — Earnings reports, acquisitions, layoffs
- **Global News** — Trade disputes, interest rates, geopolitics
- **Social Media** — Reddit-style pump posts and speculation

### Upgrades
- Extra monitors, faster news feeds, better chart types, lower interest rates, insider tips

## Development

### Prerequisites
- Node.js 18+
- Rust (install via [rustup](https://rustup.rs/))

### Setup
```bash
npm install
```

### Run in development
```bash
npm run tauri dev
```

### Build for production
```bash
npm run tauri build
```

## Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Desktop**: Tauri 2
- **Target**: Steam (Windows, macOS, Linux)
