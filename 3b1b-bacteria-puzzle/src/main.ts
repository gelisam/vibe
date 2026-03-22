// ─── Constants ───────────────────────────────────────────────────────────────

const CELL_SIZE = 40;
const FILLED_COLOR   = '#4a90d9';
const GRID_COLOR     = '#e0e0e0';
const BOUNDARY_COLOR = '#333';
const GRID_BG        = '#fafafa';
const OUTSIDE_BG     = '#e8e8e8';

// ─── State helpers ────────────────────────────────────────────────────────────

function cellKey(x: number, y: number): string {
    return `${x},${y}`;
}

function parseKey(key: string): [number, number] {
    const i = key.indexOf(',');
    return [parseInt(key.slice(0, i), 10), parseInt(key.slice(i + 1), 10)];
}

interface GameState {
    filled: Set<string>;
    steps: number;
}

function cloneState(s: GameState): GameState {
    return { filled: new Set(s.filled), steps: s.steps };
}

function initialState(): GameState {
    return { filled: new Set([cellKey(0, 0)]), steps: 0 };
}

// ─── App state ────────────────────────────────────────────────────────────────

let gameState: GameState = initialState();
let moveHistory: GameState[] = [];

// Viewport: canvas-space coordinate of the grid's x=0 line (originCx) and the
// bottom edge of the y=0 row (originCy, which equals the y=0 boundary line).
// Canvas y increases downward; grid y increases upward.
let originCx = 0;
let originCy = 0;

// Cell currently under the mouse pointer (null if none / outside grid)
let hoverCell: [number, number] | null = null;

// ─── DOM references ───────────────────────────────────────────────────────────

const canvas   = document.getElementById('grid-canvas') as HTMLCanvasElement;
const ctx      = canvas.getContext('2d')!;
const stepsEl  = document.getElementById('steps-count')  as HTMLElement;
const undoBtn  = document.getElementById('undo-btn')      as HTMLButtonElement;
const kebabBtn = document.getElementById('kebab-btn')     as HTMLButtonElement;
const kebabMenu = document.getElementById('kebab-menu')   as HTMLDivElement;

// ─── Coordinate helpers ───────────────────────────────────────────────────────

/** Top-left canvas corner of grid cell (gx, gy). */
function cellTopLeft(gx: number, gy: number): [number, number] {
    return [
        originCx + gx * CELL_SIZE,
        originCy - (gy + 1) * CELL_SIZE,
    ];
}

