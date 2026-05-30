/* =============================================================
   RETRO WEB GAME COLLECTION — GAME ENGINE
   File    : game.js
   Dibuat  : Vanilla JavaScript (NO external libraries)
   Berisi  : 1) Web Audio Engine (Retro SFX Synthesizer)
             2) Scene / State Manager
             3) Game A: 2D Platformer Engine (3 Level)
             4) Game B: Pseudo-3D Raycasting Engine
   ============================================================= */


/* ==============================================================
   BAGIAN 1: WEB AUDIO ENGINE — RETRO SFX SYNTHESIZER
   Menggunakan Web Audio API OscillatorNode untuk menghasilkan
   suara bip-bop retro secara sintetis, tanpa file .mp3 eksternal.
   AudioContext di-resume HANYA setelah user klik (Autoplay Policy).
   ============================================================== */

let audioCtx = null; // AudioContext dibuat saat dibutuhkan pertama kali

/**
 * Mendapatkan AudioContext, atau membuat baru jika belum ada.
 * Dipanggil dari dalam fungsi playSound agar AudioContext
 * selalu dibuat sebagai respons dari user gesture (klik tombol).
 */
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Jika browser meng-suspend AudioContext karena kebijakan autoplay,
  // resume-kan setelah ada gesture dari user.
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Memainkan nada sintetis retro menggunakan OscillatorNode.
 * @param {number} freq         - Frekuensi dasar nada (Hz)
 * @param {number} duration     - Durasi suara (detik)
 * @param {string} type         - Tipe gelombang: 'square', 'sawtooth', 'sine', 'triangle'
 * @param {number} [freqEnd]    - Frekuensi akhir (untuk efek pitch slide)
 * @param {number} [vol=0.15]   - Volume (0.0 - 1.0)
 */
function playSound(freq, duration, type = 'square', freqEnd = null, vol = 0.15) {
  try {
    const ctx = getAudioCtx();
    const oscillator = ctx.createOscillator();
    const gainNode   = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

    // Jika ada freqEnd, buat slide frekuensi (pitch sweep)
    if (freqEnd !== null) {
      oscillator.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + duration);
    }

    // Envelope: Attack singkat, decay alami
    gainNode.gain.setValueAtTime(vol, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    // Abaikan error audio agar tidak mengganggu gameplay
  }
}

/** SFX Preset: Suara lompat (Game 2D) */
function sfxJump()    { playSound(220, 0.15, 'square', 440); }

/** SFX Preset: Suara mengambil koin / collectible */
function sfxCollect() {
  playSound(440, 0.08, 'square');
  setTimeout(() => playSound(660, 0.08, 'square'), 80);
  setTimeout(() => playSound(880, 0.12, 'square'), 160);
}

/** SFX Preset: Suara player terkena musuh / respawn */
function sfxHit()     { playSound(200, 0.3, 'sawtooth', 50); }

/** SFX Preset: Suara menang */
function sfxWin() {
  const notes = [262, 330, 392, 523, 659, 784];
  notes.forEach((n, i) => setTimeout(() => playSound(n, 0.2, 'square'), i * 100));
}

/** SFX Preset: Suara kalah */
function sfxLose() {
  const notes = [330, 294, 262, 220, 196, 165];
  notes.forEach((n, i) => setTimeout(() => playSound(n, 0.2, 'sawtooth'), i * 100));
}

/** SFX Preset: Suara klik tombol menu */
function sfxClick()   { playSound(660, 0.05, 'square'); }

/** SFX Preset: Suara naik level */
function sfxLevelUp() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => setTimeout(() => playSound(n, 0.15, 'square'), i * 80));
}


/* ==============================================================
   BAGIAN 2: SCENE / STATE MANAGER
   Mengontrol transisi antar tiga state utama:
   - 'menu'   : Main Menu (Scene 0)
   - 'game'   : Gameplay aktif (Scene 1)
   - 'result' : Win / Lose Screen (Scene 2)
   ============================================================== */

/** State Manager: menyimpan kondisi global aplikasi */
const App = {
  currentScene: 'menu',   // State awal: menu
  selectedGame: '2d',     // Game yang dipilih: '2d' atau '3d'
  animFrameId:  null,     // ID requestAnimationFrame untuk dibatalkan saat game berhenti
};

/**
 * Menampilkan scene yang ditentukan dan menyembunyikan yang lain.
 * @param {'menu'|'game'|'result'} sceneName
 */
function showScene(sceneName) {
  document.getElementById('scene-menu').classList.remove('active');
  document.getElementById('scene-game').classList.remove('active');
  document.getElementById('scene-result').classList.remove('active');

  document.getElementById('scene-' + sceneName).classList.add('active');
  App.currentScene = sceneName;
}

/**
 * Memilih game (dipanggil dari onclick kartu di HTML).
 * @param {'2d'|'3d'} gameType
 */
function selectGame(gameType) {
  sfxClick();
  App.selectedGame = gameType;

  // Update tampilan kartu yang dipilih
  document.getElementById('card-2d').classList.toggle('selected', gameType === '2d');
  document.getElementById('card-3d').classList.toggle('selected', gameType === '3d');
  document.getElementById('ind-2d').textContent = gameType === '2d' ? '▶ SELECTED ◀' : '';
  document.getElementById('ind-3d').textContent = gameType === '3d' ? '▶ SELECTED ◀' : '';
}

/** Memulai game yang dipilih (dipanggil tombol PLAY) */
function startGame() {
  sfxClick();
  getAudioCtx(); // Pastikan AudioContext aktif dari gesture ini

  // Hentikan loop game yang mungkin masih berjalan
  if (App.animFrameId) {
    cancelAnimationFrame(App.animFrameId);
    App.animFrameId = null;
  }
  // Hentikan timer game 3D jika ada
  if (game3D.timerInterval) {
    clearInterval(game3D.timerInterval);
    game3D.timerInterval = null;
  }

  showScene('game');

  if (App.selectedGame === '2d') {
    initGame2D(1); // Mulai dari level 1
  } else {
    initGame3D();
  }
}

/** Kembali ke main menu dari scene game atau result */
function returnToMenu() {
  sfxClick();
  // Hentikan semua game loop yang aktif
  if (App.animFrameId) {
    cancelAnimationFrame(App.animFrameId);
    App.animFrameId = null;
  }
  if (game3D.timerInterval) {
    clearInterval(game3D.timerInterval);
    game3D.timerInterval = null;
  }
  // Bersihkan event listener pointer lock jika game 3D
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  // Sembunyikan elemen khusus game
  document.getElementById('crosshair').style.display = 'none';
  document.getElementById('hud-timer-label').style.display = 'none';
  document.getElementById('hud-timer').style.display = 'none';
  document.getElementById('hud-level').style.display = 'none';

  showScene('menu');
  selectGame(App.selectedGame); // Re-highlight kartu yang dipilih
}

