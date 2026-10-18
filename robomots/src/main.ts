const TRACK_LENGTH = 100;
const START_X = 6;
const FINISH_X = 94;

interface Robot {
    name: string;
    emoji: string;
    description: string;
    baseSpeed: number;
    bonusLabel: string;
    bonusFor(word: string): { amount: number; indices: number[] };
}

type Op = "keep" | "delete" | "replace" | "insert";

const VOWELS = "aeiouyàâäéèêëîïôöùûü";

function accentIndices(word: string): number[] {
    const result: number[] = [];
    Array.from(word.toLowerCase()).forEach((ch, i) => {
        if (/[\u0300-\u036f]/.test(ch.normalize("NFD").slice(1))) result.push(i);
    });
    return result;
}

function vowelGroups(word: string): number[][] {
    const groups: number[][] = [];
    let current: number[] = [];
    Array.from(word.toLowerCase()).forEach((ch, i) => {
        if (VOWELS.indexOf(ch) >= 0) {
            current.push(i);
        } else {
            if (current.length > 1) groups.push(current);
            current = [];
        }
    });
    if (current.length > 1) groups.push(current);
    return groups;
}

const ROBOTS: Robot[] = [
    {
        name: "Bip-Bip Muet", emoji: "🤖", description: "Vitesse 4, +4 si le mot finit par E",
        baseSpeed: 4, bonusLabel: "finit par E",
        bonusFor(word) {
            const chars = Array.from(word);
            const last = chars.length - 1;
            return /e$/i.test(word) ? { amount: 4, indices: [last] } : { amount: 0, indices: [] };
        },
    },
    {
        name: "Voyelle Voyou", emoji: "🦾", description: "Vitesse 4, +4 par groupe de voyelles",
        baseSpeed: 4, bonusLabel: "voyelles qui se suivent",
        bonusFor(word) {
            const groups = vowelGroups(word);
            return { amount: 4 * groups.length, indices: ([] as number[]).concat(...groups) };
        },
    },
    {
        name: "Accent Turbo", emoji: "🚀", description: "Vitesse 4, +16 par accent",
        baseSpeed: 4, bonusLabel: "accents",
        bonusFor(word) {
            const idx = accentIndices(word);
            return { amount: 16 * idx.length, indices: idx };
        },
    },
    {
        name: "Long Boulon", emoji: "🐌", description: "Vitesse 0, +2 par lettre",
        baseSpeed: 0, bonusLabel: "longueur du mot",
        bonusFor(word) {
            const n = Array.from(word).length;
            return { amount: 2 * n, indices: Array.from({ length: n }, (_, i) => i) };
        },
    },
];

// ---------- Utilities ----------

const app = document.getElementById("app") as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

function shuffle<T>(a: T[]): T[] {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
}

function parseEntry(line: string): { spoken: string; word: string } {
    const comma = line.indexOf(",");
    if (comma < 0) return { spoken: line, word: line };
    const word = line.slice(0, comma).trim();
    return { spoken: line, word: word.length > 0 ? word : line };
}

function normalize(s: string): string {
    return s.trim().normalize("NFC").toLowerCase();
}

function diff(typed: string[], correct: string[]): { typedOps: Op[]; correctOps: Op[]; distance: number } {
    const n = typed.length, m = correct.length;
    const d: number[][] = [];
    for (let i = 0; i <= n; i++) {
        d.push(new Array(m + 1).fill(0));
        d[i][0] = i;
    }
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            d[i][j] = Math.min(
                d[i - 1][j] + 1,
                d[i][j - 1] + 1,
                d[i - 1][j - 1] + (typed[i - 1] === correct[j - 1] ? 0 : 1));
        }
    }
    const typedOps: Op[] = new Array(n).fill("keep");
    const correctOps: Op[] = new Array(m).fill("keep");
    let i = n, j = m;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (typed[i - 1] === correct[j - 1] ? 0 : 1)) {
            if (typed[i - 1] !== correct[j - 1]) {
                typedOps[i - 1] = "replace";
                correctOps[j - 1] = "replace";
            }
            i--; j--;
        } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
            typedOps[i - 1] = "delete";
            i--;
        } else {
            correctOps[j - 1] = "insert";
            j--;
        }
    }
    return { typedOps, correctOps, distance: d[n][m] };
}

