/* =============================================================
   RETRO WEB GAME COLLECTION — GAME ENGINE
   File    : game.js
   Dibuat  : Vanilla JavaScript (NO external libraries)
   Berisi  : 1) Web Audio Engine (Retro SFX Synthesizer)
             2) Scene / State Manager
             3) Game A: 2D Platformer Engine
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
  if (audioCtx.state === "suspended") {
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
function playSound(
  freq,
  duration,
  type = "square",
  freqEnd = null,
  vol = 0.15,
) {
  try {
    const ctx = getAudioCtx();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

    // Jika ada freqEnd, buat slide frekuensi (pitch sweep)
    if (freqEnd !== null) {
      oscillator.frequency.linearRampToValueAtTime(
        freqEnd,
        ctx.currentTime + duration,
      );
    }

    // Envelope: Attack singkat, decay alami
    gainNode.gain.setValueAtTime(vol, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration,
    );

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    // Abaikan error audio agar tidak mengganggu gameplay
  }
}

/** SFX Preset: Suara lompat (Game 2D) */
function sfxJump() {
  playSound(220, 0.15, "square", 440);
}

/** SFX Preset: Suara mengambil koin / collectible */
function sfxCollect() {
  playSound(440, 0.08, "square");
  setTimeout(() => playSound(660, 0.08, "square"), 80);
  setTimeout(() => playSound(880, 0.12, "square"), 160);
}

/** SFX Preset: Suara player terkena musuh / respawn */
function sfxHit() {
  playSound(200, 0.3, "sawtooth", 50);
}

/** SFX Preset: Suara menang */
function sfxWin() {
  const notes = [262, 330, 392, 523, 659, 784];
  notes.forEach((n, i) =>
    setTimeout(() => playSound(n, 0.2, "square"), i * 100),
  );
}

/** SFX Preset: Suara kalah */
function sfxLose() {
  const notes = [330, 294, 262, 220, 196, 165];
  notes.forEach((n, i) =>
    setTimeout(() => playSound(n, 0.2, "sawtooth"), i * 100),
  );
}

/** SFX Preset: Suara klik tombol menu */
function sfxClick() {
  playSound(660, 0.05, "square");
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
  currentScene: "menu", // State awal: menu
  selectedGame: "2d", // Game yang dipilih: '2d' atau '3d'
  animFrameId: null, // ID requestAnimationFrame untuk dibatalkan saat game berhenti
};

/**
 * Menampilkan scene yang ditentukan dan menyembunyikan yang lain.
 * @param {'menu'|'game'|'result'} sceneName
 */
function showScene(sceneName) {
  document.getElementById("scene-menu").classList.remove("active");
  document.getElementById("scene-game").classList.remove("active");
  document.getElementById("scene-result").classList.remove("active");

  document.getElementById("scene-" + sceneName).classList.add("active");
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
  document
    .getElementById("card-2d")
    .classList.toggle("selected", gameType === "2d");
  document
    .getElementById("card-3d")
    .classList.toggle("selected", gameType === "3d");
  document.getElementById("ind-2d").textContent =
    gameType === "2d" ? "▶ SELECTED ◀" : "";
  document.getElementById("ind-3d").textContent =
    gameType === "3d" ? "▶ SELECTED ◀" : "";
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

  showScene("game");

  if (App.selectedGame === "2d") {
    initGame2D();
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
  document.getElementById("crosshair").style.display = "none";
  document.getElementById("hud-timer-label").style.display = "none";
  document.getElementById("hud-timer").style.display = "none";

  showScene("menu");
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
function showResult(isWin, score, subtitle = "") {
  if (isWin) {
    sfxWin();
    document.getElementById("result-icon").textContent = "🏆";
    document.getElementById("result-title").textContent = "YOU WIN!";
    document.getElementById("result-title").className = "result-title win";
  } else {
    sfxLose();
    document.getElementById("result-icon").textContent = "💀";
    document.getElementById("result-title").textContent = "GAME OVER";
    document.getElementById("result-title").className = "result-title lose";
  }
  document.getElementById("result-subtitle").textContent = subtitle;
  document.getElementById("result-score").textContent = score;
  document.getElementById("result-score").style.color = isWin
    ? "var(--clr-primary)"
    : "var(--clr-red)";

  // Hentikan game loop sebelum berganti scene
  if (App.animFrameId) {
    cancelAnimationFrame(App.animFrameId);
    App.animFrameId = null;
  }
  if (game3D.timerInterval) {
    clearInterval(game3D.timerInterval);
    game3D.timerInterval = null;
  }

  showScene("result");
}

// Inisialisasi: tampilkan menu dan pilih game 2D sebagai default
document.addEventListener("DOMContentLoaded", () => {
  showScene("menu");
  selectGame("2d");
});

/* ==============================================================
   BAGIAN 3: GAME A — 2D PLATFORMER "SYNCBOY ADVENTURE"
   Core Engine:
   - Physics:    Gravitasi buatan, AABB Collision Detection
   - Rendering:  Canvas 2D context
   - Game Loop:  requestAnimationFrame (target 60 FPS)
   ============================================================== */

/** Namespace untuk semua state dan logika Game 2D */
const game2D = {
  canvas: null,
  ctx: null,
  score: 0,
  running: false,

  // ── Konstanta Fisika ──
  GRAVITY: 0.45, // Percepatan gravitasi per frame (piksel/frame²)
  JUMP_FORCE: -11, // Kecepatan awal vertikal saat lompat (negatif = ke atas)
  MOVE_SPEED: 3.5, // Kecepatan horizontal player (piksel/frame)
  TILE: 32, // Ukuran satu tile dalam piksel

  // ── Input State ──
  keys: {},

  // ── Objek Player ──
  player: null,

  // ── Data Level ──
  tilemap: [], // Array 2D tilemap level
  coins: [], // Array koin yang ada di level
  enemy: null, // Objek musuh
  portal: null, // Objek portal/bendera finish

  // ── Dimensi World ──
  worldWidth: 0,
  worldHeight: 0,
  cameraX: 0, // Posisi kamera horizontal (untuk efek scrolling)
};

/**
 * Tilemap level 2D.
 * 0 = ruang kosong (udara)
 * 1 = platform/tanah solid
 *
 * Level dirancang dengan:
 * - Lantai dasar di baris paling bawah
 * - 3 variasi ketinggian platform di tengah-atas
 * - Ruang yang cukup untuk penempatan koin dan pergerakan musuh
 */
const LEVEL_MAP = [
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0,
  ],
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0,
  ],
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0,
  ],
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0,
  ], // Platform tinggi kiri-tengah
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0,
    0,
  ], // Platform menengah kanan
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0,
  ],
  [
    0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0,
    0,
  ], // Platform rendah kiri + kanan
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0,
  ],
  [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0,
  ], // Platform tengah panjang
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0,
  ],
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0,
  ],
  [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1,
  ], // Lantai dasar
];

