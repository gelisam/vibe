// ─── Types ────────────────────────────────────────────────────────────────────
let numPlayers = 64;
let numRounds = Math.log2(numPlayers); // 6

interface SimResult {
  /** positions[round][matchIndex] = winner slot index (0-63 for round 0, etc.) */
  bracket: number[][];
  alexSlot: number;
  miguelSlot: number;
  /** Round in which they met, or -1 if they never met */
  metInRound: number;
  /** For each round, the slot index Alex occupies (-1 if eliminated) */
  alexPath: number[];
  /** For each round, the slot index Miguel occupies (-1 if eliminated) */
  miguelPath: number[];
}

// ─── Simulation ───────────────────────────────────────────────────────────────

function simulate(): SimResult {
  // Place Alex and Miguel randomly
  const slots = Array.from({ length: numPlayers }, (_, i) => i);
  const alexSlot = slots[Math.floor(Math.random() * numPlayers)];
  let miguelSlot: number;
  do {
    miguelSlot = slots[Math.floor(Math.random() * numPlayers)];
  } while (miguelSlot === alexSlot);

  // bracket[round] = array of winner indices within that round
  // round 0: 64 players → 32 winners, round 1: 32→16, ... round 5: 2→1
  const bracket: number[][] = [];

  let currentPlayers = slots.slice(); // all 64
  let alexCurrent = alexSlot;
  let miguelCurrent = miguelSlot;
  let metInRound = -1;

  const alexPath: number[] = [alexSlot];
  const miguelPath: number[] = [miguelSlot];

  for (let round = 0; round < numRounds; round++) {
    const winners: number[] = [];
    const numMatches = currentPlayers.length / 2;
    let alexNext = -1;
    let miguelNext = -1;

    for (let m = 0; m < numMatches; m++) {
      const p1 = currentPlayers[m * 2];
      const p2 = currentPlayers[m * 2 + 1];

      // Check if Alex and Miguel face each other this round
      const alexInMatch =
        p1 === alexCurrent || p2 === alexCurrent;
      const miguelInMatch =
        p1 === miguelCurrent || p2 === miguelCurrent;

      if (alexInMatch && miguelInMatch && metInRound === -1) {
        metInRound = round;
      }

      // Random winner
      const winner = Math.random() < 0.5 ? p1 : p2;
      winners.push(winner);

      if (winner === alexCurrent) alexNext = alexCurrent;
      else if (p1 === alexCurrent || p2 === alexCurrent) alexNext = -1; // eliminated

      if (winner === miguelCurrent) miguelNext = miguelCurrent;
      else if (p1 === miguelCurrent || p2 === miguelCurrent) miguelNext = -1; // eliminated
    }

    // If Alex or Miguel survived, update their current position
    if (alexNext !== -1) alexCurrent = alexNext;
    else alexCurrent = -1;

    if (miguelNext !== -1) miguelCurrent = miguelNext;
    else miguelCurrent = -1;

    alexPath.push(alexCurrent);
    miguelPath.push(miguelCurrent);

    bracket.push(winners);
    currentPlayers = winners;
  }

  return { bracket, alexSlot, miguelSlot, metInRound, alexPath, miguelPath };
}

// ─── Canvas Drawing ───────────────────────────────────────────────────────────

const canvas = document.getElementById('bracket-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const ALEX_COLOR = '#4fc3f7';
const MIGUEL_COLOR = '#ff7043';
const LINE_COLOR = '#334155';
const MATCH_COLOR = '#ffeb3b';
const SLOT_COLOR = '#455a64';

// Layout constants
const LEFT_MARGIN = 30;
const TOP_MARGIN = 20;

function getRoundWidth(): number {
  return (canvas.width - LEFT_MARGIN * 2) / numRounds;
}

function slotY(slotIndex: number, totalSlots: number): number {
  const availableHeight = canvas.height - TOP_MARGIN * 2;
  if (totalSlots === 1) return TOP_MARGIN + availableHeight / 2;
  return TOP_MARGIN + (slotIndex / (totalSlots - 1)) * availableHeight;
}

function roundX(round: number): number {
  return LEFT_MARGIN + round * getRoundWidth();
}

/** Draw a simple stick figure */
function drawStickFigure(
  x: number,
  y: number,
  color: string,
  size: number = 10,
  glow: boolean = false
) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
  }
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;

  const headR = size * 0.3;
  // Head
  ctx.beginPath();
  ctx.arc(x, y - size * 0.6, headR, 0, Math.PI * 2);
  ctx.fill();
  // Body
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.3);
  ctx.lineTo(x, y + size * 0.3);
  ctx.stroke();
  // Arms
  ctx.beginPath();
  ctx.moveTo(x - size * 0.35, y - size * 0.1);
  ctx.lineTo(x + size * 0.35, y - size * 0.1);
  ctx.stroke();
  // Legs
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.3);
  ctx.lineTo(x - size * 0.3, y + size * 0.7);
  ctx.moveTo(x, y + size * 0.3);
  ctx.lineTo(x + size * 0.3, y + size * 0.7);
  ctx.stroke();
  ctx.restore();
}

