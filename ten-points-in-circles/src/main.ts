type ItemKind = 'point' | 'circle';
type Mode = 'select' | 'add-point' | 'add-circle' | 'remove';

interface Item {
    id: number;
    kind: ItemKind;
    x: number;
    y: number;
}

interface DragMove {
    startX: number;
    startY: number;
    basePositions: Map<number, { x: number; y: number }>;
}

interface Marquee {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    additive: boolean;
}

const UNIT_RADIUS = 1;
const WORLD_SIZE = 24;
const SCALE = 28;
const POINT_DRAW_RADIUS_UNITS = 5 / SCALE;
const POINT_HIT_RADIUS_UNITS = 8 / SCALE;
const MIN_MARQUEE_SELECTION_SIZE_UNITS = 0.05;

const canvasEl = document.getElementById('stage') as HTMLCanvasElement | null;
const pointCountNode = document.getElementById('point-count');
const clearSelectionNode = document.getElementById('clear-selection');
const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-mode]'));

if (!canvasEl || !pointCountNode || !clearSelectionNode) {
    throw new Error('Missing required DOM elements.');
}

const canvas: HTMLCanvasElement = canvasEl;
const pointCountEl: HTMLElement = pointCountNode;
const clearSelectionButton: HTMLElement = clearSelectionNode;

const ctxMaybe = canvas.getContext('2d');
if (!ctxMaybe) {
    throw new Error('Failed to get 2D context.');
}
const ctx: CanvasRenderingContext2D = ctxMaybe;

let items: Item[] = [];
let nextId = 1;
let mode: Mode = 'select';
const selectedIds = new Set<number>();
let dragMove: DragMove | null = null;
let marquee: Marquee | null = null;

function toWorld(screen: number): number {
    return screen / SCALE;
}