/**
 * Menginisialisasi dan memulai Game 2D.
 * Dipanggil dari startGame() di State Manager.
 */
function initGame2D() {
  const g = game2D;
  g.canvas = document.getElementById("gameCanvas");
  g.ctx = g.canvas.getContext("2d");
  g.score = 0;
  g.running = true;
  g.keys = {};

  // Sembunyikan elemen khusus game 3D
  document.getElementById("crosshair").style.display = "none";
  document.getElementById("hud-timer-label").style.display = "none";
  document.getElementById("hud-timer").style.display = "none";
  document.getElementById("prompt-e").style.display = "none";

  // Ukuran canvas mengikuti window, dikurangi HUD
  const HUD_H = 44;
  g.canvas.width = window.innerWidth;
  g.canvas.height = window.innerHeight - HUD_H;
  g.canvas.style.marginTop = HUD_H + "px";

  g.tilemap = LEVEL_MAP;
  g.worldWidth = g.tilemap[0].length * g.TILE;
  g.worldHeight = g.tilemap.length * g.TILE;

  // ── Inisialisasi Player ──
  // Posisi awal: kolom 1, di atas lantai dasar
  const floorRow = g.tilemap.length - 1;
  g.player = {
    x: g.TILE * 1,
    y: (floorRow - 1) * g.TILE,
    w: 24, // Lebar hitbox player (lebih kecil dari tile)
    h: 28, // Tinggi hitbox player
    vx: 0, // Kecepatan horizontal
    vy: 0, // Kecepatan vertikal
    onGround: false, // Flag: apakah player menyentuh tanah
    facing: 1, // Arah hadap: 1 = kanan, -1 = kiri
    // Spawn point untuk respawn setelah terkena musuh
    spawnX: g.TILE * 1,
    spawnY: (floorRow - 1) * g.TILE,
    // Timer invincibility singkat setelah respawn (mencegah langsung terkena lagi)
    invincible: 0,
  };

  // ── Inisialisasi Koin (10 buah) ──
  // Koin ditempatkan secara terprogram di atas platform yang ada
  g.coins = [];
  // Posisi koin manual berdasarkan layout tilemap: [col, row platform di atasnya]
  const coinPositions = [
    // Di atas lantai dasar
    { col: 3, row: 10 },
    { col: 5, row: 10 },
    { col: 7, row: 10 },
    // Di atas platform tengah panjang (row 8)
    { col: 9, row: 7 },
    { col: 10, row: 7 },
    { col: 12, row: 7 },
    // Di atas platform rendah kiri (row 6)
    { col: 2, row: 5 },
    { col: 4, row: 5 },
    // Di atas platform tinggi (row 3)
    { col: 11, row: 2 },
    // Di atas platform kanan menengah (row 4)
    { col: 17, row: 3 },
  ];
  coinPositions.forEach((pos) => {
    g.coins.push({
      x: pos.col * g.TILE + g.TILE / 2 - 8, // Tengahkan di tile
      y: pos.row * g.TILE,
      w: 16,
      h: 16,
      active: true, // false jika sudah diambil
      pulse: Math.random() * Math.PI * 2, // Fase animasi mengambang
    });
  });

  // ── Inisialisasi Musuh ──
  // Musuh berpatroli di atas platform tengah panjang (row 8)
  g.enemy = {
    x: 9 * g.TILE,
    y: 7 * g.TILE, // Satu tile di atas platform row 8
    w: 24,
    h: 28,
    vx: 1.5, // Kecepatan patroli
    minX: 8 * g.TILE, // Batas kiri patroli
    maxX: 12 * g.TILE, // Batas kanan patroli
  };

  // ── Inisialisasi Portal (Finish) ──
  // Ditempatkan di ujung kanan, di atas lantai dasar
  g.portal = {
    x: 23 * g.TILE,
    y: 9 * g.TILE, // Sedikit di atas lantai (row 11 = lantai, row 10 di atasnya)
    w: 28,
    h: 32,
    pulse: 0,
  };

  // Update HUD skor awal
  document.getElementById("hud-score").textContent = g.score;

  // ── Event Listener Keyboard ──
  // Gunakan flag keys{} agar input smooth (tidak satu-persatu)
  window.addEventListener("keydown", onKey2DDown);
  window.addEventListener("keyup", onKey2DUp);

  // Mulai game loop
  loop2D();
}

/** Keyboard down handler untuk Game 2D */
function onKey2DDown(e) {
  game2D.keys[e.code] = true;
  // Lompat hanya jika player di atas tanah (tidak bisa double jump)
  if (
    (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") &&
    game2D.player.onGround
  ) {
    game2D.player.vy = game2D.JUMP_FORCE; // Kecepatan awal lompat
    game2D.player.onGround = false;
    sfxJump();
  }
  // Cegah scroll halaman saat bermain
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      e.code,
    )
  ) {
    e.preventDefault();
  }
}

/** Keyboard up handler untuk Game 2D */
function onKey2DUp(e) {
  game2D.keys[e.code] = false;
}