/** Retry game yang sama dari result screen */
function retryGame() {
  sfxClick();
  startGame();
}

/**
 * Menampilkan scene result (Win atau Lose).
 * @param {boolean} isWin  - true jika menang, false jika kalah
 * @param {number}  score  - Skor akhir pemain
 * @param {string}  [subtitle] - Pesan tambahan
 */
function showResult(isWin, score, subtitle = '') {
  if (isWin) {
    sfxWin();
    document.getElementById('result-icon').textContent = '🏆';
    document.getElementById('result-title').textContent = 'YOU WIN!';
    document.getElementById('result-title').className = 'result-title win';
  } else {
    sfxLose();
    document.getElementById('result-icon').textContent = '💀';
    document.getElementById('result-title').textContent = 'GAME OVER';
    document.getElementById('result-title').className = 'result-title lose';
  }
  document.getElementById('result-subtitle').textContent = subtitle;
  document.getElementById('result-score').textContent   = score;
  document.getElementById('result-score').style.color   = isWin ? 'var(--clr-primary)' : 'var(--clr-red)';

  // Hentikan game loop sebelum berganti scene
  if (App.animFrameId) {
    cancelAnimationFrame(App.animFrameId);
    App.animFrameId = null;
  }
  if (game3D.timerInterval) {
    clearInterval(game3D.timerInterval);
    game3D.timerInterval = null;
  }

  showScene('result');
}

// Inisialisasi: tampilkan menu dan pilih game 2D sebagai default
document.addEventListener('DOMContentLoaded', () => {
  showScene('menu');
  selectGame('2d');
});


/* ==============================================================
   BAGIAN 3: GAME A — 2D PLATFORMER "SYNCBOY ADVENTURE"
   Core Engine:
   - Physics:    Gravitasi buatan, AABB Collision Detection
   - Rendering:  Canvas 2D context
   - Game Loop:  requestAnimationFrame (target 60 FPS)
   - Levels:     3 level dengan kesulitan progresif
   ============================================================== */

/** Namespace untuk semua state dan logika Game 2D */
const game2D = {
  canvas:    null,
  ctx:       null,
  score:     0,       // Skor kumulatif dari semua level
  running:   false,
  currentLevel: 1,    // Level yang sedang dimainkan (1, 2, atau 3)

  // ── Konstanta Fisika ──
  GRAVITY:        0.45,   // Percepatan gravitasi per frame (piksel/frame²)
  JUMP_FORCE:    -11,     // Kecepatan awal vertikal saat lompat (negatif = ke atas)
  MOVE_SPEED:     3.5,    // Kecepatan horizontal player (piksel/frame)
  TILE:           32,     // Ukuran satu tile dalam piksel

  // ── Input State ──
  keys: {},

  // ── Objek Player ──
  player: null,

  // ── Data Level ──
  tilemap:    [],    // Array 2D tilemap level aktif
  coins:      [],    // Array koin yang ada di level
  enemies:    [],    // Array musuh (mendukung banyak musuh di level 2 & 3)
  portal:     null,  // Objek portal/bendera finish
  coinsNeeded: 8,    // Jumlah koin yang dibutuhkan untuk membuka portal

  // ── Dimensi World ──
  worldCols:   0,    // Jumlah kolom tilemap (dihitung dinamis dari lebar layar)
  worldRows:   0,    // Jumlah baris tilemap
  worldWidth:  0,    // Lebar dunia dalam piksel
  worldHeight: 0,    // Tinggi dunia dalam piksel
  cameraX:     0,    // Posisi kamera horizontal (untuk efek scrolling)

  // ── Tampilan Level Transition ──
  levelBanner: { active: false, timer: 0, text: '' },
};

/* ==============================================================
   DATA LEVEL 2D
   Setiap level didefinisikan dengan:
   - tilemap     : Array 2D grid (0=udara, 1=solid)
   - coinPos     : Array posisi koin [{col, row}] (row = baris ATAS platform)
   - enemies     : Array data musuh [{col, row, patrolMin, patrolMax, speed}]
   - portalCol   : Kolom posisi portal finish
   - coinsNeeded : Jumlah minimum koin untuk menang
   - label       : Nama level untuk banner

   PENTING — Desain Tilemap:
   - Semua peta 13 baris × 40 kolom (lebar cukup untuk scrolling)
   - Lantai dasar di baris 11 (row index 11), baris 12 adalah sub-tanah
   - Baris 0–9 adalah zona platform udara
   - Ruang lantai = ~55% tinggi layar agar fondasi terasa di tengah
   ============================================================== */

/**
 * Membangun tilemap dinamis berbasis lebar layar.
 * Kolom tilemap = Math.ceil(window.innerWidth / TILE) * 2 + ekstra
 * Ini memastikan lantai dasar selalu penuh memenuhi lebar viewport
 * ketika kamera di posisi awal maupun setelah scrolling.
 *
 * @param {number[][]} baseTemplate  - Template 13×N yang akan diulang/dipotong
 * @param {number}     targetCols    - Jumlah kolom yang diinginkan
 * @returns {number[][]}             - Tilemap final dengan lebar targetCols
 */
function buildTilemap(baseTemplate, targetCols) {
  const rows = baseTemplate.length;
  const result = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < targetCols; c++) {
      // Ambil dari template jika masih ada, jika tidak: isi 0 kecuali baris tanah
      if (c < baseTemplate[r].length) {
        row.push(baseTemplate[r][c]);
      } else {
        // Baris 11 ke bawah = tanah solid untuk memenuhi layar
        row.push(r >= 11 ? 1 : 0);
      }
    }
    result.push(row);
  }
  return result;
}

/* ─────────────────────────────────────────────────────────────
   LEVEL 1 — "Green Hills" (Mudah)
   Susunan: 13 baris × 40 kolom
   Platform: 3 ketinggian berbeda, musuh 1 (patroli lambat)
   Koin: 10 buah, 8 dibutuhkan
   ───────────────────────────────────────────────────────────── */
const LEVEL1_TEMPLATE = [
// 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 0
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 1
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 2
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 3 platform tinggi
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0], // row 4 platform tengah
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 5
  [0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0], // row 6 platform rendah
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 7
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 8 platform tengah panjang
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 9
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 10
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 11 LANTAI DASAR
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 12 sub-tanah
];

