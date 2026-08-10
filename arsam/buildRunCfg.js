/* buildRunCfg.js
 * Base -> Sortie bridge (single conversion layer).
 * - buildRunCfg(skillLevels): sortie-runtime skill IDs -> { runCfg, meta }
 * - buildSamRunCfg(): Score Attack Mode / ARSAM standalone 用の固定 runCfg（引数なし・max skill 相当）
 * - magazine_capacity is applied on Base as magazineSize, then passed to launch as takeAmmo. 
 * - buildRunCfgFromMeta(launchMeta): launch-only bridge -> sortie runCfg snapshot
 *
 * ARSAM standalone (Step 1): only buildSamRunCfg is on the play path (arsam.html createArsamRunCfg).
 * buildRunCfg / buildRunCfgFromMeta / applyNextSortieEffectToRunCfg remain Base-Sortie legacy exports.
 *
 * Current structure:
 * - This file currently owns both sortie/runtime numeric tables and base/meta helper tables.
 * - DEFAULT_RUN_CFG is the sortie-side fallback shape and baseline values.
 * - In other words this module handles both "numeric definitions + conversion" today.
 * - Numeric table extraction to a separate file remains possible later, but is not done here.
 * - This update clarifies responsibilities only; no numeric migration in this file.
 */
(() => {
  'use strict';

  // Baseline sortie config shape/values so sortie still runs without table lookups.
  const DEFAULT_RUN_CFG = {
    player: {
      speed: 52,
      orbGravityRadius: 0,
      orbGravityForce: 0
    },
    weapon: {
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

  const SKILL_MAX_LEVEL_BY_ID = Object.freeze(
    (typeof window !== 'undefined' && window.GAME_DEFS && window.GAME_DEFS.SKILL_MAX_LEVEL_BY_ID)
      ? window.GAME_DEFS.SKILL_MAX_LEVEL_BY_ID
      : {
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
        }
  );

  // Skill level -> sortie runtime value conversion tables.
  const SORTIE_SKILL_TABLES = {
    movement_speed: [52, 60, 75, 90],
    bullet_speed: [180, 190, 220, 250],
    shot_cooldown: [1.5, 1.2, 1.0, 0.8],
    blast_radius: [12, 14, 17, 20],
    blast_shrink: [0.2, 0.28, 0.36, 0.5],

    remnant_carrier_blast: {
      0: { radiusMul: 1.00, shrinkMul: 1.00 },
      1: { radiusMul: 1.20, shrinkMul: 1.00 },
      2: { radiusMul: 1.20, shrinkMul: 1.15 },
      3: { radiusMul: 1.25, shrinkMul: 1.25 },
    },
    chain_reaction: {
      0: [1.00],
      1: [1.00, 0.5],
      2: [1.00, 0.75, 0.50],
      3: [1.00, 1.00, 0.75, 0.50],
    },
    orb_gravity: {
      0: { radius: 0, force: 0 },
      1: { radius: 8, force: 1000.00 },
      2: { radius: 16, force: 1000.00 },
    },
  };
  // Base/Research-side helper value tables (returned in `meta`).
  const BASE_META_TABLES = {
    research_speed: [1.0, 0.90, 0.80, 0.70],
  };

  function clampToRange(v, max) {
    const n = (v == null) ? 0 : (v | 0);
    if (n < 0) return 0;
    if (n > max) return max;
    return n;
  }

  function getSkillHardMaxLevel(key) {
    const v = SKILL_MAX_LEVEL_BY_ID[key];
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.trunc(v));
  }

  function getClampedSkillLevel(skillLevels, key) {
    const src = (skillLevels && typeof skillLevels === 'object') ? skillLevels : null;
    const hardMax = getSkillHardMaxLevel(key);
    return clampToRange(src ? src[key] : 0, hardMax);
  }

  function getTableValue(table, level, keyForClamp) {
    const lv = clampToRange(level, getSkillHardMaxLevel(keyForClamp));
    if (Array.isArray(table)) return table[lv];
    if (table && typeof table === 'object') return table[lv];
    return undefined;
  }

  function cloneRunCfgTemplate() {
    return {
      player: { ...DEFAULT_RUN_CFG.player },
      weapon: { ...DEFAULT_RUN_CFG.weapon },
      blast: {
        ...DEFAULT_RUN_CFG.blast,
        mulTable: DEFAULT_RUN_CFG.blast.mulTable.slice(),
      },
    };
  }

  function researchSpeedMultiplier(skillLevels) {
    const lv = getClampedSkillLevel(skillLevels, 'research_speed');
    const mul = getTableValue(BASE_META_TABLES.research_speed, lv, 'research_speed');
    return typeof mul === 'number' && Number.isFinite(mul) ? mul : 1.0;
  }

  function buildRunCfg(skillLevels) {
    const runCfg = cloneRunCfgTemplate();

    // --- Sortie mapping ---
    runCfg.player.speed = getTableValue(SORTIE_SKILL_TABLES.movement_speed, getClampedSkillLevel(skillLevels, 'movement_speed'), 'movement_speed');
    runCfg.weapon.bulletSpeed = getTableValue(SORTIE_SKILL_TABLES.bullet_speed, getClampedSkillLevel(skillLevels, 'bullet_speed'), 'bullet_speed');
    runCfg.weapon.cooldownSec = getTableValue(SORTIE_SKILL_TABLES.shot_cooldown, getClampedSkillLevel(skillLevels, 'shot_cooldown'), 'shot_cooldown');
    runCfg.blast.radius = getTableValue(SORTIE_SKILL_TABLES.blast_radius, getClampedSkillLevel(skillLevels, 'blast_radius'), 'blast_radius');
    runCfg.blast.shrink = getTableValue(SORTIE_SKILL_TABLES.blast_shrink, getClampedSkillLevel(skillLevels, 'blast_shrink'), 'blast_shrink');
    {
      const boost = getTableValue(
        SORTIE_SKILL_TABLES.remnant_carrier_blast,
        getClampedSkillLevel(skillLevels, 'remnant_carrier_blast'),
        'remnant_carrier_blast'
      ) || { radiusMul: 1.00, shrinkMul: 1.00 };
      runCfg.blast.remnantCarrierRadiusMul = Number(boost.radiusMul) || 1.00;
      runCfg.blast.remnantCarrierShrinkMul = Number(boost.shrinkMul) || 1.00;
    }
    {
      const mt = getTableValue(SORTIE_SKILL_TABLES.chain_reaction, getClampedSkillLevel(skillLevels, 'chain_reaction'), 'chain_reaction');
      runCfg.blast.mulTable = Array.isArray(mt) ? mt.slice() : DEFAULT_RUN_CFG.blast.mulTable.slice();
    }
    {
      const og = getTableValue(SORTIE_SKILL_TABLES.orb_gravity, getClampedSkillLevel(skillLevels, 'orb_gravity'), 'orb_gravity') || { radius: 0, force: 0 };
      runCfg.player.orbGravityRadius = +og.radius || 0;
      runCfg.player.orbGravityForce = +og.force || 0;
    }

    // Keep blast.grow default only (life is normalized in sortie_state).
    runCfg.blast.grow = DEFAULT_RUN_CFG.blast.grow;
    delete runCfg.blast.life;

    const meta = {
      research_speed: researchSpeedMultiplier(skillLevels),
      // Base-side only values (Sortie runtime does not read these directly).
      // research_efficiency semantics stay in Base logic.
      // Lv2 enables one duplicate-at-cap template reroll.
      // Guaranteed Remnant reward is handled in research_logic.js.
      research_efficiency: getClampedSkillLevel(skillLevels, 'research_efficiency'),
    };

    return { runCfg, meta };
  }

  /**
   * Score Attack Mode / ARSAM standalone: 全 skill 取得後前提の固定 runCfg。
   * - テーブル max level のみ参照（one-time / launchSession / area は含めない）。
   * - ARSAM entry: arsam.html createArsamRunCfg() → window.ARSAM.init(runCfg).
   * - ammo 数値は arsam_state.js SAM_AMMO_CFG が runCfg.weapon より後勝ち（speed / blast / cooldown はここが効く）。
   * - buildRunCfg(skillLevels) / buildRunCfgFromMeta は Base→Sortie 橋渡し専用（ARSAM shell 未使用）。
   * @returns {typeof DEFAULT_RUN_CFG & { player: object, weapon: object, blast: object }}
   */
  function buildSamRunCfg() {
    const runCfg = cloneRunCfgTemplate();

    runCfg.player.speed = getTableValue(
      SORTIE_SKILL_TABLES.movement_speed,
      getSkillHardMaxLevel('movement_speed'),
      'movement_speed'
    );
    runCfg.weapon.bulletSpeed = getTableValue(
      SORTIE_SKILL_TABLES.bullet_speed,
      getSkillHardMaxLevel('bullet_speed'),
      'bullet_speed'
    );
    runCfg.weapon.cooldownSec = getTableValue(
      SORTIE_SKILL_TABLES.shot_cooldown,
      getSkillHardMaxLevel('shot_cooldown'),
      'shot_cooldown'
    );
    runCfg.blast.radius = getTableValue(
      SORTIE_SKILL_TABLES.blast_radius,
      getSkillHardMaxLevel('blast_radius'),
      'blast_radius'
    );
    runCfg.blast.shrink = getTableValue(
      SORTIE_SKILL_TABLES.blast_shrink,
      getSkillHardMaxLevel('blast_shrink'),
      'blast_shrink'
    );
    {
      const boost = getTableValue(
        SORTIE_SKILL_TABLES.remnant_carrier_blast,
        getSkillHardMaxLevel('remnant_carrier_blast'),
        'remnant_carrier_blast'
      ) || { radiusMul: 1.00, shrinkMul: 1.00 };
      runCfg.blast.remnantCarrierRadiusMul = Number(boost.radiusMul) || 1.00;
      runCfg.blast.remnantCarrierShrinkMul = Number(boost.shrinkMul) || 1.00;
    }
    {
      const mt = getTableValue(
        SORTIE_SKILL_TABLES.chain_reaction,
        getSkillHardMaxLevel('chain_reaction'),
        'chain_reaction'
      );
      runCfg.blast.mulTable = Array.isArray(mt) ? mt.slice() : DEFAULT_RUN_CFG.blast.mulTable.slice();
    }
    {
      runCfg.weapon.ammoMax = DEFAULT_RUN_CFG.weapon.ammoMax;
      runCfg.weapon.ammoStart = runCfg.weapon.ammoMax;
    }

    runCfg.player.orbGravityRadius = 0;
    runCfg.player.orbGravityForce = 0;

    runCfg.blast.grow = DEFAULT_RUN_CFG.blast.grow;
    delete runCfg.blast.life;

    return runCfg;
  }

  function getOneTimeCfg(GD){
    const c = GD && GD.NEXT_SORTIE_EFFECT_CONFIG;
    return {
      ammoBonus: Number(c && c.ammoBonus) || 3,
      blastRadiusBonus: Number(c && c.blastRadiusBonus) || 10,
      blastShrinkBonus: Number(c && c.blastShrinkBonus) || 0.3,
      cooldownFloorSec: Number(c && c.cooldownFloorSec) || 0.45,
      orbPickupMul: Number(c && c.orbPickupMul) || 2,
      remnantCarrierBonus: {
        windowSec: Number(c && c.remnantCarrierBonus && c.remnantCarrierBonus.windowSec) || 36,
        everySec: Number(c && c.remnantCarrierBonus && c.remnantCarrierBonus.everySec) || 1.5
      }
    };
  }

  function getSortieAreaDef(areaId, GD){
    const defs = GD && GD.SORTIE_AREA_DEFS;
    const idNum = Math.max(1, Math.min(5, Number(areaId) || 1));
    const raw = defs && defs[idNum];
    const orbMul = Number(raw && raw.orbMul);
    return {
      id: idNum,
      orbMul: (Number.isFinite(orbMul) && orbMul > 0) ? orbMul : 1
    };
  }

  function cloneSortieRunCfgForLaunch(runCfg){
    if (!runCfg || typeof runCfg !== 'object') return null;
    const b = runCfg.blast || {};
    const mul = Array.isArray(b.mulTable) ? b.mulTable.slice() : [1, 0.66, 0.33];
    return {
      player: Object.assign({}, runCfg.player || {}),
      weapon: Object.assign({}, runCfg.weapon || {}),
      blast: Object.assign({}, b, { mulTable: mul }),
    };
  }

  /**
   * Applies collective one-sortie effect to an already-built runCfg snapshot (mutates snap).
   * ORB_DOUBLER / REMNANT_CARRIER_BONUS use launchSession; others adjust weapon/blast.
   */
  function applyNextSortieEffectToRunCfg(snap, nextSortieEffect){
    const GD = (typeof window !== 'undefined' && window.GAME_DEFS) ? window.GAME_DEFS : null;
    if (!GD || !snap || typeof snap !== 'object') return snap;
    if (!snap.weapon || !snap.blast) return snap;
    const cfg = getOneTimeCfg(GD);
    const effect = nextSortieEffect;
    if (!effect){
      snap.oneTime = null;
      return snap;
    }
    const effectKind = String((effect && effect.kind) ? effect.kind : '');
    snap.oneTime = { kind: effectKind || null };

    if (effectKind === GD.NEXT_SORTIE_EFFECT_KINDS.AMMO_PLUS_3){
      const bonus = cfg.ammoBonus;
      const oldAmmoMax = Math.max(1, snap.weapon.ammoMax|0);
      const rawStart = Math.max(0, snap.weapon.ammoStart|0);
      const oldAmmoStart = Math.min(oldAmmoMax, rawStart);
      snap.weapon.ammoMax = oldAmmoMax + bonus;
      snap.weapon.ammoStart = Math.max(0, Math.min(snap.weapon.ammoMax, oldAmmoStart + bonus));
    } else if (effectKind === GD.NEXT_SORTIE_EFFECT_KINDS.BLAST_RADIUS_PLUS_10){
      const radius = Number(snap.blast.radius);
      const safeRadius = Number.isFinite(radius) ? radius : 0;
      snap.blast.radius = Math.max(0, safeRadius + cfg.blastRadiusBonus);
    } else if (effectKind === GD.NEXT_SORTIE_EFFECT_KINDS.BLAST_SHRINK_PLUS_0_3){
      const shrink = Number(snap.blast.shrink);
      const safeShrink = Number.isFinite(shrink) ? shrink : 0;
      snap.blast.shrink = Math.max(0, safeShrink + cfg.blastShrinkBonus);
    } else if (effectKind === GD.NEXT_SORTIE_EFFECT_KINDS.COOLDOWN_SHORT){
      const cooldown = Number(snap.weapon.cooldownSec);
      const safeCooldown = Number.isFinite(cooldown) ? cooldown : cfg.cooldownFloorSec;
      snap.weapon.cooldownSec = Math.max(0.01, Math.min(safeCooldown, cfg.cooldownFloorSec));
    }

    if (effectKind === GD.NEXT_SORTIE_EFFECT_KINDS.ORB_DOUBLER){
      const ls = Object.assign({}, snap.launchSession || {});
      const baseMul = Number(ls.orbPickupMulBase);
      const safeBaseMul = (Number.isFinite(baseMul) && baseMul > 0) ? baseMul : 1;
      const oneTimeMul = cfg.orbPickupMul;
      ls.orbPickupMulBase = safeBaseMul;
      ls.orbPickupMulOneTime = oneTimeMul;
      ls.orbPickupMul = safeBaseMul * oneTimeMul;
      snap.launchSession = ls;
    } else if (effectKind === GD.NEXT_SORTIE_EFFECT_KINDS.REMNANT_CARRIER_BONUS){
      snap.launchSession = Object.assign({}, snap.launchSession || {}, {
        remnantCarrierBonus: {
          windowSec: cfg.remnantCarrierBonus.windowSec,
          everySec: cfg.remnantCarrierBonus.everySec,
        },
      });
    }
    return snap;
  }

  /**
   * Single entry: Base launch snapshot → Sortie runCfg (no App, no localStorage).
   * @param {{ skillLevels?: object, takeAmmo?: number, nextSortieEffect?: {kind?:string,label?:string}|null }} launchMeta
   */
  function buildRunCfgFromMeta(launchMeta){
    const lm = (launchMeta && typeof launchMeta === 'object') ? launchMeta : {};
    const skillLevels = lm.skillLevels || {};
    const built = buildRunCfg(skillLevels);
    const runCfg = built && built.runCfg;
    if (!runCfg || !runCfg.weapon) return null;
    const snap = cloneSortieRunCfgForLaunch(runCfg);
    if (!snap || !snap.weapon) return null;
    const take = Math.max(0, lm.takeAmmo|0);
    const GD = (typeof window !== 'undefined' && window.GAME_DEFS) ? window.GAME_DEFS : null;
    const areaDef = getSortieAreaDef(lm.areaId, GD);
    snap.launchSession = Object.assign({}, snap.launchSession || {}, {
      areaId: areaDef.id,
      orbPickupMulBase: areaDef.orbMul,
      orbPickupMulOneTime: 1,
      orbPickupMul: areaDef.orbMul
    });
    snap.weapon.ammoStart = take;
    snap.weapon.ammoMax = Math.max(1, (snap.weapon.ammoMax|0), take);
    applyNextSortieEffectToRunCfg(snap, lm.nextSortieEffect || null);
    return snap;
  }

  // Export (CommonJS + browser global fallback).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildRunCfg,
      buildRunCfgFromMeta,
      applyNextSortieEffectToRunCfg,
      buildSamRunCfg,
    };
  } else if (typeof window !== 'undefined') {
    window.buildRunCfg = buildRunCfg;
    window.buildRunCfgFromMeta = buildRunCfgFromMeta;
    window.buildSamRunCfg = buildSamRunCfg;
  }
})();