/**
 * Membersihkan semua event listener Game 2D.
 * Dipanggil saat game berakhir / kembali ke menu.
 */
function cleanup2D() {
  window.removeEventListener("keydown", onKey2DDown);
  window.removeEventListener("keyup", onKey2DUp);
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

  // ── 1. Input Handling ──
  // Kiri: A atau ArrowLeft
  if (g.keys["KeyA"] || g.keys["ArrowLeft"]) {
    p.vx = -g.MOVE_SPEED;
    p.facing = -1;
  }
  // Kanan: D atau ArrowRight
  else if (g.keys["KeyD"] || g.keys["ArrowRight"]) {
    p.vx = g.MOVE_SPEED;
    p.facing = 1;
  } else {
    // Gesekan (friction): perlambat kecepatan horizontal jika tidak ada input
    p.vx *= 0.75;
    if (Math.abs(p.vx) < 0.1) p.vx = 0;
  }

  // ── 2. Physics: Terapkan Gravitasi ──
  // Gravitasi menambah kecepatan vertikal setiap frame
  // vy positif = bergerak ke bawah (sumbu Y kanvas = ke bawah)
  p.vy += g.GRAVITY;

  // Batasi kecepatan jatuh maksimum (terminal velocity)
  if (p.vy > 15) p.vy = 15;

  // ── 3. AABB Collision Detection & Resolution ──
  // Prinsip: cek sumbu Y dulu (untuk grounding), baru sumbu X.
  // Ini mencegah "corner catching" — bug umum pada collision AABB.

  // === 3a. Resolusi Sumbu Y ===
  p.y += p.vy;
  p.onGround = false;

  // Cari semua tile yang berada di sekitar player
  const tilesAroundY = getTilesAround(p.x, p.y, p.w, p.h, T, g.tilemap);
  for (const tile of tilesAroundY) {
    if (!aabbOverlap(p, tile)) continue;

    if (p.vy > 0) {
      // Player bergerak ke bawah → dasar player menyentuh atas tile
      p.y = tile.y - p.h; // Dorong player ke atas permukaan tile
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy < 0) {
      // Player bergerak ke atas → kepala player menabrak bawah tile
      p.y = tile.y + tile.h; // Dorong player ke bawah permukaan tile
      p.vy = 0;
    }
  }

  // === 3b. Resolusi Sumbu X ===
  p.x += p.vx;

  const tilesAroundX = getTilesAround(p.x, p.y, p.w, p.h, T, g.tilemap);
  for (const tile of tilesAroundX) {
    if (!aabbOverlap(p, tile)) continue;

    if (p.vx > 0) {
      // Player bergerak ke kanan → sisi kanan player menabrak tile
      p.x = tile.x - p.w;
      p.vx = 0;
    } else if (p.vx < 0) {
      // Player bergerak ke kiri → sisi kiri player menabrak tile
      p.x = tile.x + tile.w;
      p.vx = 0;
    }
  }

  // Batasi player dalam batas horizontal world
  if (p.x < 0) p.x = 0;
  if (p.x + p.w > g.worldWidth) p.x = g.worldWidth - p.w;

  // Jika player jatuh ke bawah layar, respawn
  if (p.y > g.worldHeight + 100) {
    respawnPlayer();
  }

  // ── 4. Camera Scrolling (Horizontal) ──
  // Kamera mengikuti player dan menjaga player di tengah horizontal
  const targetCam = p.x + p.w / 2 - g.canvas.width / 2;
  g.cameraX = Math.max(0, Math.min(targetCam, g.worldWidth - g.canvas.width));

  // ── 5. Collectible Logic — Deteksi Tabrakan Koin ──
  g.coins.forEach((coin) => {
    if (!coin.active) return;
    // Animasi mengambang koin
    coin.pulse += 0.05;

    // AABB check: apakah player menyentuh koin?
    if (aabbOverlap(p, coin)) {
      coin.active = false; // Nonaktifkan koin
      g.score++;
      document.getElementById("hud-score").textContent = g.score;
      sfxCollect();
    }
  });

  // ── 6. Enemy AI — Patroli Otomatis ──
  const en = g.enemy;
  en.x += en.vx;
  // Balik arah jika mencapai batas patroli
  if (en.x <= en.minX || en.x + en.w >= en.maxX) {
    en.vx *= -1;
  }

  // Deteksi tabrakan musuh dengan player
  if (p.invincible <= 0 && aabbOverlap(p, en)) {
    sfxHit();
    respawnPlayer();
    // Efek screen shake dengan manipulasi CSS
    triggerScreenShake();
  }

  // Hitung mundur timer invincibility
  if (p.invincible > 0) p.invincible--;

  // ── 7. Portal (Win Condition) Check ──
  g.portal.pulse += 0.05;
  if (aabbOverlap(p, g.portal)) {
    if (g.score >= 8) {
      // Menang! Hentikan game dan tampilkan result
      cleanup2D();
      showResult(true, g.score, "ALL CHIPS COLLECTED! PORTAL UNLOCKED!");
    } else {
      // Belum cukup koin — berikan visual feedback (portal "terkunci")
      // Tidak ada aksi, player bisa masuk tapi tidak menang
    }
  }
}

/**
 * Mengembalikan player ke posisi spawn awal.
 * Dipanggil saat player terkena musuh atau jatuh dari level.
 */
function respawnPlayer() {
  const p = game2D.player;
  p.x = p.spawnX;
  p.y = p.spawnY;
  p.vx = 0;
  p.vy = 0;
  p.invincible = 90; // ~1.5 detik invincibility setelah respawn
}

/**
 * Efek screen shake: tambahkan class CSS 'shake' ke canvas,
 * lalu hapus setelah animasi selesai.
 */
function triggerScreenShake() {
  const canvas = game2D.canvas;
  canvas.classList.remove("shake");
  // Reflow trick agar animasi restart meski class sudah ada
  void canvas.offsetWidth;
  canvas.classList.add("shake");
  setTimeout(() => canvas.classList.remove("shake"), 300);
}