const LEVEL1_DATA = {
  template:    LEVEL1_TEMPLATE,
  label:       'LEVEL 1 — GREEN HILLS',
  coinsNeeded: 8,
  coinPos: [
    // Di atas lantai dasar (row 10 = satu baris di atas lantai row 11)
    {col:3, row:10}, {col:5, row:10}, {col:7, row:10},
    // Di atas platform tengah panjang (row 8 → koin di row 7)
    {col:9, row:7},  {col:11, row:7},
    // Di atas platform rendah kiri (row 6 → koin di row 5)
    {col:2, row:5},  {col:4, row:5},
    // Di atas platform tinggi kiri (row 3 → koin di row 2)
    {col:11, row:2},
    // Di atas platform tengah kanan (row 4 → koin di row 3)
    {col:17, row:3},
    // Di atas platform tengah kanan jauh (row 8 → row 7)
    {col:25, row:7},
  ],
  enemies: [
    // Musuh 1: patroli di atas platform tengah panjang (row 8)
    { col:9, row:7, patrolMin:8, patrolMax:13, speed:1.5 },
  ],
  portalCol: 38,   // Portal di ujung kanan tilemap
  portalRow: 9,    // Satu baris di atas lantai dasar
};

/* ─────────────────────────────────────────────────────────────
   LEVEL 2 — "Sky Factory" (Sedang)
   Susunan: 13 baris × 50 kolom (lebih panjang)
   Platform: banyak platform dengan celah, musuh 2 (lebih cepat)
   Koin: 12 buah, 10 dibutuhkan (semua tersebar di platform tinggi)
   ───────────────────────────────────────────────────────────── */
const LEVEL2_TEMPLATE = [
// 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 0
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 1
  [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0], // row 2 platform mini
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 3
  [0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], // row 4 platform zig-zag
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 5
  [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0], // row 6 platform pendek
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 7
  [0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0], // row 8 platform bata
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 9
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 10
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 11 LANTAI
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 12 sub
];

const LEVEL2_DATA = {
  template:    LEVEL2_TEMPLATE,
  label:       'LEVEL 2 — SKY FACTORY',
  coinsNeeded: 10,
  coinPos: [
    // Platform bata row 8 (koin di row 7)
    {col:1,  row:7}, {col:10, row:7}, {col:18, row:7},
    {col:25, row:7}, {col:33, row:7}, {col:41, row:7},
    // Platform zig-zag row 4 (koin di row 3)
    {col:2,  row:3}, {col:9,  row:3}, {col:20, row:3},
    {col:30, row:3}, {col:41, row:3},
    // Platform mini row 2 (koin di row 1)
    {col:4,  row:1},
  ],
  enemies: [
    // Musuh 1: platform bata kiri, lebih cepat dari level 1
    { col:1, row:7, patrolMin:1, patrolMax:4,   speed:2.2 },
    // Musuh 2: platform bata tengah
    { col:17, row:7, patrolMin:17, patrolMax:21, speed:2.5 },
  ],
  portalCol: 47,
  portalRow: 9,
};

/* ─────────────────────────────────────────────────────────────
   LEVEL 3 — "Danger Zone" (Sulit)
   Susunan: 13 baris × 55 kolom (level terpanjang)
   Platform: celah mematikan (jatuh = respawn), musuh 3 (cepat + zig-zag)
   Koin: 12 buah, semua 12 dibutuhkan (tidak ada toleransi)
   ───────────────────────────────────────────────────────────── */
const LEVEL3_TEMPLATE = [
// 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 0
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 1
  [0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0], // row 2 loncat pendek
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 3
  [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], // row 4 platform sedang
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 5
  [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0], // row 6 stepping stone
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 7
  [0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0], // row 8 platform bawah
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 9
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 10
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 11 LANTAI
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 12 sub
];

const LEVEL3_DATA = {
  template:    LEVEL3_TEMPLATE,
  label:       'LEVEL 3 — DANGER ZONE',
  coinsNeeded: 12,
  coinPos: [
    // Platform bawah row 8 (koin di row 7)
    {col:1,  row:7}, {col:9,  row:7}, {col:17, row:7},
    {col:25, row:7}, {col:33, row:7}, {col:41, row:7},
    // Platform sedang row 4 (koin di row 3)
    {col:5,  row:3}, {col:13, row:3}, {col:21, row:3},
    // Platform mini row 2 (koin di row 1) — paling susah dijangkau
    {col:2,  row:1}, {col:11, row:1}, {col:27, row:1},
  ],
  enemies: [
    // Musuh 1: platform bawah kiri (cepat)
    { col:1, row:7, patrolMin:1, patrolMax:3,   speed:3.0 },
    // Musuh 2: platform bawah tengah
    { col:17, row:7, patrolMin:17, patrolMax:20, speed:3.0 },
    // Musuh 3: platform bawah kanan (paling cepat)
    { col:33, row:7, patrolMin:33, patrolMax:36, speed:3.5 },
  ],
  portalCol: 52,
  portalRow: 9,
};

/** Array definisi semua level — diakses via indeks (level 1 = index 0) */
const ALL_LEVELS = [LEVEL1_DATA, LEVEL2_DATA, LEVEL3_DATA];

/**
 * Menginisialisasi dan memulai Game 2D pada level tertentu.
 * @param {number} levelNum - Level yang ingin dimainkan (1, 2, atau 3)
 */