function toScreen(world: number): number {
    return world * SCALE;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function clampPosition(item: Item, x: number, y: number): { x: number; y: number } {
    if (item.kind === 'circle') {
        return {
            x: clamp(x, UNIT_RADIUS, WORLD_SIZE - UNIT_RADIUS),
            y: clamp(y, UNIT_RADIUS, WORLD_SIZE - UNIT_RADIUS)
        };
    }
    return {
        x: clamp(x, 0, WORLD_SIZE),
        y: clamp(y, 0, WORLD_SIZE)
    };
}

function getCanvasWorldPosition(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    return { x: toWorld(x), y: toWorld(y) };
}

function isPointInsideAnyCircle(point: Item): boolean {
    return items.some((item) => {
        if (item.kind !== 'circle') {
            return false;
        }
        const dx = item.x - point.x;
        const dy = item.y - point.y;
        return Math.hypot(dx, dy) <= UNIT_RADIUS;
    });
}

function circleTouchesAnother(circle: Item): boolean {
    return items.some((other) => {
        if (other.id === circle.id || other.kind !== 'circle') {
            return false;
        }
        const dx = other.x - circle.x;
        const dy = other.y - circle.y;
        return Math.hypot(dx, dy) <= UNIT_RADIUS * 2;
    });
}

function updateCounts(): void {
    const pointCount = items.filter((item) => item.kind === 'point').length;
    pointCountEl.textContent = String(pointCount);
}

function drawGrid(): void {
    ctx.strokeStyle = '#eef2ff';
    ctx.lineWidth = 1;
    for (let i = 0; i <= WORLD_SIZE; i += 2) {
        const s = toScreen(i);
        ctx.beginPath();
        ctx.moveTo(s, 0);
        ctx.lineTo(s, canvas.height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, s);
        ctx.lineTo(canvas.width, s);
        ctx.stroke();
    }
}

function drawItems(): void {
    for (const item of items) {
        if (item.kind !== 'circle') {
            continue;
        }
        const touches = circleTouchesAnother(item);
        const selected = selectedIds.has(item.id);

        ctx.beginPath();
        ctx.arc(toScreen(item.x), toScreen(item.y), toScreen(UNIT_RADIUS), 0, Math.PI * 2);
        ctx.strokeStyle = touches ? '#dc2626' : '#2563eb';
        ctx.lineWidth = selected ? 3 : 2;
        ctx.stroke();
    }

    for (const item of items) {
        if (item.kind !== 'point') {
            continue;
        }
        const inside = isPointInsideAnyCircle(item);
        const selected = selectedIds.has(item.id);

        ctx.beginPath();
        ctx.arc(toScreen(item.x), toScreen(item.y), toScreen(POINT_DRAW_RADIUS_UNITS), 0, Math.PI * 2);
        ctx.fillStyle = inside ? '#111827' : '#facc15';
        ctx.fill();

        if (selected) {
            ctx.beginPath();
            ctx.arc(toScreen(item.x), toScreen(item.y), toScreen(POINT_DRAW_RADIUS_UNITS) + 2, 0, Math.PI * 2);
            ctx.strokeStyle = '#0ea5e9';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

function drawMarquee(): void {
    if (!marquee) {
        return;
    }
    const x = Math.min(marquee.startX, marquee.currentX);
    const y = Math.min(marquee.startY, marquee.currentY);
    const width = Math.abs(marquee.currentX - marquee.startX);
    const height = Math.abs(marquee.currentY - marquee.startY);

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(toScreen(x), toScreen(y), toScreen(width), toScreen(height));
    ctx.setLineDash([]);
}

function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawItems();
    drawMarquee();
    updateCounts();
}

function distanceToItem(x: number, y: number, item: Item): number {
    const dx = x - item.x;
    const dy = y - item.y;
    return Math.hypot(dx, dy);
}

function hitTest(x: number, y: number): Item | null {
    for (let i = items.length - 1; i >= 0; i -= 1) {
        const item = items[i];
        if (item.kind !== 'point') {
            continue;
        }
        const distance = distanceToItem(x, y, item);
        if (distance <= POINT_HIT_RADIUS_UNITS) {
            return item;
        }
    }

    for (let i = items.length - 1; i >= 0; i -= 1) {
        const item = items[i];
        if (item.kind !== 'circle') {
            continue;
        }
        const distance = distanceToItem(x, y, item);
        if (distance <= UNIT_RADIUS) {
            return item;
        }
    }
    return null;
}

function addItem(kind: ItemKind, x: number, y: number): void {
    const newItem: Item = { id: nextId, kind, x, y };
    const clamped = clampPosition(newItem, x, y);
    newItem.x = clamped.x;
    newItem.y = clamped.y;
    items.push(newItem);
    nextId += 1;
}

function removeItemById(id: number): void {
    items = items.filter((item) => item.id !== id);
    selectedIds.delete(id);
}

function removeSelected(): void {
    if (selectedIds.size === 0) {
        return;
    }
    items = items.filter((item) => !selectedIds.has(item.id));
    selectedIds.clear();
}

function setMode(nextMode: Mode): void {
    mode = nextMode;
    for (const button of modeButtons) {
        const active = button.dataset.mode === mode;
        button.classList.toggle('active', active);
    }
}

function beginMove(worldX: number, worldY: number): void {
    const basePositions = new Map<number, { x: number; y: number }>();
    for (const item of items) {
        if (selectedIds.has(item.id)) {
            basePositions.set(item.id, { x: item.x, y: item.y });
        }
    }
    dragMove = {
        startX: worldX,
        startY: worldY,
        basePositions
    };
}

function applyMove(worldX: number, worldY: number): void {
    if (!dragMove) {
        return;
    }
    const dx = worldX - dragMove.startX;
    const dy = worldY - dragMove.startY;

    for (const item of items) {
        if (!selectedIds.has(item.id)) {
            continue;
        }
        const base = dragMove.basePositions.get(item.id);
        if (!base) {
            continue;
        }
        const clamped = clampPosition(item, base.x + dx, base.y + dy);
        item.x = clamped.x;
        item.y = clamped.y;
    }
}

function selectedInMarquee(currentMarquee: Marquee): Set<number> {
    const minX = Math.min(currentMarquee.startX, currentMarquee.currentX);
    const minY = Math.min(currentMarquee.startY, currentMarquee.currentY);
    const maxX = Math.max(currentMarquee.startX, currentMarquee.currentX);
    const maxY = Math.max(currentMarquee.startY, currentMarquee.currentY);

    const ids = new Set<number>();
    for (const item of items) {
        if (item.x >= minX && item.x <= maxX && item.y >= minY && item.y <= maxY) {
            ids.add(item.id);
        }
    }
    return ids;
}

canvas.addEventListener('pointerdown', (event) => {
    canvas.focus();
    const { x, y } = getCanvasWorldPosition(event);

    if (mode === 'add-point') {
        addItem('point', x, y);
        render();
        return;
    }

    if (mode === 'add-circle') {
        addItem('circle', x, y);
        render();
        return;
    }

    const hit = hitTest(x, y);

    if (mode === 'remove') {
        if (hit) {
            removeItemById(hit.id);
            render();
        }
        return;
    }

    if (!hit) {
        marquee = {
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
            additive: event.shiftKey
        };
        if (!event.shiftKey) {
            selectedIds.clear();
        }
        render();
        return;
    }

    if (event.shiftKey) {
        if (selectedIds.has(hit.id)) {
            selectedIds.delete(hit.id);
        } else {
            selectedIds.add(hit.id);
        }
    } else if (!selectedIds.has(hit.id)) {
        selectedIds.clear();
        selectedIds.add(hit.id);
    }

    beginMove(x, y);
    render();
});

canvas.addEventListener('pointermove', (event) => {
    const { x, y } = getCanvasWorldPosition(event);
    if (dragMove) {
        applyMove(x, y);
        render();
        return;
    }

    if (marquee) {
        marquee.currentX = x;
        marquee.currentY = y;
        render();
    }
});

canvas.addEventListener('pointerup', () => {
    dragMove = null;
    if (marquee) {
        const width = Math.abs(marquee.currentX - marquee.startX);
        const height = Math.abs(marquee.currentY - marquee.startY);
        if (width > MIN_MARQUEE_SELECTION_SIZE_UNITS || height > MIN_MARQUEE_SELECTION_SIZE_UNITS) {
            const ids = selectedInMarquee(marquee);
            if (!marquee.additive) {
                selectedIds.clear();
            }
            for (const id of ids) {
                selectedIds.add(id);
            }
        }
        marquee = null;
        render();
    }
});

canvas.addEventListener('pointerleave', () => {
    if (dragMove) {
        dragMove = null;
    }
    if (marquee) {
        marquee = null;
    }
    render();
});

window.addEventListener('keydown', (event) => {
    const focusedOnCanvas = document.activeElement === canvas;
    if (!focusedOnCanvas) {
        return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.size > 0) {
        event.preventDefault();
        removeSelected();
        render();
        return;
    }

    if (selectedIds.size === 0) {
        return;
    }

    let dxPx = 0;
    let dyPx = 0;

    if (event.key === 'ArrowLeft') {
        dxPx = -1;
    } else if (event.key === 'ArrowRight') {
        dxPx = 1;
    } else if (event.key === 'ArrowUp') {
        dyPx = -1;
    } else if (event.key === 'ArrowDown') {
        dyPx = 1;
    }

    if (dxPx === 0 && dyPx === 0) {
        return;
    }

    event.preventDefault();

    const dx = dxPx / SCALE;
    const dy = dyPx / SCALE;

    for (const item of items) {
        if (!selectedIds.has(item.id)) {
            continue;
        }
        const clamped = clampPosition(item, item.x + dx, item.y + dy);
        item.x = clamped.x;
        item.y = clamped.y;
    }

    render();
});

for (const button of modeButtons) {
    button.addEventListener('click', () => {
        const requested = button.dataset.mode as Mode | undefined;
        if (!requested) {
            return;
        }
        setMode(requested);
    });
}

clearSelectionButton.addEventListener('click', () => {
    selectedIds.clear();
    render();
});

render();