/**
 * Mendapatkan semua tile solid di sekitar bounding box yang diberikan.
 * Digunakan untuk optimasi collision — hanya cek tile yang relevan.
 * @returns {Array} Array objek {x, y, w, h} untuk setiap tile solid
 */
function getTilesAround(px, py, pw, ph, tileSize, tilemap) {
  const tiles = [];
  // Hitung rentang tile yang perlu dicek
  const startCol = Math.max(0, Math.floor(px / tileSize));
  const endCol = Math.min(
    tilemap[0].length - 1,
    Math.floor((px + pw) / tileSize) + 1,
  );
  const startRow = Math.max(0, Math.floor(py / tileSize));
  const endRow = Math.min(
    tilemap.length - 1,
    Math.floor((py + ph) / tileSize) + 1,
  );

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (tilemap[row][col] === 1) {
        tiles.push({
          x: col * tileSize,
          y: row * tileSize,
          w: tileSize,
          h: tileSize,
        });
      }
    }
  }
  return tiles;
}

/**
 * AABB (Axis-Aligned Bounding Box) Overlap Check.
 * Mengembalikan true jika dua kotak berpotongan.
 * @param {Object} a - {x, y, w, h}
 * @param {Object} b - {x, y, w, h}
 */
function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/**
 * RENDER 2D — Menggambar semua elemen game ke canvas setiap frame.
 * Urutan render: Background → Tilemap → Portal → Koin → Musuh → Player
 */
function render2D() {
  const g = game2D;
  const ctx = g.ctx;
  const T = g.TILE;
  const W = g.canvas.width;
  const H = g.canvas.height;

  // Bersihkan canvas
  ctx.clearRect(0, 0, W, H);

  // ── Latar Belakang: Gradien Langit Retro ──
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, "#0a0a2a");
  skyGrad.addColorStop(1, "#1a1a5a");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // Bintang-bintang kecil di latar
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  for (let i = 0; i < 40; i++) {
    // Gunakan index i sebagai seed deterministik (posisi bintang tidak random tiap frame)
    const sx = (i * 137 + 50) % W;
    const sy = (i * 97 + 20) % (H * 0.6);
    ctx.fillRect(sx, sy, 2, 2);
  }

  // Terapkan transformasi kamera (geser semua gambar sesuai cameraX)
  ctx.save();
  ctx.translate(-g.cameraX, 0);

  // ── Render Tilemap ──
  for (let row = 0; row < g.tilemap.length; row++) {
    for (let col = 0; col < g.tilemap[row].length; col++) {
      if (g.tilemap[row][col] !== 1) continue;

      const tx = col * T;
      const ty = row * T;

      // Warna tanah dengan variasi kedalaman
      const isTopEdge = row === 0 || g.tilemap[row - 1][col] !== 1;
      ctx.fillStyle = isTopEdge ? "#3a7a3a" : "#2a5a2a";
      ctx.fillRect(tx, ty, T, T);

      // Highlight tepi atas platform (efek retro)
      if (isTopEdge) {
        ctx.fillStyle = "#6aaa5a";
        ctx.fillRect(tx, ty, T, 3);
        // Sisi kiri
        ctx.fillStyle = "#4a8a4a";
        ctx.fillRect(tx, ty, 3, T);
      }

      // Grid line halus
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(tx, ty, T, T);
    }
  }

  // ── Render Portal (Finish Flag) ──
  const portal = g.portal;
  const portalUnlocked = g.score >= 8;
  const pulseFactor = Math.sin(portal.pulse) * 4;

  // Tiang bendera
  ctx.fillStyle = "#aaaaaa";
  ctx.fillRect(portal.x + portal.w / 2 - 2, portal.y, 4, portal.h);

  // Bendera (warna berbeda tergantung apakah terkunci atau tidak)
  ctx.fillStyle = portalUnlocked
    ? `hsl(${140 + Math.sin(portal.pulse) * 20}, 100%, 50%)` // Hijau berdenyut jika terbuka
    : "#555577";
  ctx.fillRect(portal.x + portal.w / 2 + 2, portal.y, 18, 12);

  // Glow efek jika portal terbuka
  if (portalUnlocked) {
    ctx.shadowColor = "#00ff88";
    ctx.shadowBlur = 10 + pulseFactor;
    ctx.fillStyle = "rgba(0,255,136,0.15)";
    ctx.fillRect(portal.x - 4, portal.y - 4, portal.w + 8, portal.h + 8);
    ctx.shadowBlur = 0;
  }

  // Label skor yang dibutuhkan
  ctx.fillStyle = portalUnlocked ? "#00ff88" : "#ffffff55";
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillText(
    portalUnlocked ? "GO!" : `${g.score}/8`,
    portal.x - 4,
    portal.y - 6,
  );

  // ── Render Koin ──
  g.coins.forEach((coin) => {
    if (!coin.active) return;
    const floatY = Math.sin(coin.pulse) * 3; // Efek mengambang naik-turun
    const cx = coin.x + coin.w / 2;
    const cy = coin.y + coin.h / 2 + floatY;

    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd700";
    ctx.shadowColor = "#ffd700";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Tanda bintang di dalam koin
    ctx.fillStyle = "#ffaa00";
    ctx.font = "10px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✦", cx, cy);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  });

  // ── Render Musuh ──
  const en = g.enemy;
  // Body musuh (kotak merah)
  ctx.fillStyle = "#ff3355";
  ctx.fillRect(en.x, en.y, en.w, en.h);
  // Mata musuh
  const eyeDir = en.vx > 0 ? en.w * 0.6 : en.w * 0.2;
  ctx.fillStyle = "#fff";
  ctx.fillRect(en.x + eyeDir - 2, en.y + 6, 6, 6);
  ctx.fillStyle = "#000";
  ctx.fillRect(en.x + eyeDir, en.y + 8, 3, 3);
  // Antena musuh
  ctx.fillStyle = "#ff6688";
  ctx.fillRect(en.x + en.w / 2 - 1, en.y - 6, 2, 6);
  ctx.beginPath();
  ctx.arc(en.x + en.w / 2, en.y - 7, 3, 0, Math.PI * 2);
  ctx.fill();

  // ── Render Player ──
  const p = g.player;
  // Efek berkedip saat invincible
  const isVisible = p.invincible <= 0 || Math.floor(p.invincible / 5) % 2 === 0;

  if (isVisible) {
    ctx.save();
    // Flip horizontal berdasarkan arah hadap
    if (p.facing === -1) {
      ctx.translate(p.x + p.w, p.y);
      ctx.scale(-1, 1);
      ctx.translate(-p.w, 0);
    } else {
      ctx.translate(p.x, p.y);
    }

    // Body player (pixel art sederhana)
    ctx.fillStyle = "#00ff88";
    ctx.fillRect(4, 8, 16, 16); // Torso
    ctx.fillStyle = "#00cc66";
    ctx.fillRect(4, 0, 16, 10); // Kepala
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(7, 2, 5, 5); // Mata
    ctx.fillStyle = "#000000";
    ctx.fillRect(9, 3, 3, 3); // Pupil
    // Kaki (animasi berjalan sederhana)
    const legAnim =
      p.onGround && Math.abs(p.vx) > 0.5 ? Math.sin(Date.now() * 0.015) * 3 : 0;
    ctx.fillStyle = "#008844";
    ctx.fillRect(4, 24, 7, 4 + legAnim); // Kaki kiri
    ctx.fillRect(13, 24, 7, 4 - legAnim); // Kaki kanan

    ctx.restore();
  }

  // ── Indikator skor yang diperlukan di atas player ──
  if (g.score < 8) {
    ctx.fillStyle = "rgba(255,215,0,0.8)";
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText(`${g.score}/8 ✦`, p.x - 4, p.y - 6);
  }

  // Kembalikan transformasi kamera
  ctx.restore();

  // ── HUD Mini (di canvas, di bawah layar) ──
  // Petunjuk kontrol di sudut bawah
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, H - 30, W, 30);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillText(
    "A/D: MOVE  |  SPACE: JUMP  |  REACH PORTAL WITH 8 COINS TO WIN",
    10,
    H - 10,
  );
}