function initGame2D(levelNum) {
  const g        = game2D;
  g.canvas       = document.getElementById('gameCanvas');
  g.ctx          = g.canvas.getContext('2d');
  g.running      = true;
  g.keys         = {};
  g.currentLevel = levelNum;

  // Sembunyikan elemen khusus game 3D
  document.getElementById('crosshair').style.display        = 'none';
  document.getElementById('hud-timer-label').style.display  = 'none';
  document.getElementById('hud-timer').style.display        = 'none';
  document.getElementById('prompt-e').style.display         = 'none';

  // Tampilkan indikator level di HUD
  let levelHud = document.getElementById('hud-level');
  if (!levelHud) {
    // Buat elemen hud-level jika belum ada
    levelHud = document.createElement('div');
    levelHud.id = 'hud-level';
    levelHud.style.cssText = `
      position:fixed; top:0; left:50%; transform:translateX(-50%);
      height:44px; display:flex; align-items:center; gap:6px;
      font-family:'Press Start 2P',monospace; z-index:20;
    `;
    document.getElementById('game-hud').appendChild(levelHud);
  }
  levelHud.style.display = 'flex';
  levelHud.innerHTML = `
    <span style="font-size:0.65em;color:#5a5a8a;letter-spacing:2px">LEVEL</span>
    <span style="font-size:1.1em;color:#ffd700;text-shadow:0 0 8px #ffd700">${levelNum}/3</span>
  `;

  // ── Ukuran Canvas ──
  const HUD_H = 44;
  g.canvas.width  = window.innerWidth;
  g.canvas.height = window.innerHeight - HUD_H;
  g.canvas.style.marginTop = HUD_H + 'px';

  // ── Muat Data Level ──
  const levelData = ALL_LEVELS[levelNum - 1];
  g.coinsNeeded   = levelData.coinsNeeded;

  // Hitung jumlah kolom agar selalu memenuhi viewport
  // Minimal kolom = lebar layar / tile, maksimal = panjang template
  const minCols = Math.ceil(g.canvas.width / g.TILE) + 2;
  const targetCols = Math.max(minCols, levelData.template[0].length);

  // Bangun tilemap dengan lebar yang menjamin layar terisi penuh
  g.tilemap     = buildTilemap(levelData.template, targetCols);
  g.worldCols   = g.tilemap[0].length;
  g.worldRows   = g.tilemap.length;
  g.worldWidth  = g.worldCols  * g.TILE;
  g.worldHeight = g.worldRows  * g.TILE;

  // ── Inisialisasi Player ──
  // Posisi Y spawn = satu baris di atas lantai dasar (row 11)
  // Lantai dasar selalu di row 11 pada semua level kita
  const floorRow = 11;
  const spawnX   = g.TILE * 1;
  const spawnY   = (floorRow - 1) * g.TILE;

  g.player = {
    x:          spawnX,
    y:          spawnY,
    w:          24,          // Lebar hitbox
    h:          28,          // Tinggi hitbox
    vx:         0,
    vy:         0,
    onGround:   false,
    facing:     1,
    spawnX:     spawnX,
    spawnY:     spawnY,
    invincible: 0,
  };

  // ── Inisialisasi Koin ──
  g.coins = [];
  levelData.coinPos.forEach(pos => {
    g.coins.push({
      x:      pos.col * g.TILE + g.TILE / 2 - 8,
      y:      pos.row * g.TILE,
      w:      16, h: 16,
      active: true,
      pulse:  Math.random() * Math.PI * 2,
    });
  });

  // ── Inisialisasi Musuh ──
  // Level lebih tinggi = musuh lebih banyak dan lebih cepat
  g.enemies = [];
  levelData.enemies.forEach(ed => {
    // Kecepatan diberi bonus berdasarkan level agar makin sulit
    const speedBonus = (levelNum - 1) * 0.3;
    g.enemies.push({
      x:       ed.col * g.TILE,
      y:       ed.row * g.TILE,
      w:       24, h: 28,
      vx:      ed.speed + speedBonus,
      minX:    ed.patrolMin * g.TILE,
      maxX:    ed.patrolMax * g.TILE,
    });
  });

  // ── Inisialisasi Portal ──
  g.portal = {
    x:     levelData.portalCol * g.TILE,
    y:     levelData.portalRow * g.TILE,
    w:     28, h: 32,
    pulse: 0,
  };

  // ── Skor ──
  // Skor tidak direset saat naik level — skor kumulatif dari semua level
  if (levelNum === 1) g.score = 0;
  document.getElementById('hud-score').textContent = g.score;

  // ── Level Banner (pengumuman nama level) ──
  g.levelBanner = {
    active: true,
    timer:  180, // Tampil selama ~3 detik (180 frame @ 60fps)
    text:   levelData.label,
    color:  levelNum === 1 ? '#00ff88' : levelNum === 2 ? '#ffd700' : '#ff3355',
  };

  // ── Event Listener Keyboard ──
  window.removeEventListener('keydown', onKey2DDown); // Hapus dulu agar tidak dobel
  window.removeEventListener('keyup',   onKey2DUp);
  window.addEventListener('keydown', onKey2DDown);
  window.addEventListener('keyup',   onKey2DUp);

  // Mulai game loop
  loop2D();
}

/** Keyboard down handler untuk Game 2D */
function onKey2DDown(e) {
  game2D.keys[e.code] = true;
  // Lompat hanya jika player di atas tanah (tidak bisa double jump)
  if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') &&
       game2D.player.onGround) {
    game2D.player.vy = game2D.JUMP_FORCE; // Kecepatan awal lompat
    game2D.player.onGround = false;
    sfxJump();
  }
  // Cegah scroll halaman saat bermain
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
}

/** Keyboard up handler untuk Game 2D */
function onKey2DUp(e) {
  game2D.keys[e.code] = false;
}

/**
 * Membersihkan event listener Game 2D.
 * Dipanggil saat game berakhir / kembali ke menu.
 */
function cleanup2D() {
  window.removeEventListener('keydown', onKey2DDown);
  window.removeEventListener('keyup',   onKey2DUp);
  game2D.running = false;
}

/** Main Game Loop 2D — dipanggil setiap frame via requestAnimationFrame */
function loop2D() {
  if (!game2D.running) return;
  App.animFrameId = requestAnimationFrame(loop2D);

  update2D();
  render2D();
}

/**
 * UPDATE LOGIC 2D — Memperbarui semua state game setiap frame.
 * Urutan: Input → Fisika → Collision → AI Musuh → Collectible → Win Check
 */
