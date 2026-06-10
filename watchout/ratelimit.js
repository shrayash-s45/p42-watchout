// watchout/ratelimit.js
// In-memory guards for the Watchout limits (§B.4 of the API reference):
//   • 6 calls / minute (hard)
//   • 350 calls peak (09:00–20:00) / 1300 off-peak (20:00–09:00)
//   • 50,000 calls / month
// This is process-local (resets on restart) — fine for a tester. A production
// build would back these with a shared store.

const PER_MINUTE = 6;
const PEAK_DAILY = 350;
const OFFPEAK_DAILY = 1300;
const MONTHLY = 50000;

const state = {
  minuteWindow: [], // timestamps (ms) of calls in the trailing 60s
  dayCount: 0,
  dayKey: "",
  monthCount: 0,
  monthKey: "",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isPeak(d) {
  const h = d.getHours();
  return h >= 9 && h < 20;
}

function rollWindows(now) {
  const d = new Date(now);
  const dayKey = d.toISOString().slice(0, 10);
  const monthKey = dayKey.slice(0, 7);
  if (state.dayKey !== dayKey) {
    state.dayKey = dayKey;
    state.dayCount = 0;
  }
  if (state.monthKey !== monthKey) {
    state.monthKey = monthKey;
    state.monthCount = 0;
  }
  state.minuteWindow = state.minuteWindow.filter((t) => now - t < 60_000);
}

export class WatchoutLimitError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "WatchoutLimitError";
    this.code = code; // "MONTHLY" | "DAILY"
  }
}

// Acquire a slot before a call. Throws WatchoutLimitError on hard daily/monthly
// caps (caller maps these to GAP rows); waits out the per-minute window.
export async function acquireSlot(now = Date.now()) {
  rollWindows(now);
  const dailyCap = isPeak(new Date(now)) ? PEAK_DAILY : OFFPEAK_DAILY;

  if (state.monthCount >= MONTHLY) {
    throw new WatchoutLimitError("Monthly Watchout cap (50,000) reached.", "MONTHLY");
  }
  if (state.dayCount >= dailyCap) {
    throw new WatchoutLimitError(
      `Daily Watchout cap (${dailyCap}) reached.`,
      "DAILY"
    );
  }

  while (state.minuteWindow.length >= PER_MINUTE) {
    const waitMs = 60_000 - (Date.now() - state.minuteWindow[0]) + 50;
    await sleep(Math.max(waitMs, 100));
    rollWindows(Date.now());
  }

  const ts = Date.now();
  state.minuteWindow.push(ts);
  state.dayCount += 1;
  state.monthCount += 1;
  return ts;
}

export function usage() {
  rollWindows(Date.now());
  return {
    lastMinute: state.minuteWindow.length,
    today: state.dayCount,
    thisMonth: state.monthCount,
    caps: { perMinute: PER_MINUTE, monthly: MONTHLY },
  };
}