/** Draw an "eliminated" X on top of a stick figure */
function drawEliminated(x: number, y: number, _color: string, size: number = 10) {
  ctx.save();
  ctx.strokeStyle = '#ffeb3b';
  ctx.lineWidth = 3;
  const s = size * 0.7;
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.stroke();
  ctx.restore();
}

function drawBracketLines() {
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 0.5;

  for (let round = 0; round < numRounds; round++) {
    const slotsInRound = numPlayers / Math.pow(2, round);
    const slotsNext = slotsInRound / 2;
    const x1 = roundX(round);
    const x2 = roundX(round + 1);

    for (let i = 0; i < slotsNext; i++) {
      const y1 = slotY(i * 2, slotsInRound);
      const y2 = slotY(i * 2 + 1, slotsInRound);
      const yMid = slotY(i, slotsNext);

      // Horizontal lines from each player to midpoint x
      const xMid = (x1 + x2) / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(xMid, y1);
      ctx.lineTo(xMid, y2);
      ctx.lineTo(x1, y2);
      ctx.stroke();

      // Line from mid to next round
      ctx.beginPath();
      ctx.moveTo(xMid, yMid);
      ctx.lineTo(x2, yMid);
      ctx.stroke();
    }
  }
}

function drawSlotDots() {
  for (let round = 0; round <= numRounds; round++) {
    const slotsInRound = numPlayers / Math.pow(2, round);
    for (let i = 0; i < slotsInRound; i++) {
      const x = roundX(round);
      const y = slotY(i, slotsInRound);
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = SLOT_COLOR;
      ctx.fill();
    }
  }
}

/** Compute the slot index within a round given the original slot and round number */
function slotInRound(originalSlot: number, round: number): number {
  return Math.floor(originalSlot / Math.pow(2, round));
}

interface AnimState {
  sim: SimResult;
  /** Current round being animated (0-based), or numRounds when done */
  currentRound: number;
  /** Progress within current round animation [0, 1] */
  progress: number;
  done: boolean;
}

