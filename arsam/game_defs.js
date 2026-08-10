/* Astral Remnant — static game definitions (constants / tables only). Loaded before AstralRemnant.html inline script. */
(() => {
  'use strict';

  // Base/meta skills apply on Base. Sortie-only rows: apply is no-op; effects flow via buildRunCfg → runCfg.
  const UPGRADE_DEFS = [
    { id:'remnant_carrier_blast', nameKey:'skill.remnant_carrier_blast_name', descKey:'skill.remnant_carrier_blast_desc', icon:'CORE', apply(_app){} },
    { id:'magazine_capacity', nameKey:'skill.magazine_capacity_name', descKey:'skill.magazine_capacity_desc', icon:'CAP+1', apply(app){ app.magazineSize = Math.max(1, (app.magazineSize|0) + 1); } },
    { id:'reload_plus', nameKey:'skill.reload_plus_name', descKey:'skill.reload_plus_desc', icon:'RLD+1', apply(app){ app.reloadPerTick = Math.max(1, (app.reloadPerTick|0) + 1); } },
    { id:'research_speed', nameKey:'skill.research_speed_name', descKey:'skill.research_speed_desc', icon:'RSP', apply(_app){} },
    { id:'research_efficiency', nameKey:'skill.research_efficiency_name', descKey:'skill.research_efficiency_desc', icon:'REF', apply(_app){} },
    { id:'movement_speed', nameKey:'skill.movement_speed_name', descKey:'skill.movement_speed_desc', icon:'SPD', apply(_app){} },
    { id:'bullet_speed',   nameKey:'skill.bullet_speed_name',   descKey:'skill.bullet_speed_desc',   icon:'BUL', apply(_app){} },
    { id:'shot_cooldown',  nameKey:'skill.shot_cooldown_name',  descKey:'skill.shot_cooldown_desc',  icon:'CD',  apply(_app){} },
    { id:'blast_radius',   nameKey:'skill.blast_radius_name',   descKey:'skill.blast_radius_desc',   icon:'BLR', apply(_app){} },
    { id:'blast_shrink',   nameKey:'skill.blast_shrink_name',   descKey:'skill.blast_shrink_desc',   icon:'BLS', apply(_app){} },
    { id:'chain_reaction', nameKey:'skill.chain_reaction_name', descKey:'skill.chain_reaction_desc', icon:'CHN', apply(_app){} },
    { id:'orb_gravity',    nameKey:'skill.orb_gravity_name',    descKey:'skill.orb_gravity_desc',    icon:'ORB', apply(_app){} },
    // Reload growth lives on `reloadPerTick` only (`reloadTickMs` stays fixed at 10 min).
  ];

  const ALL_SKILL_IDS = [
    'remnant_carrier_blast',
    'magazine_capacity',
    'reload_plus',
    'research_speed',
    'research_efficiency',
    'movement_speed',
    'bullet_speed',
    'shot_cooldown',
    'blast_radius',
    'blast_shrink',
    'chain_reaction',
    'orb_gravity'
  ];

  /**
   * Progress の skill 分母・加算対象（固定12種）。
   * Research の permSkill 候補（RESEARCH_PERM_SKILL_IDS）とは独立して常に同じ分母を使う。
   */
  const PROGRESS_SKILL_IDS = [
    'remnant_carrier_blast',
    'magazine_capacity',
    'reload_plus',
    'research_speed',
    'research_efficiency',
    'movement_speed',
    'bullet_speed',
    'shot_cooldown',
    'blast_radius',
    'blast_shrink',
    'chain_reaction',
    'orb_gravity'
  ];

  const SKILL_MAX_LEVEL_BY_ID = Object.freeze({
    remnant_carrier_blast: 3,
    magazine_capacity: 3,
    research_speed: 3,
    movement_speed: 3,
    bullet_speed: 3,
    shot_cooldown: 3,
    blast_radius: 3,
    blast_shrink: 3,
    chain_reaction: 3,
    reload_plus: 2,
    research_efficiency: 2,
    orb_gravity: 2
  });

  const TOTAL_COLLECTIVE_COUNT = 35;
  const RESEARCH_FACILITY_GRADE_MAX = 2;

  const NEXT_SORTIE_EFFECT_KINDS = {
    AMMO_PLUS_3: 'ammo_plus_3',
    BLAST_RADIUS_PLUS_10: 'blast_radius_plus_10',
    BLAST_SHRINK_PLUS_0_3: 'blast_shrink_plus_0_3',
    COOLDOWN_SHORT: 'cooldown_short',
    ORB_DOUBLER: 'orb_doubler',
    INSTANT_RESEARCH: 'instant_research',
    REMNANT_CARRIER_BONUS: 'remnant_carrier_bonus'
  };

  const NEXT_SORTIE_EFFECT_BY_COLLECTIVE_ID = Object.freeze({
    coll_0: NEXT_SORTIE_EFFECT_KINDS.AMMO_PLUS_3,
    coll_1: NEXT_SORTIE_EFFECT_KINDS.BLAST_RADIUS_PLUS_10,
    coll_2: NEXT_SORTIE_EFFECT_KINDS.BLAST_SHRINK_PLUS_0_3,
    coll_3: NEXT_SORTIE_EFFECT_KINDS.COOLDOWN_SHORT,
    coll_4: NEXT_SORTIE_EFFECT_KINDS.ORB_DOUBLER,
    coll_5: NEXT_SORTIE_EFFECT_KINDS.INSTANT_RESEARCH,
    coll_6: NEXT_SORTIE_EFFECT_KINDS.REMNANT_CARRIER_BONUS,
  });

  const NEXT_SORTIE_EFFECT_LABELS = Object.freeze({
    [NEXT_SORTIE_EFFECT_KINDS.AMMO_PLUS_3]: 'ONE-TIME: Ammo +3',
    [NEXT_SORTIE_EFFECT_KINDS.BLAST_RADIUS_PLUS_10]: 'ONE-TIME: Blast +10',
    [NEXT_SORTIE_EFFECT_KINDS.BLAST_SHRINK_PLUS_0_3]: 'ONE-TIME: Shrink +0.3',
    [NEXT_SORTIE_EFFECT_KINDS.COOLDOWN_SHORT]: 'ONE-TIME: Cooldown Short',
    [NEXT_SORTIE_EFFECT_KINDS.ORB_DOUBLER]: 'ONE-TIME: Orb ×2',
    [NEXT_SORTIE_EFFECT_KINDS.INSTANT_RESEARCH]: 'ONE-TIME: Instant Research',
    [NEXT_SORTIE_EFFECT_KINDS.REMNANT_CARRIER_BONUS]: 'ONE-TIME: Remnant Surge'
  });

  // One-time effect numeric config (single source of truth for launch bridge/runtime fallback).
  const NEXT_SORTIE_EFFECT_CONFIG = Object.freeze({
    ammoBonus: 3,
    blastRadiusBonus: 10,
    blastShrinkBonus: 0.3,
    cooldownFloorSec: 0.45,
    orbPickupMul: 2,
    remnantCarrierBonus: Object.freeze({
      windowSec: 36,
      everySec: 1.5
    })
  });

  /** Sortie area static defs (Phase 1-2: only orb multiplier differs by area). */
  const SORTIE_AREA_DEFS = Object.freeze({
    1: Object.freeze({ id: 1, orbMul: 1 }),
    2: Object.freeze({ id: 2, orbMul: 1 }),
    3: Object.freeze({ id: 3, orbMul: 2 }),
    4: Object.freeze({ id: 4, orbMul: 2 }),
    5: Object.freeze({ id: 5, orbMul: 3 })
  });

  /** Sortie area spawn defs (enemyA rows + optional enemyB/enemyC mix). */
  const SORTIE_AREA_SPAWN_DEFS = Object.freeze({
    1: Object.freeze({
      enemyA: Object.freeze({
        spawnEvery: 1.00,
        formationN: 3,
        formationGap: 36,
        mixWeight: 4,
        lanes: Object.freeze([32, 64, 96, 128, 160])
      }),
      enemyB: Object.freeze({ enabled: false, weight: 0 }),
      enemyC: Object.freeze({ enabled: false, weight: 0 }),
      obstacle: Object.freeze({
        enabled: false,
        spawnEvery: 999,
        lanes: Object.freeze([32, 64, 96, 128, 160])
      })
    }),
    2: Object.freeze({
      enemyA: Object.freeze({
        spawnEvery: 0.95,
        formationN: 3,
        formationGap: 35,
        mixWeight: 4,
        lanes: Object.freeze([32, 64, 96, 128, 160])
      }),
      enemyB: Object.freeze({ enabled: true, weight: 1 }),
      enemyC: Object.freeze({ enabled: false, weight: 0 }),
      obstacle: Object.freeze({
        enabled: false,
        spawnEvery: 999,
        lanes: Object.freeze([32, 64, 96, 128, 160])
      })
    }),
    3: Object.freeze({
      enemyA: Object.freeze({
        spawnEvery: 0.90,
        formationN: 4,
        formationGap: 34,
        mixWeight: 4,
        lanes: Object.freeze([32, 64, 96, 128, 160])
      }),
      enemyB: Object.freeze({ enabled: true, weight: 2 }),
      enemyC: Object.freeze({ enabled: false, weight: 0 }),
      obstacle: Object.freeze({
        enabled: true,
        spawnEvery: 3.3,
        lanes: Object.freeze([32, 64, 96, 128, 160])
      })
    }),
    4: Object.freeze({
      enemyA: Object.freeze({
        spawnEvery: 0.84,
        formationN: 4,
        formationGap: 32,
        mixWeight: 4,
        lanes: Object.freeze([24, 56, 88, 120, 152, 168])
      }),
      enemyB: Object.freeze({ enabled: true, weight: 3 }),
      enemyC: Object.freeze({ enabled: true, weight: 1 }),
      obstacle: Object.freeze({
        enabled: true,
        spawnEvery: 2.8,
        lanes: Object.freeze([24, 56, 88, 120, 152, 168])
      })
    }),
    5: Object.freeze({
      enemyA: Object.freeze({
        spawnEvery: 0.78,
        formationN: 4,
        formationGap: 30,
        mixWeight: 4,
        lanes: Object.freeze([24, 56, 88, 120, 152, 168])
      }),
      enemyB: Object.freeze({ enabled: true, weight: 4 }),
      enemyC: Object.freeze({ enabled: true, weight: 2 }),
      obstacle: Object.freeze({
        enabled: true,
        spawnEvery: 2.3,
        lanes: Object.freeze([24, 56, 88, 120, 152, 168])
      })
    })
  });

  /**
   * Tier lottery foundation (skill / collective shared). Tier affects roll weights only.
   * Facility gating for skills is separate (`SKILL_FACILITY_GATE`). Not wired into main research rolls yet.
   */
  const TIER_WEIGHT_TABLE = Object.freeze([
    { rem: 0, B: 70, A: 30, S: 0 },
    { rem: 20, B: 66, A: 32, S: 2 },
    { rem: 40, B: 60, A: 35, S: 5 },
    { rem: 70, B: 50, A: 40, S: 10 },
    { rem: 110, B: 45, A: 40, S: 15 },
    { rem: 160, B: 40, A: 40, S: 20 },
    { rem: 220, B: 35, A: 40, S: 25 },
  ]);

  /** @type {Readonly<Record<string, 'B'|'A'|'S'>>} */
  const SKILL_TIER = Object.freeze({
    movement_speed: 'B',
    bullet_speed: 'B',
    shot_cooldown: 'B',
    blast_radius: 'B',
    blast_shrink: 'B',
    magazine_capacity: 'A',
    research_speed: 'A',
    chain_reaction: 'A',
    remnant_carrier_blast: 'A',
    reload_plus: 'S',
    research_efficiency: 'S',
    orb_gravity: 'S'
  });

  /** Minimum research facility grade (not tier). Omitted ids are always eligible for tier rolls. */
  const SKILL_FACILITY_GATE = Object.freeze({
    reload_plus: 1,
    research_efficiency: 1,
    orb_gravity: 1
  });

  const FACILITY_LVL2_ONLY_SKILL_IDS = Object.freeze(new Set([
    'reload_plus',
    'research_efficiency',
    'orb_gravity'
  ]));

  /**
   * Per-collective tier (research IDs only). One-time groups from `NEXT_SORTIE_EFFECT_BY_COLLECTIVE_ID`;
   * `coll_7`…`coll_34` are orb-bonus collectives (`_researchCollectiveIdGetsOrbBonus`).
   * Precomputed equivalent of former IIFE (no runtime loop).
   */
  const COLLECTIVE_TIER = Object.freeze({
    coll_0: 'B', coll_1: 'B', coll_2: 'B', coll_3: 'B', coll_4: 'S', coll_5: 'A', coll_6: 'A',
    coll_7: 'B', coll_8: 'B', coll_9: 'B', coll_10: 'B', coll_11: 'B', coll_12: 'B', coll_13: 'B', coll_14: 'B',
    coll_15: 'A', coll_16: 'A', coll_17: 'A', coll_18: 'A', coll_19: 'A', coll_20: 'A', coll_21: 'A', coll_22: 'A', coll_23: 'A', coll_24: 'A', coll_25: 'A',
    coll_26: 'S', coll_27: 'S', coll_28: 'S', coll_29: 'S', coll_30: 'S', coll_31: 'S', coll_32: 'S', coll_33: 'S', coll_34: 'S'
  });

  /**
   * CEM bracket thresholds on cumulative Remnant total (`remnantsTotal` 導入後の derived CEM 用).
   * xN は CEM 倍率段; 各値はその段が始まる remnantsTotal の下限（含む）。
   * Phase 1: 定義のみ。参照切替は後続 phase。
   */
  const CEM_BRACKET_THRESHOLDS = Object.freeze({
    x1: 0,
    x2: 26,
    x3: 61,
    x4: 101,
    x5: 151
  });

  /** @type {ReadonlyArray<{ mul: number, threshold: number }>} */
  const CEM_BRACKET_ENTRIES = Object.freeze((() => {
    const out = [];
    for (const k of Object.keys(CEM_BRACKET_THRESHOLDS)){
      const m = /^x(\d+)$/i.exec(k);
      if (!m) continue;
      const mul = parseInt(m[1], 10);
      const threshold = Number(CEM_BRACKET_THRESHOLDS[/** @type {keyof typeof CEM_BRACKET_THRESHOLDS} */ (k)]);
      if (!Number.isFinite(mul) || mul < 1 || !Number.isFinite(threshold)) continue;
      out.push({ mul, threshold });
    }
    out.sort((a, b) => (a.threshold - b.threshold) || (a.mul - b.mul));
    return out;
  })());

  function _safeRemnantsTotalForCem(remnantsTotal){
    const n = Number(remnantsTotal);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  /**
   * `remnantsTotal` から到達済みの最大 CEM 倍率（現在の表では 1〜5）。
   * @param {*} remnantsTotal
   * @returns {number}
   */
  function getCoreMulFromRemnants(remnantsTotal){
    const t = _safeRemnantsTotalForCem(remnantsTotal);
    let mul = 1;
    for (const e of CEM_BRACKET_ENTRIES){
      if (t >= e.threshold) mul = e.mul;
    }
    return mul;
  }

  /**
   * 現在の CEM 段の下限・次段閾値（最大段は nextThreshold: null）。
   * @param {*} remnantsTotal
   * @returns {{ currentMul: number, currentMin: number, nextThreshold: number|null }}
   */
  function getCemRangeFromRemnants(remnantsTotal){
    const t = _safeRemnantsTotalForCem(remnantsTotal);
    const n = CEM_BRACKET_ENTRIES.length;
    if (n === 0) return { currentMul: 1, currentMin: 0, nextThreshold: null };

    let idx = 0;
    for (let i = 0; i < n; i++){
      if (t >= CEM_BRACKET_ENTRIES[i].threshold) idx = i;
    }
    const cur = CEM_BRACKET_ENTRIES[idx];
    const next = CEM_BRACKET_ENTRIES[idx + 1];
    return {
      currentMul: cur.mul,
      currentMin: cur.threshold,
      nextThreshold: next ? next.threshold : null
    };
  }

  /**
   * 現在の CEM bracket 内の Remnant 進行度（0〜1）。最大段は 1。
   * @param {*} remnantsTotal
   * @returns {number}
   */
  function getCemMeterFillFromRemnants(remnantsTotal){
    const { currentMin, nextThreshold } = getCemRangeFromRemnants(remnantsTotal);
    const t = _safeRemnantsTotalForCem(remnantsTotal);
    if (nextThreshold == null) return 1;
    const span = nextThreshold - currentMin;
    if (span <= 0) return 1;
    const raw = (t - currentMin) / span;
    return Math.min(1, Math.max(0, raw));
  }

  /** Per-duration inclusive range for research guaranteed Remnant gain. */
  const RESEARCH_GUARANTEED_REMNANT_RANGE = Object.freeze({
    '1h': Object.freeze({ min: 1, max: 1 }),
    '2h': Object.freeze({ min: 1, max: 2 }),
    '4h': Object.freeze({ min: 2, max: 4 })
  });

  const RESEARCH_REWARD_TABLES = {
    normal: {
    '1h': {
      mainSlots: [
        { roll:[
          { kind:'permSkill', weight:45 },
          { kind:'collective', weight:45 },
          { kind:'none', weight:10 }
        ] }
      ],
      bonusSlotsDef: [
        { roll:[
          { kind:'permSkill', weight:45 },
          { kind:'collective', weight:45 },
          { kind:'none', weight:10 }
        ] }
      ]
    },
    '2h': {
      mainSlots: [
        { roll:[
          { kind:'collective', weight:100 }
        ]},
        { roll:[
          { kind:'permSkill', weight:75 },
          { kind:'none', weight:25 }
        ]}
      ],
      bonusSlotsDef: [
        { roll:[
          { kind:'permSkill', weight:45 },
          { kind:'collective', weight:45 },
          { kind:'none', weight:10 }
        ] }
      ]
    },
    '4h': {
      mainSlots: [
        { roll:[
          { kind:'collective', weight:100 }
        ]},
        { roll:[
          { kind:'permSkill', weight:65 },
          { kind:'collective', weight:25 },
          { kind:'none', weight:10 }
        ] },
        { roll:[
          { kind:'permSkill', weight:75 },
          { kind:'none', weight:25 }
        ]}
      ],
      bonusSlotsDef: [
        { roll:[
          { kind:'permSkill', weight:45 },
          { kind:'collective', weight:45 },
          { kind:'none', weight:10 }
        ] }
      ]
    }
    },
    lowNone: {
      '1h': {
        mainSlots: [
          { roll:[
            { kind:'permSkill', weight:48 },
            { kind:'collective', weight:48 },
            { kind:'none', weight:4 }
          ] }
        ],
        bonusSlotsDef: [
          { roll:[
            { kind:'permSkill', weight:45 },
            { kind:'collective', weight:45 },
            { kind:'none', weight:10 }
          ] }
        ]
      },
      '2h': {
        mainSlots: [
          { roll:[
            { kind:'collective', weight:100 }
          ]},
          { roll:[
            { kind:'permSkill', weight:90 },
            { kind:'none', weight:10 }
          ]}
        ],
        bonusSlotsDef: [
          { roll:[
            { kind:'permSkill', weight:45 },
            { kind:'collective', weight:45 },
            { kind:'none', weight:10 }
          ] }
        ]
      },
      '4h': {
        mainSlots: [
          { roll:[
            { kind:'collective', weight:100 }
          ]},
          { roll:[
            { kind:'permSkill', weight:68 },
            { kind:'collective', weight:28 },
            { kind:'none', weight:4 }
          ] },
          { roll:[
            { kind:'permSkill', weight:90 },
            { kind:'none', weight:10 }
          ]}
        ],
        bonusSlotsDef: [
          { roll:[
            { kind:'permSkill', weight:45 },
            { kind:'collective', weight:45 },
            { kind:'none', weight:10 }
          ] }
        ]
      }
    }
  };
  const RESEARCH_RESULT_TABLE = RESEARCH_REWARD_TABLES.normal;

  window.GAME_DEFS = {
    UPGRADE_DEFS,
    ALL_SKILL_IDS,
    PROGRESS_SKILL_IDS,
    SKILL_MAX_LEVEL_BY_ID,
    TOTAL_COLLECTIVE_COUNT,
    RESEARCH_FACILITY_GRADE_MAX,
    NEXT_SORTIE_EFFECT_KINDS,
    NEXT_SORTIE_EFFECT_BY_COLLECTIVE_ID,
    NEXT_SORTIE_EFFECT_LABELS,
    NEXT_SORTIE_EFFECT_CONFIG,
    SORTIE_AREA_DEFS,
    SORTIE_AREA_SPAWN_DEFS,
    TIER_WEIGHT_TABLE,
    SKILL_TIER,
    SKILL_FACILITY_GATE,
    FACILITY_LVL2_ONLY_SKILL_IDS,
    COLLECTIVE_TIER,
    CEM_BRACKET_THRESHOLDS,
    getCoreMulFromRemnants,
    getCemRangeFromRemnants,
    getCemMeterFillFromRemnants,
    RESEARCH_GUARANTEED_REMNANT_RANGE,
    RESEARCH_REWARD_TABLES,
    RESEARCH_RESULT_TABLE
  };
})();