/* ==============================================================
   BAGIAN 4: GAME B — PSEUDO-3D RAYCASTER "TECH LAB ESCAPE"
   Core Engine:
   - Raycasting klasik (Wolfenstein 3D technique)
   - Canvas 2D untuk menampilkan ilusi perspektif 3D
   - FPS Controller dengan Math.cos / Math.sin untuk pergerakan
   - Sprite scaling 2D untuk objek 3D (data chip)
   ============================================================== */

/** Namespace untuk semua state dan logika Game 3D */
const game3D = {
  canvas: null,
  ctx: null,
  score: 0,
  timeLeft: 60,
  timerInterval: null,
  running: false,
  showPickupPrompt: false,

  // Konstanta Raycasting
  FOV: Math.PI / 3, // Field of View: 60 derajat (π/3 radian)
  NUM_RAYS: 0, // Jumlah sinar = lebar canvas (dihitung saat init)
  HALF_PI: Math.PI / 2,
  MAP_SIZE: 15, // Ukuran grid peta 15x15

  // State Player 3D
  player: null,

  // Data chip collectible
  chips: [],
};

/**
 * Peta Level 3D (15x15 grid).
 * 1 = dinding, 0 = ruang kosong
 * Bentuk: koridor lab yang berkelok dengan ruangan terbuka di tengah
 */