function drawAnimatedBracket(state: AnimState) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBracketLines();
  drawSlotDots();

  const { sim } = state;
  const figSize = 8;

  // Draw Alex and Miguel at each completed round
  for (let r = 0; r <= Math.min(state.currentRound, numRounds); r++) {
    const slotsInThisRound = numPlayers / Math.pow(2, r);
    const alexHere = sim.alexPath[r];
    const miguelHere = sim.miguelPath[r];

    const isCurrentRound = r === state.currentRound && !state.done;
    const isFutureRound = r > state.currentRound;

    if (isFutureRound) continue;

    // For current round being animated, interpolate position
    if (isCurrentRound && r > 0) {
      // Draw the moving figures from previous round to this round
      const prevSlots = numPlayers / Math.pow(2, r - 1);
      const t = state.progress;

      // Alex
      if (alexHere !== -1) {
        const prevIdx = sim.alexPath[r - 1];
        const prevX = roundX(r - 1);
        const prevY = slotY(slotInRound(prevIdx, r - 1), prevSlots);
        const curX = roundX(r);
        const curY = slotY(slotInRound(alexHere, r), slotsInThisRound);
        const x = prevX + (curX - prevX) * t;
        const y = prevY + (curY - prevY) * t;
        drawStickFigure(x, y, ALEX_COLOR, figSize, true);
      } else if (sim.alexPath[r - 1] !== -1) {
        // Alex was just eliminated
        const prevIdx = sim.alexPath[r - 1];
        const prevX = roundX(r - 1);
        const prevY = slotY(slotInRound(prevIdx, r - 1), prevSlots);
        drawStickFigure(prevX, prevY, ALEX_COLOR, figSize, false);
        if (t > 0.5) drawEliminated(prevX, prevY, ALEX_COLOR, figSize);
      }

      // Miguel
      if (miguelHere !== -1) {
        const prevIdx = sim.miguelPath[r - 1];
        const prevX = roundX(r - 1);
        const prevY = slotY(slotInRound(prevIdx, r - 1), prevSlots);
        const curX = roundX(r);
        const curY = slotY(slotInRound(miguelHere, r), slotsInThisRound);
        const x = prevX + (curX - prevX) * t;
        const y = prevY + (curY - prevY) * t;
        drawStickFigure(x, y, MIGUEL_COLOR, figSize, true);
      } else if (sim.miguelPath[r - 1] !== -1) {
        const prevIdx = sim.miguelPath[r - 1];
        const prevX = roundX(r - 1);
        const prevY = slotY(slotInRound(prevIdx, r - 1), prevSlots);
        drawStickFigure(prevX, prevY, MIGUEL_COLOR, figSize, false);
        if (t > 0.5) drawEliminated(prevX, prevY, MIGUEL_COLOR, figSize);
      }
    } else {
      // Completed round — draw static figures
      if (alexHere !== -1) {
        const x = roundX(r);
        const y = slotY(slotInRound(alexHere, r), slotsInThisRound);
        drawStickFigure(x, y, ALEX_COLOR, figSize, false);
      }
      if (miguelHere !== -1) {
        const x = roundX(r);
        const y = slotY(slotInRound(miguelHere, r), slotsInThisRound);
        drawStickFigure(x, y, MIGUEL_COLOR, figSize, false);
      }
    }
  }

  // If they met, highlight the meeting round
  if (sim.metInRound >= 0 && state.currentRound >= sim.metInRound && state.done) {
    const meetRound = sim.metInRound;
    const slotsInMeetRound = numPlayers / Math.pow(2, meetRound);
    const alexIdx = slotInRound(sim.alexSlot, meetRound);
    const miguelIdx = slotInRound(sim.miguelSlot, meetRound);
    const x = roundX(meetRound);
    const y1 = slotY(alexIdx, slotsInMeetRound);
    const y2 = slotY(miguelIdx, slotsInMeetRound);
    const yMid = (y1 + y2) / 2;

    ctx.save();
    ctx.strokeStyle = MATCH_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(x, yMid, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Draw eliminated markers for completed rounds
  for (let r = 1; r <= Math.min(state.currentRound, numRounds); r++) {
    const isCurrentAnimating = r === state.currentRound && !state.done;
    if (isCurrentAnimating) continue;

    const prevSlots = numPlayers / Math.pow(2, r - 1);
    if (sim.alexPath[r] === -1 && sim.alexPath[r - 1] !== -1) {
      const prevIdx = sim.alexPath[r - 1];
      const prevX = roundX(r - 1);
      const prevY = slotY(slotInRound(prevIdx, r - 1), prevSlots);
      drawStickFigure(prevX, prevY, ALEX_COLOR, figSize, false);
      drawEliminated(prevX, prevY, ALEX_COLOR, figSize);
    }
    if (sim.miguelPath[r] === -1 && sim.miguelPath[r - 1] !== -1) {
      const prevIdx = sim.miguelPath[r - 1];
      const prevX = roundX(r - 1);
      const prevY = slotY(slotInRound(prevIdx, r - 1), prevSlots);
      drawStickFigure(prevX, prevY, MIGUEL_COLOR, figSize, false);
      drawEliminated(prevX, prevY, MIGUEL_COLOR, figSize);
    }
  }
}

function drawStaticBracket(sim: SimResult) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBracketLines();
  drawSlotDots();

  const figSize = 8;

  // Draw final positions
  for (let r = 0; r <= numRounds; r++) {
    const slotsInThisRound = numPlayers / Math.pow(2, r);
    if (sim.alexPath[r] !== -1) {
      const x = roundX(r);
      const y = slotY(slotInRound(sim.alexPath[r], r), slotsInThisRound);
      drawStickFigure(x, y, ALEX_COLOR, figSize, false);
    }
    if (sim.miguelPath[r] !== -1) {
      const x = roundX(r);
      const y = slotY(slotInRound(sim.miguelPath[r], r), slotsInThisRound);
      drawStickFigure(x, y, MIGUEL_COLOR, figSize, false);
    }
  }

  // Draw eliminated markers
  for (let r = 1; r <= numRounds; r++) {
    const prevSlots = numPlayers / Math.pow(2, r - 1);
    if (sim.alexPath[r] === -1 && sim.alexPath[r - 1] !== -1) {
      const prevIdx = sim.alexPath[r - 1];
      const x = roundX(r - 1);
      const y = slotY(slotInRound(prevIdx, r - 1), prevSlots);
      drawStickFigure(x, y, ALEX_COLOR, figSize, false);
      drawEliminated(x, y, ALEX_COLOR, figSize);
    }
    if (sim.miguelPath[r] === -1 && sim.miguelPath[r - 1] !== -1) {
      const prevIdx = sim.miguelPath[r - 1];
      const x = roundX(r - 1);
      const y = slotY(slotInRound(prevIdx, r - 1), prevSlots);
      drawStickFigure(x, y, MIGUEL_COLOR, figSize, false);
      drawEliminated(x, y, MIGUEL_COLOR, figSize);
    }
  }

  // Highlight meeting point
  if (sim.metInRound >= 0) {
    const meetRound = sim.metInRound;
    const slotsInMeetRound = numPlayers / Math.pow(2, meetRound);
    const alexIdx = slotInRound(sim.alexSlot, meetRound);
    const miguelIdx = slotInRound(sim.miguelSlot, meetRound);
    const x = roundX(meetRound);
    const y1 = slotY(alexIdx, slotsInMeetRound);
    const y2 = slotY(miguelIdx, slotsInMeetRound);
    const yMid = (y1 + y2) / 2;

    ctx.save();
    ctx.strokeStyle = MATCH_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(x, yMid, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

const totalSimsEl = document.getElementById('total-sims')!;
const meetPctEl = document.getElementById('meet-pct')!;
const animToggle = document.getElementById('animate-toggle') as HTMLInputElement;
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
const playerCountSelect = document.getElementById('player-count') as HTMLSelectElement;

let totalSims = 0;
let totalMet = 0;
let paused = false;
let animState: AnimState | null = null;
let lastFrameTime = 0;
let pendingTimeout: number | null = null;

function updateStats() {
  totalSimsEl.textContent = totalSims.toLocaleString();
  const pct = totalSims === 0 ? 0 : (totalMet / totalSims) * 100;
  meetPctEl.textContent = pct.toFixed(2) + '%';
}

function shouldAnimate(): boolean {
  return animToggle.checked;
}

/** Determine the last round we need to animate to (stop once both eliminated or they met) */
function lastRelevantRound(sim: SimResult): number {
  for (let r = 1; r <= numRounds; r++) {
    const alexGone = sim.alexPath[r] === -1;
    const miguelGone = sim.miguelPath[r] === -1;
    if (alexGone && miguelGone) return r;
    if (sim.metInRound >= 0 && r >= sim.metInRound + 1) return r;
  }
  return numRounds;
}

function drawEmptyBracket() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBracketLines();
  drawSlotDots();
}

function startNewSimulation() {
  const sim = simulate();

  // Start animation
  animState = {
    sim,
    currentRound: 0,
    progress: 0,
    done: false,
  };
  return false;
}

function tick(timestamp: number) {
  if (paused) return;

  if (!lastFrameTime) lastFrameTime = timestamp;
  const dt = (timestamp - lastFrameTime) / 1000;
  lastFrameTime = timestamp;

  if (!shouldAnimate()) {
    // Run many simulations per frame, only update numbers
    const batchSize = Math.max(1, Math.floor(Math.pow(10, speedSlider.valueAsNumber / 20)));
    for (let i = 0; i < batchSize; i++) {
      const sim = simulate();
      totalSims++;
      if (sim.metInRound >= 0) totalMet++;
    }
    updateStats();
    requestAnimationFrame(tick);
    return;
  }

  // Animated mode
  if (!animState || animState.done) {
    startNewSimulation();
    if (!animState) {
      requestAnimationFrame(tick);
      return;
    }
  }

  const speed = speedSlider.valueAsNumber / 10; // 0.1 to 10
  const lastRound = lastRelevantRound(animState.sim);

  animState.progress += dt * speed * 2;

  if (animState.progress >= 1) {
    animState.progress = 0;
    animState.currentRound++;

    if (animState.currentRound > lastRound) {
      // Simulation complete
      animState.done = true;
      totalSims++;
      if (animState.sim.metInRound >= 0) totalMet++;
      updateStats();

      // Pause briefly on the final state
      pendingTimeout = window.setTimeout(() => {
        pendingTimeout = null;
        animState = null;
        if (!paused) requestAnimationFrame(tick);
      }, Math.max(200, 1000 / speed));
      drawAnimatedBracket(animState);
      return;
    }
  }

  drawAnimatedBracket(animState);
  updateStats();
  requestAnimationFrame(tick);
}

// ─── Play/Pause ───────────────────────────────────────────────────────────────

function updatePlayPauseButton() {
  playPauseBtn.textContent = paused ? '\u25b6 Play' : '\u23f8 Pause';
}

playPauseBtn.addEventListener('click', () => {
  paused = !paused;
  updatePlayPauseButton();
  if (!paused) {
    lastFrameTime = 0;
    requestAnimationFrame(tick);
  }
});

// ─── Player Count ─────────────────────────────────────────────────────────────

playerCountSelect.addEventListener('change', () => {
  numPlayers = parseInt(playerCountSelect.value, 10);
  numRounds = Math.log2(numPlayers);

  // Reset stats
  totalSims = 0;
  totalMet = 0;
  updateStats();

  // Cancel any pending timeout
  if (pendingTimeout !== null) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }

  // Reset animation state
  animState = null;
  lastFrameTime = 0;

  // Redraw empty bracket
  drawEmptyBracket();

  // Restart loop if not paused
  if (!paused) {
    requestAnimationFrame(tick);
  }
});

// ─── Initial Setup ────────────────────────────────────────────────────────────

updatePlayPauseButton();
drawEmptyBracket();

requestAnimationFrame(tick);