function update2D() {
  const g = game2D;
  const p = g.player;
  const T = g.TILE;

  // ── Countdown Level Banner ──
  if (g.levelBanner.active) {
    g.levelBanner.timer--;
    if (g.levelBanner.timer <= 0) g.levelBanner.active = false;
  }

  // ── 1. Input Handling ──
  if (g.keys['KeyA'] || g.keys['ArrowLeft']) {
    p.vx     = -g.MOVE_SPEED;
    p.facing = -1;
  } else if (g.keys['KeyD'] || g.keys['ArrowRight']) {
    p.vx     = g.MOVE_SPEED;
    p.facing = 1;
  } else {
    // Gesekan (friction): perlambat secara alami saat tidak ada input
    p.vx *= 0.75;
    if (Math.abs(p.vx) < 0.1) p.vx = 0;
  }

  // ── 2. Physics: Terapkan Gravitasi ──
  // Gravitasi menambah kecepatan vertikal (vy positif = ke bawah di canvas)
  p.vy += g.GRAVITY;
  if (p.vy > 15) p.vy = 15; // Terminal velocity

  // ── 3. AABB Collision Detection & Resolution ──
  // Penting: cek sumbu Y dulu, baru sumbu X
  // Ini mencegah bug "corner catching" pada pojok platform.

  // === 3a. Resolusi Sumbu Y ===
  p.y += p.vy;
  p.onGround = false;

  const tilesY = getTilesAround(p.x, p.y, p.w, p.h, T, g.tilemap);
  for (const tile of tilesY) {
    if (!aabbOverlap(p, tile)) continue;
    if (p.vy > 0) {
      // Jatuh ke bawah → dorong ke atas permukaan tile
      p.y = tile.y - p.h;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy < 0) {
      // Lompat ke atas → kepala bentur bawah tile
      p.y = tile.y + tile.h;
      p.vy = 0;
    }
  }

  // === 3b. Resolusi Sumbu X ===
  p.x += p.vx;
  const tilesX = getTilesAround(p.x, p.y, p.w, p.h, T, g.tilemap);
  for (const tile of tilesX) {
    if (!aabbOverlap(p, tile)) continue;
    if (p.vx > 0) {
      p.x = tile.x - p.w;
      p.vx = 0;
    } else if (p.vx < 0) {
      p.x = tile.x + tile.w;
      p.vx = 0;
    }
  }

  // Batasi player dalam batas horizontal world
  if (p.x < 0) p.x = 0;
  if (p.x + p.w > g.worldWidth) p.x = g.worldWidth - p.w;

  // Jatuh ke bawah layar → respawn
  if (p.y > g.worldHeight + 50) {
    sfxHit();
    respawnPlayer();
    triggerScreenShake();
  }

  // ── 4. Camera Scrolling (Horizontal) ──
  // Kamera menjaga player di tengah layar secara horizontal
  const targetCam = p.x + p.w / 2 - g.canvas.width / 2;
  g.cameraX = Math.max(0, Math.min(targetCam, g.worldWidth - g.canvas.width));

  // ── 5. Collectible Logic ──
  g.coins.forEach(coin => {
    if (!coin.active) return;
    coin.pulse += 0.05; // Animasi mengambang
    if (aabbOverlap(p, coin)) {
      coin.active = false;
      g.score++;
      document.getElementById('hud-score').textContent = g.score;
      sfxCollect();
    }
  });

  // ── 6. Enemy AI — Patroli Otomatis ──
  g.enemies.forEach(en => {
    en.x += en.vx;
    if (en.x <= en.minX || en.x + en.w >= en.maxX) {
      en.vx *= -1; // Balik arah di batas patroli
    }

    // Deteksi tabrakan musuh dengan player
    if (p.invincible <= 0 && aabbOverlap(p, en)) {
      sfxHit();
      respawnPlayer();
      triggerScreenShake();
    }
  });

  // Hitung mundur timer invincibility
  if (p.invincible > 0) p.invincible--;

  // ── 7. Portal (Level Complete / Win) Check ──
  g.portal.pulse += 0.05;
  if (aabbOverlap(p, g.portal)) {
    const coinsInLevel   = g.coins.length;
    const coinsCollected = g.coins.filter(c => !c.active).length;

    if (coinsCollected >= g.coinsNeeded) {
      // Level selesai!
      if (g.currentLevel < 3) {
        // Ada level berikutnya → naik level
        cleanup2D();
        sfxLevelUp();

        // Jeda singkat sebelum memuat level berikutnya
        setTimeout(() => {
          initGame2D(g.currentLevel + 1);
        }, 800);
      } else {
        // Level 3 selesai → Game Clear!
        cleanup2D();
        showResult(true, g.score,
          `ALL 3 LEVELS CLEARED! TOTAL SCORE: ${g.score}`);
      }
    }
    // Jika belum cukup koin, portal tidak bisa dimasuki (tidak ada aksi)
  }
}

/**
 * Respawn player ke titik spawn awal level aktif.
 */
function respawnPlayer() {
  const p = game2D.player;
  p.x = p.spawnX;
  p.y = p.spawnY;
  p.vx = 0;
  p.vy = 0;
  p.invincible = 90; // ~1.5 detik invincibility
}

/**
 * Efek screen shake: tambahkan class CSS 'shake' ke canvas,
 * lalu hapus setelah animasi CSS selesai.
 */
function triggerScreenShake() {
  const canvas = game2D.canvas;
  canvas.classList.remove('shake');
  void canvas.offsetWidth; // Reflow trick untuk restart animasi
  canvas.classList.add('shake');
  setTimeout(() => canvas.classList.remove('shake'), 300);
}

/**
 * Mendapatkan semua tile solid di sekitar bounding box.
 * Dioptimasi: hanya cek tile di rentang kolom/baris yang relevan.
 * @returns {Array} Array objek {x, y, w, h}
 */
function getTilesAround(px, py, pw, ph, tileSize, tilemap) {
  const tiles    = [];
  const startCol = Math.max(0, Math.floor(px / tileSize));
  const endCol   = Math.min(tilemap[0].length - 1, Math.floor((px + pw) / tileSize) + 1);
  const startRow = Math.max(0, Math.floor(py / tileSize));
  const endRow   = Math.min(tilemap.length - 1, Math.floor((py + ph) / tileSize) + 1);

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (tilemap[row][col] === 1) {
        tiles.push({ x: col * tileSize, y: row * tileSize, w: tileSize, h: tileSize });
      }
    }
  }
  return tiles;
}

/**
 * AABB (Axis-Aligned Bounding Box) Overlap Check.
 * @param {Object} a - {x, y, w, h}
 * @param {Object} b - {x, y, w, h}
 * @returns {boolean}
 */
