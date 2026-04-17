type Mode = 'select' | 'add-point' | 'add-circle';

interface PointItem {
    id: number;
    x: number;
    y: number;
}

interface CircleItem {
    id: number;
    x: number;
    y: number;
}

const WORLD_SPAN = 20;
const PADDING_PX = 30;
const POINT_RADIUS_PX = 6;
const CIRCLE_RADIUS_WORLD = 1;
const CIRCLE_STROKE_PX = 2;
const HIT_PADDING_WORLD = 0.25;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const modeSelectBtn = document.getElementById('mode-select') as HTMLButtonElement;
const modePointBtn = document.getElementById('mode-point') as HTMLButtonElement;
const modeCircleBtn = document.getElementById('mode-circle') as HTMLButtonElement;
const deleteSelectedBtn = document.getElementById('delete-selected') as HTMLButtonElement;
const clearSelectionBtn = document.getElementById('clear-selection') as HTMLButtonElement;
const pointCountEl = document.getElementById('point-count') as HTMLElement;

let mode: Mode = 'select';
let nextPointId = 1;
let nextCircleId = 1;

const points: PointItem[] = [];
const circles: CircleItem[] = [];
const selection = new Set<string>();

let scale = 1;
let centerX = 0;
let centerY = 0;

let dragging = false;
let dragStartWorld: { x: number; y: number } | null = null;
let dragStartPositions = new Map<string, { x: number; y: number }>();

function pointKey(id: number): string {
    return `p:${id}`;
}

function circleKey(id: number): string {
    return `c:${id}`;
}

function distance(aX: number, aY: number, bX: number, bY: number): number {
    const dx = aX - bX;
    const dy = aY - bY;
    return Math.sqrt(dx * dx + dy * dy);
}

function recomputeScale(): void {
    scale = Math.min(
        (canvas.width - PADDING_PX * 2) / WORLD_SPAN,
        (canvas.height - PADDING_PX * 2) / WORLD_SPAN,
    );
    centerX = canvas.width / 2;
    centerY = canvas.height / 2;
}

function worldToCanvas(x: number, y: number): { x: number; y: number } {
    return {
        x: centerX + x * scale,
        y: centerY - y * scale,
    };
}

function canvasToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const cx = (clientX - rect.left) * (canvas.width / rect.width);
    const cy = (clientY - rect.top) * (canvas.height / rect.height);
    return {
        x: (cx - centerX) / scale,
        y: (centerY - cy) / scale,
    };
}

function isPointInsideAnyCircle(point: PointItem): boolean {
    for (const circle of circles) {
        if (distance(point.x, point.y, circle.x, circle.y) <= CIRCLE_RADIUS_WORLD) {
            return true;
        }
    }
    return false;
}

function circlesThatTouchAnyOther(): Set<number> {
    const touching = new Set<number>();
    for (let i = 0; i < circles.length; i += 1) {
        for (let j = i + 1; j < circles.length; j += 1) {
            const d = distance(circles[i].x, circles[i].y, circles[j].x, circles[j].y);
            if (d <= CIRCLE_RADIUS_WORLD * 2 + 1e-9) {
                touching.add(circles[i].id);
                touching.add(circles[j].id);
            }
        }
    }
    return touching;
}

function updateModeButtons(): void {
    modeSelectBtn.classList.toggle('active', mode === 'select');
    modePointBtn.classList.toggle('active', mode === 'add-point');
    modeCircleBtn.classList.toggle('active', mode === 'add-circle');
}

function drawAxes(): void {
    ctx.save();
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 1;

    for (let i = -10; i <= 10; i += 1) {
        const v = worldToCanvas(i, 0).x;
        ctx.beginPath();
        ctx.moveTo(v, 0);
        ctx.lineTo(v, canvas.height);
        ctx.stroke();
    }

    for (let i = -10; i <= 10; i += 1) {
        const h = worldToCanvas(0, i).y;
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(canvas.width, h);
        ctx.stroke();
    }

    ctx.strokeStyle = '#c6c6c6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(worldToCanvas(0, 0).x, 0);
    ctx.lineTo(worldToCanvas(0, 0).x, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, worldToCanvas(0, 0).y);
    ctx.lineTo(canvas.width, worldToCanvas(0, 0).y);
    ctx.stroke();
    ctx.restore();
}