const MAP_3D = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],
  [1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

/**
 * Menginisialisasi dan memulai Game 3D.
 * Dipanggil dari startGame() di State Manager.
 */
function initGame3D() {
  const g = game3D;
  g.canvas = document.getElementById("gameCanvas");
  g.ctx = g.canvas.getContext("2d");
  g.score = 0;
  g.timeLeft = 60;
  g.running = true;
  g.showPickupPrompt = false;

  // Tampilkan elemen khusus game 3D
  document.getElementById("crosshair").style.display = "block";
  document.getElementById("hud-timer-label").style.display = "flex";
  document.getElementById("hud-timer").style.display = "flex";
  document.getElementById("hud-timer").textContent = g.timeLeft;
  document.getElementById("hud-timer").classList.remove("danger");

  // Ukuran canvas
  const HUD_H = 44;
  g.canvas.width = window.innerWidth;
  g.canvas.height = window.innerHeight - HUD_H;
  g.canvas.style.marginTop = HUD_H + "px";
  g.NUM_RAYS = g.canvas.width; // Satu sinar per kolom piksel

  // ── Inisialisasi Player 3D ──
  // Posisi awal: (1.5, 1.5) dalam unit grid (di dalam ruangan pojok kiri-atas)
  g.player = {
    x: 1.5, // Koordinat X dalam unit grid
    y: 1.5, // Koordinat Y dalam unit grid
    angle: 0, // Sudut pandang dalam radian (0 = menghadap kanan)
    speed: 0.06, // Kecepatan gerak per frame
    rotSpeed: 0.04, // Kecepatan rotasi per frame (radian)
  };

  // ── Inisialisasi Data Chip (5 buah) ──
  // Tempatkan chip di koordinat grid yang kosong (MAP_3D[y][x] === 0)
  g.chips = [];
  const chipPositions = [
    { x: 1.5, y: 3.5 }, // Ruangan kiri-tengah
    { x: 7.5, y: 1.5 }, // Koridor atas-tengah
    { x: 5.5, y: 5.5 }, // Ruangan kecil tengah
    { x: 12.5, y: 7.5 }, // Koridor kanan
    { x: 7.5, y: 11.5 }, // Ruangan bawah-tengah
  ];
  chipPositions.forEach((pos) => {
    g.chips.push({
      x: pos.x,
      y: pos.y,
      active: true,
    });
  });

  // Update HUD
  document.getElementById("hud-score").textContent = g.score;

  // ── Event Listeners ──
  window.addEventListener("keydown", onKey3DDown);
  window.addEventListener("keyup", onKey3DUp);
  game3D.keys3D = {};

  // ── Countdown Timer ──
  // Menggunakan setInterval untuk countdown 60 detik
  g.timerInterval = setInterval(() => {
    if (!g.running) {
      clearInterval(g.timerInterval);
      return;
    }
    g.timeLeft--;
    const timerEl = document.getElementById("hud-timer");
    timerEl.textContent = g.timeLeft;

    // Efek bahaya saat waktu < 10 detik
    if (g.timeLeft <= 10) timerEl.classList.add("danger");

    // LOSE: Waktu habis sebelum score = 5
    if (g.timeLeft <= 0) {
      cleanup3D();
      showResult(false, g.score, "TIME'S UP! MISSION FAILED.");
    }
  }, 1000);

  // Mulai game loop
  loop3D();
}

/** State keyboard untuk game 3D */
game3D.keys3D = {};

function onKey3DDown(e) {
  game3D.keys3D[e.code] = true;

  // Interaksi ambil chip: tombol E
  if (e.code === "KeyE" && game3D.showPickupPrompt) {
    tryPickupChip();
  }
}

function onKey3DUp(e) {
  game3D.keys3D[e.code] = false;
}

/** Bersihkan event listener Game 3D */
function cleanup3D() {
  window.removeEventListener("keydown", onKey3DDown);
  window.removeEventListener("keyup", onKey3DUp);
  game3D.running = false;
  document.getElementById("prompt-e").style.display = "none";
}

/** Main Game Loop 3D */
function loop3D() {
  if (!game3D.running) return;
  App.animFrameId = requestAnimationFrame(loop3D);

  update3D();
  render3D();
}

/**
 * UPDATE LOGIC 3D — Input, Pergerakan FPS, Collision, Chip Check
 */
function update3D() {
  const g = game3D;
  const p = g.player;
  const keys = g.keys3D;

  // ── FPS Controller ──
  // W / S: Maju/Mundur berdasarkan sudut pandang
  // Posisi baru = posisi lama + (cos/sin dari sudut) × kecepatan
  // Math.cos(angle) = komponen X dari vektor arah
  // Math.sin(angle) = komponen Y dari vektor arah
  if (keys["KeyW"] || keys["ArrowUp"]) {
    const nx = p.x + Math.cos(p.angle) * p.speed;
    const ny = p.y + Math.sin(p.angle) * p.speed;
    // Anti-bug collision: cek grid sebelum bergerak
    if (MAP_3D[Math.floor(ny)][Math.floor(p.x)] !== 1) p.y = ny;
    if (MAP_3D[Math.floor(p.y)][Math.floor(nx)] !== 1) p.x = nx;
  }
  if (keys["KeyS"] || keys["ArrowDown"]) {
    const nx = p.x - Math.cos(p.angle) * p.speed;
    const ny = p.y - Math.sin(p.angle) * p.speed;
    if (MAP_3D[Math.floor(ny)][Math.floor(p.x)] !== 1) p.y = ny;
    if (MAP_3D[Math.floor(p.y)][Math.floor(nx)] !== 1) p.x = nx;
  }

  // A / D: Rotasi sudut pandang player
  if (keys["KeyA"] || keys["ArrowLeft"]) p.angle -= p.rotSpeed;
  if (keys["KeyD"] || keys["ArrowRight"]) p.angle += p.rotSpeed;

  // ── Deteksi Kedekatan Chip ──
  // Cek apakah ada chip aktif dalam radius tertentu dari player
  let nearChip = false;
  g.chips.forEach((chip) => {
    if (!chip.active) return;
    const dx = chip.x - p.x;
    const dy = chip.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1.0) {
      // Radius pickup: 1 unit grid
      nearChip = true;
    }
  });

  // Tampilkan / sembunyikan prompt "Press E"
  g.showPickupPrompt = nearChip;
  document.getElementById("prompt-e").style.display = nearChip
    ? "block"
    : "none";
}

/**
 * Mengambil chip terdekat dari posisi player.
 * Dipanggil saat player menekan E dengan showPickupPrompt = true.
 */
function tryPickupChip() {
  const g = game3D;
  const p = g.player;

  g.chips.forEach((chip) => {
    if (!chip.active) return;
    const dx = chip.x - p.x;
    const dy = chip.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1.0) {
      chip.active = false;
      g.score++;
      document.getElementById("hud-score").textContent = g.score;
      sfxCollect();

      // WIN: Semua 5 chip dikumpulkan
      if (g.score >= 5) {
        cleanup3D();
        showResult(
          true,
          g.score,
          `ESCAPED IN ${60 - g.timeLeft}s! ALL DATA SECURED!`,
        );
      }
    }
  });
}

/**
 * RAYCASTING ENGINE + RENDER 3D
 * Algoritma:
 * 1. Untuk setiap kolom piksel di canvas (= satu sinar/ray):
 *    a. Hitung sudut sinar = sudut player - FOV/2 + (kolom/lebar) * FOV
 *    b. Cast ray menggunakan DDA (Digital Differential Analyzer)
 *    c. Hitung jarak ke dinding terdekat
 *    d. Hitung tinggi kolom dinding = H_canvas / jarak (proyeksi perspektif)
 *    e. Gambar kolom vertikal dengan warna berdasarkan jarak (shading)
 * 2. Render sprite chip menggunakan teknik sprite scaling
 */
