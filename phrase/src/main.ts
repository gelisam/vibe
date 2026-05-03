// ===== Confetti System =====

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  isRect: boolean;
}

const CONFETTI_COLORS = [
  '#ff4444', '#ff9900', '#ffff00',
  '#00cc44', '#0088ff', '#cc44ff', '#ff44cc',
];

let confettiCanvas: HTMLCanvasElement | null = null;
let confettiCtx: CanvasRenderingContext2D | null = null;
let confettiParticles: Particle[] = [];
let confettiAnimId: number | null = null;

function getOrCreateConfettiCanvas(): void {
  if (!confettiCanvas) {
    confettiCanvas = document.createElement('canvas');
    confettiCanvas.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(confettiCanvas);
    window.addEventListener('resize', () => {
      if (confettiCanvas) {
        confettiCanvas.width  = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
      }
    });
  }
  confettiCanvas.width  = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  confettiCtx = confettiCanvas.getContext('2d');
}

function spawnConfetti(count: number): void {
  getOrCreateConfettiCanvas();
  for (let i = 0; i < count; i++) {
    confettiParticles.push({
      x:             Math.random() * window.innerWidth,
      y:             -20 - Math.random() * 40,
      vx:            (Math.random() - 0.5) * 5,
      vy:            2 + Math.random() * 4,
      color:         CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size:          6 + Math.random() * 8,
      rotation:      Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.15,
      isRect:        Math.random() > 0.4,
    });
  }
  if (confettiAnimId === null) {
    confettiAnimId = requestAnimationFrame(tickConfetti);
  }
}