function aabbOverlap(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

/**
 * RENDER 2D — Menggambar semua elemen game ke canvas setiap frame.
 * Urutan render: Background → Tilemap → Portal → Koin → Musuh → Player → HUD
 */
function render2D() {
  const g   = game2D;
  const ctx = g.ctx;
  const T   = g.TILE;
  const W   = g.canvas.width;
  const H   = g.canvas.height;

  // Bersihkan canvas
  ctx.clearRect(0, 0, W, H);

  // ── Latar Belakang: Gradien Langit Retro (warna berbeda per level) ──
  const skyColors = [
    ['#0a0a2a', '#1a1a5a'],   // Level 1: biru-ungu
    ['#0a1a2a', '#1a3a5a'],   // Level 2: biru-baja
    ['#1a0a0a', '#3a1a1a'],   // Level 3: merah gelap
  ];
  const [skyTop, skyBot] = skyColors[g.currentLevel - 1] || skyColors[0];
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, skyTop);
  skyGrad.addColorStop(1, skyBot);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // Bintang/partikel latar
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 50; i++) {
    const sx = (i * 137 + 50) % W;
    const sy = (i * 97  + 20) % (H * 0.65);
    ctx.fillRect(sx, sy, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
  }

  // Terapkan transformasi kamera
  ctx.save();
  ctx.translate(-g.cameraX, 0);

  // ── Warna Platform per Level ──
  const platformColors = [
    { top:'#3a7a3a', body:'#2a5a2a', highlight:'#6aaa5a', side:'#4a8a4a' }, // Level 1: hijau
    { top:'#5a5a8a', body:'#3a3a6a', highlight:'#8a8aaa', side:'#5a5a9a' }, // Level 2: biru-abu
    { top:'#8a3a3a', body:'#6a2a2a', highlight:'#aa6a5a', side:'#8a4a4a' }, // Level 3: merah
  ];
  const pc = platformColors[g.currentLevel - 1] || platformColors[0];

  // ── Render Tilemap ──
  for (let row = 0; row < g.tilemap.length; row++) {
    for (let col = 0; col < g.tilemap[row].length; col++) {
      if (g.tilemap[row][col] !== 1) continue;

      const tx = col * T;
      const ty = row * T;
      const isTopEdge = row === 0 || g.tilemap[row-1][col] !== 1;

      ctx.fillStyle = isTopEdge ? pc.top : pc.body;
      ctx.fillRect(tx, ty, T, T);

      if (isTopEdge) {
        ctx.fillStyle = pc.highlight;
        ctx.fillRect(tx, ty, T, 3);
        ctx.fillStyle = pc.side;
        ctx.fillRect(tx, ty, 3, T);
      }

      // Grid line
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(tx, ty, T, T);
    }
  }

  // ── Render Portal (Finish Flag) ──
  const portal          = g.portal;
  const coinsCollected  = g.coins.filter(c => !c.active).length;
  const portalUnlocked  = coinsCollected >= g.coinsNeeded;
  const pulseFactor     = Math.sin(portal.pulse) * 4;

  // Tiang bendera
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(portal.x + portal.w / 2 - 2, portal.y, 4, portal.h);

  // Bendera
  ctx.fillStyle = portalUnlocked
    ? `hsl(${140 + Math.sin(portal.pulse) * 20}, 100%, 50%)`
    : '#555577';
  ctx.fillRect(portal.x + portal.w / 2 + 2, portal.y, 18, 12);

  if (portalUnlocked) {
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur  = 10 + pulseFactor;
    ctx.fillStyle   = 'rgba(0,255,136,0.12)';
    ctx.fillRect(portal.x - 4, portal.y - 4, portal.w + 8, portal.h + 8);
    ctx.shadowBlur  = 0;
  }

  // Label progres koin di atas portal
  ctx.fillStyle = portalUnlocked ? '#00ff88' : '#ffffff66';
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillText(
    portalUnlocked ? (g.currentLevel < 3 ? 'NEXT!' : 'WIN!') : `${coinsCollected}/${g.coinsNeeded}`,
    portal.x - 4, portal.y - 6
  );

  // ── Render Koin ──
  g.coins.forEach(coin => {
    if (!coin.active) return;
    const floatY = Math.sin(coin.pulse) * 3;
    const cx = coin.x + coin.w / 2;
    const cy = coin.y + coin.h / 2 + floatY;

    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle   = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#ffaa00';
    ctx.font = '10px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', cx, cy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });

  // ── Render Musuh (semua musuh dalam array) ──
  g.enemies.forEach((en, idx) => {
    // Warna musuh berbeda per level agar visual lebih beragam
    const enemyColors = ['#ff3355', '#ff8800', '#cc00ff'];
    const ec = enemyColors[(g.currentLevel - 1 + idx) % enemyColors.length];

    ctx.fillStyle = ec;
    ctx.fillRect(en.x, en.y, en.w, en.h);

    // Mata musuh (mengarah sesuai arah gerak)
    const eyeDir = en.vx > 0 ? en.w * 0.6 : en.w * 0.2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(en.x + eyeDir - 2, en.y + 6, 6, 6);
    ctx.fillStyle = '#000';
    ctx.fillRect(en.x + eyeDir, en.y + 8, 3, 3);

    // Antena musuh
    ctx.fillStyle = ec;
    ctx.fillRect(en.x + en.w / 2 - 1, en.y - 6, 2, 6);
    ctx.beginPath();
    ctx.arc(en.x + en.w / 2, en.y - 7, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── Render Player ──
  const p = g.player;
  const isVisible = p.invincible <= 0 || Math.floor(p.invincible / 5) % 2 === 0;

  if (isVisible) {
    ctx.save();
    if (p.facing === -1) {
      ctx.translate(p.x + p.w, p.y);
      ctx.scale(-1, 1);
      ctx.translate(-p.w, 0);
    } else {
      ctx.translate(p.x, p.y);
    }

    ctx.fillStyle = '#00ff88';
    ctx.fillRect(4, 8, 16, 16);   // Torso
    ctx.fillStyle = '#00cc66';
    ctx.fillRect(4, 0, 16, 10);   // Kepala
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 2, 5, 5);     // Mata
    ctx.fillStyle = '#000000';
    ctx.fillRect(9, 3, 3, 3);     // Pupil

    // Animasi berjalan (kaki)
    const legAnim = p.onGround && Math.abs(p.vx) > 0.5
      ? Math.sin(Date.now() * 0.015) * 3 : 0;
    ctx.fillStyle = '#008844';
    ctx.fillRect(4, 24, 7, 4 + legAnim);
    ctx.fillRect(13, 24, 7, 4 - legAnim);
    ctx.restore();
  }

  // Progres koin di atas player
  ctx.fillStyle = 'rgba(255,215,0,0.85)';
  ctx.font = '7px "Press Start 2P", monospace';
  ctx.fillText(`${g.coins.filter(c=>!c.active).length}/${g.coinsNeeded} ✦`, p.x - 4, p.y - 6);

  // Kembalikan transformasi kamera
  ctx.restore();

  // ── Level Banner (tampil di awal level selama 3 detik) ──
  if (g.levelBanner.active) {
    const alpha = Math.min(1, g.levelBanner.timer / 30); // Fade out di 30 frame terakhir
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, H / 2 - 36, W, 72);

    ctx.fillStyle = g.levelBanner.color || '#ffffff';
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(g.levelBanner.text, W / 2, H / 2 + 6);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ── HUD Kontrol di Bagian Bawah Canvas ──
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, H - 28, W, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '7px "Press Start 2P", monospace';
  ctx.fillText(
    `A/D: MOVE  |  SPACE: JUMP  |  REACH FLAG WITH ${g.coinsNeeded} COINS`,
    10, H - 9
  );
}


/* ==============================================================
   BAGIAN 4: GAME B — PSEUDO-3D RAYCASTER "TECH LAB ESCAPE"
   Core Engine:
   - Raycasting klasik (Wolfenstein 3D technique)
   - Canvas 2D untuk menampilkan ilusi perspektif 3D
   - FPS Controller dengan Math.cos / Math.sin
   - Sprite scaling 2D untuk objek (data chip)
   ============================================================== */

/** Namespace untuk semua state dan logika Game 3D */
const game3D = {
  canvas:    null,
  ctx:       null,
  score:     0,
  timeLeft:  60,
  timerInterval: null,
  running:   false,
  showPickupPrompt: false,
  keys3D:    {},

  // Konstanta Raycasting
  FOV:      Math.PI / 3,  // Field of View: 60 derajat (π/3 radian)
  NUM_RAYS: 0,            // Jumlah sinar = lebar canvas
  MAP_SIZE: 15,

  player: null,
  chips:  [],
};

/**
 * Peta Level 3D (15×15 grid).
 * 1 = dinding, 0 = ruang kosong
 */
const MAP_3D = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,0,1,0,1,1,1,0,1,0,1],
  [1,0,1,0,0,0,0,0,0,0,1,0,1,0,1],
  [1,0,1,0,1,1,1,1,1,0,1,0,0,0,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,1],
  [1,1,1,0,1,0,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,1,0,1],
  [1,0,1,1,1,0,1,0,1,1,0,1,1,0,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
  [1,1,1,0,1,1,1,0,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

/**
 * Menginisialisasi Game 3D.
 */
function initGame3D() {
  const g = game3D;
  g.canvas   = document.getElementById('gameCanvas');
  g.ctx      = g.canvas.getContext('2d');
  g.score    = 0;
  g.timeLeft = 60;
  g.running  = true;
  g.showPickupPrompt = false;
  g.keys3D   = {};

  document.getElementById('crosshair').style.display       = 'block';
  document.getElementById('hud-timer-label').style.display = 'flex';
  document.getElementById('hud-timer').style.display       = 'flex';
  document.getElementById('hud-timer').textContent         = g.timeLeft;
  document.getElementById('hud-timer').classList.remove('danger');
  const levelHud = document.getElementById('hud-level');
  if (levelHud) levelHud.style.display = 'none';

  const HUD_H = 44;
  g.canvas.width  = window.innerWidth;
  g.canvas.height = window.innerHeight - HUD_H;
  g.canvas.style.marginTop = HUD_H + 'px';
  g.NUM_RAYS = g.canvas.width;

  g.player = {
    x: 1.5, y: 1.5,
    angle: 0,
    speed: 0.06,
    rotSpeed: 0.04,
  };

  g.chips = [];
  const chipPositions = [
    {x:1.5, y:3.5}, {x:7.5, y:1.5}, {x:5.5, y:5.5},
    {x:12.5, y:7.5}, {x:7.5, y:11.5},
  ];
  chipPositions.forEach(pos => {
    g.chips.push({ x:pos.x, y:pos.y, active:true });
  });

  document.getElementById('hud-score').textContent = g.score;

  // Timer countdown
  g.timerInterval = setInterval(() => {
    if (!g.running) { clearInterval(g.timerInterval); return; }
    g.timeLeft--;
    const timerEl = document.getElementById('hud-timer');
    timerEl.textContent = g.timeLeft;
    if (g.timeLeft <= 10) timerEl.classList.add('danger');
    if (g.timeLeft <= 0) {
      cleanup3D();
      showResult(false, g.score, "TIME'S UP! MISSION FAILED.");
    }
  }, 1000);

  window.removeEventListener('keydown', onKey3DDown);
  window.removeEventListener('keyup',   onKey3DUp);
  window.addEventListener('keydown', onKey3DDown);
  window.addEventListener('keyup',   onKey3DUp);

  loop3D();
}

function onKey3DDown(e) {
  game3D.keys3D[e.code] = true;
  if (e.code === 'KeyE' && game3D.showPickupPrompt) tryPickupChip();
}

function onKey3DUp(e) {
  game3D.keys3D[e.code] = false;
}

function cleanup3D() {
  window.removeEventListener('keydown', onKey3DDown);
  window.removeEventListener('keyup',   onKey3DUp);
  game3D.running = false;
  document.getElementById('prompt-e').style.display = 'none';
}

function loop3D() {
  if (!game3D.running) return;
  App.animFrameId = requestAnimationFrame(loop3D);
  update3D();
  render3D();
}

/**
 * UPDATE LOGIC 3D — FPS Controller + Pickup Detection
 */
function update3D() {
  const g    = game3D;
  const p    = g.player;
  const keys = g.keys3D;

  // W/S: Maju/Mundur menggunakan vektor arah cos/sin dari sudut pandang
  // Posisi baru = posisi lama ± cos(θ)/sin(θ) × kecepatan
  if (keys['KeyW'] || keys['ArrowUp']) {
    const nx = p.x + Math.cos(p.angle) * p.speed;
    const ny = p.y + Math.sin(p.angle) * p.speed;
    // Anti-wall collision: cek grid sebelum update posisi
    if (MAP_3D[Math.floor(ny)][Math.floor(p.x)] !== 1) p.y = ny;
    if (MAP_3D[Math.floor(p.y)][Math.floor(nx)] !== 1) p.x = nx;
  }
  if (keys['KeyS'] || keys['ArrowDown']) {
    const nx = p.x - Math.cos(p.angle) * p.speed;
    const ny = p.y - Math.sin(p.angle) * p.speed;
    if (MAP_3D[Math.floor(ny)][Math.floor(p.x)] !== 1) p.y = ny;
    if (MAP_3D[Math.floor(p.y)][Math.floor(nx)] !== 1) p.x = nx;
  }
  // A/D: Rotasi sudut pandang
  if (keys['KeyA'] || keys['ArrowLeft'])  p.angle -= p.rotSpeed;
  if (keys['KeyD'] || keys['ArrowRight']) p.angle += p.rotSpeed;

  // Cek kedekatan chip
  let nearChip = false;
  g.chips.forEach(chip => {
    if (!chip.active) return;
    const dist = Math.hypot(chip.x - p.x, chip.y - p.y);
    if (dist < 1.0) nearChip = true;
  });
  g.showPickupPrompt = nearChip;
  document.getElementById('prompt-e').style.display = nearChip ? 'block' : 'none';
}

function tryPickupChip() {
  const g = game3D;
  const p = g.player;
  g.chips.forEach(chip => {
    if (!chip.active) return;
    if (Math.hypot(chip.x - p.x, chip.y - p.y) < 1.0) {
      chip.active = false;
      g.score++;
      document.getElementById('hud-score').textContent = g.score;
      sfxCollect();
      if (g.score >= 5) {
        cleanup3D();
        showResult(true, g.score, `ESCAPED IN ${60 - g.timeLeft}s! ALL DATA SECURED!`);
      }
    }
  });
}

/**
 * RENDER 3D — Raycasting + Sprite Scaling + Minimap
 * Algoritma DDA (Digital Differential Analyzer) digunakan
 * untuk menemukan dinding pada grid 2D secara efisien.
 */
function render3D() {
  const g   = game3D;
  const ctx = g.ctx;
  const W   = g.canvas.width;
  const H   = g.canvas.height;
  const p   = g.player;

  // Langit-langit dan lantai
  const ceilGrad = ctx.createLinearGradient(0, 0, 0, H / 2);
  ceilGrad.addColorStop(0, '#050510');
  ceilGrad.addColorStop(1, '#0a0a20');
  ctx.fillStyle = ceilGrad;
  ctx.fillRect(0, 0, W, H / 2);

  const floorGrad = ctx.createLinearGradient(0, H / 2, 0, H);
  floorGrad.addColorStop(0, '#0a0a18');
  floorGrad.addColorStop(1, '#050510');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, H / 2, W, H / 2);

  const zBuffer = new Float32Array(W);

  // ── Raycasting: satu sinar per kolom piksel ──
  for (let col = 0; col < W; col++) {
    // Sudut sinar: didistribusikan dalam rentang FOV
    const rayAngle = p.angle + (col / W - 0.5) * g.FOV;
    const rayDirX  = Math.cos(rayAngle);
    const rayDirY  = Math.sin(rayAngle);

    let mapX = Math.floor(p.x);
    let mapY = Math.floor(p.y);

    // deltaDist: jarak per unit grid pada masing-masing sumbu
    const deltaDistX = Math.abs(1 / (rayDirX || 1e-10));
    const deltaDistY = Math.abs(1 / (rayDirY || 1e-10));

    let sideDistX, sideDistY, stepX, stepY;

    if (rayDirX < 0) { stepX = -1; sideDistX = (p.x - mapX) * deltaDistX; }
    else              { stepX =  1; sideDistX = (mapX + 1.0 - p.x) * deltaDistX; }
    if (rayDirY < 0) { stepY = -1; sideDistY = (p.y - mapY) * deltaDistY; }
    else              { stepY =  1; sideDistY = (mapY + 1.0 - p.y) * deltaDistY; }

    // March sinar hingga mengenai dinding
    let hit = false, side = 0;
    while (!hit) {
      if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
      else                        { sideDistY += deltaDistY; mapY += stepY; side = 1; }
      if (mapX < 0 || mapX >= g.MAP_SIZE || mapY < 0 || mapY >= g.MAP_SIZE) { hit = true; break; }
      if (MAP_3D[mapY][mapX] === 1) hit = true;
    }

    // Jarak perpendikular (anti fish-eye distortion)
    const perpWallDist = side === 0
      ? sideDistX - deltaDistX
      : sideDistY - deltaDistY;

    zBuffer[col] = perpWallDist;

    // Tinggi kolom dinding: H / jarak (proyeksi perspektif)
    const wallHeight = Math.floor(H / (perpWallDist + 1e-4));
    const drawStart  = Math.max(0, Math.floor((H - wallHeight) / 2));
    const drawEnd    = Math.min(H, Math.floor((H + wallHeight) / 2));

    // Shading: makin jauh makin gelap; sisi EW lebih gelap dari NS
    const shade = Math.max(0.1, Math.min(1.0, 1.5 / (perpWallDist + 0.5)));
    const factor = side === 1 ? 0.7 : 1.0;
    const r  = Math.floor(0   * shade * factor);
    const gv = Math.floor(120 * shade * factor);
    const b  = Math.floor(200 * shade * factor);

    ctx.fillStyle = `rgb(${r},${gv},${b})`;
    ctx.fillRect(col, drawStart, 1, drawEnd - drawStart);
  }

  renderSprites3D(zBuffer);
  renderMinimap3D();
}

/**
 * Render sprite data chip menggunakan teknik sprite scaling.
 * Transformasi ke camera-space → proyeksi → z-buffer occlusion.
 * @param {Float32Array} zBuffer
 */
function renderSprites3D(zBuffer) {
  const g   = game3D;
  const ctx = g.ctx;
  const W   = g.canvas.width;
  const H   = g.canvas.height;
  const p   = g.player;

  // Urutkan jauh ke dekat (painter's algorithm)
  const active = g.chips.filter(c => c.active);
  active.sort((a, b) =>
    (b.x-p.x)**2 + (b.y-p.y)**2 - (a.x-p.x)**2 - (a.y-p.y)**2
  );

  active.forEach(chip => {
    const spX = chip.x - p.x;
    const spY = chip.y - p.y;

    // Transformasi ke ruang kamera (inverse camera matrix)
    const invDet = 1.0 / (
      Math.cos(p.angle) * Math.sin(p.angle + Math.PI / 2) -
      Math.sin(p.angle) * Math.cos(p.angle + Math.PI / 2)
    );
    const tX = invDet * ( Math.sin(p.angle + Math.PI/2) * spX - Math.cos(p.angle + Math.PI/2) * spY);
    const tY = invDet * (-Math.sin(p.angle)             * spX + Math.cos(p.angle)             * spY);

    if (tY <= 0) return; // Di belakang player

    // Proyeksi ke layar
    const screenX   = Math.floor((W / 2) * (1 + tX / tY));
    const spriteSize = Math.abs(Math.floor(H / tY));
    const drawStartY = Math.max(0, Math.floor((H - spriteSize) / 2));
    const drawEndY   = Math.min(H, Math.floor((H + spriteSize) / 2));
    const drawStartX = Math.max(0, screenX - spriteSize / 2);
    const drawEndX   = Math.min(W - 1, screenX + spriteSize / 2);

    // Gambar kolom per kolom dengan z-buffer check
    for (let col = Math.floor(drawStartX); col < Math.floor(drawEndX); col++) {
      if (tY >= zBuffer[col]) continue; // Tertutup dinding
      const grad = ctx.createLinearGradient(0, drawStartY, 0, drawEndY);
      grad.addColorStop(0,   'rgba(0,212,255,0.9)');
      grad.addColorStop(0.3, 'rgba(0,255,200,0.95)');
      grad.addColorStop(0.7, 'rgba(0,180,255,0.9)');
      grad.addColorStop(1,   'rgba(0,100,180,0.8)');
      ctx.fillStyle = grad;
      ctx.fillRect(col, drawStartY, 1, drawEndY - drawStartY);
    }

    if (spriteSize > 20) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, spriteSize / 60);
      ctx.fillStyle   = '#ffffff';
      ctx.font        = `${Math.min(spriteSize * 0.5, 24)}px "Press Start 2P", monospace`;
      ctx.textAlign   = 'center';
      ctx.textBaseline= 'middle';
      ctx.fillText('◈', screenX, H / 2);
      ctx.restore();
    }
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * Render mini-map untuk orientasi player di game 3D.
 */
function renderMinimap3D() {
  const g   = game3D;
  const ctx = g.ctx;
  const W   = g.canvas.width;
  const H   = g.canvas.height;
  const p   = g.player;
  const MT  = 8;
  const MW  = g.MAP_SIZE * MT;
  const MH  = g.MAP_SIZE * MT;
  const MX  = W - MW - 10;
  const MY  = H - MH - 10;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(MX - 2, MY - 2, MW + 4, MH + 4);

  for (let row = 0; row < g.MAP_SIZE; row++) {
    for (let col = 0; col < g.MAP_SIZE; col++) {
      ctx.fillStyle = MAP_3D[row][col] === 1 ? '#334455' : '#0a0a15';
      ctx.fillRect(MX + col * MT, MY + row * MT, MT - 1, MT - 1);
    }
  }

  g.chips.forEach(chip => {
    if (!chip.active) return;
    ctx.fillStyle = '#00d4ff';
    ctx.fillRect(MX + chip.x * MT - 2, MY + chip.y * MT - 2, 4, 4);
  });

  const px = MX + p.x * MT;
  const py = MY + p.y * MT;
  ctx.strokeStyle = 'rgba(0,255,136,0.6)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(p.angle) * 10, py + Math.sin(p.angle) * 10);
  ctx.stroke();
  ctx.fillStyle = '#00ff88';
  ctx.beginPath();
  ctx.arc(px, py, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '7px "Press Start 2P", monospace';
  ctx.fillText('MAP', MX, MY - 4);
}