/** Grid cell coordinates for a canvas point. May return negative values. */
function canvasToGrid(cx: number, cy: number): [number, number] {
    return [
        Math.floor((cx - originCx) / CELL_SIZE),
        Math.floor((originCy - cy)  / CELL_SIZE),
    ];
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function draw(): void {
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Visible grid cell range
    const minGx = Math.max(0, Math.floor((0 - originCx) / CELL_SIZE) - 1);
    const maxGx = Math.floor((W - originCx) / CELL_SIZE) + 1;
    const minGy = Math.max(0, Math.floor((originCy - H) / CELL_SIZE) - 1);
    const maxGy = Math.floor(originCy / CELL_SIZE) + 1;

    // Outside-boundary background (covers whole canvas first)
    ctx.fillStyle = OUTSIDE_BG;
    ctx.fillRect(0, 0, W, H);

    // Valid-grid-area background (x≥0, y≥0)
    const gridL = Math.max(0, originCx);
    const gridT = 0;
    const gridR = W;
    const gridB = Math.min(H, originCy);
    if (gridR > gridL && gridB > gridT) {
        ctx.fillStyle = GRID_BG;
        ctx.fillRect(gridL, gridT, gridR - gridL, gridB - gridT);
    }

    // Grid lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (let gx = minGx; gx <= maxGx + 1; gx++) {
        const cx = originCx + gx * CELL_SIZE;
        if (cx < gridL || cx > gridR) continue;
        ctx.beginPath();
        ctx.moveTo(cx, gridT);
        ctx.lineTo(cx, gridB);
        ctx.stroke();
    }
    for (let gy = minGy; gy <= maxGy + 1; gy++) {
        const cy = originCy - gy * CELL_SIZE;
        if (cy < gridT || cy > gridB) continue;
        ctx.beginPath();
        ctx.moveTo(gridL, cy);
        ctx.lineTo(gridR, cy);
        ctx.stroke();
    }

    // Filled cells
    ctx.fillStyle = FILLED_COLOR;
    for (const key of gameState.filled) {
        const [gx, gy] = parseKey(key);
        if (gx < minGx - 1 || gx > maxGx + 1 || gy < minGy - 1 || gy > maxGy + 1) continue;
        const [tx, ty] = cellTopLeft(gx, gy);
        ctx.fillRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }

    // Hover highlight
    if (hoverCell) {
        const [hx, hy] = hoverCell;
        const hKey = cellKey(hx, hy);
        if (gameState.filled.has(hKey)) {
            const canAct =
                !gameState.filled.has(cellKey(hx, hy + 1)) &&
                !gameState.filled.has(cellKey(hx + 1, hy));
            ctx.fillStyle = canAct
                ? 'rgba(255,255,255,0.40)'
                : 'rgba(0,0,0,0.20)';
            const [tx, ty] = cellTopLeft(hx, hy);
            ctx.fillRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        }
    }

    // Boundary lines (drawn on top so they stay crisp)
    ctx.strokeStyle = BOUNDARY_COLOR;
    ctx.lineWidth = 2;
    if (originCx >= 0 && originCx <= W) {
        ctx.beginPath();
        ctx.moveTo(originCx, gridT);
        ctx.lineTo(originCx, Math.min(H, originCy));
        ctx.stroke();
    }
    if (originCy >= 0 && originCy <= H) {
        ctx.beginPath();
        ctx.moveTo(Math.max(0, originCx), originCy);
        ctx.lineTo(W, originCy);
        ctx.stroke();
    }

    // UI counters / button state
    stepsEl.textContent = String(gameState.steps);
    undoBtn.disabled = moveHistory.length === 0;
}

// ─── Game logic ───────────────────────────────────────────────────────────────

function tryMove(gx: number, gy: number): void {
    if (gx < 0 || gy < 0) return;
    const key      = cellKey(gx, gy);
    const aboveKey = cellKey(gx,     gy + 1);
    const rightKey = cellKey(gx + 1, gy);
    if (!gameState.filled.has(key))       return;
    if (gameState.filled.has(aboveKey) ||
        gameState.filled.has(rightKey))   return;

    moveHistory.push(cloneState(gameState));
    gameState = cloneState(gameState);
    gameState.filled.delete(key);
    gameState.filled.add(aboveKey);
    gameState.filled.add(rightKey);
    gameState.steps++;
    draw();
}

function undo(): void {
    if (moveHistory.length === 0) return;
    gameState = moveHistory.pop()!;
    draw();
}

function reset(): void {
    moveHistory    = [];
    gameState  = initialState();
    originCx   = CELL_SIZE;
    originCy   = canvas.height - CELL_SIZE;
    hoverCell  = null;
    canvas.style.cursor = 'default';
    draw();
}

// ─── Viewport clamping ────────────────────────────────────────────────────────

function clampOrigin(): void {
    // Don't let x=0 boundary drift too far right (no content left of x=0)
    originCx = Math.min(CELL_SIZE * 2, originCx);
    // Don't let y=0 boundary drift off the bottom of the canvas
    originCy = Math.min(canvas.height - Math.floor(CELL_SIZE / 2), originCy);
}

// ─── Mouse events ─────────────────────────────────────────────────────────────

canvas.addEventListener('click', (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const [gx, gy] = canvasToGrid(e.clientX - r.left, e.clientY - r.top);
    tryMove(gx, gy);
});

canvas.addEventListener('mousemove', (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const [gx, gy] = canvasToGrid(e.clientX - r.left, e.clientY - r.top);
    const newHover: [number, number] | null =
        (gx >= 0 && gy >= 0) ? [gx, gy] : null;

    const changed =
        newHover === null
            ? hoverCell !== null
            : hoverCell === null ||
              hoverCell[0] !== newHover[0] ||
              hoverCell[1] !== newHover[1];

    hoverCell = newHover;

    if (newHover && gameState.filled.has(cellKey(newHover[0], newHover[1]))) {
        canvas.style.cursor = 'pointer';
    } else {
        canvas.style.cursor = 'default';
    }

    if (changed) draw();
});

