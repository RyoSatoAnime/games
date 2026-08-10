/* =========================
   Score Attack Mode (SAM) — dedicated state scaffold
   - sortie_state.js をベースにした独立モジュール（window.ARSAM）

   ARSAM standalone runtime dependencies:
   - Required: runCfg from arsam.html createArsamRunCfg() (ARSAM_DEFAULT_RUN_CFG)
   - Optional: window.AR_SFX (ar_sfx.js), window.blip (inline shell; miss feedback only)
   - Does NOT read: App, localStorage, skillLevels, sortie_state / AR_Shooting, GAME_DEFS

   Exports: window.ARSAM, window.ARSAM_FONT8, window.ARSAMExitReason
   ========================= */
   (() => {
  'use strict';

  const W = 192, H = 192;

  // ARSAM is endless. Table covers 0..SAM_RAMP_DURATION_SEC.
  // After the intro, ramp lookup loops over the step10..step70 window only
  // (never back to the 0–10 default). Enemy speed uses a separate duration.
  const SAM_RAMP_DURATION_SEC = 75;
  /** Initial default SAM ramp window (once per run). */
  const SAM_RAMP_INTRO_SEC = 10;
  /** Looping window length for step10..step70 (10..80 → 10..80 → …). */
  const SAM_RAMP_LOOP_SEC = 70;
  /** Enemy realtime speed reaches SAM_SPEED_RAMP.end at this play time (does not loop). */
  const SAM_SPEED_RAMP_DURATION_SEC = 80;
  /** Centered start tip visible for this many seconds from run start. */
  const SAM_START_MSG_SEC = 1.2;
  /** clear 時: RESULT 表示後、exit までのホールド秒数。 */
  const SAM_CLEAR_RESULT_HOLD_SEC = 10;
  /** fail 時: RESULT 表示後、exit までのホールド秒数。 */
  const SAM_FAIL_RESULT_HOLD_SEC = 2;
  // Future: clear presentation can be inserted before RESULT.

  /** SAM 専用スコア（enemyKind / orb / remnant → base points）。ラン内一時。score は base * scoreMult。倍率 scoreMult は Chain threshold 到達時に上昇。 */
  const SAM_SCORE_TABLE = Object.freeze({
    enemyA: 1,
    enemyB: 2,
    enemyC: 3,
    enemySeeker: 4,
    orb: 5,
    remnant: 10
  });
  /** scoreMult の上限（暫定）。 */
  const SAM_MULT_MAX = 999;

  /** SAM chain bonus: `add` は score 加算（_addSamScore、scoreMult 適用）、`total` は HUD 累計表示のみ。`multAdd` は Chain threshold 到達時の MULT 上昇。 */
  const SAM_CHAIN_BONUS_TABLE = Object.freeze([
    Object.freeze({ kills: 5,  add: 10,  total: 10,  multAdd: 1 }),
    Object.freeze({ kills: 10, add: 30,  total: 40,  multAdd: 3 }),
    Object.freeze({ kills: 15, add: 60,  total: 100, multAdd: 5 }),
    Object.freeze({ kills: 20, add: 100, total: 200, multAdd: 8 }),
  ]);

  /**
   * SAM 弾数実験用（runCfg.weapon の ammo より後勝ちで適用）。
   * `mode` だけ `'infinite'` に変えれば無限弾を試せる。
   */
  const SAM_AMMO_CFG = Object.freeze({
    mode: 'finite', // 'finite' | 'infinite'
    finiteStart: 8,
    finiteMax: 20,
    remnantRecover: 5
  });
  
  // SAM 1 回ぶんの「実効値」設定（Base が runCfg スナップショットを渡す想定。SAM は runCfg + 内部ランタイムのみ。localStorage / Base 永続データ / skillLevels は参照しない）
  /** @typedef {'aborted'|'failed'|'cleared'|string} SamExitReason */

  const SAM_EXIT_REASON = {
    ABORTED: 'aborted',
    FAILED: 'failed',
    CLEARED: 'cleared',
  };

  /** SAM 終了理由を正規化（新規書き込みは小文字。旧値は互換吸収）。通常 Sortie の AR_SortieExitReason とは別グローバル。 */
  function normalizeSamExitReason(reason){
    const x = (reason == null || reason === '') ? 'UNKNOWN' : String(reason);
    if (x === 'WITHDRAW' || x === 'WITHDRAWN') return SAM_EXIT_REASON.ABORTED;
    if (x === 'MISS' || x === 'MISSED') return SAM_EXIT_REASON.FAILED;
    if (x === 'aborted' || x === 'failed' || x === 'cleared') return x;
    return x;
  }

  function isFailedSamExit(r){
    return normalizeSamExitReason(r) === SAM_EXIT_REASON.FAILED;
  }

  const DEFAULT_RUN_CFG = {
    player: {
      speed: 52,
      orbGravityRadius: 0,
      orbGravityForce: 0
    },
    weapon: {
      // SAM scaffold: ammo（上限・初期・消費）は後続 step で SAM 専用仕様に変更予定。現状は通常 Sortie と同一値。
      ammoMax: 20,
      ammoStart: 5,
      bulletSpeed: 180,
      cooldownSec: 1.55
    },
    blast: {
      radius: 11,
      grow: 0.20,
      shrink: 0.20,
      remnantCarrierRadiusMul: 1.00,
      remnantCarrierShrinkMul: 1.00,
      mulTable: [1.00, 0.66, 0.33]
    }
  };
  /** Remnant-carrier bonus interval (sec); ARSAM standalone fixed (was game_defs NEXT_SORTIE_EFFECT_CONFIG.remnantCarrierBonus.everySec). */
  const ARSAM_REMNANT_CARRIER_BONUS_EVERY_SEC = 4.0;
  const ONE_TIME_REMNANT_BONUS_EVERY_SEC = ARSAM_REMNANT_CARRIER_BONUS_EVERY_SEC;
  /** Baseline enemy rows (same motion/hitbox; sprite differs by kind). */
  const DEFAULT_ENEMY_A_CFG = Object.freeze({
    spriteIndex: 1,
    remnantSpriteIndex: 2,
    w: 16, h: 16,
    r: 5,
    vy: 54,
    amp: 48,
    period: 6,
    spawnEvery: 1,
    formationN: 3,
    formationGap: 36,
    lanes: Object.freeze([24, 48, 72, 96, 120, 144, 168])
  });
  const ENEMY_B_SPRITE_INDEX = 7;
  const DEFAULT_ENEMY_B_CFG = Object.freeze(
    Object.assign({}, DEFAULT_ENEMY_A_CFG, { spriteIndex: ENEMY_B_SPRITE_INDEX })
  );
  const ENEMY_B_REMNANT_SPRITE_INDEX = 8;
  const ENEMY_C_REMNANT_SPRITE_INDEX = 10;
  const ENEMY_B_COLUMN_COUNT = 4;
  const ENEMY_B_COLUMN_GAP = 32;
  const ENEMY_B_SPEED_MUL = 1.75;
  const ENEMY_B_DIAG_ANGLE_DEG = 20;
  const ENEMY_B_EDGE_INWARD_GUARD_X = 48;
  const ENEMY_A_EDGE_INWARD_GUARD_X = 48;
  const ENEMY_C_SPRITE_INDEX = 9;
  /** 3体横並びの間隔（px）。 */
  const ENEMY_C_FORMATION_GAP = 36;
  /** 斜め移動のスカラー速度（px/s）。vx,vy は 45° でこの値 * SQRT1_2。 */
  const ENEMY_C_DIAG_SPEED = 68;
  /** 一時停止するまでの「敵中心」Y しきい値（画面高の約 1/3）。 */
  const ENEMY_C_PAUSE_CENTER_Y = H * (1 / 3);
  /** ジグザグ2段目へ移る「敵中心」Y しきい値（画面高の約 2/3）。pause2 後に角度反転。 */
  const ENEMY_C_ZIGZAG_CENTER_Y = H * (2 / 3);
  const ENEMY_C_PAUSE_SEC = 0.5;
  const ENEMY_C_TURN_PAUSE_SEC = 0.5;
  /** enemyC 編隊の基準 X（中央寄りレーン）。enemyA/B は変更しない。 */
  const ENEMY_C_LANES = Object.freeze([64, 88, 112, 136]);
  const ENEMY_C_EDGE_INWARD_GUARD_X = 72;
  // TODO(enemyC tuning): tune zigzag depth / bullet speed after Area4 playtest.
  /** 射撃後の下方向退場 vy（px/s）。RETREAT/FAIL 時の enemyC のみ。 */
  const ENEMY_C_EXIT_VY = 72;
  const ENEMY_SEEKER_SPRITE_INDEX = 12;
  /** seeker 挙動用（仮値・後続STEPで調整） */
  const ENEMY_SEEKER_LOCK_CENTER_Y = H * 0.30;
  const ENEMY_SEEKER_LOCK_SEC = 0.35;
  const ENEMY_SEEKER_DASH_SPEED = 150;
  /** 降下（Area 倍率は移動更新で別掛け。ここには焼き込まない） */
  const ENEMY_SEEKER_DESCEND_SPEED = DEFAULT_ENEMY_A_CFG.vy * ENEMY_B_SPEED_MUL;
  const ENEMY_BULLET_SPEED = 165; // enemyC bullet speed; player bullet uses bulletCfg.speed / bulletSpeedRt
  const ENEMY_BULLET_TINT = '#e22';
  const DEFAULT_ENEMY_C_CFG = Object.freeze(
    Object.assign({}, DEFAULT_ENEMY_A_CFG, { spriteIndex: ENEMY_C_SPRITE_INDEX })
  );
  const DEFAULT_ENEMY_SEEKER_CFG = Object.freeze(
    Object.assign({}, DEFAULT_ENEMY_A_CFG, { spriteIndex: ENEMY_SEEKER_SPRITE_INDEX })
  );
  /** Per-kind defaults for lookup / future enemy kind extensions. */
  const DEFAULT_ENEMY_CFG_BY_KIND = Object.freeze({
    enemyA: DEFAULT_ENEMY_A_CFG,
    enemyB: DEFAULT_ENEMY_B_CFG,
    enemyC: DEFAULT_ENEMY_C_CFG,
    enemySeeker: DEFAULT_ENEMY_SEEKER_CFG
  });
  const OBSTACLE_SPRITE_INDEX = 11;
  const DEFAULT_OBSTACLE_CFG = Object.freeze({
    spriteIndex: OBSTACLE_SPRITE_INDEX,
    w: 16, h: 16,
    r: 6,
    vy: 54,
    spawnEvery: 3.0,
    lanes: Object.freeze([24, 48, 72, 96, 120, 144, 168]),
    enabled: false
  });
  /** SAM 専用の固定ベース tuning（Area 複製に依存しない）。速度は SAM_SPEED_RAMP、spawn 主値は spawn.every。 */
  const SAM_BASE_TUNING = Object.freeze({
    orbMul: 1,
    spawn: Object.freeze({ enabled: true, every: 1.00 }),
    remnant: Object.freeze({ every: 5.0 }),
    enemyA: Object.freeze({ enabled: true, weight: 9 }),
    enemyB: Object.freeze({ enabled: false, weight: 0 }),
    enemyC: Object.freeze({ enabled: false, weight: 0 }),
    enemySeeker: Object.freeze({ enabled: true, weight: 1 }),
    obstacle: Object.freeze({
      enabled: false,
      every: 5.0,
      countWeights: Object.freeze([100, 0, 0]),
      clusterStep: 20,
      maxCount: 3
    })
  });

  /** SAM 専用 ramp の時間解像度（秒）。spawn テーブルはこの粒度で区切る想定。 */
  const SAM_TICK_SEC = 5;
  /**
   * 敵移動速度のみへの線形ランプ（playTimeSec / SAM_SPEED_RAMP_DURATION_SEC）。
   * SAM ramp のループ時間には掛けない。dt 全体にも掛けない。
   */
  const SAM_SPEED_RAMP = Object.freeze({
    start: 1.25,
    end: 1.75
  });
  /** SAM ramp 行の初期状態（tick 0 以前。SAM_RAMP_STEPS で上書きされる）。 */
  function _samRampDefaultState(){
    return {
      spawn: { enabled: true, every: 0.8 },
      remnant: { every: 4.0 },
      enemyA: { enabled: true, weight: 10 },
      enemyB: { enabled: false, weight: 0 },
      enemyC: { enabled: false, weight: 0 },
      enemySeeker: { enabled: false, weight: 0 },
      obstacle: {
        enabled: false,
        every: 5.0,
        countWeights: Object.freeze([100, 0, 0]),
        clusterStep: 20,
        maxCount: 3
      }
    };
  }

  /** obstacle interval: `every` (formal) → `spawnEvery` (legacy) → fallback. */
  function _obstacleEveryFrom(src, fallback){
    if (!src || typeof src !== 'object') return fallback;
    const every = Number(src.every);
    if (Number.isFinite(every) && every > 0) return every;
    const legacy = Number(src.spawnEvery);
    if (Number.isFinite(legacy) && legacy > 0) return legacy;
    return fallback;
  }

  function _applyObstacleBurstFields(dst, src){
    if (!dst || !src || typeof src !== 'object') return;
    if (Array.isArray(src.countWeights)) dst.countWeights = src.countWeights;
    if (Number.isFinite(Number(src.clusterStep))) dst.clusterStep = Number(src.clusterStep);
    if (Number.isFinite(Number(src.maxCount))) dst.maxCount = Number(src.maxCount);
  }

  function _mergeSamRampState(state, step){
    if (!step) return state;
    return {
      spawn: Object.assign({}, state.spawn, step.spawn || {}),
      remnant: Object.assign({}, state.remnant, step.remnant || {}),
      enemyA: Object.assign({}, state.enemyA, step.enemyA || {}),
      enemyB: Object.assign({}, state.enemyB, step.enemyB || {}),
      enemyC: Object.assign({}, state.enemyC, step.enemyC || {}),
      enemySeeker: Object.assign({}, state.enemySeeker, step.enemySeeker || {}),
      obstacle: Object.assign({}, state.obstacle, step.obstacle || {})
    };
  }

  function _freezeSamRampRow(t, state){
    return Object.freeze({
      t,
      tickSec: SAM_TICK_SEC,
      spawn: Object.freeze(Object.assign({}, state.spawn)),
      remnant: Object.freeze(Object.assign({}, state.remnant)),
      enemyA: Object.freeze(Object.assign({}, state.enemyA)),
      enemyB: Object.freeze(Object.assign({}, state.enemyB)),
      enemyC: Object.freeze(Object.assign({}, state.enemyC)),
      enemySeeker: Object.freeze(Object.assign({}, state.enemySeeker)),
      obstacle: Object.freeze(Object.assign({}, state.obstacle))
    });
  }

  /** 指定tickのstepを現在stateへマージする。未指定tickでは直近stateを継続する。 */
  const SAM_RAMP_STEPS = Object.freeze({
    10: Object.freeze({
      spawn: Object.freeze({ enabled: true, every: 0.80 }),
      remnant: Object.freeze({ every: 5.0 }),

      enemyA: Object.freeze({ enabled: true, weight: 7.5 }),
      enemyB: Object.freeze({ enabled: true, weight: 2 }),
      enemyC: Object.freeze({ enabled: false, weight: 0 }),
      enemySeeker: Object.freeze({ enabled: true, weight: 0.5 }),

      obstacle: Object.freeze({ enabled: false, every: 5.0 })
    }),

    20: Object.freeze({
      spawn: Object.freeze({ enabled: true, every: 0.80 }),
      remnant: Object.freeze({ every: 5.0 }),

      enemyA: Object.freeze({ enabled: true, weight: 6 }),
      enemyB: Object.freeze({ enabled: true, weight: 2 }),
      enemyC: Object.freeze({ enabled: true, weight: 1.5 }),
      enemySeeker: Object.freeze({ enabled: true, weight: 0.5 }),

      obstacle: Object.freeze({ enabled: false, every: 5.0 })
    }),

    30: Object.freeze({
      spawn: Object.freeze({ enabled: true, every: 0.75 }),
      remnant: Object.freeze({ every: 5.0 }),

      enemyA: Object.freeze({ enabled: true, weight: 5 }),
      enemyB: Object.freeze({ enabled: true, weight: 1.5 }),
      enemyC: Object.freeze({ enabled: true, weight: 3 }),
      enemySeeker: Object.freeze({ enabled: true, weight: 0.5 }),

      obstacle: Object.freeze({
        enabled: true,
        every: 6.0,
        countWeights: Object.freeze([50, 45, 5]),
        clusterStep: 20,
        maxCount: 1
      })
    }),

    40: Object.freeze({
      spawn: Object.freeze({ enabled: true, every: 0.75 }),
      remnant: Object.freeze({ every: 5.0 }),

      enemyA: Object.freeze({ enabled: true, weight: 2 }),
      enemyB: Object.freeze({ enabled: true, weight: 3 }),
      enemyC: Object.freeze({ enabled: true, weight: 3.5 }),
      enemySeeker: Object.freeze({ enabled: true, weight: 1.5 }),

      obstacle: Object.freeze({
        enabled: true,
        every: 4.0,
        countWeights: Object.freeze([50, 45, 5]),
        clusterStep: 20,
        maxCount: 2
      })
    }),

    50: Object.freeze({
      spawn: Object.freeze({ enabled: true, every: 0.70 }),
      remnant: Object.freeze({ every: 5.0 }),

      enemyA: Object.freeze({ enabled: false, weight: 0 }),
      enemyB: Object.freeze({ enabled: false, weight: 0 }),
      enemyC: Object.freeze({ enabled: false, weight: 0 }),
      enemySeeker: Object.freeze({ enabled: true, weight: 10 }),

      obstacle: Object.freeze({
        enabled: true,
        every: 1.0,
        countWeights: Object.freeze([40, 40, 20]),
        clusterStep: 20,
        maxCount: 3
      })
    }),

    55: Object.freeze({
      spawn: Object.freeze({ enabled: true, every: 0.5 }),
      remnant: Object.freeze({ every: 3.0 }),

      enemyA: Object.freeze({ enabled: true, weight: 10 }),
      enemyB: Object.freeze({ enabled: false, weight: 0 }),
      enemyC: Object.freeze({ enabled: false, weight: 0 }),
      enemySeeker: Object.freeze({ enabled: false, weight: 0 }),

      obstacle: Object.freeze({ enabled: false, every: 2.0 })
    }),

    60: Object.freeze({
      spawn: Object.freeze({ enabled: true, every: 0.5 }),
      remnant: Object.freeze({ every: 999.0 }),

      enemyA: Object.freeze({ enabled: false, weight: 0 }),
      enemyB: Object.freeze({ enabled: true, weight: 10 }),
      enemyC: Object.freeze({ enabled: false, weight: 0 }),
      enemySeeker: Object.freeze({ enabled: false, weight: 0 }),

      obstacle: Object.freeze({ enabled: false, every: 2.0 })
    }),

    65: Object.freeze({
      spawn: Object.freeze({ enabled: true, every: 0.5 }),
      remnant: Object.freeze({ every: 999.0 }),

      enemyA: Object.freeze({ enabled: false, weight: 0 }),
      enemyB: Object.freeze({ enabled: false, weight: 0 }),
      enemyC: Object.freeze({ enabled: true, weight: 10 }),
      enemySeeker: Object.freeze({ enabled: false, weight: 0 }),

      obstacle: Object.freeze({ enabled: false, every: 2.0 })
    }),

    70: Object.freeze({
      spawn: Object.freeze({ enabled: true, every: 0.5 }),
      remnant: Object.freeze({ every: 999.0 }),

      enemyA: Object.freeze({ enabled: true, weight: 3 }),
      enemyB: Object.freeze({ enabled: true, weight: 3 }),
      enemyC: Object.freeze({ enabled: true, weight: 3 }),
      enemySeeker: Object.freeze({ enabled: true, weight: 1 }),

      obstacle: Object.freeze({
        enabled: true,
        every: 3.0,
        countWeights: Object.freeze([40, 40, 20]),
        clusterStep: 20,
        maxCount: 3
      })
    })
  });

  const SAM_RAMP_TABLE = Object.freeze((() => {
    let state = _samRampDefaultState();
    const rows = [];
    const n = Math.floor(SAM_RAMP_DURATION_SEC / SAM_TICK_SEC);
    for (let i = 0; i <= n; i++){
      const t = i * SAM_TICK_SEC;
      const step = SAM_RAMP_STEPS[t];
      if (step) state = _mergeSamRampState(state, step);
      rows.push(_freezeSamRampRow(t, state));
    }
    return rows;
  })());

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function rand(a,b){ return a + Math.random() * (b-a); }
  const floor = (v)=> (v|0);
  function lerp(a,b,t){ return a + (b-a)*t; }
  function easeOutCubic(t){ t=clamp(t,0,1); return 1 - Math.pow(1-t, 3); }

  function _mergeRunCfg(runCfg){
    const inCfg = runCfg || {};
    const out = {
      player: Object.assign({}, DEFAULT_RUN_CFG.player, inCfg.player || {}),
      weapon: Object.assign({}, DEFAULT_RUN_CFG.weapon, inCfg.weapon || {}),
      blast: Object.assign({}, DEFAULT_RUN_CFG.blast, inCfg.blast || {}),
    };
    if (!Array.isArray(out.blast.mulTable)) out.blast.mulTable = DEFAULT_RUN_CFG.blast.mulTable.slice();
    else out.blast.mulTable = out.blast.mulTable.slice();
    // Blast timing の正規化: life は常に grow + shrink（入力に life があっても上書き）。
    // 将来「明示的 life」を再導入する場合は、この直前でフラグ分岐する想定（今回は未使用）。
    out.blast.life = (Number(out.blast.grow) || 0) + (Number(out.blast.shrink) || 0);
    // Base-only one-sortie launch payload (e.g. orb pickup multiplier). Not part of buildRunCfg; preserved for re-apply.
    if (inCfg.launchSession && typeof inCfg.launchSession === 'object'){
      out.launchSession = Object.assign({}, inCfg.launchSession);
    }
    if (inCfg.oneTime !== undefined){
      out.oneTime = (inCfg.oneTime && typeof inCfg.oneTime === 'object')
        ? Object.assign({}, inCfg.oneTime)
        : inCfg.oneTime;
    }
    return out;
  }

  function rectCircleOverlap(rx, ry, rw, rh, cx, cy, cr){
    const px = clamp(cx, rx, rx + rw);
    const py = clamp(cy, ry, ry + rh);
    const dx = cx - px;
    const dy = cy - py;
    return (dx*dx + dy*dy) <= cr*cr;
  }

  function circleHit(ax, ay, ar, bx, by, br){
    const dx = ax - bx, dy = ay - by;
    const rr = ar + br;
    return (dx*dx + dy*dy) <= rr*rr;
  }

function drawDotRing(ctx, cx, cy, r, dot=1){
  const steps = Math.max(10, (r * 6) | 0);
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  const rr = Math.max(1, Math.round(r));

  for (let i=0; i<steps; i++){
    const a = (i / steps) * Math.PI * 2;
    const x = x0 + Math.round(Math.cos(a) * rr);
    const y = y0 + Math.round(Math.sin(a) * rr);
    ctx.fillRect(x, y, dot, dot);
  }
}

// ===== FONT8 renderer (built-in data) =====
const BUILTIN_FONT8_DATA = {
  meta: {
    name: 'FONT8',
    w: 8,
    h: 8,
    bitOrder: 'bit7=left',
    order: ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?-+/*=()[]_#@×',
    yOff: {},
    exported: '2026-03-03T12:47:17.265Z'
  },
  glyphs: {
    '0': [120, 204, 220, 236, 204, 204, 120, 0],
    '1': [48, 112, 48, 48, 48, 48, 120, 0],
    '2': [120, 204, 12, 24, 48, 96, 252, 0],
    '3': [120, 204, 12, 56, 12, 204, 120, 0],
    '4': [12, 28, 60, 108, 204, 252, 12, 0],
    '5': [252, 128, 248, 12, 12, 204, 120, 0],
    '6': [120, 204, 192, 248, 204, 204, 120, 0],
    '7': [252, 204, 12, 24, 24, 48, 48, 0],
    '8': [120, 204, 204, 120, 204, 204, 120, 0],
    '9': [120, 204, 204, 124, 12, 204, 120, 0],
    ' ': [0, 0, 0, 0, 0, 0, 0, 0],
    A: [56, 108, 68, 198, 254, 198, 198, 0],
    B: [252, 198, 198, 252, 198, 198, 252, 0],
    C: [60, 102, 192, 192, 192, 102, 60, 0],
    D: [248, 204, 198, 198, 198, 204, 248, 0],
    E: [254, 192, 192, 252, 192, 192, 254, 0],
    F: [254, 192, 192, 252, 192, 192, 192, 0],
    G: [62, 96, 192, 206, 198, 102, 62, 0],
    H: [198, 198, 198, 254, 198, 198, 198, 0],
    I: [60, 24, 24, 24, 24, 24, 60, 0],
    J: [30, 6, 6, 6, 6, 198, 124, 0],
    K: [198, 204, 216, 240, 248, 220, 206, 0],
    L: [192, 192, 192, 192, 192, 192, 254, 0],
    M: [198, 238, 254, 254, 214, 198, 198, 0],
    N: [198, 230, 246, 254, 222, 206, 198, 0],
    O: [124, 198, 198, 198, 198, 198, 124, 0],
    P: [252, 198, 198, 198, 252, 192, 192, 0],
    Q: [124, 198, 198, 198, 222, 204, 122, 0],
    R: [252, 198, 198, 206, 248, 220, 206, 0],
    S: [124, 198, 192, 124, 6, 198, 124, 0],
    T: [252, 48, 48, 48, 48, 48, 48, 0],
    U: [198, 198, 198, 198, 198, 198, 124, 0],
    V: [198, 198, 198, 198, 108, 56, 16, 0],
    W: [198, 198, 214, 254, 254, 238, 198, 0],
    X: [198, 238, 124, 56, 124, 238, 198, 0],
    Y: [204, 204, 204, 120, 48, 48, 48, 0],
    Z: [254, 14, 28, 56, 112, 224, 254, 0],
    a: [0, 0, 56, 12, 60, 108, 60, 0],
    b: [96, 96, 96, 120, 108, 108, 120, 0],
    c: [0, 0, 56, 108, 96, 108, 56, 0],
    d: [12, 12, 12, 60, 108, 108, 60, 0],
    e: [0, 0, 56, 100, 124, 96, 56, 0],
    f: [0, 24, 48, 48, 120, 48, 48, 0],
    g: [0, 0, 56, 76, 76, 60, 12, 56],
    h: [96, 96, 96, 120, 108, 108, 108, 0],
    i: [0, 48, 0, 48, 48, 48, 48, 0],
    j: [0, 24, 0, 24, 24, 24, 88, 48],
    k: [96, 96, 100, 104, 112, 104, 100, 0],
    l: [48, 48, 48, 48, 48, 48, 24, 0],
    m: [0, 0, 104, 124, 84, 84, 84, 0],
    n: [0, 0, 120, 108, 108, 108, 108, 0],
    o: [0, 0, 56, 108, 108, 108, 56, 0],
    p: [0, 0, 56, 108, 108, 60, 12, 12],
    q: [0, 0, 56, 108, 108, 120, 96, 96],
    r: [0, 0, 120, 108, 96, 96, 96, 0],
    s: [0, 0, 60, 96, 124, 12, 120, 0],
    t: [0, 48, 120, 48, 48, 48, 24, 0],
    u: [0, 0, 108, 108, 108, 108, 60, 0],
    v: [0, 0, 108, 108, 108, 40, 16, 0],
    w: [0, 0, 68, 84, 124, 124, 40, 0],
    x: [0, 0, 108, 40, 16, 40, 108, 0],
    y: [0, 108, 108, 108, 56, 24, 48, 0],
    z: [0, 0, 124, 12, 24, 48, 124, 0],
    '.': [0, 0, 0, 0, 0, 96, 96, 0],
    ',': [0, 0, 0, 0, 0, 96, 96, 32],
    ':': [0, 96, 96, 0, 96, 96, 0, 0],
    ';': [0, 96, 96, 0, 96, 96, 32, 0],
    '!': [56, 56, 56, 48, 48, 0, 48, 0],
    '?': [124, 198, 198, 28, 48, 0, 48, 0],
    '-': [0, 0, 0, 120, 0, 0, 0, 0],
    '+': [0, 0, 48, 120, 48, 0, 0, 0],
    '/': [2, 6, 12, 24, 48, 96, 64, 0],
    '*': [80, 32, 80, 0, 0, 0, 0, 0],
    '=': [0, 0, 120, 0, 120, 0, 0, 0],
    '(': [8, 16, 48, 48, 48, 16, 8, 0],
    ')': [32, 16, 24, 24, 24, 16, 32, 0],
    '[': [56, 48, 48, 48, 48, 48, 56, 0],
    ']': [56, 24, 24, 24, 24, 24, 56, 0],
    _: [0, 0, 0, 0, 0, 60, 126, 0],
    '#': [52, 126, 52, 52, 52, 126, 52, 0],
    '@': [56, 68, 154, 170, 158, 68, 56, 0],
    '×': [0, 68, 40, 16, 40, 68, 0, 0]
  }
};

const FONT8 = (() => {
  const data = BUILTIN_FONT8_DATA;
  const glyphs = data.glyphs || {};
  const meta = data.meta || {};
  const W = (meta.w) ? (meta.w | 0) : 8;
  const H = (meta.h) ? (meta.h | 0) : 8;

  /** @type {Map<string, HTMLCanvasElement>} */
  const _glyphCache = new Map();
  
  function _isLowercase(ch){
    return ch >= 'a' && ch <= 'z';
  }

  function _charAdvance(ch){
    return _isLowercase(ch) ? 7 : W;
  }

  function _getGlyphCanvas(ch, color){
    const key = ch + '|' + color;
    const hit = _glyphCache.get(key);
    if (hit) return hit;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cctx = c.getContext('2d');
    if (!cctx) return c;

    cctx.fillStyle = color;
    const rows = glyphs[ch] || glyphs['?'] || glyphs[' '];
    if (rows){
      for (let ry=0; ry<H; ry++){
        const bits = rows[ry] || 0;
        for (let rx=0; rx<W; rx++){
          if (bits & (0x80 >> rx)) cctx.fillRect(rx, ry, 1, 1);
        }
      }
    }

    _glyphCache.set(key, c);
    return c;
  }

  function measure(txt, spacing=1){
    if (!txt) return 0;

    let w = 0;
    for (let i = 0; i < txt.length; i++){
      w += _charAdvance(txt[i]);
      if (i < txt.length - 1) w += spacing;
    }
    return w;
  }

  function draw(ctx, txt, x, y, color='#fff', spacing=1){
    if (!txt) return;
    for (let i = 0; i < txt.length; i++){
      const ch = txt[i];
      const gc = _getGlyphCanvas(ch, color);
      ctx.drawImage(gc, x, y);
      x += _charAdvance(ch) + spacing;
    }
  }

  function clearCache(){ _glyphCache.clear(); }

  return { w: W, h: H, measure, draw, clearCache };
})();

function drawResultText(ctx, txt, x, y, color='#fff', spacing=1){
  if (!txt) return;

  // 1-dot stroke / outline
  FONT8.draw(ctx, txt, x - 1, y, '#000', spacing);
  FONT8.draw(ctx, txt, x + 1, y, '#000', spacing);
  FONT8.draw(ctx, txt, x, y - 1, '#000', spacing);
  FONT8.draw(ctx, txt, x, y + 1, '#000', spacing);

  // body
  FONT8.draw(ctx, txt, x, y, color, spacing);
}

  /** SAM chain HUD 専用 3x5（左上3列×上5行）。unknown は空白扱い。 */
  const MINI3X5_GLYPHS = Object.freeze({
    ' ': [0, 0, 0, 0, 0],
    '0': [0b010, 0b101, 0b101, 0b101, 0b010],
    '1': [0b010, 0b110, 0b010, 0b010, 0b010],
    '2': [0b010, 0b101, 0b001, 0b010, 0b111],
    '3': [0b110, 0b001, 0b010, 0b001, 0b110],
    '4': [0b001, 0b011, 0b101, 0b111, 0b001],
    '5': [0b111, 0b100, 0b110, 0b001, 0b110],
    '6': [0b010, 0b100, 0b110, 0b101, 0b010],
    '7': [0b111, 0b001, 0b010, 0b010, 0b010],
    '8': [0b111, 0b101, 0b010, 0b101, 0b111],
    '9': [0b011, 0b101, 0b011, 0b001, 0b001],

    A: [0b010, 0b101, 0b111, 0b101, 0b101],
    B: [0b110, 0b101, 0b110, 0b101, 0b110],
    C: [0b010, 0b101, 0b100, 0b101, 0b010],
    H: [0b101, 0b101, 0b111, 0b101, 0b101],
    I: [0b010, 0b010, 0b010, 0b010, 0b010],
    L: [0b100, 0b100, 0b100, 0b100, 0b111],
    M: [0b101, 0b111, 0b111, 0b101, 0b101],
    N: [0b110, 0b101, 0b101, 0b101, 0b101],
    O: [0b111, 0b101, 0b101, 0b101, 0b111],
    P: [0b110, 0b101, 0b110, 0b100, 0b100],
    S: [0b011, 0b100, 0b010, 0b001, 0b110],
    T: [0b111, 0b010, 0b010, 0b010, 0b010],
    U: [0b101, 0b101, 0b101, 0b101, 0b111],
    X: [0b101, 0b101, 0b010, 0b101, 0b101],

    '+': [0b000, 0b010, 0b111, 0b010, 0b000],
    '/': [0b001, 0b001, 0b010, 0b100, 0b100],
  });

  const MINI3X5_W = 3;
  const MINI3X5_H = 5;

  function mini3x5Measure(txt, spacing = 1){
    if (!txt) return 0;
    const n = txt.length;
    return n * MINI3X5_W + Math.max(0, n - 1) * spacing;
  }

  function mini3x5Draw(ctx, txt, x, y, color = '#fff', spacing = 1){
    if (!txt) return;
    ctx.fillStyle = color;
    let penX = x | 0;
    const y0 = y | 0;
    for (let i = 0; i < txt.length; i++){
      let ch = txt[i];
      if (ch >= 'a' && ch <= 'z') ch = String.fromCharCode(ch.charCodeAt(0) - 32);
      const rows = MINI3X5_GLYPHS[ch] || MINI3X5_GLYPHS[' '];
      for (let ry = 0; ry < MINI3X5_H; ry++){
        const row = rows[ry] | 0;
        for (let rx = 0; rx < MINI3X5_W; rx++){
          if ((row >> (2 - rx)) & 1) ctx.fillRect(penX + rx, y0 + ry, 1, 1);
        }
      }
      penX += MINI3X5_W + spacing;
    }
  }

  function mini3x5DrawCenter(ctx, txt, cx, y, color = '#fff', spacing = 1){
    if (!txt) return;
    const w = mini3x5Measure(txt, spacing);
    const x = Math.floor(cx - w / 2);
    mini3x5Draw(ctx, txt, x, y | 0, color, spacing);
  }

  const mod = {
    ready:false,
    img:null,
    imgReady:false,

    /** ARSAM standalone debug: skip collision FAIL when true (not persisted). */
    debugInvincible: false,
    /** shell (arsam.html) が render 直前に同期。描画のみに使用。 */
    shellPaused: false,

    // 出撃1回ぶんの設定（未指定ならDEFAULT_RUN_CFG）
    runCfg: null,

    // ===== Runtime (applied) values =====
    playerSpeed: 52,
    orbGravityRadius: 0,
    orbGravityForce: 0,

    ammoMaxRt: 20,
    ammoStartRt: 5,
    bulletSpeedRt: 220,
    cooldownSecRt: 1.55,

    blastRadiusRt: 11,
    blastGrowRt: 0.20,
    blastShrinkRt: 0.20,
    blastLifeRt: 0.40,
    blastRemnantCarrierRadiusMulRt: 1.00,
    blastRemnantCarrierShrinkMulRt: 1.00,
    blastMulTableRt: null,

    // player in 192-space
    p: { x: (W/2 - 8), y: (H - 24), w:16, h:16, spd: 52 },

    // sprite sheet: 16x96, 16x16 cells
    sheet: { cell:16 },

    // --- STEP 1-B: single shot bullet ---
    ammoMax: 20,
    ammoStart: 5,
    ammo: 0,
    shotUsed: false,
    bullets: [],
    /** 敵弾（プレイヤー弾とは別配列・ブラスト等では消えない） */
    enemyBullets: [],

    bulletCfg: {
      spriteIndex: 3,
      sw: 4, sh: 6,
      speed: 220
    },

    /** enemyC 弾のみ。自機弾 bulletCfg とは分離（見た目 2x5、当たり 2x4）。 */
    enemyBulletCfg: {
      spriteIndex: 3,
      sw: 2,
      sh: 5,
      hitOx: 0,
      hitOy: 0,
      hitW: 2,
      hitH: 4
    },

    // --- STEP 1-C: Cooldown (visual recharge on the ship) ---
    cooldownDur: 1.55,
    cooldownT: 0,        // seconds remaining
    rechargeDots: 14,    // ship inner height (14dot) :contentReference[oaicite:2]{index=2}

    // tinted sprite cache (index|color -> 16x16 canvas)
    _tintCache: new Map(),
    _tintCropCache: new Map(),
    _spriteCellCache: [],

    // --- STEP 2: Enemy A ---
    enemies: [],
    enemyCfg: {
      ...DEFAULT_ENEMY_A_CFG,
      lanes: DEFAULT_ENEMY_A_CFG.lanes.slice(), // center x positions (enemyA spawn row)
    },
    obstacles: [],
    obstacleCfg: {
      ...DEFAULT_OBSTACLE_CFG,
      lanes: DEFAULT_OBSTACLE_CFG.lanes.slice(),
    },
    _obstacleSpawnT: 0,
    samSpawnDefRt: null,
    _spawnT: 0,

    // --- Collision events (per-frame) ---
    colEvents: [],

    // --- Intro / input lock ---
    enterT: 0,             // seconds since entering shooting
    introDur: 1.0,         // ship rise duration
    spawnWarmup: 1.0,      // enemy spawn begins after N seconds (can be <= inputLockDur)
    _targetPy: (H - 24),
    _startPy: (H + 16),    // start below the 192-space screen

    // --- Abort sequence (player ↑ / back during shooting; mode RETREAT) ---
    retreating: false,
    retreatT: 0,
    retreatDur: 1.0,      // seconds: descend -> offscreen
    retreatHold: 2.0,     // seconds: show message, then exit to base
    _retreatStartY: 0,
    abortMsg: 'ABORTED',
    exitReady: false,
    // SAM scaffold: 終了時 payload（exitPayload / _requestExit）は後続 step で SAM 専用化予定。現状は通常 Sortie 同等の loot 形。
    exitPayload: null,
    // --- FAIL (player collides with enemy) ---
    failFrozen: false,
    failT: 0,
    failFreezeDur: 2.0,
    failMsg: 'FAILED',

    /** 操作可能になってからの経過秒（intro / input lock は含めない）。HUD には出さない。 */
    playTimeSec: 0,
    /** RESULT mode 経過秒。 */
    resultT: 0,
    /** RESULT に表示する終端理由（clear / fail など）。 */
    resultReason: null,
    clearMsg: 'CLEARED',

    // --- STEP 3: Blast + Defeat ---
    blasts: [], // {x,y,t,life,r0}
    blastCfg: {
      spriteIndex: 2,
      grow: 0.20,      // ★ 0→最大まで
      shrink: 0.20,    // ★ 最大→0まで
      life: 0.40,      // ★ grow + shrink（applyRunCfg で上書き）
      r0: 11,
      blinkHz: 30,
      cap: 64
    },

    blastMulTableEff: null, // runCfg.blast.mulTable を焼き込んだ「今回の完成テーブル」

    defeatCfg: {
      spriteIndex: 6,  // defeat sprite (added as 7th cell)
      dur: 0.12        // 4-8 frames @60fps
    },

    // --- STEP 5-A: Orbs (drop only; static) ---
    orbs: [], // {x,y,alive,kind}
    orbCfg: {
      spriteIndex: 4,
      remnantSpriteIndex: 5,
      w: 16, h: 16,
      cap: 96,

      // STEP 5-B: physics
      g: 140,          // gravity (px/s^2) in 192-space
      vx0: 18,         // initial drift range (+/-)
      vy0: 24,         // initial fall speed range (0..vy0)
      drag: 0.90,      // velocity damping per 60fps-ish (see step)
      maxVy: 220,      // clamp
      killY: H + 24    // cull line
    },

    orbCount: 0,
    /** Legacy/debug placeholder; not used for SAM tuning. */
    areaIdRt: 0,
    /** Per-area enemy movement multiplier (position updates only). */
    enemySpeedMulRt: 1.0,
    /** SAM ramp tick 長（秒）。将来 SAM_RAMP_TABLE の解像度と揃える。 */
    samTickSecRt: SAM_TICK_SEC,
    /** SAM_RAMP_TABLE 上の現在インデックス（5 秒境界で更新）。 */
    samRampIndexRt: -1,
    /** SAM_RAMP_TABLE の現在行参照（未初期化時は null）。 */
    samRampRowRt: null,
    /** SAM_SPEED_RAMP に基づく線形速度倍率。PLAY 中は enemySpeedMulRt に同期（dt には不掛け）。 */
    samSpeedMulRt: 1.0,
    /** SAM_RAMP_TABLE.remnant.every（Remnant Carrier 間隔・秒）。 */
    samRemnantEveryRt: 5.0,
    /** Area baseline orb pickup multiplier for this sortie. */
    baseAreaOrbMulRt: 1,
    /** One-time orb pickup multiplier for this sortie. */
    oneTimeOrbMulRt: 1,
    /** Final orb pickup amount multiplier (baseArea * oneTime). */
    finalOrbPickupMulRt: 1,
    /** Backward-compatible alias for runtime multiplier references. */
    orbPickupMulRt: 1,
    /** One-sortie remnant bonus runtime config (launchSession-derived, sortie-local only). */
    remnantCarrierBonusRt: null,
    remnantCarrierBonusRemainSecRt: 0,

    orbHitCfg: {
      // player: 16x16 center 基準 radius 4
      pr: 3,

      // orb: center is (orb.x+4, orb.y+4), radius 4 (8〜9の中間)
      ocx: 4,
      ocy: 4,
      or: 4
    },
    
    deathFx: [],
    deathFxCfg: {
      cap: 64,
      lifeMin: 0.32,
      lifeMax: 0.48
    },

    remnantCount: 0,

    /** SAM ラン内スコア（一時）。初期化は reset()。 */
    score: 0,
    /** SAMスコア倍率。Chain threshold到達時に上昇する。 */
    scoreMult: 1,

    /** SAM shot chain state（1 shot 由来の撃破数・HUD表示・chain bonus判定用。永続化には使わない） */
    _samNextShotId: 1,
    _samChains: null,
    _samChainHudLine1: '',
    _samChainHudLine2: '',
    _samChainHudT: 0,
    _samMaxChain: 0,

    setRunCfg(runCfg){
      this.runCfg = runCfg || null;
    },

    /**
     * Map play time onto SAM_RAMP_TABLE lookup time.
     * 0..INTRO uses raw time once; after that only the INTRO..(INTRO+LOOP) window repeats.
     */
    _samRampLookupSec(sec){
      const s = Number(sec);
      const x = Number.isFinite(s) ? Math.max(0, s) : 0;
      if (x < SAM_RAMP_INTRO_SEC) return x;
      return SAM_RAMP_INTRO_SEC + ((x - SAM_RAMP_INTRO_SEC) % SAM_RAMP_LOOP_SEC);
    },

    _getSamRampIndex(sec){
      const table = SAM_RAMP_TABLE;
      if (!table || !table.length) return 0;
      const x = this._samRampLookupSec(sec);
      let idx = 0;
      for (let i = 0; i < table.length; i++){
        const row = table[i];
        if (row && Number(row.t) <= x) idx = i;
        else break;
      }
      return idx;
    },

    _getSamRampRow(sec){
      const table = SAM_RAMP_TABLE;
      const i = this._getSamRampIndex(sec);
      return (table && table[i]) ? table[i] : table[0];
    },

    _getSamLinearSpeedMul(sec){
      const s = Number(sec);
      const x = Number.isFinite(s) ? s : 0;
      const t = clamp(x / SAM_SPEED_RAMP_DURATION_SEC, 0, 1);
      return lerp(SAM_SPEED_RAMP.start, SAM_SPEED_RAMP.end, t);
    },

    /**
     * playTimeSec に応じて ramp 行と線形速度倍率を更新。
     * ramp 行はループ lookup、速度は生の playTimeSec（ループしない）。
     * `samRampIndexRt` / `samRampRowRt` は tick 境界で変化したときのみ更新（`force` で強制）。
     */
    _updateSamRampTick(force){
      const sec = Number(this.playTimeSec);
      const playSec = Number.isFinite(sec) ? Math.max(0, sec) : 0;
      const nextIndex = this._getSamRampIndex(playSec);
      const nextRow = this._getSamRampRow(playSec);
      this.samSpeedMulRt = this._getSamLinearSpeedMul(playSec);
      this.enemySpeedMulRt = this.samSpeedMulRt;
      if (force || nextIndex !== this.samRampIndexRt){
        this.samRampIndexRt = nextIndex;
        this.samRampRowRt = nextRow;
        this._applySamRampRow(nextRow);
      }
    },

    _applySamBaseSpawnDef(){
      const tuning = SAM_BASE_TUNING;
      const baseDef = {
        spawn: Object.assign({}, tuning.spawn),
        enemyA: Object.assign({}, tuning.enemyA),
        enemyB: Object.assign({}, tuning.enemyB),
        enemyC: Object.assign({}, tuning.enemyC),
        enemySeeker: Object.assign({}, tuning.enemySeeker),
        obstacle: Object.assign({}, tuning.obstacle),
      };
      const enemyA = (baseDef.enemyA && typeof baseDef.enemyA === 'object') ? baseDef.enemyA : {};
      const lanes = (Array.isArray(enemyA.lanes) && enemyA.lanes.length)
        ? enemyA.lanes.slice()
        : DEFAULT_ENEMY_A_CFG.lanes.slice();
      const pick = {};
      for (const k of Object.keys(enemyA)){
        if (k === 'lanes' || k === 'mixWeight' || k === 'weight' || k === 'enabled') continue;
        pick[k] = enemyA[k];
      }
      this.enemyCfg = Object.assign({}, DEFAULT_ENEMY_A_CFG, pick, { lanes });

      if (tuning.spawn && typeof tuning.spawn === 'object'){
        const te = Number(tuning.spawn.every);
        if (Number.isFinite(te) && te > 0){
          this.enemyCfg.spawnEvery = te;
        }
      }

      const obstacle = (baseDef.obstacle && typeof baseDef.obstacle === 'object') ? baseDef.obstacle : {};
      const obstacleLanes = (Array.isArray(obstacle.lanes) && obstacle.lanes.length)
        ? obstacle.lanes.slice()
        : DEFAULT_OBSTACLE_CFG.lanes.slice();
      this.obstacleCfg = Object.assign({}, DEFAULT_OBSTACLE_CFG, obstacle, { lanes: obstacleLanes });
      const obsTuning = (tuning && tuning.obstacle && typeof tuning.obstacle === 'object') ? tuning.obstacle : null;
      if (obsTuning && typeof obsTuning.enabled === 'boolean'){
        this.obstacleCfg.enabled = obsTuning.enabled;
      }
      this.obstacleCfg.spawnEvery = _obstacleEveryFrom(
        obsTuning || obstacle,
        Number(DEFAULT_OBSTACLE_CFG.spawnEvery) || 3.0
      );
      _applyObstacleBurstFields(this.obstacleCfg, obsTuning || obstacle);

      const areaEnemyB = (baseDef.enemyB && typeof baseDef.enemyB === 'object') ? baseDef.enemyB : {};
      const areaEnemyC = (baseDef.enemyC && typeof baseDef.enemyC === 'object') ? baseDef.enemyC : {};
      const areaEnemySeeker = (baseDef.enemySeeker && typeof baseDef.enemySeeker === 'object') ? baseDef.enemySeeker : {};
      const mergedEnemyA = Object.assign({}, enemyA);
      const mergedEnemyB = Object.assign({}, areaEnemyB);
      const mergedEnemyC = Object.assign({}, areaEnemyC);
      const mergedEnemySeeker = Object.assign({}, areaEnemySeeker);
      const mergedObstacle = Object.assign({}, obstacle);

      if (tuning && tuning.enemyA && typeof tuning.enemyA === 'object'){
        if (typeof tuning.enemyA.enabled === 'boolean') mergedEnemyA.enabled = tuning.enemyA.enabled;
        if (Number.isFinite(Number(tuning.enemyA.weight))) mergedEnemyA.weight = Number(tuning.enemyA.weight);
        else if (Number.isFinite(Number(tuning.enemyA.mixWeight))) mergedEnemyA.weight = Number(tuning.enemyA.mixWeight);
      }
      if (typeof mergedEnemyA.enabled !== 'boolean'){
        const legacyMix = Number(mergedEnemyA.mixWeight);
        if (Number.isFinite(legacyMix) && legacyMix > 0){
          mergedEnemyA.enabled = true;
          if (!Number.isFinite(Number(mergedEnemyA.weight))) mergedEnemyA.weight = legacyMix;
        } else {
          mergedEnemyA.enabled = false;
          if (!Number.isFinite(Number(mergedEnemyA.weight))) mergedEnemyA.weight = 0;
        }
      } else if (!Number.isFinite(Number(mergedEnemyA.weight))){
        const legacyMix = Number(mergedEnemyA.mixWeight);
        mergedEnemyA.weight = Number.isFinite(legacyMix) ? legacyMix : 0;
      }
      if (tuning && tuning.enemyB && typeof tuning.enemyB === 'object'){
        if (typeof tuning.enemyB.enabled === 'boolean') mergedEnemyB.enabled = tuning.enemyB.enabled;
        if (Number.isFinite(Number(tuning.enemyB.weight))) mergedEnemyB.weight = Number(tuning.enemyB.weight);
      }
      if (tuning && tuning.enemyC && typeof tuning.enemyC === 'object'){
        if (typeof tuning.enemyC.enabled === 'boolean') mergedEnemyC.enabled = tuning.enemyC.enabled;
        if (Number.isFinite(Number(tuning.enemyC.weight))) mergedEnemyC.weight = Number(tuning.enemyC.weight);
      }
      if (tuning && tuning.enemySeeker && typeof tuning.enemySeeker === 'object'){
        if (typeof tuning.enemySeeker.enabled === 'boolean') mergedEnemySeeker.enabled = tuning.enemySeeker.enabled;
        if (Number.isFinite(Number(tuning.enemySeeker.weight))) mergedEnemySeeker.weight = Number(tuning.enemySeeker.weight);
      }
      if (obsTuning && typeof obsTuning.enabled === 'boolean') mergedObstacle.enabled = obsTuning.enabled;
      mergedObstacle.every = this.obstacleCfg.spawnEvery;
      _applyObstacleBurstFields(mergedObstacle, this.obstacleCfg);

      const mergedSpawn = Object.assign({}, baseDef.spawn || {});
      if (typeof mergedSpawn.enabled !== 'boolean') mergedSpawn.enabled = true;
      if (tuning.spawn && typeof tuning.spawn === 'object'){
        if (typeof tuning.spawn.enabled === 'boolean') mergedSpawn.enabled = tuning.spawn.enabled;
        const te = Number(tuning.spawn.every);
        if (Number.isFinite(te) && te > 0) mergedSpawn.every = te;
      }
      if (!Number.isFinite(Number(mergedSpawn.every)) || Number(mergedSpawn.every) <= 0){
        mergedSpawn.every = this.enemyCfg.spawnEvery;
      }

      const baseRemEvery =
        (tuning.remnant && Number.isFinite(Number(tuning.remnant.every)) && Number(tuning.remnant.every) > 0)
          ? Number(tuning.remnant.every)
          : (Number(SAM_BASE_TUNING.remnant.every) || 5.0);

      this.samSpawnDefRt = Object.assign({}, baseDef, {
        spawn: mergedSpawn,
        enemyA: mergedEnemyA,
        enemyB: mergedEnemyB,
        enemyC: mergedEnemyC,
        enemySeeker: mergedEnemySeeker,
        obstacle: mergedObstacle,
        remnant: Object.assign({}, (baseDef.remnant && typeof baseDef.remnant === 'object') ? baseDef.remnant : {}, { every: baseRemEvery })
      });
    },

    /**
     * SAM_RAMP_TABLE の現在行を spawn / enemy mix / obstacle / remnant に反映。
     * _applySamBaseSpawnDef() 後の samSpawnDefRt をベースに上書きする（lanes 等は維持）。
     */
    _applySamRampRow(row){
      const table = SAM_RAMP_TABLE;
      const src = row || (table && table[0]) || null;
      if (!src) return;
      const def = this.samSpawnDefRt;
      if (!def) return;

      const mergedSpawn = Object.assign({}, def.spawn || {});
      const rowSpawn = src.spawn;
      if (rowSpawn && typeof rowSpawn === 'object'){
        if (typeof rowSpawn.enabled === 'boolean') mergedSpawn.enabled = rowSpawn.enabled;
        const spawnEvery = Number(rowSpawn.every);
        if (Number.isFinite(spawnEvery) && spawnEvery > 0){
          mergedSpawn.every = spawnEvery;
          this.enemyCfg.spawnEvery = spawnEvery;
        }
      }
      const legacySpawnEvery = Number(src.enemySpawnEvery);
      if (Number.isFinite(legacySpawnEvery) && legacySpawnEvery > 0){
        mergedSpawn.every = legacySpawnEvery;
        this.enemyCfg.spawnEvery = legacySpawnEvery;
      }
      def.spawn = mergedSpawn;

      const applyEnemyRamp = (key) => {
        const patch = src[key];
        if (!patch || typeof patch !== 'object') return;
        const merged = Object.assign({}, def[key] || {});
        if (typeof patch.enabled === 'boolean') merged.enabled = patch.enabled;
        if (Number.isFinite(Number(patch.weight))) merged.weight = Number(patch.weight);
        else if (Number.isFinite(Number(patch.mixWeight))) merged.weight = Number(patch.mixWeight);
        def[key] = merged;
      };
      applyEnemyRamp('enemyA');
      applyEnemyRamp('enemyB');
      applyEnemyRamp('enemyC');
      applyEnemyRamp('enemySeeker');

      const rowObs = src.obstacle;
      if (rowObs && typeof rowObs === 'object'){
        const mergedObs = Object.assign({}, def.obstacle || {});
        if (typeof rowObs.enabled === 'boolean'){
          mergedObs.enabled = rowObs.enabled;
          this.obstacleCfg.enabled = rowObs.enabled;
        }
        const obsEvery = _obstacleEveryFrom(rowObs, NaN);
        if (Number.isFinite(obsEvery) && obsEvery > 0){
          mergedObs.every = obsEvery;
          this.obstacleCfg.spawnEvery = obsEvery;
        }
        _applyObstacleBurstFields(mergedObs, rowObs);
        _applyObstacleBurstFields(this.obstacleCfg, rowObs);
        def.obstacle = mergedObs;
      }

      const rowRem = src.remnant;
      if (rowRem && typeof rowRem === 'object'){
        const remEvery = Number(rowRem.every);
        if (Number.isFinite(remEvery) && remEvery > 0){
          this.samRemnantEveryRt = remEvery;
          def.remnant = Object.assign({}, def.remnant || {}, { every: remEvery });
        }
      }
    },

    /**
     * Picks formation kind for the wave (enemyA/B/C/seeker).
     * Uses enabled/weight on each kind; returns null when all weights are zero.
     */
    _pickSpawnEnemyKind(){
      const def = this.samSpawnDefRt;
      const aRow = def && def.enemyA;
      const bRow = def && def.enemyB;
      const cRow = def && def.enemyC;
      const sRow = def && def.enemySeeker;
      const wA = (aRow && aRow.enabled)
        ? Math.max(0, Number(aRow.weight) || 0)
        : 0;
      const wB = (bRow && bRow.enabled)
        ? Math.max(0, Number(bRow.weight) || 0)
        : 0;
      const wC = (cRow && cRow.enabled)
        ? Math.max(0, Number(cRow.weight) || 0)
        : 0;
      const wS = (sRow && sRow.enabled)
        ? Math.max(0, Number(sRow.weight) || 0)
        : 0;
      const sum = wA + wB + wC + wS;
      if (!(sum > 0)) return null;
      let roll = Math.random() * sum;
      if (roll < wA) return 'enemyA';
      roll -= wA;
      if (roll < wB) return 'enemyB';
      roll -= wB;
      if (roll < wC) return 'enemyC';
      return 'enemySeeker';
    },

    /** Live enemy sprite (remnant marker uses shared remnant sprite for all kinds). */
    _enemyLiveSpriteIndex(e){
      if (e && e.enemyKind === 'enemySeeker') return ENEMY_SEEKER_SPRITE_INDEX;
      if (e && e.hasRemnant){
        if (e.enemyKind === 'enemyB') return ENEMY_B_REMNANT_SPRITE_INDEX;
        if (e.enemyKind === 'enemyC') return ENEMY_C_REMNANT_SPRITE_INDEX;
        return this.enemyCfg.remnantSpriteIndex;
      }
      if (e && e.enemyKind === 'enemyB') return ENEMY_B_SPRITE_INDEX;
      if (e && e.enemyKind === 'enemyC') return ENEMY_C_SPRITE_INDEX;
      return this.enemyCfg.spriteIndex;
    },

    applyRunCfg(runCfg){
      const rc = _mergeRunCfg((runCfg !== undefined) ? runCfg : this.runCfg);
      this.runCfg = rc;
      {
        const ls = rc.launchSession;
        this.areaIdRt = 0;
        this.enemySpeedMulRt = 1.0;

        const baseMul = (ls && typeof ls === 'object') ? Number(ls.orbPickupMulBase) : NaN;
        const oneTimeMul = (ls && typeof ls === 'object') ? Number(ls.orbPickupMulOneTime) : NaN;
        const mergedMul = (ls && typeof ls === 'object') ? Number(ls.orbPickupMul) : NaN;
        const tuningOrbMul = Number(SAM_BASE_TUNING.orbMul);
        if (Number.isFinite(baseMul) && baseMul > 0){
          this.baseAreaOrbMulRt = baseMul;
        } else if (Number.isFinite(mergedMul) && mergedMul > 0){
          this.baseAreaOrbMulRt = mergedMul;
        } else if (Number.isFinite(tuningOrbMul) && tuningOrbMul > 0){
          this.baseAreaOrbMulRt = tuningOrbMul;
        } else {
          this.baseAreaOrbMulRt = 1;
        }
        this.oneTimeOrbMulRt = (Number.isFinite(oneTimeMul) && oneTimeMul > 0) ? oneTimeMul : 1;
        this.finalOrbPickupMulRt = Math.max(1, Math.floor(this.baseAreaOrbMulRt * this.oneTimeOrbMulRt));
        this.orbPickupMulRt = this.finalOrbPickupMulRt;

        const remBonus = (ls && typeof ls === 'object') ? ls.remnantCarrierBonus : null;
        const windowSec = remBonus ? Number(remBonus.windowSec) : NaN;
        const everySec = remBonus ? Number(remBonus.everySec) : NaN;
        if (Number.isFinite(windowSec) && windowSec > 0 && Number.isFinite(everySec) && everySec > 0){
          this.remnantCarrierBonusRt = { windowSec, everySec };
        } else {
          this.remnantCarrierBonusRt = null;
        }
      }
      this._applySamBaseSpawnDef();
      this.samRemnantEveryRt = Number(SAM_BASE_TUNING.remnant.every) || 5.0;

      // player.speed ← runCfg (Base/buildRunCfg: movement_speed)
      this.playerSpeed = clamp(+rc.player.speed || DEFAULT_RUN_CFG.player.speed, 10, 240);
      // legacy storage (hitbox/movement code may still reference p.spd)
      this.p.spd = this.playerSpeed;

      // orb attraction (gravity)
      this.orbGravityRadius = clamp(+rc.player.orbGravityRadius || 0, 0, 999);
      this.orbGravityForce = clamp(+rc.player.orbGravityForce || 0, 0, 9999);

      // weapon
      this.ammoMaxRt = clamp((rc.weapon.ammoMax|0) || DEFAULT_RUN_CFG.weapon.ammoMax, 1, 999);
      this.ammoStartRt = clamp((rc.weapon.ammoStart|0) || DEFAULT_RUN_CFG.weapon.ammoStart, 0, this.ammoMaxRt);
      this.bulletSpeedRt = clamp(+rc.weapon.bulletSpeed || DEFAULT_RUN_CFG.weapon.bulletSpeed, 10, 2000);
      // weapon.cooldownSec ← runCfg (Base/buildRunCfg: shot_cooldown)
      this.cooldownSecRt = clamp(+rc.weapon.cooldownSec || DEFAULT_RUN_CFG.weapon.cooldownSec, 0.05, 30);

      // legacy storage (keep existing external/state fields stable)
      this.ammoMax = this.ammoMaxRt;
      this.ammoStart = this.ammoStartRt;
      this.bulletCfg.speed = this.bulletSpeedRt;
      this.cooldownDur = this.cooldownSecRt;

      // blast.radius ← runCfg (Base/buildRunCfg: blast_radius)
      this.blastRadiusRt = clamp(+rc.blast.radius || DEFAULT_RUN_CFG.blast.radius, 1, this.blastCfg.cap);
      this.blastGrowRt = clamp(+rc.blast.grow || DEFAULT_RUN_CFG.blast.grow, 0.01, 10);
      this.blastShrinkRt = clamp(+rc.blast.shrink || DEFAULT_RUN_CFG.blast.shrink, 0.01, 10);
      this.blastLifeRt = clamp(this.blastGrowRt + this.blastShrinkRt, 0.05, 30);
      this.blastRemnantCarrierRadiusMulRt = clamp(
        +rc.blast.remnantCarrierRadiusMul || DEFAULT_RUN_CFG.blast.remnantCarrierRadiusMul,
        0.01,
        10
      );
      this.blastRemnantCarrierShrinkMulRt = clamp(
        +rc.blast.remnantCarrierShrinkMul || DEFAULT_RUN_CFG.blast.remnantCarrierShrinkMul,
        0.01,
        10
      );
      rc.blast.grow = this.blastGrowRt;
      rc.blast.shrink = this.blastShrinkRt;
      rc.blast.life = this.blastLifeRt;
      rc.blast.remnantCarrierRadiusMul = this.blastRemnantCarrierRadiusMulRt;
      rc.blast.remnantCarrierShrinkMul = this.blastRemnantCarrierShrinkMulRt;

      this.blastMulTableRt = Array.isArray(rc.blast.mulTable) ? rc.blast.mulTable.slice() : DEFAULT_RUN_CFG.blast.mulTable.slice();
      this.blastMulTableEff = this.blastMulTableRt.slice();

      // legacy storage (blastCfg is now "defaults + caps"; runtime reads *_Rt)
      this.blastCfg.r0 = this.blastRadiusRt;
      this.blastCfg.grow = this.blastGrowRt;
      this.blastCfg.shrink = this.blastShrinkRt;
      this.blastCfg.life = this.blastLifeRt;

      // SAM: 弾数は runCfg より SAM_AMMO_CFG を優先（finite / infinite の切替はここ1か所）。
      this._applySamAmmoCaps();
    },

    _samAmmoIsInfinite(){
      return String(SAM_AMMO_CFG.mode) === 'infinite';
    },

    /** SAM_AMMO_CFG に合わせて ammo 上限・初期のみ上書き（発射クールダウン等は runCfg のまま）。 */
    _applySamAmmoCaps(){
      const mx = clamp((Number(SAM_AMMO_CFG.finiteMax) || 20) | 0, 1, 999);
      const st = clamp((Number(SAM_AMMO_CFG.finiteStart) || 0) | 0, 0, mx);
      this.ammoMaxRt = mx;
      this.ammoStartRt = st;
      this.ammoMax = mx;
      this.ammoStart = st;
    },

    _resetSamAmmoState(){
      if (this._samAmmoIsInfinite()){
        this.ammo = Math.max(0, this.ammoMaxRt | 0);
      } else {
        this.ammo = Math.min(this.ammoStart, this.ammoMax);
      }
    },

    _recoverSamAmmoFromRemnant(){
      if (this._samAmmoIsInfinite()) return;
      const n = Math.max(0, Number(SAM_AMMO_CFG.remnantRecover) || 0);
      if (n <= 0) return;
      this.ammo = Math.min(this.ammoMax, this.ammo + n);
    },

    // ===== Hitboxes (single source of truth) =====
    _hit_player(){
      // ship 16x16, center base
      return { x: this.p.x + 8, y: this.p.y + 8, r: this.orbHitCfg.pr };
    },
    // Orb / Remnant pickup only: same top edge, ~2px more reach below
    _hit_playerPickup(){
      return { x: this.p.x + 8, y: this.p.y + 9, r: 5 };
    },
    _hit_enemy(e){
      return {
        x: e.x + this.enemyCfg.w/2,
        y: e.y + this.enemyCfg.h/2,
        r: this.enemyCfg.r
      };
    },
    _hit_obstacle(o){
      return {
        x: o.x + this.obstacleCfg.w/2,
        y: o.y + this.obstacleCfg.h/2,
        r: this.obstacleCfg.r
      };
    },
    _hit_orb(o){
      // orb sprite 16x16 だけど、当たりは「見た目のコア」に寄せる
      return {
        x: o.x + this.orbHitCfg.ocx,
        y: o.y + this.orbHitCfg.ocy,
        r: this.orbHitCfg.or
      };
    },

    reset(runCfg){
      if (runCfg !== undefined) this.setRunCfg(runCfg);
      this.applyRunCfg();

      this.p.x = (W/2 - 8);
      // start off-screen, then rise to target
      this._targetPy = (H - 24);
      this._startPy  = (H + 16);
      this.p.y = this._startPy;
      this.enterT = 0;
      this.cooldownT = 0;

      this._resetSamAmmoState();
      this.shotUsed = false;
      this.bullets.length = 0;
      this.enemyBullets.length = 0;

      this.enemies.length = 0;
      this._spawnT = 0;
      this.obstacles.length = 0;
      this._obstacleSpawnT = 0;

      this._remnantT = 0; // ★経過時間
      this._remnantDue = false; // ★開始直後に1体出したいならtrue、不要ならfalse
      this.remnantCarrierBonusRemainSecRt = this.remnantCarrierBonusRt
        ? this.remnantCarrierBonusRt.windowSec
        : 0;

      this.blasts.length = 0;
      this.orbs.length = 0;
      this.deathFx.length = 0;
      this.orbCount = 0;

      this.retreating = false;
      this.retreatT = 0;
      this.exitReady = false;
      this.exitPayload = null;
      this.failFrozen = false;
      this.failT = 0;
            
      this.mode = 'PLAY';
      this.modeT = 0;
      
      this.remnantCount = 0;
      this._pendingExitReason = null;

      this.score = 0;
      this.scoreMult = 1;

      this._samNextShotId = 1;
      this._samChains = new Map();
      this._samChainHudLine1 = '';
      this._samChainHudLine2 = '';
      this._samChainHudT = 0;
      this._samMaxChain = 0;

      this.playTimeSec = 0;
      this.resultT = 0;
      this.resultReason = null;

      this.samTickSecRt = SAM_TICK_SEC;
      this.samRampIndexRt = -1;
      this.samRampRowRt = null;
      this.samSpeedMulRt = 1.0;
      this.samRemnantEveryRt = Number(SAM_BASE_TUNING.remnant.every) || 5.0;
      this._updateSamRampTick(true);
    },

    ensureImage(){
      if (this.imgReady) return;

      if (!this.img) {
        const img = new Image();

        img.onload = () => {
          this.imgReady = true;
          this._buildSpriteCellCache();
        };

        img.src = 'arSprites.png';
        this.img = img;
      }

      if (this.img && this.img.complete && this.img.naturalWidth > 0) {
        this.imgReady = true;
        this._buildSpriteCellCache();
      }
    },

    _buildSpriteCellCache(){
      if (!this.imgReady || !this.img) return;
      if (this._spriteCellCache && this._spriteCellCache.length > 0) return;

      const s = this.sheet.cell;
      const count = Math.floor((this.img.naturalHeight || this.img.height || 0) / s);
      if (count <= 0) return;

      this._spriteCellCache = new Array(count);

      for (let index = 0; index < count; index++){
        const c = document.createElement('canvas');
        c.width = s;
        c.height = s;
        const cctx = c.getContext('2d');
        if (!cctx){
          this._spriteCellCache[index] = c;
          continue;
        }
        cctx.imageSmoothingEnabled = false;
        cctx.drawImage(this.img, 0, index * s, s, s, 0, 0, s, s);
        this._spriteCellCache[index] = c;
      }
    },

    invalidateRenderCaches(){
      this._spriteCellCache = [];
      if (this._tintCache && typeof this._tintCache.clear === 'function') this._tintCache.clear();
      if (this._tintCropCache && typeof this._tintCropCache.clear === 'function') this._tintCropCache.clear();
      if (FONT8 && typeof FONT8.clearCache === 'function') FONT8.clearCache();
      if (this.imgReady && this.img) this._buildSpriteCellCache();
    },
    
    init(runCfg){
      const merged = _mergeRunCfg((runCfg != null && typeof runCfg === 'object') ? runCfg : {});
      this.setRunCfg(merged);
      this.applyRunCfg(merged);
      this.ensureImage();
      this.reset();
      this.ready = true;
    },

    setDebugInvincible(flag){
      this.debugInvincible = !!flag;
    },

    toggleDebugInvincible(){
      this.setDebugInvincible(!this.debugInvincible);
      return this.debugInvincible;
    },

    _drawPlayDebugOverlay600(ctx){
      if (!ctx || this.mode !== 'PLAY') return;
      const cw = ctx.canvas && ctx.canvas.width ? ctx.canvas.width : 0;
      if (cw > 0 && cw <= 256) return;

      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      let msg = `ARSAM DEBUG  —  TIME ${Math.floor(this.playTimeSec || 0)}s  —  TICK ${this.samRampIndexRt | 0}`;
      if (this.debugInvincible) msg += '  —  INV ON';
      ctx.fillText(msg, 300, 594);
      ctx.restore();
    },

    drawSpriteIndex(ctx, index, dx, dy){
      if (!this.imgReady) return;
      const cell = this._spriteCellCache[index];
      if (cell){
        ctx.drawImage(cell, dx, dy);
        return;
      }
      const s = this.sheet.cell;
      const sx = 0;
      const sy = index * s;
      ctx.drawImage(this.img, sx, sy, s, s, dx, dy, s, s);
    },

    drawSpriteCrop(ctx, index, sx0, sy0, sw, sh, dx, dy, dw, dh){
      if (!this.imgReady) return;
      const s = this.sheet.cell;
      const sx = 0 + sx0;
      const sy = index * s + sy0;
      ctx.drawImage(this.img, sx, sy, sw, sh, dx, dy, dw, dh);
    },

    _getTintedSpriteCanvas(index, color){
      const key = index + '|' + color;
      const hit = this._tintCache.get(key);
      if (hit) return hit;

      const s = this.sheet.cell;
      const c = document.createElement('canvas');
      c.width = s; c.height = s;
      const cctx = c.getContext('2d');
      if (!cctx) return c;

      // draw original sprite
      cctx.imageSmoothingEnabled = false;
      const baseCell = this._spriteCellCache[index];
      if (baseCell){
        cctx.drawImage(baseCell, 0, 0);
      } else {
        const sx = 0;
        const sy = index * s;
        cctx.drawImage(this.img, sx, sy, s, s, 0, 0, s, s);
      }

      // recolor by alpha mask
      cctx.globalCompositeOperation = 'source-in';
      cctx.fillStyle = color;
      cctx.fillRect(0, 0, s, s);
      cctx.globalCompositeOperation = 'source-over';

      this._tintCache.set(key, c);
      return c;
    },

    drawSpriteTinted(ctx, index, dx, dy, color){
      if (!this.imgReady) return;
      const c = this._getTintedSpriteCanvas(index, color);
      ctx.drawImage(c, dx, dy);
    },

    _getTintedSpriteCropCanvas(index, sx0, sy0, sw, sh, color){
      const key = index + '|' + sx0 + '|' + sy0 + '|' + sw + '|' + sh + '|' + color;
      const hit = this._tintCropCache.get(key);
      if (hit) return hit;

      const s = this.sheet.cell;
      const c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      const cctx = c.getContext('2d');
      if (!cctx) return c;

      const sx = sx0;
      const sy = index * s + sy0;
      cctx.imageSmoothingEnabled = false;
      cctx.drawImage(this.img, sx, sy, sw, sh, 0, 0, sw, sh);
      cctx.globalCompositeOperation = 'source-in';
      cctx.fillStyle = color;
      cctx.fillRect(0, 0, sw, sh);
      cctx.globalCompositeOperation = 'source-over';

      this._tintCropCache.set(key, c);
      return c;
    },

    drawSpriteCropTinted(ctx, index, sx0, sy0, sw, sh, dx, dy, dw, dh, color){
      if (!this.imgReady) return;
      const c = this._getTintedSpriteCropCanvas(index, sx0, sy0, sw, sh, color);
      ctx.drawImage(c, 0, 0, sw, sh, dx, dy, dw, dh);
    },

    _spawnBullet(){
      if (this.cooldownT > 0) return false;
      if (this.shotUsed) return false;
      if (!this._samAmmoIsInfinite() && this.ammo <= 0){
        window.AR_SFX?.play('no_ammo');
        return false;
      }
      if (this.bullets.length) return false;

      const cfg = this.bulletCfg;
      const bx = (this.p.x + this.p.w/2 - cfg.sw/2 + 1);
      const by = (this.p.y - cfg.sh - 1 + 8);

      const shotId = this._samNextShotId++;
      this.bullets.push({
        x: bx, y: by,
        vx: 0, vy: -this.bulletSpeedRt,
        w: cfg.sw, h: cfg.sh,
        alive: true,
        shotId
      });

      if (!this._samAmmoIsInfinite()) this.ammo -= 1;
      this.shotUsed = true;

      // ★ cooldown start
      this.cooldownT = this.cooldownSecRt;

      window.AR_SFX?.play('shot');
      return true;
    },

    startAbort(){
      // SAMでは未使用（abort 入力無効のため通常フローから呼ばれない）。RETREAT 分岐は過去互換のため残す。
      if (this.mode !== 'PLAY') return;

      this.mode = 'RETREAT';
      this.modeT = 0;

      this.retreating = true;
      this.retreatT = 0;
      this._retreatStartY = this.p.y;

      this._pendingExitReason = SAM_EXIT_REASON.ABORTED;

      if (typeof window !== 'undefined' && typeof window.blip === 'function'){
        window.blip(220, 60, 0.10);
      }
    },

    startFail(){
      if (this.mode !== 'PLAY') return;
      if (this.debugInvincible) return;

      this.resultReason = SAM_EXIT_REASON.FAILED;
      this._pendingExitReason = SAM_EXIT_REASON.FAILED;
      this.mode = 'RESULT';
      this.modeT = 0;
      this.resultT = 0;
      this.failFrozen = false;
      this.failT = 0;

      window.AR_SFX?.play('miss');
    },

    /** RESULT の exit までのホールド秒数（fail / clear など）。 */
    _getResultHoldSec(){
      const r = this.resultReason || this._pendingExitReason;
      if (isFailedSamExit(r)) return SAM_FAIL_RESULT_HOLD_SEC;
      return SAM_CLEAR_RESULT_HOLD_SEC;
    },

    // --- State machine ---
    // 'PLAY' | 'RETREAT'（SAMでは未使用）| 'FAIL' | 'RESULT'
    // Future: clear 専用演出なら 'CLEAR' / 'CLEAR_PRESENTATION' を PLAY→RESULT の間に挟める想定（ARSAM は endless のため通常は未使用）。
    mode: 'PLAY',
    modeT: 0,       // seconds elapsed in current mode
    
_getBlastMulTable(){
  if (Array.isArray(this.blastMulTableEff) && this.blastMulTableEff.length) return this.blastMulTableEff;
  const rc = this.runCfg;
  if (rc && rc.blast && Array.isArray(rc.blast.mulTable) && rc.blast.mulTable.length) return rc.blast.mulTable;
  return DEFAULT_RUN_CFG.blast.mulTable;
},
_getBlastMulForGen(gen){
  const t = this._getBlastMulTable();
  return (t[gen] != null) ? t[gen] : 0;
},
_getBlastMaxGen(){
  const t = this._getBlastMulTable();
  return Math.max(0, t.length - 1);
},

_getBlastRadius(bl){
  const t = bl.t;

  // 0..1 : grow
  if (t < this.blastGrowRt){
    const u = t / Math.max(0.001, this.blastGrowRt);
    // 立ち上がり気持ちよく：easeOut
    const g = 1 - Math.pow(1-u, 3);
    return bl.r0 * g;
  }

  // 1..0 : shrink
  const tt = t - this.blastGrowRt;
  const shrink = Number(bl.shrink);
  const effShrink = (Number.isFinite(shrink) && shrink > 0) ? shrink : this.blastShrinkRt;
  const u = tt / Math.max(0.001, effShrink);
  const s = 1 - Math.min(1, u);
  return bl.r0 * s;
},

_spawnBlast(cx, cy, gen=0, radiusMul=1, shrinkMul=1, shotId=null){
  const cfg = this.blastCfg;
  const mul = this._getBlastMulForGen(gen);
  if (mul <= 0) return;

  const effShrinkMul = (Number.isFinite(Number(shrinkMul)) && Number(shrinkMul) > 0) ? Number(shrinkMul) : 1;
  const blastShrink = this.blastShrinkRt * effShrinkMul;
  const blastLife = this.blastGrowRt + blastShrink;
  if (this.blasts.length >= cfg.cap) this.blasts.shift();
  this.blasts.push({
    x: cx, y: cy,
    t: 0,
    life: blastLife,
    shrink: blastShrink,
    gen,
    r0: this.blastRadiusRt * mul * radiusMul,
    shotId
  });
},

_spawnOrbAt(cx, cy, kind=0){
  const cfg = this.orbCfg;
  if (this.orbs.length >= cfg.cap) this.orbs.shift();

  const vx = rand(-cfg.vx0, cfg.vx0);
  const vy = rand(0, cfg.vy0);

  const orb = {
    x: cx - cfg.w/2,
    y: cy - cfg.h/2,
    vx, vy,
    alive: true,
    kind: kind|0
  };
  this.orbs.push(orb);
},

_getSamEnemyBasePoint(enemyKind){
  const k = enemyKind || 'enemyA';
  const v = SAM_SCORE_TABLE[k];
  if (Number.isFinite(v)) return v;
  return SAM_SCORE_TABLE.enemyA;
},

/**
 * @param {number} basePoint
 * @param {string} reason 将来 chain / floating score / log 用（現状未使用）
 */
_addSamScore(basePoint, reason){
  void reason;
  const bp = Math.max(0, Number(basePoint) || 0);
  const mul = Math.max(1, this.scoreMult | 0);
  const add = Math.floor(bp * mul);
  if (add <= 0) return 0;
  this.score = Math.max(0, (this.score | 0) + add);
  return add;
},

_addSamScoreForEnemy(e){
  if (!e) return 0;
  if (!e.alive) return 0;
  const bp = this._getSamEnemyBasePoint(e.enemyKind);
  return this._addSamScore(bp, e.enemyKind || 'enemyA');
},

/** SAM scoreMultを+n。主にChain threshold報酬で使用する。 */
_addSamMult(n = 1){
  const add = Math.max(0, Number(n) || 0);
  if (add <= 0) return this.scoreMult | 0;
  this.scoreMult = Math.min(SAM_MULT_MAX, Math.max(1, (this.scoreMult | 0) + add));
  return this.scoreMult;
},

/** SAM chain HUD: line1 / line2 とホールド秒。 */
_setSamChainHud(line1, line2 = '', holdSec = 1.0){
  this._samChainHudLine1 = (line1 != null) ? String(line1) : '';
  this._samChainHudLine2 = (line2 != null) ? String(line2) : '';
  this._samChainHudT = Math.max(0, Number(holdSec) || 0);
},

/**
 * kills が threshold に初めて達したときだけテーブル行を返す（`row.awardedChainBonus` に記録）。
 * 該当なし・既に処理済みは `null`。
 * @returns {Readonly<{kills:number,add:number,total:number}>|null}
 */
_getSamChainBonusAwardForKills(row, kills){
  if (!row) return null;
  const k = kills | 0;
  let awarded = row.awardedChainBonus;
  if (!awarded || typeof awarded !== 'object'){
    awarded = Object.create(null);
    row.awardedChainBonus = awarded;
  }
  for (let i = 0; i < SAM_CHAIN_BONUS_TABLE.length; i++){
    const e = SAM_CHAIN_BONUS_TABLE[i];
    const tk = e.kills | 0;
    if (tk !== k) continue;
    if (awarded[k]) return null;
    awarded[k] = true;
    return e;
  }
  return null;
},

/** 将来・単体テスト用: line2 のみ更新（timer / line1 は触らない）。通常は _setSamChainHud を使う。 */
_setSamChainBonusHud(bonus){
  const n = Math.max(0, Math.floor(Number(bonus) || 0));
  this._samChainHudLine2 = 'BONUS +' + String(n);
},

/** SAM: 1 shot 由来の撃破数を記録し chain HUD を更新。shotId が無効なら何もしない。 */
_noteSamShotKill(shotId){
  if (shotId == null) return;
  const map = this._samChains;
  if (!map) return;
  let row = map.get(shotId);
  if (!row){
    row = { kills: 0, awardedChainBonus: Object.create(null), bonusTotal: 0, multTotal: 0 };
    map.set(shotId, row);
  } else if (!row.awardedChainBonus || typeof row.awardedChainBonus !== 'object'){
    row.awardedChainBonus = Object.create(null);
  }
  if (!Number.isFinite(Number(row.bonusTotal))) row.bonusTotal = 0;
  if (!Number.isFinite(Number(row.multTotal))) row.multTotal = 0;
  row.kills++;
  const kills = row.kills;
  this._samMaxChain = Math.max(this._samMaxChain | 0, kills);
  const kills2 = String(kills | 0).padStart(2, '0');
  const max2 = String(this._samMaxChain | 0).padStart(2, '0');
  const line1 = 'CHAIN ' + kills2 + ' / MAX ' + max2;
  const award = this._getSamChainBonusAwardForKills(row, kills);
  if (award){
    this._addSamScore(award.add | 0, 'chain');
    this._addSamMult(award.multAdd | 0);

    row.bonusTotal = Math.max(row.bonusTotal | 0, award.total | 0);
    row.multTotal += Math.max(0, award.multAdd | 0);

    window.AR_SFX?.play('chain_bonus', { level: award.kills });
  }
  const line2 = (row.bonusTotal > 0)
    ? 'BONUS +' + String(row.bonusTotal | 0)
      + ' +' + String(row.multTotal | 0) + 'MULT'
    : '';
  const holdSec = (row.bonusTotal > 0) ? 1.2 : 1.0;
  this._setSamChainHud(line1, line2, holdSec);
  if (map.size > 48){
    const cutoff = (this._samNextShotId | 0) - 32;
    for (const k of map.keys()){
      if (k < cutoff) map.delete(k);
    }
  }
},

_killEnemy(e){
  if (!e.alive) return;
  window.AR_SFX?.play('enemy_destroy');
  this._spawnDeathFx(e);
  e.alive = false;
  e.defeatT = 0;

  const cx = e.x + this.enemyCfg.w/2;
  const cy = e.y + this.enemyCfg.h/2;

  // Drop rule:
  // - Remnant持ち: remnantのみ
  // - 通常: orbのみ
  if (e.hasRemnant){
    this._spawnOrbAt(cx, cy, 1); // kind=1 = remnant
  } else {
    this._spawnOrbAt(cx, cy, 0); // kind=0 = orb
  }
},

    _stepBlasts(dt){
      for (const b of this.blasts) b.t += dt;
      for (let i = this.blasts.length - 1; i >= 0; i--){
        if (this.blasts[i].t >= this.blasts[i].life) this.blasts.splice(i, 1);
      }
    },

_stepOrbs(dt){
  const cfg = this.orbCfg;
  if (!this.orbs.length) return;

  // dtに強い “擬似フレーム” 減衰（60fps基準）
  const damp = Math.pow(cfg.drag, dt * 60);

  const gr = this.orbGravityRadius || 0;
  const gf = this.orbGravityForce || 0;
  const px = this.p.x + this.p.w/2;
  const py = this.p.y + this.p.h/2;
  const gr2 = gr * gr;

  for (const o of this.orbs){
    if (!o.alive) continue;

    // attraction (optional)
    if (gf > 0 && gr > 0){
      const ox = o.x + cfg.w/2;
      const oy = o.y + cfg.h/2;
      const dx = px - ox;
      const dy = py - oy;
      const d2 = dx*dx + dy*dy;
      if (d2 > 0.0001 && d2 <= gr2){
        const inv = 1 / Math.sqrt(d2);
        o.vx += dx * inv * gf * dt;
        o.vy += dy * inv * gf * dt;
      }
    }

    // gravity
    o.vy = Math.min(cfg.maxVy, o.vy + cfg.g * dt);

    // integrate
    o.vx *= damp;
    o.vy *= damp;
    o.x += o.vx * dt;
    o.y += o.vy * dt;

    // cull (below screen)
    if (o.y > cfg.killY) o.alive = false;
  }

  // compact
  for (let i = this.orbs.length - 1; i >= 0; i--){
    if (!this.orbs[i].alive) this.orbs.splice(i, 1);
  }
},

_spawnDeathFx(e){
  const cfg = this.deathFxCfg;
  const arr = this.deathFx;

  const cx = e.x + this.enemyCfg.w/2;
  const cy = e.y + this.enemyCfg.h/2;

  const n = e.hasRemnant ? 8 : 6;
  const color = e.hasRemnant ? '#f0f' : '#f00';

  for (let i = 0; i < n; i++){
    if (arr.length >= cfg.cap) break;

    const a = Math.random() * Math.PI * 2;
    const s = 20 + Math.random() * 20;

    arr.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      t: 0,
      life: cfg.lifeMin + Math.random() * (cfg.lifeMax - cfg.lifeMin),
      color
    });
  }
},

_stepDeathFx(dt){
  const arr = this.deathFx;

  for (let i = arr.length - 1; i >= 0; i--){
    const p = arr[i];

    p.t += dt;
    if (p.t >= p.life){
      arr.splice(i, 1);
      continue;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
},

_drawDeathFx(ctx){
  const arr = this.deathFx;

  for (let i = 0; i < arr.length; i++){
    const p = arr[i];
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x | 0, p.y | 0, 1, 1);
  }
},

    _applyBlastDamage(){
  if (!this.blasts.length) return;

  const er = this.enemyCfg.r;
  const maxGen = this._getBlastMaxGen();

  // 連鎖が同フレームで暴走しないための安全弁（密度低い想定ならまず引っかからない）
  let spawnBudget = 256;

  // 追加されたblastも同フレームで処理できるよう、index走査にする
  for (let bi = 0; bi < this.blasts.length; bi++){
    const bl = this.blasts[bi];

    const r = this._getBlastRadius(bl);
    if (r <= 0.01) continue;

    for (const e of this.enemies){
      if (!e.alive) continue;

      const cx = e.x + this.enemyCfg.w/2;
      const cy = e.y + this.enemyCfg.h/2;

      if (circleHit(bl.x, bl.y, r, cx, cy, er)){
        // kill（撃破スコアは alive のとき一度だけ。_killEnemy 内で alive が false になる）
        if (e.alive) this._addSamScoreForEnemy(e);
        if (e.alive) this._noteSamShotKill(bl.shotId);
        this._killEnemy(e);

        // spawn next gen blast at killed enemy center
        if (bl.gen < maxGen && spawnBudget > 0){
          spawnBudget--;
          this._spawnBlast(cx, cy, bl.gen + 1, 1, 1, bl.shotId);
        }
      }
    }
  }
},

    _pickLaneX(){
      const lanes = this.enemyCfg.lanes;
      return lanes[(Math.random() * lanes.length) | 0];
    },
    _pickEnemyCDir(baseCx){
      if (baseCx <= ENEMY_C_EDGE_INWARD_GUARD_X) return 1;
      if (baseCx >= W - ENEMY_C_EDGE_INWARD_GUARD_X) return -1;
      return (Math.random() < 0.5) ? -1 : 1;
    },
    _pickObstacleLaneX(){
      const lanes = this.obstacleCfg.lanes;
      return lanes[(Math.random() * lanes.length) | 0];
    },

    _isEnemyOutOfBounds(e){
      return e.x < -32 || e.x > (W + 32) || e.y > (H + 32);
    },

    _spawnEnemyFormation(){
      const cfg = this.enemyCfg;
      const enemyKind = this._pickSpawnEnemyKind();
      if (!enemyKind) return;
      const baseCx = (enemyKind === 'enemyC')
        ? ENEMY_C_LANES[(Math.random() * ENEMY_C_LANES.length) | 0]
        : this._pickLaneX();

      if (enemyKind === 'enemyB'){
        const speedY = cfg.vy * ENEMY_B_SPEED_MUL;
        const angleRad = ENEMY_B_DIAG_ANGLE_DEG * Math.PI / 180;
        const speedXAbs = Math.tan(angleRad) * speedY;
        let dir = (Math.random() < 0.5) ? -1 : 1;
        if (baseCx <= ENEMY_B_EDGE_INWARD_GUARD_X) {
          dir = 1;
        } else if (baseCx >= W - ENEMY_B_EDGE_INWARD_GUARD_X) {
          dir = -1;
        }
        const vx = speedXAbs * dir;
        const offsetX = Math.tan(angleRad) * ENEMY_B_COLUMN_GAP;
        const remIdx = (Math.random() < 0.5) ? 1 : 2; // 2nd or 3rd in a 4-column group
        const hasDue = !!this._remnantDue;
        if (hasDue) this._remnantDue = false;
        for (let i = 0; i < ENEMY_B_COLUMN_COUNT; i++){
          const cy = -cfg.h - i * ENEMY_B_COLUMN_GAP;
          const cx = baseCx + dir * offsetX * (ENEMY_B_COLUMN_COUNT - 1 - i);
          const hasRem = hasDue && i === remIdx;
          this.enemies.push({
            x: cx - cfg.w/2,
            y: cy,
            vy: speedY,
            vx,
            alive: true,
            defeatT: 0,
            enemyKind,
            hasRemnant: hasRem
          });
        }
        return;
      }

      if (enemyKind === 'enemyC'){
        const inv = Math.SQRT1_2;
        const cDir = this._pickEnemyCDir(baseCx);
        const vx = ENEMY_C_DIAG_SPEED * inv * cDir;
        const vy = ENEMY_C_DIAG_SPEED * inv;
        const gap = ENEMY_C_FORMATION_GAP;
        const hasDue = !!this._remnantDue;
        if (hasDue) this._remnantDue = false;
        for (let i = 0; i < 3; i++){
          const cx = baseCx + (i - 1) * gap;
          const hasRem = hasDue && (i === 1);
          this.enemies.push({
            x: cx - cfg.w / 2,
            y: -cfg.h,
            vx,
            vy,
            alive: true,
            defeatT: 0,
            enemyKind: 'enemyC',
            hasRemnant: hasRem,
            cDir,
            cPhase: 'diag1',
            cPauseT: 0,
            cFired: false
          });
        }
        return;
      }

      if (enemyKind === 'enemySeeker'){
        this.enemies.push({
          x: baseCx - cfg.w / 2,
          y: -cfg.h,
          vx: 0,
          vy: ENEMY_SEEKER_DESCEND_SPEED,
          alive: true,
          defeatT: 0,
          enemyKind: 'enemySeeker',
          hasRemnant: true,
          seekerPhase: 'descend',
          seekerLockT: 0,
          seekerTargetX: null,
          seekerTargetY: null
        });
        return;
      }

      const amp = cfg.amp * rand(0.75, 1.20);
      const period = cfg.period * rand(0.85, 1.30);
      const omega = (Math.PI * 2) / Math.max(0.001, period);
      let phase = rand(0, Math.PI * 2);
      if (baseCx <= ENEMY_A_EDGE_INWARD_GUARD_X) {
        phase = -Math.PI / 2;
      } else if (baseCx >= W - ENEMY_A_EDGE_INWARD_GUARD_X) {
        phase = Math.PI / 2;
      }

      for (let i = 0; i < cfg.formationN; i++){

        const cy = -cfg.h - i * cfg.formationGap;

        // ★ Remnant予約チェック
        let hasRem = false;
        if (this._remnantDue){
          hasRem = true;
          this._remnantDue = false;
        }

        this.enemies.push({
          x: baseCx - cfg.w/2,
          y: cy,
          baseX: baseCx,
          amp,
          omega,
          phase,
          vy: cfg.vy,
          alive: true,
          defeatT: 0,
          enemyKind,
          hasRemnant: hasRem
        });
      }
    },

    _spawnEnemyBulletFrom(e){
      const cfg = this.enemyCfg;
      const bc = this.enemyBulletCfg;
      const bx = (e.x + cfg.w / 2 - bc.sw / 2);
      const by = (e.y + cfg.h);
      this.enemyBullets.push({
        x: bx,
        y: by,
        vx: 0,
        vy: ENEMY_BULLET_SPEED,
        w: bc.sw,
        h: bc.sh,
        hitOx: bc.hitOx,
        hitOy: bc.hitOy,
        hitW: bc.hitW,
        hitH: bc.hitH
      });
    },

    /**
     * enemyC 専用ステップ。RETREAT/FAIL 中は this.mode で単純下退場。
     * Phase: diag1 → pause1（1回射撃）→ zig1 → pause2（短停止）→ zig2
     * @param {boolean} spawnWarmupPhase enterT < spawnWarmup（停止・射撃なしの斜め移動のみ）
     */
    _stepEnemyC(e, dt, cfg, spawnWarmupPhase){
      if (!e.alive) return;
      const enemySpeedMul = this.enemySpeedMulRt || 1.0;

      if (this.mode !== 'PLAY'){
        e.vx = 0;
        e.vy = ENEMY_C_EXIT_VY;
        e.x += e.vx * dt * enemySpeedMul;
        e.y += e.vy * dt * enemySpeedMul;
        return;
      }

      if (spawnWarmupPhase){
        e.x += e.vx * dt * enemySpeedMul;
        e.y += e.vy * dt * enemySpeedMul;
        return;
      }

      const inv = Math.SQRT1_2;
      if (e.cPhase === 'diag') e.cPhase = 'diag1';
      if (e.cPhase === 'pause') e.cPhase = 'pause1';
      if (e.cPhase === 'exit'){
        const d = Number.isFinite(e.cDir) ? (e.cDir < 0 ? -1 : 1) : 1;
        e.cDir = d;
        e.cPhase = 'zig1';
        e.vx = ENEMY_C_DIAG_SPEED * inv * (-d);
        e.vy = ENEMY_C_DIAG_SPEED * inv;
      }

      const cd = Number.isFinite(e.cDir) ? (e.cDir < 0 ? -1 : 1) : 1;
      e.cDir = cd;
      const phase = e.cPhase || 'diag1';

      if (phase === 'diag1'){
        e.x += e.vx * dt * enemySpeedMul;
        e.y += e.vy * dt * enemySpeedMul;
        const cyAfter = e.y + cfg.h / 2;
        if (cyAfter >= ENEMY_C_PAUSE_CENTER_Y){
          e.cPhase = 'pause1';
          e.cPauseT = ENEMY_C_PAUSE_SEC;
          e.vx = 0;
          e.vy = 0;
        }
        return;
      }

      if (phase === 'pause1'){
        e.cPauseT = Math.max(0, (e.cPauseT || 0) - dt);
        if (e.cPauseT <= 0){
          if (!e.cFired){
            this._spawnEnemyBulletFrom(e);
            window.AR_SFX?.play('enemy_shot');
            e.cFired = true;
          }
          e.cPhase = 'zig1';
          e.vx = ENEMY_C_DIAG_SPEED * inv * (-cd);
          e.vy = ENEMY_C_DIAG_SPEED * inv;
        }
        return;
      }

      if (phase === 'zig1'){
        e.x += e.vx * dt * enemySpeedMul;
        e.y += e.vy * dt * enemySpeedMul;
        const cyAfter = e.y + cfg.h / 2;
        if (cyAfter >= ENEMY_C_ZIGZAG_CENTER_Y){
          e.cPhase = 'pause2';
          e.cPauseT = ENEMY_C_TURN_PAUSE_SEC;
          e.vx = 0;
          e.vy = 0;
        }
        return;
      }

      if (phase === 'pause2'){
        e.cPauseT = Math.max(0, (e.cPauseT || 0) - dt);
        if (e.cPauseT <= 0){
          e.cPhase = 'zig2';
          e.vx = ENEMY_C_DIAG_SPEED * inv * cd;
          e.vy = ENEMY_C_DIAG_SPEED * inv;
        }
        return;
      }

      if (phase === 'zig2'){
        e.x += e.vx * dt * enemySpeedMul;
        e.y += e.vy * dt * enemySpeedMul;
      }
    },

    /**
     * enemySeeker 専用: descend → lock（停止・予告）→ dash 開始直前に自機位置を取得して方向決定（dash 中は追尾なし）。
     * @param {boolean} spawnWarmupPhase enterT < spawnWarmup（ロック遷移なし・降下のみ）
     */
    _stepEnemySeeker(e, dt, cfg, spawnWarmupPhase){
      if (!e.alive) return;
      const enemySpeedMul = this.enemySpeedMulRt || 1.0;

      if (this.mode !== 'PLAY'){
        e.vx = 0;
        e.vy = ENEMY_SEEKER_DESCEND_SPEED;
        e.x += e.vx * dt * enemySpeedMul;
        e.y += e.vy * dt * enemySpeedMul;
        return;
      }

      if (spawnWarmupPhase){
        const vx = Number.isFinite(e.vx) ? e.vx : 0;
        const vy = Number.isFinite(e.vy) ? e.vy : ENEMY_SEEKER_DESCEND_SPEED;
        e.x += vx * dt * enemySpeedMul;
        e.y += vy * dt * enemySpeedMul;
        return;
      }

      const ph = e.seekerPhase || 'descend';

      if (ph === 'descend'){
        const vx = Number.isFinite(e.vx) ? e.vx : 0;
        const vy = Number.isFinite(e.vy) ? e.vy : ENEMY_SEEKER_DESCEND_SPEED;
        e.x += vx * dt * enemySpeedMul;
        e.y += vy * dt * enemySpeedMul;
        const cyAfter = e.y + cfg.h / 2;
        if (cyAfter >= ENEMY_SEEKER_LOCK_CENTER_Y){
          e.seekerPhase = 'lock';
          e.seekerLockT = ENEMY_SEEKER_LOCK_SEC;
          e.vx = 0;
          e.vy = 0;
          e.seekerTargetX = null;
          e.seekerTargetY = null;
        }
        return;
      }

      if (ph === 'lock'){
        e.seekerLockT = Math.max(0, (e.seekerLockT || 0) - dt);
        if (e.seekerLockT <= 0){
          const tx = this.p.x + this.p.w / 2;
          const ty = this.p.y + this.p.h / 2;
          e.seekerTargetX = tx;
          e.seekerTargetY = ty;
          const ecx = e.x + cfg.w / 2;
          const ecy = e.y + cfg.h / 2;
          const dx = tx - ecx;
          const dy = ty - ecy;
          const len = Math.sqrt(dx * dx + dy * dy);
          const eps = 1e-4;
          if (len <= eps){
            e.vx = 0;
            e.vy = ENEMY_SEEKER_DASH_SPEED;
          } else {
            const inv = ENEMY_SEEKER_DASH_SPEED / len;
            e.vx = dx * inv;
            e.vy = dy * inv;
          }
          e.seekerPhase = 'dash';
          window.AR_SFX?.play('seeker_dash');
        }
        return;
      }

      if (ph === 'dash'){
        const vx = Number.isFinite(e.vx) ? e.vx : 0;
        const vy = Number.isFinite(e.vy) ? e.vy : 0;
        e.x += vx * dt * enemySpeedMul;
        e.y += vy * dt * enemySpeedMul;
      }
    },

    _stepEnemyBullets(dt){
      if (this.mode === 'FAIL') return;
      for (const eb of this.enemyBullets){
        eb.x += eb.vx * dt;
        eb.y += eb.vy * dt;
      }
      for (let i = this.enemyBullets.length - 1; i >= 0; i--){
        const eb = this.enemyBullets[i];
        if (eb.y > H + 20 || eb.y + eb.h < -8 || eb.x > W + 16 || eb.x + eb.w < -16){
          this.enemyBullets.splice(i, 1);
        }
      }
    },

    _obstacleCountFromWeights(src){
      const weights = Array.isArray(src && src.countWeights) ? src.countWeights : null;
      const maxCount = Math.max(1, Math.min(3, Number(src && src.maxCount) || 3));

      if (!weights || !weights.length) return 1;

      let total = 0;
      const usable = [];
      for (let i = 0; i < Math.min(weights.length, maxCount); i++){
        const w = Math.max(0, Number(weights[i]) || 0);
        usable.push(w);
        total += w;
      }

      if (total <= 0) return 1;

      let r = Math.random() * total;
      for (let i = 0; i < usable.length; i++){
        r -= usable[i];
        if (r <= 0) return i + 1;
      }
      return 1;
    },

    _getObstacleClusterPositions(baseCx, count, src){
      const cfg = this.obstacleCfg;
      const half = cfg.w / 2;
      const step = Math.max(1, Number(src && src.clusterStep) || 24);
      const baseY = -cfg.h;

      let offsets;
      if (count <= 1){
        offsets = [0];
      } else if (count === 2){
        const h = step / 2;
        offsets = [-h, h];
      } else {
        offsets = [-step, 0, step];
      }

      const out = [];
      for (const ox of offsets){
        const cx = clamp(baseCx + ox, half, W - half);
        out.push({
          x: cx - half,
          y: baseY
        });
      }
      return out;
    },

    _spawnObstacle(x, y){
      const cfg = this.obstacleCfg;

      let sx = x;
      if (sx == null){
        const cx = this._pickObstacleLaneX();
        sx = cx - cfg.w / 2;
      }

      this.obstacles.push({
        x: sx,
        y: (y != null) ? y : -cfg.h,
        vy: cfg.vy,
        alive: true
      });
    },

    _spawnObstacleBurst(){
      const cfg = this.obstacleCfg;
      const baseCx = this._pickObstacleLaneX();
      const count = this._obstacleCountFromWeights(cfg);
      const positions = this._getObstacleClusterPositions(baseCx, count, cfg);
      for (const pos of positions){
        this._spawnObstacle(pos.x, pos.y);
      }
    },
    
    _stepEnemies(dt){
      const cfg = this.enemyCfg;
      const enemySpeedMul = this.enemySpeedMulRt || 1.0;

      // warmup: delay enemy spawning at the start
      if (this.enterT < this.spawnWarmup){
        // still allow existing enemies to drift (usually none)
        for (const e of this.enemies){
          if (!e.alive){ e.defeatT += dt; continue; }
          if (e.enemyKind === 'enemyC'){
            this._stepEnemyC(e, dt, cfg, true);
            continue;
          }
          if (e.enemyKind === 'enemySeeker'){
            this._stepEnemySeeker(e, dt, cfg, true);
            continue;
          }
          const vx = Number.isFinite(e.vx) ? e.vx : 0;
          const vy = Number.isFinite(e.vy) ? e.vy : cfg.vy;
          e.x += vx * dt * enemySpeedMul;
          e.y += vy * dt * enemySpeedMul;
        }
        // cull off-screen
        for (let i = this.enemies.length - 1; i >= 0; i--){
          const e = this.enemies[i];
          if (this._isEnemyOutOfBounds(e)) this.enemies.splice(i, 1);
        }
        return;
      }

      const spawnDef = this.samSpawnDefRt && this.samSpawnDefRt.spawn;
      const spawnEnabled = !spawnDef || spawnDef.enabled !== false;
      const spawnEvery = (spawnDef && Number.isFinite(Number(spawnDef.every)) && Number(spawnDef.every) > 0)
        ? Number(spawnDef.every)
        : cfg.spawnEvery;
      if (spawnEnabled){
        this._spawnT += dt;
        if (this._spawnT >= spawnEvery){
          this._spawnT -= spawnEvery;
          this._spawnEnemyFormation();
        }
      }
      
      // --- remnant schedule (time-based, single route) ---
      if (this.remnantCarrierBonusRemainSecRt > 0){
        this.remnantCarrierBonusRemainSecRt = Math.max(0, this.remnantCarrierBonusRemainSecRt - dt);
      }
      const defRem = this.samSpawnDefRt && this.samSpawnDefRt.remnant;
      let baseEvery = Number(this.samRemnantEveryRt);
      if (!(Number.isFinite(baseEvery) && baseEvery > 0)){
        const defEvery = Number(defRem && defRem.every);
        baseEvery = (Number.isFinite(defEvery) && defEvery > 0) ? defEvery : 5.0;
      }
      baseEvery = Math.max(0.001, baseEvery);
      const bonusActive = this.remnantCarrierBonusRemainSecRt > 0;
      const bonusEvery = bonusActive && this.remnantCarrierBonusRt
        ? Math.max(0.001, Number(this.remnantCarrierBonusRt.everySec) || ONE_TIME_REMNANT_BONUS_EVERY_SEC)
        : ONE_TIME_REMNANT_BONUS_EVERY_SEC;
      const effectiveEvery = bonusActive ? Math.min(baseEvery, bonusEvery) : baseEvery;
      this._remnantT = (this._remnantT || 0) + dt;
      if (this._remnantT >= effectiveEvery){
        this._remnantT -= effectiveEvery;
        this._remnantDue = true;
      }
      
      for (const e of this.enemies){
        if (!e.alive){
          e.defeatT += dt;
          continue;
        }
        if (e.enemyKind === 'enemyC'){
          this._stepEnemyC(e, dt, cfg, false);
          continue;
        }
        if (e.enemyKind === 'enemySeeker'){
          this._stepEnemySeeker(e, dt, cfg, false);
          continue;
        }
        const vx = Number.isFinite(e.vx) ? e.vx : 0;
        const vy = Number.isFinite(e.vy) ? e.vy : cfg.vy;
        e.x += vx * dt * enemySpeedMul;
        e.y += vy * dt * enemySpeedMul;

        if (e.enemyKind !== 'enemyB' && e.enemyKind !== 'enemySeeker'){
          // use y progression as a time proxy (stable even if dt jitters)
          const t = (e.y / Math.max(1, vy));
          const cx = e.baseX + e.amp * Math.sin(e.omega * t + e.phase);
          e.x = cx - cfg.w/2;
        }
      }

      // cull (remove shortly after hit flash, or when below screen)
      for (let i = this.enemies.length - 1; i >= 0; i--){
        const e = this.enemies[i];
        if (!e.alive && e.defeatT > this.defeatCfg.dur){
          this.enemies.splice(i, 1);
          continue;
        }
        if (this._isEnemyOutOfBounds(e)){
          this.enemies.splice(i, 1);
        }
      }
    },

    _stepObstacles(dt){
      const cfg = this.obstacleCfg;
      if (this.enterT < this.spawnWarmup) return;

      const enemySpeedMul = this.enemySpeedMulRt || 1.0;

      if (cfg.enabled){
        const spawnEvery = Number(cfg.spawnEvery);
        if (Number.isFinite(spawnEvery) && spawnEvery > 0){
          this._obstacleSpawnT += dt;
          if (this._obstacleSpawnT >= spawnEvery){
            this._obstacleSpawnT -= spawnEvery;
            this._spawnObstacleBurst();
          }
        }
      }

      for (const o of this.obstacles){
        if (!o.alive) continue;
        o.y += o.vy * dt * enemySpeedMul;
      }

      for (let i = this.obstacles.length - 1; i >= 0; i--){
        const o = this.obstacles[i];
        if (!o.alive || o.y > H + 24) this.obstacles.splice(i, 1);
      }
    },

_emitCol(type, a=null, b=null, x=0, y=0){
  this.colEvents.push({ type, a, b, x, y });
},

_pollCollisions(){
  this.colEvents.length = 0;

  const p = this._hit_player();

  // 2) BULLET vs ENEMY — 同一 frame の player 接触より先に解決する
  if (this.bullets.length){
    const b = this.bullets[0];
    if (b.alive){
      for (const e of this.enemies){
        if (!e.alive) continue;
        const eh = this._hit_enemy(e);
        if (rectCircleOverlap(b.x, b.y, b.w, b.h, eh.x, eh.y, eh.r)){
          this._emitCol('BULLET_HIT_ENEMY', b, e, eh.x, eh.y);
          break;
        }
      }
    }
  }

  // 撃破結果を alive に反映してから PLAYER vs ENEMY を見る（既存 apply を再利用）
  if (this.colEvents.length){
    this._applyCollisionEvents();
    this.colEvents.length = 0;
  }

  // 1) PLAYER vs ENEMY (fail run)
  if (this.mode === 'PLAY'){
    for (const e of this.enemies){
      if (!e.alive) continue;
      const eh = this._hit_enemy(e);
      if (circleHit(p.x, p.y, p.r, eh.x, eh.y, eh.r)){
        this._emitCol('FAIL', this.p, e, eh.x, eh.y);
        return;
      }
    }
  }

  // 1.5) PLAYER vs OBSTACLE (fail run)
  if (this.mode === 'PLAY'){
    for (const o of this.obstacles){
      if (!o.alive) continue;
      const oh = this._hit_obstacle(o);
      if (circleHit(p.x, p.y, p.r, oh.x, oh.y, oh.r)){
        this._emitCol('FAIL', this.p, o, oh.x, oh.y);
        return;
      }
    }
  }

  // 1.6) PLAYER vs ENEMY BULLET (fail run; 敵弾は破壊不可のため他ルートでは扱わない)
  if (this.mode === 'PLAY'){
    for (const eb of this.enemyBullets){
      const hx = eb.x + (Number.isFinite(eb.hitOx) ? eb.hitOx : 0);
      const hy = eb.y + (Number.isFinite(eb.hitOy) ? eb.hitOy : 0);
      const hw = Math.max(1, Number.isFinite(eb.hitW) ? eb.hitW : eb.w);
      const hh = Math.max(1, Number.isFinite(eb.hitH) ? eb.hitH : eb.h);
      if (rectCircleOverlap(hx, hy, hw, hh, p.x, p.y, p.r)){
        this._emitCol('FAIL', this.p, eb, p.x, p.y);
        return;
      }
    }
  }

  // 2.5) BULLET vs OBSTACLE (bullet only; obstacle survives)
  if (this.bullets.length){
    const b = this.bullets[0];
    if (b.alive){
      for (const o of this.obstacles){
        if (!o.alive) continue;
        const oh = this._hit_obstacle(o);
        if (rectCircleOverlap(b.x, b.y, b.w, b.h, oh.x, oh.y, oh.r)){
          this._emitCol('BULLET_HIT_OBSTACLE', b, o, oh.x, oh.y);
          break;
        }
      }
    }
  }

  // 3) PLAYER vs ORB / REMNANT (PICKUP; forgiving hitbox, fail hitbox unchanged)
  if (this.orbs.length){
    const pp = this._hit_playerPickup();
    for (const o of this.orbs){
      if (!o.alive) continue;
      const oh = this._hit_orb(o);
      if (circleHit(pp.x, pp.y, pp.r, oh.x, oh.y, oh.r)){
        this._emitCol('PICK_ORB', this.p, o, oh.x, oh.y);
      }
    }
  }
  },

_applyCollisionEvents(){
  if (!this.colEvents.length) return;

  // 1) FAIL 優先（あったら即処理して終了）
  for (const ev of this.colEvents){
    if (ev.type === 'FAIL'){
      this.startFail();
      return;
    }
  }

  // 2) bullet hit
  for (const ev of this.colEvents){
    if (ev.type !== 'BULLET_HIT_ENEMY') continue;

    const b = ev.a;
    const e = ev.b;

    if (b && b.alive && e && e.alive){
      const sid = b.shotId;
      if (e.hasRemnant){
        this._spawnBlast(
          ev.x,
          ev.y,
          0,
          this.blastRemnantCarrierRadiusMulRt,
          this.blastRemnantCarrierShrinkMulRt,
          sid
        );
      } else {
        this._spawnBlast(ev.x, ev.y, 0, 1, 1, sid);
      }
      if (e.alive) this._addSamScoreForEnemy(e);
      if (e.alive) this._noteSamShotKill(sid);
      this._killEnemy(e);
      b.alive = false;
    }
  }
  for (const ev of this.colEvents){
    if (ev.type !== 'BULLET_HIT_OBSTACLE') continue;
    const b = ev.a;
    if (b && b.alive){
      b.alive = false;
    }
  }

  // bullet cleanup（今は1発なのでこの形でOK）
  if (this.bullets.length && !this.bullets[0].alive){
    this.bullets.length = 0;
  }

  // 3) orb/remnant pickup（同一フレームは常に Orb 全処理→score 加算後に Remnant で score / ammo）
  let pickedOrb = 0;
  let pickedRem = 0;

  for (const ev of this.colEvents){
    if (ev.type !== 'PICK_ORB') continue;
    const o = ev.b;
    if (!o || !o.alive) continue;
    if ((o.kind | 0) === 1) continue;
    o.alive = false;
    pickedOrb++;
    this._addSamScore(SAM_SCORE_TABLE.orb, 'orb');
  }

  for (const ev of this.colEvents){
    if (ev.type !== 'PICK_ORB') continue;
    const o = ev.b;
    if (!o || !o.alive) continue;
    if ((o.kind | 0) !== 1) continue;
    o.alive = false;
    pickedRem++;
    this._addSamScore(SAM_SCORE_TABLE.remnant, 'remnant');
    this._recoverSamAmmoFromRemnant();
  }

  if (pickedRem > 0) window.AR_SFX?.play('remnant_pickup');
  else if (pickedOrb > 0) window.AR_SFX?.play('orb_pickup');
},

step(dt, Actions){

  // time since entering shooting（intro rise / SAM の本番計測には使わない）
  this.enterT += dt;

  // --- RESULT: シミュレーション停止・ホールド後に exit ---
  if (this.mode === 'RESULT'){
    this.resultT += dt;
    if (this.resultT >= this._getResultHoldSec()){
      this._requestExit(this._pendingExitReason || this.resultReason || 'UNKNOWN');
    }
    return;
  }

  // --- FAIL: freeze の後 RESULT へ（即 exit しない） ---
  if (this.mode === 'FAIL'){
    this.modeT += dt;
    this.failT = this.modeT;

    if (this.failT >= this.failFreezeDur){
      this.resultReason = SAM_EXIT_REASON.FAILED;
      this.mode = 'RESULT';
      this.resultT = 0;
    }
    return;
  }

  // SAM では abort を受け付けない（Actions.abort は無視）

  // RETREAT: SAMでは未使用（abort 無効のため通常到達しない）。旧分岐は残す。
  if (this.mode === 'RETREAT'){
    this.modeT += dt;
    this.retreatT = this.modeT;

    const t = easeOutCubic(this.retreatT / Math.max(0.001, this.retreatDur));
    const y0 = this._retreatStartY;
    const y1 = (H + 24);
    this.p.y = lerp(y0, y1, t);

    this._stepEnemies(dt);
    this._stepObstacles(dt);
    this._stepEnemyBullets(dt);
    this._applyBlastDamage();
    this._stepBlasts(dt);
    this._stepOrbs(dt);
    this._stepDeathFx(dt);

    if (this.retreatT >= (this.retreatDur + this.retreatHold)){
      this._requestExit(this._pendingExitReason || SAM_EXIT_REASON.ABORTED);
    }
    return;
  }

  // ===== PLAY (normal) =====

  // --- cooldown tick ---
  if (this.cooldownT > 0){
    this.cooldownT = Math.max(0, this.cooldownT - dt);
  }

  // intro rise
  if (this.enterT < this.introDur){
    const t = easeOutCubic(this.enterT / this.introDur);
    this.p.y = lerp(this._startPy, this._targetPy, t);
  } else {
    this.p.y = this._targetPy;
  }

  const inputLocked = (this.enterT < this.introDur);

  // movement
  const left  = !!(Actions && Actions.moveLeft)  && !inputLocked;
  const right = !!(Actions && Actions.moveRight) && !inputLocked;

  let vx = 0;
  if (left) vx -= 1;
  if (right) vx += 1;

  this.p.x = clamp(this.p.x + vx * this.playerSpeed * dt, 0, W - this.p.w);

  const shoot = !!(Actions && Actions.select) && !inputLocked;
  if (shoot) this._spawnBullet();
  if (!shoot) this.shotUsed = false;

  for (const b of this.bullets){
    if (!b.alive) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y + b.h < -4) b.alive = false;
  }
  if (this.bullets.length && !this.bullets[0].alive) this.bullets.length = 0;

  this._stepEnemies(dt);
  this._stepObstacles(dt);
  this._stepEnemyBullets(dt);

  this._applyBlastDamage();
  this._stepBlasts(dt);
  this._stepOrbs(dt);
  this._stepDeathFx(dt);

  this._pollCollisions();
  this._applyCollisionEvents();

  if (this._samChainHudT > 0){
    this._samChainHudT = Math.max(0, this._samChainHudT - dt);
    if (this._samChainHudT <= 0){
      this._samChainHudLine1 = '';
      this._samChainHudLine2 = '';
    }
  }

  // SAM: 本番時間は PLAY かつ input lock 解除後のみ（被弾後は進めない）
  if (this.mode === 'PLAY'){
    if (!inputLocked){
      this.playTimeSec += dt;
      this._updateSamRampTick(false);
    }
  }
},

    consumeExit(){
      if (!this.exitReady) return null;
      this.exitReady = false;
      const p = this.exitPayload;
      this.exitPayload = null;
      return p;
    },

    _requestExit(reason){
      if (this.exitReady) return;

      const r = normalizeSamExitReason(reason || 'UNKNOWN');
      const survivedSec = Math.max(0, Number(this.playTimeSec) || 0);

      this.exitReady = true;
      this.exitPayload = {
        reason: r,
        survivedSec,
        score: this.score | 0,
        scoreMult: this.scoreMult | 0,
        maxChain: this._samMaxChain | 0,
        loot: {
          orbs: 0,
          remnants: 0
        }
      };
    },

    render(ctx){
      if (!ctx) return;

      this.ensureImage();
      if (this.imgReady && (!this._spriteCellCache || this._spriteCellCache.length === 0)){
        this._buildSpriteCellCache();
      }

      ctx.save();
      ctx.imageSmoothingEnabled = false;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // wait for sprite sheet to load (no fallback boxes; avoid red flash)
      if (!this.imgReady){
        const txt = 'LOADING...';
        const tw = FONT8.measure(txt, 1);
        drawResultText(ctx, txt, ((W - tw) / 2) | 0, ((H - FONT8.h) / 2) | 0, '#fff', 1);
        ctx.restore();
        return;
      }

      for (const e of this.enemies){
        if (e.alive){
          const idx = this._enemyLiveSpriteIndex(e);
          this.drawSpriteIndex(ctx, idx, floor(e.x), floor(e.y));
        } else if (e.defeatT < this.defeatCfg.dur){
          this.drawSpriteIndex(ctx, this.defeatCfg.spriteIndex, floor(e.x), floor(e.y));
        }
      }
      for (const o of this.obstacles){
        if (!o.alive) continue;
        this.drawSpriteIndex(ctx, this.obstacleCfg.spriteIndex, floor(o.x), floor(o.y));
      }

      for (const eb of this.enemyBullets){
        const bc = this.enemyBulletCfg;
        if (this.imgReady){
          this.drawSpriteCropTinted(
            ctx,
            bc.spriteIndex,
            0, 0, eb.w, eb.h,
            floor(eb.x), floor(eb.y),
            eb.w, eb.h,
            ENEMY_BULLET_TINT
          );
        } else {
          ctx.fillStyle = ENEMY_BULLET_TINT;
          ctx.fillRect(floor(eb.x), floor(eb.y), eb.w, eb.h);
        }
      }

      // --- STEP 5-A: draw orbs/remnants
      for (const o of this.orbs){
        if (!o.alive) continue;
        const isRem = (o.kind | 0) === 1;
        const idx = isRem ? this.orbCfg.remnantSpriteIndex : this.orbCfg.spriteIndex;
        this.drawSpriteIndex(ctx, idx, floor(o.x), floor(o.y));
      }
      // blasts (shrink; draw as procedural circle)
      for (const bl of this.blasts){
        const k = 1 - (bl.t / Math.max(0.001, bl.life));
        const r = this._getBlastRadius(bl);
        if (r <= 0.01) continue;

        ctx.fillStyle = '#f00';
        drawDotRing(ctx, Math.round(bl.x) - 1, Math.round(bl.y) - 1, Math.round(r), 1);
      }
      this._drawDeathFx(ctx);

      if (this.imgReady){
        const px = floor(this.p.x);
        const py = floor(this.p.y);
        const shipIndex = 0;

        // Visual only: no-ammo gray overrides cooldown recharge fill.
        const noAmmo = !this._samAmmoIsInfinite() && this.ammo <= 0;
        if (noAmmo){
          this.drawSpriteTinted(ctx, shipIndex, px, py, '#666');
        } else if (this.cooldownT > 0){
          this.drawSpriteTinted(ctx, shipIndex, px, py, '#666');

          const dots = this.rechargeDots; // 14
          const prog = 1 - (this.cooldownT / Math.max(0.0001, this.cooldownSecRt));
          const level = Math.max(0, Math.min(dots, Math.floor(prog * dots + 1e-6)));

          if (level > 0){
            const s = this.sheet.cell; // 16
            const innerTop = 1;
            const innerH = dots;
            const drawH = level;
            const srcY = innerTop + (innerH - drawH);

            const white = this._getTintedSpriteCanvas(shipIndex, '#fff');
            ctx.drawImage(white, 0, srcY, s, drawH, px, py + srcY, s, drawH);
          }
        } else {
          this.drawSpriteIndex(ctx, shipIndex, px, py);
        }
      } else {
        ctx.fillStyle = '#f44';
        ctx.fillRect(floor(this.p.x), floor(this.p.y), 16, 16);
      }
      if (this.bullets.length){
        const b = this.bullets[0];
        if (this.imgReady){
          this.drawSpriteCrop(
            ctx,
            this.bulletCfg.spriteIndex,
            0, 0, this.bulletCfg.sw, this.bulletCfg.sh,
            floor(b.x), floor(b.y),
            this.bulletCfg.sw, this.bulletCfg.sh
          );
        } else {
          ctx.fillStyle = '#ff0';
          ctx.fillRect(floor(b.x), floor(b.y), this.bulletCfg.sw, this.bulletCfg.sh);
        }
      }

// --- SAM プレイ中 HUD（192 座標系・1段・ラベルなし。time 非表示） ---
if (this.mode === 'PLAY'){
  const pad = 4;
  const y = 4;

  const ammoTxt = this._samAmmoIsInfinite()
    ? '--'
    : String(this.ammo | 0).padStart(2, '0');

  const multTxt = 'x' + String(this.scoreMult | 0);
  const scoreTxt = String(this.score | 0);

  const ammoColor = (!this._samAmmoIsInfinite() && this.ammo <= 1) ? '#f00' : '#fff';
  FONT8.draw(ctx, ammoTxt, pad, y, ammoColor, 1);

  const multW = FONT8.measure(multTxt, 1);
  FONT8.draw(ctx, multTxt, ((W - multW) / 2) | 0, y, '#fff', 1);

  const scoreW = FONT8.measure(scoreTxt, 1);
  FONT8.draw(ctx, scoreTxt, (W - pad - scoreW) | 0, y, '#fff', 1);

  const cx = W / 2;
  if (this._samChainHudT > 0 && this._samChainHudLine1){
    mini3x5DrawCenter(ctx, this._samChainHudLine1, cx, 15, '#fff', 1);
    if (this._samChainHudLine2) mini3x5DrawCenter(ctx, this._samChainHudLine2, cx, 22, '#fff', 1);
  } else if (!this._samAmmoIsInfinite() && this.ammo <= 0){
    const txt = 'NO AMMO';
    const w = FONT8.measure(txt, 1);
    FONT8.draw(ctx, txt, ((W - w) / 2) | 0, 15, '#f00', 1);
  }
}

// --- Abort sequence message (center) — SAMでは通常未到達 ---
if (this.mode === 'RETREAT'){
  const txt = this.abortMsg || 'ABORTED';
  const w = FONT8.measure(txt, 1);
  const x = ((W - w) / 2) | 0;
  const y = ((H - FONT8.h) / 2) | 0;
  drawResultText(ctx, txt, x, y, '#fff', 1);
}

// --- Start tip (center) — first SAM_START_MSG_SEC of a run only ---
if (
  this.mode === 'PLAY' &&
  !this.shellPaused &&
  (Number(this.playTimeSec) || 0) < SAM_START_MSG_SEC
){
  const txt = 'START A CHAIN';
  const w = FONT8.measure(txt, 1);
  const x = ((W - w) / 2) | 0;
  const y = ((H - FONT8.h) / 2) | 0;
  drawResultText(ctx, txt, x, y, '#fff', 1);
}

// --- Last shot warning (center) ---
if (
  this.mode === 'PLAY' &&
  !this._samAmmoIsInfinite() &&
  this.ammo === 1
){
  const txt = 'LAST SHOT';
  const w = FONT8.measure(txt, 1);
  const x = ((W - w) / 2) | 0;
  const y = ((H - FONT8.h) / 2) | 0;
  drawResultText(ctx, txt, x, y, '#f00', 1);
}

// --- Fail message (center) — FAIL freeze 中のみ ---
if (this.mode === 'FAIL'){
  const txt = this.failMsg || 'FAILED';
  const w = FONT8.measure(txt, 1);
  const x = ((W - w) / 2) | 0;
  const y = ((H - FONT8.h) / 2) | 0;
  drawResultText(ctx, txt, x, y, '#f00', 1);
}

// --- SAM RESULT（短い終端表示のみ。詳細スコアは shell RESULT で表示） ---
if (this.mode === 'RESULT'){
  const txt = 'GAME OVER';
  const scale = 2;
  const w = FONT8.measure(txt, 1) * scale;
  const h = FONT8.h * scale;
  const x = ((W - w) / 2) | 0;
  const y = ((H - h) / 2) | 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawResultText(ctx, txt, 0, 0, '#f00', 1);
  ctx.restore();
}

      this._drawPlayDebugOverlay600(ctx);

      ctx.restore();
    }
  };

  window.ARSAM_FONT8 = FONT8;
  window.ARSAM = mod;
  window.ARSAMExitReason = {
    normalize: normalizeSamExitReason,
    isFailed: isFailedSamExit,
    ABORTED: SAM_EXIT_REASON.ABORTED,
    FAILED: SAM_EXIT_REASON.FAILED,
    CLEARED: SAM_EXIT_REASON.CLEARED,
  };
})();