function render3D() {
  const g = game3D;
  const ctx = g.ctx;
  const W = g.canvas.width;
  const H = g.canvas.height;
  const p = g.player;

  // ── Render Langit-langit dan Lantai ──
  // Langit-langit: gradien gelap dari atas ke tengah
  const ceilGrad = ctx.createLinearGradient(0, 0, 0, H / 2);
  ceilGrad.addColorStop(0, "#050510");
  ceilGrad.addColorStop(1, "#0a0a20");
  ctx.fillStyle = ceilGrad;
  ctx.fillRect(0, 0, W, H / 2);

  // Lantai: gradien dari tengah ke bawah, sedikit lebih terang
  const floorGrad = ctx.createLinearGradient(0, H / 2, 0, H);
  floorGrad.addColorStop(0, "#0a0a18");
  floorGrad.addColorStop(1, "#050510");
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, H / 2, W, H / 2);

  // ── Array untuk menyimpan data z-depth tiap kolom ──
  // Digunakan untuk sprite occlusion (sprite tersembunyi di belakang dinding)
  const zBuffer = new Float32Array(W);

  // ── RAYCASTING: Cast Satu Sinar Per Kolom Piksel ──
  for (let col = 0; col < W; col++) {
    // === Langkah 1: Hitung Sudut Sinar ===
    // Distribusikan sinar dari kiri ke kanan dalam rentang FOV
    // (col / W - 0.5) menghasilkan nilai -0.5 sampai +0.5
    const rayAngle = p.angle + (col / W - 0.5) * g.FOV;

    // Komponen arah sinar dalam sumbu X dan Y
    const rayDirX = Math.cos(rayAngle);
    const rayDirY = Math.sin(rayAngle);

    // === Langkah 2: DDA (Digital Differential Analyzer) ===
    // Algoritma DDA efisien untuk menemukan sel grid yang dilintasi sinar

    // Posisi grid (integer) dari posisi player
    let mapX = Math.floor(p.x);
    let mapY = Math.floor(p.y);

    // deltaDist: jarak yang ditempuh sinar untuk melintasi SATU unit grid
    // pada sumbu X dan Y masing-masing
    const deltaDistX = Math.abs(1 / (rayDirX || 0.00001)); // Hindari div by zero
    const deltaDistY = Math.abs(1 / (rayDirY || 0.00001));

    // sideDist: jarak awal dari posisi player ke tepi grid pertama
    let sideDistX, sideDistY;
    let stepX, stepY; // Arah langkah pada grid: +1 atau -1

    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (p.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1.0 - p.x) * deltaDistX;
    }

    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (p.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1.0 - p.y) * deltaDistY;
    }

    // === Langkah 3: March — Terus melangkah hingga mengenai dinding ===
    let hit = false; // Apakah sinar sudah mengenai dinding
    let side = 0; // 0 = mengenai sisi NS (atas/bawah), 1 = EW (kiri/kanan)

    while (!hit) {
      // Langkah ke tepi grid terdekat berikutnya
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }
      // Cek batas array peta
      if (mapX < 0 || mapX >= g.MAP_SIZE || mapY < 0 || mapY >= g.MAP_SIZE) {
        hit = true;
        break;
      }
      // Cek apakah sinar mengenai dinding (nilai 1)
      if (MAP_3D[mapY][mapX] === 1) hit = true;
    }

    // === Langkah 4: Hitung Jarak ke Dinding ===
    // Jarak perpendikular (tegak lurus ke layar) digunakan untuk mencegah
    // distorsi "fish-eye" yang terjadi jika menggunakan jarak Euclidean biasa
    let perpWallDist;
    if (side === 0) {
      // Sinar mengenai sisi vertikal (EW face)
      perpWallDist = sideDistX - deltaDistX;
    } else {
      // Sinar mengenai sisi horizontal (NS face)
      perpWallDist = sideDistY - deltaDistY;
    }

    // Simpan jarak ke z-buffer untuk sprite occlusion
    zBuffer[col] = perpWallDist;

    // === Langkah 5: Hitung Tinggi Kolom Dinding ===
    // Semakin dekat dinding, semakin tinggi kolomnya.
    // Rumus proyeksi: H_kolom = H_canvas / jarak_perpendikular
    const wallHeight = Math.floor(H / (perpWallDist + 0.0001)); // +epsilon anti div by zero

    // Koordinat awal dan akhir gambar kolom dinding di canvas
    const drawStart = Math.max(0, Math.floor((H - wallHeight) / 2));
    const drawEnd = Math.min(H, Math.floor((H + wallHeight) / 2));

    // === Langkah 6: Shading Dinding Berdasarkan Jarak ===
    // Warna dasar dinding lab: biru-cyan retro
    // Sisi NS (side=0): terang | Sisi EW (side=1): gelap (simulasi pencahayaan)
    const shade = Math.max(0.1, Math.min(1.0, 1.5 / (perpWallDist + 0.5)));
    let r, gv, b;

    if (side === 0) {
      // Sisi yang terkena cahaya langsung
      r = Math.floor(0 * shade);
      gv = Math.floor(120 * shade);
      b = Math.floor(200 * shade);
    } else {
      // Sisi bayangan (lebih gelap 30%)
      r = Math.floor(0 * shade * 0.7);
      gv = Math.floor(80 * shade * 0.7);
      b = Math.floor(160 * shade * 0.7);
    }

    ctx.fillStyle = `rgb(${r},${gv},${b})`;
    ctx.fillRect(col, drawStart, 1, drawEnd - drawStart);
  }

  // ── Render Sprite Data Chip ──
  // Teknik sprite scaling: hitung posisi layar chip berdasarkan jarak dan sudut
  renderSprites3D(zBuffer);

  // ── Mini-map Debug (pojok kanan bawah) ──
  renderMinimap3D();
}

/**
 * Render sprite 2D dalam dunia 3D menggunakan teknik sprite scaling.
 * Prinsip:
 * 1. Hitung posisi chip relatif terhadap player (koordinat kamera/view space)
 * 2. Proyeksikan ke layar menggunakan transformasi perspektif
 * 3. Gambar sprite hanya jika tidak terhalang dinding (z-buffer check)
 * @param {Float32Array} zBuffer - Array jarak dinding per kolom
 */