function draw(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAxes();

    const touchingCircles = circlesThatTouchAnyOther();

    for (const circle of circles) {
        const c = worldToCanvas(circle.x, circle.y);
        ctx.beginPath();
        ctx.arc(c.x, c.y, CIRCLE_RADIUS_WORLD * scale, 0, Math.PI * 2);
        ctx.lineWidth = CIRCLE_STROKE_PX;
        ctx.strokeStyle = touchingCircles.has(circle.id) ? '#cc2222' : '#2f78d6';
        ctx.stroke();

        if (selection.has(circleKey(circle.id))) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, CIRCLE_RADIUS_WORLD * scale + 5, 0, Math.PI * 2);
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    for (const point of points) {
        const c = worldToCanvas(point.x, point.y);
        ctx.beginPath();
        ctx.arc(c.x, c.y, POINT_RADIUS_PX, 0, Math.PI * 2);
        ctx.fillStyle = isPointInsideAnyCircle(point) ? '#111' : '#ffd54f';
        ctx.fill();

        if (selection.has(pointKey(point.id))) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, POINT_RADIUS_PX + 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    pointCountEl.textContent = String(points.length);
}

function clearSelection(): void {
    selection.clear();
}

function findHit(worldX: number, worldY: number): string | null {
    for (let i = points.length - 1; i >= 0; i -= 1) {
        const p = points[i];
        const threshold = POINT_RADIUS_PX / scale + HIT_PADDING_WORLD;
        if (distance(worldX, worldY, p.x, p.y) <= threshold) {
            return pointKey(p.id);
        }
    }

    for (let i = circles.length - 1; i >= 0; i -= 1) {
        const c = circles[i];
        if (distance(worldX, worldY, c.x, c.y) <= CIRCLE_RADIUS_WORLD + HIT_PADDING_WORLD) {
            return circleKey(c.id);
        }
    }

    return null;
}

function removeByKey(key: string): void {
    const [kind, idText] = key.split(':');
    const id = Number(idText);
    if (kind === 'p') {
        const idx = points.findIndex((p) => p.id === id);
        if (idx >= 0) points.splice(idx, 1);
    } else if (kind === 'c') {
        const idx = circles.findIndex((c) => c.id === id);
        if (idx >= 0) circles.splice(idx, 1);
    }
    selection.delete(key);
}

function removeSelected(): void {
    for (const key of Array.from(selection)) {
        removeByKey(key);
    }
    draw();
}

function selectedEntries(): Array<{ key: string; x: number; y: number }> {
    const entries: Array<{ key: string; x: number; y: number }> = [];
    for (const p of points) {
        const key = pointKey(p.id);
        if (selection.has(key)) {
            entries.push({ key, x: p.x, y: p.y });
        }
    }
    for (const c of circles) {
        const key = circleKey(c.id);
        if (selection.has(key)) {
            entries.push({ key, x: c.x, y: c.y });
        }
    }
    return entries;
}

function setPositionByKey(key: string, x: number, y: number): void {
    const [kind, idText] = key.split(':');
    const id = Number(idText);
    if (kind === 'p') {
        const item = points.find((p) => p.id === id);
        if (item) {
            item.x = x;
            item.y = y;
        }
    } else if (kind === 'c') {
        const item = circles.find((c) => c.id === id);
        if (item) {
            item.x = x;
            item.y = y;
        }
    }
}

function addPoint(x: number, y: number): void {
    points.push({ id: nextPointId, x, y });
    nextPointId += 1;
    draw();
}

function addCircle(x: number, y: number): void {
    circles.push({ id: nextCircleId, x, y });
    nextCircleId += 1;
    draw();
}

canvas.addEventListener('contextmenu', (event: MouseEvent) => {
    event.preventDefault();
    const world = canvasToWorld(event.clientX, event.clientY);
    const hit = findHit(world.x, world.y);
    if (hit) {
        removeByKey(hit);
        draw();
    }
});

canvas.addEventListener('mousedown', (event: MouseEvent) => {
    if (event.button !== 0) return;

    const world = canvasToWorld(event.clientX, event.clientY);

    if (mode === 'add-point') {
        addPoint(world.x, world.y);
        return;
    }

    if (mode === 'add-circle') {
        addCircle(world.x, world.y);
        return;
    }

    const hit = findHit(world.x, world.y);

    if (!hit) {
        if (!event.shiftKey) {
            clearSelection();
            draw();
        }
        return;
    }

    if (event.shiftKey) {
        if (selection.has(hit)) {
            selection.delete(hit);
        } else {
            selection.add(hit);
        }
        draw();
        return;
    }

    if (!selection.has(hit)) {
        clearSelection();
        selection.add(hit);
    }

    dragging = true;
    dragStartWorld = world;
    dragStartPositions = new Map(selectedEntries().map((e) => [e.key, { x: e.x, y: e.y }]));
    draw();
});

canvas.addEventListener('mousemove', (event: MouseEvent) => {
    if (!dragging || !dragStartWorld) return;
    const world = canvasToWorld(event.clientX, event.clientY);
    const dx = world.x - dragStartWorld.x;
    const dy = world.y - dragStartWorld.y;

    for (const [key, pos] of dragStartPositions.entries()) {
        setPositionByKey(key, pos.x + dx, pos.y + dy);
    }

    draw();
});

function finishDrag(): void {
    dragging = false;
    dragStartWorld = null;
    dragStartPositions = new Map();
}

canvas.addEventListener('mouseup', finishDrag);
canvas.addEventListener('mouseleave', finishDrag);
window.addEventListener('mouseup', finishDrag);

modeSelectBtn.addEventListener('click', () => {
    mode = 'select';
    updateModeButtons();
});

modePointBtn.addEventListener('click', () => {
    mode = 'add-point';
    updateModeButtons();
});

modeCircleBtn.addEventListener('click', () => {
    mode = 'add-circle';
    updateModeButtons();
});

deleteSelectedBtn.addEventListener('click', removeSelected);
clearSelectionBtn.addEventListener('click', () => {
    clearSelection();
    draw();
});

window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selection.size > 0) {
            event.preventDefault();
            removeSelected();
        }
        return;
    }

    let dxPx = 0;
    let dyPx = 0;
    if (event.key === 'ArrowLeft') dxPx = -1;
    else if (event.key === 'ArrowRight') dxPx = 1;
    else if (event.key === 'ArrowUp') dyPx = -1;
    else if (event.key === 'ArrowDown') dyPx = 1;
    else return;

    if (selection.size === 0) return;

    event.preventDefault();

    const dx = dxPx / scale;
    const dy = -dyPx / scale;

    for (const entry of selectedEntries()) {
        setPositionByKey(entry.key, entry.x + dx, entry.y + dy);
    }

    draw();
});

function resizeCanvasToDisplaySize(): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    recomputeScale();
    draw();
}

window.addEventListener('resize', resizeCanvasToDisplaySize);

(function init(): void {
    updateModeButtons();
    resizeCanvasToDisplaySize();

    addCircle(-3, 0);
    addCircle(3, 0);
    addPoint(-3, 0);
    addPoint(0, 0);
    clearSelection();
    draw();
})();