// ---------- Sound ----------

let audioCtx: AudioContext | null = null;

function tone(freq: number, start: number, dur: number, type: OscillatorType = "square", endFreq?: number, vol = 0.15) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    const t0 = audioCtx.currentTime + start;
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur);
}

function ensureAudio() {
    if (!audioCtx) {
        const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
        if (Ctor) audioCtx = new Ctor();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

const sounds = {
    fast() { tone(400, 0, 0.1, "square", 1200); tone(800, 0.1, 0.12, "square", 1600); },
    slow() { tone(300, 0, 0.5, "sine", 150); },
    error() { tone(200, 0, 0.2, "sawtooth"); tone(140, 0.2, 0.3, "sawtooth"); },
    boost() { [500, 700, 900, 1200].forEach((f, i) => tone(f, i * 0.07, 0.12, "triangle", f * 1.5)); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.15, 0.25, "triangle")); },
    lose() { [400, 350, 300, 200].forEach((f, i) => tone(f, i * 0.25, 0.3, "sawtooth", f * 0.9)); },
};

function speak(word: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "fr-FR";
    u.rate = 0.8;
    window.speechSynthesis.speak(u);
}

// ---------- Confetti ----------

function confetti() {
    const canvas = document.getElementById("confetti") as HTMLCanvasElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d")!;
    const colors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899"];
    const parts = Array.from({ length: 150 }, () => ({
        x: Math.random() * canvas.width, y: -Math.random() * canvas.height * 0.5,
        vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4,
        s: 5 + Math.random() * 7, c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const end = performance.now() + 5000;
    function frame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of parts) {
            p.x += p.vx; p.y += p.vy;
            ctx.fillStyle = p.c;
            ctx.fillRect(p.x, p.y, p.s, p.s * 0.6);
        }
        if (performance.now() < end) requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    frame();
}

// ---------- Screens ----------

let difficulty = 5;
let words: string[] = [];

function setupScreen() {
    app.innerHTML = "";
    app.appendChild(el("h1", "", "🤖 Robomots 🏁"));
    const card = el("div", "card");
    card.appendChild(el("label", "", "Niveau de difficulté (parent)"));
    const slider = el("input");
    slider.type = "range"; slider.min = "1"; slider.max = "10"; slider.step = "1";
    slider.value = String(Math.min(10, Math.max(1, difficulty)));
    const num = el("input");
    num.type = "number"; num.step = "1"; num.value = String(difficulty);
    slider.oninput = () => { num.value = slider.value; };
    num.oninput = () => {
        const v = parseFloat(num.value);
        if (!isNaN(v)) slider.value = String(Math.min(10, Math.max(1, Math.round(v))));
    };
    card.append(slider, num);
    card.appendChild(el("label", "", "Liste de mots (un par ligne, ou une phrase « mot, comme dans ... »)"));
    const area = el("textarea");
    area.value = words.join("\n");
    area.placeholder = "maison\nécole\npot, comme dans un pot de peinture\n...";
    card.appendChild(area);
    const err = el("div", "", "");
    err.style.color = "#b91c1c";
    const go = el("button", "", "Continuer");
    go.style.marginTop = "12px";
    go.onclick = () => {
        const v = parseFloat(num.value);
        const list = area.value.split("\n").map(w => w.trim()).filter(w => w.length > 0);
        if (isNaN(v)) { err.textContent = "Entre un niveau valide."; return; }
        if (list.length === 0) { err.textContent = "Entre au moins un mot."; return; }
        difficulty = v;
        words = list;
        ensureAudio();
        chooseScreen();
    };
    card.append(go, err);
    app.appendChild(card);
}

function makeLane(robot: Robot, mine: boolean): { lane: HTMLElement; node: HTMLElement } {
    const lane = el("div", "lane");
    lane.append(el("div", "start"), el("div", "finish"));
    const node = el("div", "robot" + (mine ? " mine" : ""));
    node.append(document.createTextNode(robot.emoji), el("small", "", robot.name));
    node.style.left = START_X + "%";
    lane.appendChild(node);
    return { lane, node };
}

function posToLeft(pos: number): number {
    return START_X + (Math.min(pos, TRACK_LENGTH) / TRACK_LENGTH) * (FINISH_X - START_X);
}

function chooseScreen() {
    app.innerHTML = "";
    app.appendChild(el("h1", "", "🤖 Robomots 🏁"));
    const track = el("div", "track");
    ROBOTS.forEach(r => track.appendChild(makeLane(r, false).lane));
    app.appendChild(track);
    const card = el("div", "card");
    card.appendChild(el("div", "", "Choisis ton robot :"));
    const choices = el("div", "choices");
    let selected = 0;
    const nodes = ROBOTS.map((r, i) => {
        const c = el("div", "choice" + (i === 0 ? " selected" : ""));
        c.append(el("div", "emoji", r.emoji), el("strong", "", r.name), el("small", "", r.description));
        c.onclick = () => {
            selected = i;
            nodes.forEach((n, k) => n.classList.toggle("selected", k === i));
        };
        choices.appendChild(c);
        return c;
    });
    card.appendChild(choices);
    const go = el("button", "", "Go !");
    go.style.marginTop = "12px";
    go.onclick = () => { ensureAudio(); startRace(selected); };
    card.appendChild(go);
    app.appendChild(card);
}

// ---------- Race ----------

function startRace(playerIdx: number) {
    app.innerHTML = "";
    app.appendChild(el("h1", "", "🤖 Robomots 🏁"));
    const track = el("div", "track");
    app.appendChild(track);

    const maxSpeed = Math.max(0.05, 0.2 + 0.1 * difficulty); // track units per second
    const fastest = Math.floor(Math.random() * ROBOTS.length);
    const speeds = ROBOTS.map((_, i) => i === fastest ? maxSpeed : maxSpeed * (0.5 + Math.random() * 0.4));
    const pos = ROBOTS.map(() => 0);
    const nodes = ROBOTS.map((r, i) => {
        const m = makeLane(r, i === playerIdx);
        track.appendChild(m.lane);
        return m.node;
    });
    const player = ROBOTS[playerIdx];
    const playerNode = nodes[playerIdx];
    let winner = -1;
    let animating = false;
    let last = performance.now();

    function render() {
        nodes.forEach((n, i) => { n.style.left = posToLeft(pos[i]) + "%"; });
    }

    function checkWinner() {
        if (winner >= 0) return;
        const idx = pos.findIndex(p => p >= TRACK_LENGTH);
        if (idx >= 0) { winner = idx; finish(); }
    }

    function tick(now: number) {
        if (winner >= 0) return;
        const dt = (now - last) / 1000;
        last = now;
        ROBOTS.forEach((_, i) => { if (i !== playerIdx) pos[i] += speeds[i] * dt; });
        render();
        checkWinner();
        requestAnimationFrame(tick);
    }

    // Steps the player forward, stopping early if the race ends.
    function stepForward(amount: number): Promise<void> {
        return new Promise(resolve => {
            const from = pos[playerIdx];
            const to = from + amount;
            const duration = 400 + amount * 40;
            const t0 = performance.now();
            animating = true;
            function f(now: number) {
                if (winner >= 0) { animating = false; resolve(); return; }
                const t = Math.min(1, (now - t0) / duration);
                pos[playerIdx] = from + (to - from) * t;
                playerNode.style.transform = `translateX(-50%) translateY(${-Math.abs(Math.sin(t * Math.PI * Math.max(1, amount / 4))) * 8}px)`;
                render();
                checkWinner();
                if (t < 1) requestAnimationFrame(f);
                else { animating = false; playerNode.style.transform = ""; resolve(); }
            }
            requestAnimationFrame(f);
        });
    }

    // Word loop
    const panel = el("div", "card");
    app.appendChild(panel);
    let pool: string[] = [];

    function nextWord(): string {
        if (pool.length === 0) pool = shuffle(words);
        return pool.pop()!;
    }

    function finish() {
        const won = winner === playerIdx;
        panel.innerHTML = "";
        if (won) { sounds.win(); confetti(); } else sounds.lose();
        panel.appendChild(el("div", "big", won
            ? `🎉 Bravo ! Tu as gagné la course ! 🎉`
            : `${ROBOTS[winner].emoji} ${ROBOTS[winner].name} a gagné la course.`));
        panel.appendChild(el("p", "big", `Niveau de difficulté : ${difficulty}`));
        const newDiff = won ? difficulty + 1 : difficulty - 1;
        panel.appendChild(el("p", "big", won
            ? `Veux-tu rejouer avec un niveau plus difficile (${newDiff}) ?`
            : `Veux-tu rejouer avec un niveau plus facile (${newDiff}) ?`));
        const yes = el("button", "", "Oui, rejouer !");
        yes.onclick = () => { difficulty = newDiff; chooseScreen(); };
        const same = el("button", "secondary", `Même niveau (${difficulty})`);
        same.style.marginLeft = "8px";
        same.onclick = () => chooseScreen();
        const menu = el("button", "secondary", "Changer les mots");
        menu.style.marginLeft = "8px";
        menu.onclick = () => { difficulty = newDiff; setupScreen(); };
        const wrap = el("div", "big");
        wrap.append(yes, same, menu);
        panel.appendChild(wrap);
    }

    function askWord() {
        if (winner >= 0) return;
        const entry = parseEntry(nextWord());
        const word = entry.word;
        panel.innerHTML = "";
        panel.appendChild(el("div", "", "Écoute le mot et écris-le :"));
        const again = el("button", "secondary", "🔊 Répéter");
        again.onclick = () => speak(entry.spoken);
        panel.appendChild(again);
        const row = el("div", "row");
        const input = el("input");
        input.type = "text";
        input.autocomplete = "off";
        input.setAttribute("autocapitalize", "off");
        input.setAttribute("autocorrect", "off");
        input.spellcheck = false;
        const ok = el("button", "", "Go !");
        row.append(input, ok);
        panel.appendChild(row);
        let submitted = false;
        const submit = () => {
            if (submitted) return;
            submitted = true;
            ok.disabled = true; input.disabled = true;
            ensureAudio();
            handleAnswer(word, input.value);
        };
        ok.onclick = submit;
        input.onkeydown = e => { if (e.key === "Enter") submit(); };
        speak(entry.spoken);
        input.focus();
    }

    function renderLetters(chars: string[], ops: Op[], cls: string, marked: Op[]): HTMLElement {
        const d = el("div", "word");
        chars.forEach((c, i) => {
            const s = el("span", marked.indexOf(ops[i]) >= 0 ? cls : "", c);
            d.appendChild(s);
        });
        return d;
    }

    async function handleAnswer(word: string, answer: string) {
        const typed = Array.from(normalize(answer));
        const correct = Array.from(normalize(word));
        const { typedOps, correctOps, distance } = diff(typed, correct);
        const isCorrect = distance === 0;
        let bonusApplies = false;
        let advance = 0;
        panel.innerHTML = "";

        if (isCorrect) {
            panel.appendChild(el("div", "big", "✅ " + word));
            sounds.fast();
            playerNode.classList.add("white");
            advance = player.baseSpeed;
        } else {
            panel.appendChild(el("div", "", "Ton écriture :"));
            panel.appendChild(renderLetters(typed, typedOps, "del", ["delete", "replace"]));
            panel.appendChild(el("div", "", "Bonne écriture :"));
            panel.appendChild(renderLetters(correct, correctOps, "add", ["insert", "replace"]));
            advance = player.baseSpeed - distance;
            if (advance > 0) {
                sounds.slow();
            } else {
                sounds.error();
                playerNode.classList.add("flicker");
                await sleep(1100);
                playerNode.classList.remove("flicker");
            }
        }

        if (advance > 0) await stepForward(advance);
        playerNode.classList.remove("white");

        if (isCorrect && winner < 0) {
            const bonus = player.bonusFor(word);
            bonusApplies = bonus.amount > 0;
            if (bonusApplies) {
                sounds.boost();
                playerNode.classList.add("yellow");
                const d = el("div", "word");
                correct.forEach((c, i) => d.appendChild(el("span", bonus.indices.indexOf(i) >= 0 ? "bonus" : "", c)));
                panel.appendChild(el("div", "", `Bonus : ${player.bonusLabel} !`));
                panel.appendChild(d);
                await stepForward(bonus.amount);
                playerNode.classList.remove("yellow");
            }
        }
        if (winner >= 0) return;
        await sleep(isCorrect ? 400 : 2500);
        askWord();
    }

    render();
    requestAnimationFrame(t => { last = t; tick(t); });
    askWord();
}

setupScreen();