function renderSprites3D(zBuffer) {
  const g = game3D;
  const ctx = g.ctx;
  const W = g.canvas.width;
  const H = g.canvas.height;
  const p = g.player;

  // Urutkan chip dari yang terjauh ke terdekat (painter's algorithm)
  const activeChips = g.chips.filter((c) => c.active);
  activeChips.sort((a, b) => {
    const dA = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
    const dB = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
    return dB - dA; // Jauh dulu
  });

  activeChips.forEach((chip) => {
    // === Transformasi ke Ruang Kamera (Camera Space) ===
    // Hitung vektor dari player ke chip
    const spriteX = chip.x - p.x;
    const spriteY = chip.y - p.y;

    // Matriks transformasi invers kamera (inverse of the camera matrix)
    // Untuk kamera dengan arah (cos, sin), inversnya adalah rotasi negatif
    const invDet =
      1.0 /
      (Math.cos(p.angle) * Math.sin(p.angle + Math.PI / 2) -
        Math.sin(p.angle) * Math.cos(p.angle + Math.PI / 2));

    // Koordinat dalam ruang kamera
    const transformX =
      invDet *
      (Math.sin(p.angle + Math.PI / 2) * spriteX -
        Math.cos(p.angle + Math.PI / 2) * spriteY);
    const transformY =
      invDet * (-Math.sin(p.angle) * spriteX + Math.cos(p.angle) * spriteY);

    // transformY adalah jarak (z-depth) dalam ruang kamera
    // Jika transformY <= 0, sprite di belakang player, tidak perlu digambar
    if (transformY <= 0) return;

    // === Proyeksi ke Layar ===
    // spriteScreenX: posisi horizontal sprite di layar
    const spriteScreenX = Math.floor((W / 2) * (1 + transformX / transformY));

    // Hitung ukuran sprite berdasarkan jarak (perspective scaling)
    // Semakin jauh, semakin kecil (H / transformY)
    const spriteSize = Math.abs(Math.floor(H / transformY));

    // Koordinat vertikal sprite di layar
    const drawStartY = Math.max(0, Math.floor((H - spriteSize) / 2));
    const drawEndY = Math.min(H, Math.floor((H + spriteSize) / 2));

    // Koordinat horizontal sprite di layar
    const drawStartX = Math.max(0, spriteScreenX - spriteSize / 2);
    const drawEndX = Math.min(W - 1, spriteScreenX + spriteSize / 2);

    // === Gambar Sprite Kolom per Kolom (Z-buffer Occlusion) ===
    for (let col = Math.floor(drawStartX); col < Math.floor(drawEndX); col++) {
      // Cek z-buffer: sprite hanya terlihat jika lebih dekat dari dinding
      if (transformY >= zBuffer[col]) continue;

      // Gambar kolom sprite sebagai gradien cyan (representasi "chip data")
      const gradient = ctx.createLinearGradient(0, drawStartY, 0, drawEndY);
      gradient.addColorStop(0, "rgba(0,212,255,0.9)");
      gradient.addColorStop(0.3, "rgba(0,255,200,0.95)");
      gradient.addColorStop(0.7, "rgba(0,180,255,0.9)");
      gradient.addColorStop(1, "rgba(0,100,180,0.8)");

      ctx.fillStyle = gradient;
      ctx.fillRect(col, drawStartY, 1, drawEndY - drawStartY);
    }

    // Gambar ikon "◈" di tengah sprite jika cukup besar
    if (spriteSize > 20) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, spriteSize / 60);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${Math.min(spriteSize * 0.5, 24)}px "Press Start 2P", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("◈", spriteScreenX, H / 2);
      ctx.restore();
    }
  });

  // Kembalikan textAlign ke default
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/**
 * Render mini-map di pojok kanan bawah untuk orientasi player.
 * Menampilkan grid peta, posisi player (titik hijau), dan chip aktif (titik cyan).
 */
function renderMinimap3D() {
  const g = game3D;
  const ctx = g.ctx;
  const W = g.canvas.width;
  const H = g.canvas.height;
  const p = g.player;

  const MINI_TILE = 8; // Ukuran tile di mini-map (piksel)
  const MINI_W = g.MAP_SIZE * MINI_TILE;
  const MINI_H = g.MAP_SIZE * MINI_TILE;
  const MINI_X = W - MINI_W - 10; // Pojok kanan
  const MINI_Y = H - MINI_H - 10; // Pojok bawah

  // Background mini-map
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(MINI_X - 2, MINI_Y - 2, MINI_W + 4, MINI_H + 4);

  // Render grid peta
  for (let row = 0; row < g.MAP_SIZE; row++) {
    for (let col = 0; col < g.MAP_SIZE; col++) {
      ctx.fillStyle = MAP_3D[row][col] === 1 ? "#334455" : "#0a0a15";
      ctx.fillRect(
        MINI_X + col * MINI_TILE,
        MINI_Y + row * MINI_TILE,
        MINI_TILE - 1,
        MINI_TILE - 1,
      );
    }
  }

  // Chip aktif (titik cyan kecil)
  g.chips.forEach((chip) => {
    if (!chip.active) return;
    ctx.fillStyle = "#00d4ff";
    ctx.fillRect(
      MINI_X + chip.x * MINI_TILE - 2,
      MINI_Y + chip.y * MINI_TILE - 2,
      4,
      4,
    );
  });

  // Posisi Player (titik hijau + arah pandang)
  const px = MINI_X + p.x * MINI_TILE;
  const py = MINI_Y + p.y * MINI_TILE;

  // Garis arah pandang
  ctx.strokeStyle = "rgba(0,255,136,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(p.angle) * 10, py + Math.sin(p.angle) * 10);
  ctx.stroke();

  // Titik player
  ctx.fillStyle = "#00ff88";
  ctx.beginPath();
  ctx.arc(px, py, 3, 0, Math.PI * 2);
  ctx.fill();

  // Label mini-map
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = '7px "Press Start 2P", monospace';
  ctx.fillText("MAP", MINI_X, MINI_Y - 4);
}