function tickConfetti(): void {
  const canvas = confettiCanvas;
  const ctx    = confettiCtx;
  if (!canvas || !ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  confettiParticles = confettiParticles.filter(p => p.y < canvas.height + 30);

  for (const p of confettiParticles) {
    p.vy += 0.08;
    p.x  += p.vx;
    p.y  += p.vy;
    p.rotation += p.rotationSpeed;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    if (p.isRect) {
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size / 2, p.size / 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (confettiParticles.length > 0) {
    confettiAnimId = requestAnimationFrame(tickConfetti);
  } else {
    confettiAnimId = null;
  }
}

// ===== Word Completion Logic =====

// Returns the number of words that form a correct, fully-typed prefix of target.
// A non-last word is "completed" when its trailing space has also been correctly typed.
// The last word is "completed" when all its characters have been correctly typed.
function countCompletedWords(target: string, typed: string): number {
  // Length of the longest common prefix between target and typed.
  let prefixLen = 0;
  while (
    prefixLen < typed.length &&
    prefixLen < target.length &&
    typed[prefixLen] === target[prefixLen]
  ) {
    prefixLen++;
  }

  const words = target.split(' ');
  let count = 0;
  let pos   = 0;

  for (let w = 0; w < words.length; w++) {
    const wordEnd    = pos + words[w].length;
    const isLastWord = w === words.length - 1;

    if (isLastWord) {
      if (prefixLen >= wordEnd) count++;
    } else {
      if (prefixLen > wordEnd) {
        count++;
        pos = wordEnd + 1;
      } else {
        break;
      }
    }
  }

  return count;
}

// ===== On-Screen Keyboard =====

function buildOnScreenKeyboard(inputEl: HTMLInputElement): HTMLDivElement {
  type KbMode = 'lower' | 'upper' | 'accents';
  let kbMode: KbMode = 'lower';

  const LAYOUTS: Record<KbMode, string[][]> = {
    lower: [
      ['a','z','e','r','t','y','u','i','o','p'],
      ['q','s','d','f','g','h','j','k','l','m'],
      ['SHIFT','w','x','c','v','b','n','BACK'],
      ['ACCENTS','SPACE'],
    ],
    upper: [
      ['A','Z','E','R','T','Y','U','I','O','P'],
      ['Q','S','D','F','G','H','J','K','L','M'],
      ['SHIFT','W','X','C','V','B','N','BACK'],
      ['ACCENTS','SPACE'],
    ],
    accents: [
      ['à','â','ä','é','è','ê','ë','î','ï','ô'],
      ['ù','û','ü','ç','œ','æ','À','É','È','Ç'],
      ['!','?','.',',','\'','«','»','-','BACK'],
      ['ABC','SPACE'],
    ],
  };

  const KEY_LABEL: Partial<Record<string, string>> = {
    SHIFT:   '⇧',
    BACK:    '⌫',
    ACCENTS: '&123',
    ABC:     'abc',
    SPACE:   'espace',
  };

  const kbEl = document.createElement('div');
  kbEl.className = 'onscreen-kb';

  function render(): void {
    kbEl.innerHTML = '';
    for (const row of LAYOUTS[kbMode]) {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      for (const key of row) {
        const btn = document.createElement('button');
        btn.type        = 'button';
        btn.textContent = KEY_LABEL[key] ?? key;

        let cls = 'kb-key';
        if (['SHIFT','BACK','ACCENTS','ABC'].includes(key)) cls += ' kb-key-modifier';
        if (key === 'SPACE')                                cls += ' kb-key-space';
        if (key === 'SHIFT' && kbMode === 'upper')         cls += ' kb-key-active';
        btn.className = cls;

        // Prevent the button tap from stealing focus from the input.
        btn.addEventListener('pointerdown', (e) => e.preventDefault());

        btn.addEventListener('click', () => {
          inputEl.focus();
          if (key === 'SHIFT') {
            kbMode = kbMode === 'upper' ? 'lower' : 'upper';
            render();
          } else if (key === 'ACCENTS') {
            kbMode = 'accents';
            render();
          } else if (key === 'ABC') {
            kbMode = 'lower';
            render();
          } else if (key === 'BACK') {
            // Always delete the last character. This game model expects
            // sequential typing, so the effective cursor is always at the end.
            if (inputEl.value.length > 0) {
              inputEl.value = inputEl.value.slice(0, -1);
              inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } else if (key === 'SPACE') {
            if (inputEl.value.length < inputEl.maxLength) {
              inputEl.value += ' ';
              inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } else {
            if (inputEl.value.length < inputEl.maxLength) {
              inputEl.value += key;
              inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // One-shot shift: revert to lowercase after each capital letter.
            if (kbMode === 'upper') {
              kbMode = 'lower';
              render();
            }
          }
        });

        rowEl.appendChild(btn);
      }
      kbEl.appendChild(rowEl);
    }
  }

  render();
  return kbEl;
}

// ===== Phase 2: Child types the sentence =====

function showTypingPhase(target: string): void {
  if (confettiCanvas) {
    confettiCanvas.remove();
    confettiCanvas = null;
  }
  confettiCtx = null;
  confettiParticles = [];
  if (confettiAnimId !== null) {
    cancelAnimationFrame(confettiAnimId);
    confettiAnimId = null;
  }

  const container = document.createElement('div');
  container.className = 'container';
  container.innerHTML = `
    <h2 class="prompt">À toi de jouer !<br>Recopie la phrase :</h2>
    <div id="target-chars" class="char-display" aria-label="Phrase cible" aria-live="polite"></div>
    <input
      id="typing-input"
      type="text"
      class="typing-input"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="none"
      spellcheck="false"
      inputmode="none"
      placeholder="Tape ici…"
    />
    <p id="success-msg" class="success-msg hidden">🎉 Bravo ! Tu as tout bien écrit !</p>
    <button id="retry-btn" class="retry-btn hidden">Réessayer</button>
  `;

  document.body.innerHTML = '';
  document.body.style.paddingBottom = '220px'; // reserve space for the ~200px on-screen keyboard
  document.body.appendChild(container);

  const charsEl    = document.getElementById('target-chars')!;
  const inputEl    = document.getElementById('typing-input') as HTMLInputElement;
  const successMsg = document.getElementById('success-msg')!;
  const retryBtn   = document.getElementById('retry-btn')!;

  const kbEl = buildOnScreenKeyboard(inputEl);
  document.body.appendChild(kbEl);

  inputEl.maxLength = target.length;

  // Returns the start index (inclusive) of the word that contains position pos.
  function wordStartAt(pos: number): number {
    let s = pos;
    while (s > 0 && target[s - 1] !== ' ') s--;
    return s;
  }

  // Returns the end index (exclusive) of the word that contains position pos.
  function wordEndAt(pos: number): number {
    let e = pos;
    while (e < target.length && target[e] !== ' ') e++;
    return e;
  }

  let celebratedWordCount = 0;
  let celebratedFull      = false;
  // Per-word mistake tracking (declared before renderChars is first called).
  let mistakeCount    = 0;
  let prevWordStart   = 0;  // will be set after wordStartAt is defined
  let prevTypedLength = 0;

  function renderChars(typed: string): void {
    charsEl.innerHTML = '';
    const cursorPos = typed.length;

    // Determine hint range: reveal current word in grey only after 10 mistakes.
    let hintStart = -1;
    let hintEnd   = -1;
    if (
      mistakeCount >= 10 &&
      cursorPos < target.length &&
      target[cursorPos] !== ' '
    ) {
      hintStart = wordStartAt(cursorPos);
      hintEnd   = wordEndAt(cursorPos);
    }

    for (let i = 0; i < target.length; i++) {
      const span = document.createElement('span');
      const ch   = target[i];
      span.textContent = ch === ' ' ? '\u00A0' : ch;
      span.className   = 'char';

      if (i < typed.length) {
        span.classList.add(typed[i] === ch ? 'correct' : 'incorrect');
      } else if (i === cursorPos) {
        // Always show the cursor indicator; reveal char text only when hinting.
        span.classList.add('cursor');
        if (i >= hintStart && i < hintEnd) {
          span.classList.add('pending');
        } else {
          span.classList.add('char-hidden');
        }
      } else {
        // Pending: show grey for current-word hint, transparent otherwise.
        if (i >= hintStart && i < hintEnd) {
          span.classList.add('pending');
        } else {
          span.classList.add('char-hidden');
        }
      }
      charsEl.appendChild(span);
    }
  }

  renderChars('');
  inputEl.focus();
  prevWordStart = wordStartAt(0);

  inputEl.addEventListener('input', () => {
    const typed     = inputEl.value;
    const cursorPos = typed.length;

    // When the cursor moves into a different word, reset the mistake counter.
    // Use target.length as the sentinel when the cursor is at or past the end.
    const wsNow = cursorPos < target.length ? wordStartAt(cursorPos) : target.length;
    if (wsNow !== prevWordStart) {
      mistakeCount  = 0;
      prevWordStart = wsNow;
    }

    // Count newly added wrong keystrokes.
    if (typed.length > prevTypedLength) {
      for (let i = prevTypedLength; i < typed.length; i++) {
        if (i < target.length && typed[i] !== target[i]) {
          mistakeCount++;
        }
      }
    }
    prevTypedLength = typed.length;

    renderChars(typed);

    // Full sentence correct
    if (typed === target && !celebratedFull) {
      celebratedFull = true;
      inputEl.disabled = true;
      successMsg.classList.remove('hidden');
      retryBtn.classList.remove('hidden');
      kbEl.remove();
      document.body.style.paddingBottom = '';
      spawnConfetti(280);
      return;
    }

    const completedNow = countCompletedWords(target, typed);

    // Allow re-celebration if the child backtracks past a word boundary
    if (completedNow < celebratedWordCount) {
      celebratedWordCount = completedNow;
    }

    if (completedNow > celebratedWordCount) {
      const gained = completedNow - celebratedWordCount;
      celebratedWordCount = completedNow;
      spawnConfetti(gained * 25);
    }
  });

  retryBtn.addEventListener('click', () => {
    showTypingPhase(target);
  });
}

// ===== Phase 1: Teacher enters the sentence =====

function showSetupPhase(): void {
  const container = document.createElement('div');
  container.className = 'container';
  container.innerHTML = `
    <h1 class="title">Dictée interactive</h1>
    <p class="instructions">Entrez la phrase que l'enfant devra recopier&nbsp;:</p>
    <textarea
      id="sentence-input"
      class="sentence-input"
      rows="4"
      placeholder="Ex : Le chat boit du lait."
    ></textarea>
    <button id="start-btn" class="start-btn">C'est parti !</button>
  `;

  document.body.innerHTML = '';
  document.body.style.paddingBottom = '';
  document.body.appendChild(container);

  const btn      = document.getElementById('start-btn') as HTMLButtonElement;
  const textarea = document.getElementById('sentence-input') as HTMLTextAreaElement;

  btn.addEventListener('click', () => {
    // Normalize whitespace so countCompletedWords works reliably
    const sentence = textarea.value.trim().replace(/\s+/g, ' ');
    if (sentence.length > 0) {
      showTypingPhase(sentence);
    } else {
      textarea.classList.add('error');
      textarea.focus();
    }
  });

  textarea.addEventListener('input', () => {
    textarea.classList.remove('error');
  });

  textarea.focus();
}

// ===== Entry point =====
showSetupPhase();