canvas.addEventListener('mouseleave', () => {
    if (hoverCell !== null) {
        hoverCell = null;
        canvas.style.cursor = 'default';
        draw();
    }
});

// ─── Wheel scrolling ──────────────────────────────────────────────────────────

canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    let dx = e.deltaX;
    let dy = e.deltaY;
    if      (e.deltaMode === 1) { dx *= 20;            dy *= 20;            }
    else if (e.deltaMode === 2) { dx *= canvas.width;  dy *= canvas.height; }

    // Scroll right (deltaX>0) → see higher x → originCx decreases
    // Scroll down  (deltaY>0) → see lower  y → originCy decreases
    originCx -= dx;
    originCy -= dy;
    clampOrigin();
    draw();
}, { passive: false });

// ─── Touch scrolling / tapping ────────────────────────────────────────────────

let touchLastX = 0;
let touchLastY = 0;
let touchMovedPx = 0;
const TOUCH_TAP_THRESHOLD = 8; // pixels

canvas.addEventListener('touchstart', (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
        touchLastX  = e.touches[0].clientX;
        touchLastY  = e.touches[0].clientY;
        touchMovedPx = 0;
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchLastX;
        const dy = e.touches[0].clientY - touchLastY;
        touchMovedPx += Math.abs(dx) + Math.abs(dy);

        // Drag right → content moves right → lower x visible → originCx increases
        // Drag down  → content moves down  → higher y visible → originCy increases
        // (opposite of wheel, matching "content follows finger")
        originCx += dx;
        originCy -= dy;   // invert: drag up → see higher y (same direction as "up" in the grid)
        touchLastX = e.touches[0].clientX;
        touchLastY = e.touches[0].clientY;
        clampOrigin();
        draw();
    }
}, { passive: false });

canvas.addEventListener('touchend', (e: TouchEvent) => {
    e.preventDefault();
    if (touchMovedPx < TOUCH_TAP_THRESHOLD && e.changedTouches.length === 1) {
        const r = canvas.getBoundingClientRect();
        const [gx, gy] = canvasToGrid(
            e.changedTouches[0].clientX - r.left,
            e.changedTouches[0].clientY - r.top,
        );
        tryMove(gx, gy);
    }
}, { passive: false });

// ─── Kebab menu ───────────────────────────────────────────────────────────────

kebabBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    kebabMenu.style.display = kebabMenu.style.display === 'block' ? 'none' : 'block';
});

document.addEventListener('click', (e: MouseEvent) => {
    if (e.target !== kebabBtn && !kebabMenu.contains(e.target as Node)) {
        kebabMenu.style.display = 'none';
    }
});

document.getElementById('reset-btn')!.addEventListener('click', () => {
    reset();
    kebabMenu.style.display = 'none';
});

undoBtn.addEventListener('click', undo);

// ─── Resize ───────────────────────────────────────────────────────────────────

function resizeCanvas(): void {
    const toolbar = document.getElementById('toolbar') as HTMLElement;
    const newH = window.innerHeight - toolbar.offsetHeight;
    // Keep the y=0 boundary at the same distance from the bottom on resize
    const bottomMargin = canvas.height > 0 ? canvas.height - originCy : CELL_SIZE;
    canvas.width  = window.innerWidth;
    canvas.height = newH;
    originCy = canvas.height - bottomMargin;
    clampOrigin();
    draw();
}

window.addEventListener('resize', resizeCanvas);

// ─── Initialise ───────────────────────────────────────────────────────────────

(function init(): void {
    const toolbar = document.getElementById('toolbar') as HTMLElement;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight - toolbar.offsetHeight;
    originCx = CELL_SIZE;          // x=0 boundary 1 cell from left edge
    originCy = canvas.height - CELL_SIZE; // y=0 boundary 1 cell from bottom edge
    draw();
})();
