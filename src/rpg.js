/**
 * RPG 数值映射引擎
 * 十神权重 → RPG 属性
 */

import {
  TIANGAN, DIZHI, TG_WUXING, TG_YINYANG, DZ_WUXING, DZ_YINYANG,
  DZ_CANGGAN, CHANGSHENG_MULT,
} from './ganzhi.js';

// ── 十神定义 ────────────────────────────────────────────────

export const SHISHEN_NAMES = ['比肩','劫财','食神','伤官','偏财','正财','七杀','正官','偏印','正印'];

// 十神 RPG 属性定义
export const SHISHEN_RPG = {
  '比肩': { attr: '生命上限',       unit: 'hp',        color: '#E05347' },
  '劫财': { attr: '生命偷取',       unit: 'percent',   color: '#E05347' },
  '食神': { attr: '法力回复',       unit: 'mp_regen',  color: '#4A90E2' },
  '伤官': { attr: '技能伤害',       unit: 'percent',   color: '#4A90E2' },
  '偏财': { attr: '高级珍宝掉落',   unit: 'percent',   color: '#D9A34A' },
  '正财': { attr: '金币与基础掉率', unit: 'percent',   color: '#D9A34A' },
  '七杀': { attr: '卖血增益',       unit: 'berserk',   color: '#AB47BC' },
  '正官': { attr: '控制命中',       unit: 'percent',   color: '#AB47BC' },
  '偏印': { attr: '技能冷却缩减',   unit: 'cdr',       color: '#4CAF7A' },
  '正印': { attr: '经验加成',       unit: 'percent',   color: '#4CAF7A' },
};

// 五行 RPG 含义
export const WUXING_RPG = {
  '木': { name: '生机/恢复力', color: '#4CAF7A', desc: '影响生命与法力自然恢复基底' },
  '火': { name: '爆发/精神力', color: '#E05347', desc: '影响攻击速度与暴击气势基底' },
  '土': { name: '坚韧/防御力', color: '#D9A34A', desc: '影响护甲、抗性与霸体基底' },
  '金': { name: '锋芒/穿透力', color: '#C8A96B', desc: '影响基础攻击力与破甲基底' },
  '水': { name: '灵动/敏捷度', color: '#4A90E2', desc: '影响闪避、移速与法力池基底' },
};

// ── 十神计算 ────────────────────────────────────────────────

/**
 * 根据日主天干和目标天干，计算十神
 * @param {number} riZhuTG 日主天干索引
 * @param {number} targetTG 目标天干索引
 * @returns {string} 十神名称
 */
export function calcShishen(riZhuTG, targetTG) {
  const myWuxing = TG_WUXING[riZhuTG];
  const myYinyang = TG_YINYANG[riZhuTG];
  const targetWuxing = TG_WUXING[targetTG];
  const targetYinyang = TG_YINYANG[targetTG];
  const samePole = myYinyang === targetYinyang;

  // 五行生克关系
  const shengKe = getWuxingRelation(myWuxing, targetWuxing);

  if (shengKe === 'same') return samePole ? '比肩' : '劫财';
  if (shengKe === 'wo_sheng') return samePole ? '食神' : '伤官'; // 我生
  if (shengKe === 'wo_ke') return samePole ? '偏财' : '正财';    // 我克
  if (shengKe === 'ke_wo') return samePole ? '七杀' : '正官';    // 克我
  if (shengKe === 'sheng_wo') return samePole ? '偏印' : '正印'; // 生我
  return '比肩';
}

/**
 * 两五行关系（相对于甲方）
 * @param {string} a 我方五行
 * @param {string} b 对方五行
 */
function getWuxingRelation(a, b) {
  if (a === b) return 'same';
  const SHENG = { '木':'火', '火':'土', '土':'金', '金':'水', '水':'木' };
  const KE   = { '木':'土', '土':'水', '水':'火', '火':'金', '金':'木' };
  if (SHENG[a] === b) return 'wo_sheng';
  if (KE[a] === b)   return 'wo_ke';
  if (SHENG[b] === a) return 'sheng_wo'; // b生a
  if (KE[b] === a)   return 'ke_wo';     // b克a
  return 'same';
}

// ── 权重计算 ────────────────────────────────────────────────

/**
 * 计算八字中各十神的权重积分
 * @param {Object} bazi 四柱数据（来自 calcBazi）
 * @returns {Object} { shishenScores, wuxingScores, details }
 */
export function calcWeights(bazi) {
  const dm = bazi.dayMaster; // 日主天干索引
  const scores = {};
  SHISHEN_NAMES.forEach(s => scores[s] = 0);
  const wuxingScores = { '木': 0, '火': 0, '土': 0, '金': 0, '水': 0 };
  const details = []; // 来源追溯

  // 四柱主柱权重配置
  const PILLAR_CONFIG = [
    { pillar: '年柱', tgW: 8,  dzW: 8  },
    { pillar: '月柱', tgW: 12, dzW: 24 },
    { pillar: '日柱', tgW: 8,  dzW: 16 },
    { pillar: '时柱', tgW: 12, dzW: 12 },
  ];
  const pillars = [bazi.year, bazi.month, bazi.day, bazi.hour];

  pillars.forEach((pillar, i) => {
    const cfg = PILLAR_CONFIG[i];
    const cs = CHANGSHENG_MULT[pillar.changsheng] || 1.0;

    // 天干（日柱天干=日主，用比肩底分）
    const tgSS = (i === 2) ? '比肩' : calcShishen(dm, pillar.tg);
    const tgWx = TG_WUXING[pillar.tg];
    const tgScore = cfg.tgW * cs;
    scores[tgSS] += tgScore;
    wuxingScores[tgWx] += tgScore;
    details.push({ pillar: cfg.pillar, pos: '天干', char: TIANGAN[pillar.tg], shishen: tgSS, wuxing: tgWx, score: tgScore, changsheng: pillar.changsheng });

    // 地支本气
    const dzKey = DIZHI[pillar.dz];
    const cangganList = DZ_CANGGAN[dzKey] || [];
    if (cangganList.length > 0) {
      const benqi = cangganList[0]; // 本气
      const benqiSS = calcShishen(dm, benqi.tg);
      const benqiWx = TG_WUXING[benqi.tg];
      const benqiScore = cfg.dzW * cs;
      scores[benqiSS] += benqiScore;
      wuxingScores[benqiWx] += benqiScore;
      details.push({ pillar: cfg.pillar, pos: `地支${dzKey}(本气)`, char: TIANGAN[benqi.tg], shishen: benqiSS, wuxing: benqiWx, score: benqiScore, changsheng: pillar.changsheng });

      // 藏干加成（≤主柱1/3）
      const maxCangScore = cfg.dzW * cs / 3;
      if (cangganList.length >= 2) {
        // 双气：中气占25%
        const zhongqi = cangganList[1];
        const zhongqiScore = Math.min(cfg.dzW * cs * (cangganList.length === 3 ? 2/9 : 1/4), maxCangScore);
        const zhongqiSS = calcShishen(dm, zhongqi.tg);
        const zhongqiWx = TG_WUXING[zhongqi.tg];
        scores[zhongqiSS] += zhongqiScore;
        wuxingScores[zhongqiWx] += zhongqiScore;
        details.push({ pillar: cfg.pillar, pos: `地支${dzKey}(中气)`, char: TIANGAN[zhongqi.tg], shishen: zhongqiSS, wuxing: zhongqiWx, score: zhongqiScore, changsheng: pillar.changsheng, isCang: true });
      }
      if (cangganList.length >= 3) {
        // 三气：余气占1/9
        const yuqi = cangganList[2];
        const yuqiScore = Math.min(cfg.dzW * cs * (1/9), maxCangScore * (1/3));
        const yuqiSS = calcShishen(dm, yuqi.tg);
        const yuqiWx = TG_WUXING[yuqi.tg];
        scores[yuqiSS] += yuqiScore;
        wuxingScores[yuqiWx] += yuqiScore;
        details.push({ pillar: cfg.pillar, pos: `地支${dzKey}(余气)`, char: TIANGAN[yuqi.tg], shishen: yuqiSS, wuxing: yuqiWx, score: yuqiScore, changsheng: pillar.changsheng, isCang: true });
      }
    }
  });

  // 按十神分组来源
  const sourceMap = {};
  SHISHEN_NAMES.forEach(s => sourceMap[s] = []);
  details.forEach(d => sourceMap[d.shishen].push(d));

  return { shishenScores: scores, wuxingScores, details, sourceMap };
}

// ── RPG 数值公式 ────────────────────────────────────────────

/**
 * 将十神积分转化为具体 RPG 数值
 */
export function calcRPGStats(shishenScores) {
  const S = shishenScores;
  const stats = {};

  // 比肩：生命上限
  const bs = S['比肩'] || 0;
  stats['比肩'] = {
    value: Math.round(1000 + bs * 45),
    bonus: (bs * 0.8).toFixed(1),
    display: `${Math.round(1000 + bs * 45)} (+${(bs * 0.8).toFixed(1)}%)`,
    raw: bs,
  };

  // 劫财：生命偷取
  const jc = S['劫财'] || 0;
  stats['劫财'] = {
    value: (jc * 0.45).toFixed(1),
    display: `+${(jc * 0.45).toFixed(1)}%`,
    raw: jc,
  };

  // 正官：控制命中
  const zg = S['正官'] || 0;
  stats['正官'] = {
    value: (5 + zg * 0.85).toFixed(1),
    display: `+${(5 + zg * 0.85).toFixed(1)}%`,
    raw: zg,
  };

  // 七杀：卖血增益
  const qs = S['七杀'] || 0;
  stats['七杀'] = {
    value: (0.1 + qs * 0.035).toFixed(3),
    maxBuff: ((0.1 + qs * 0.035) * 100).toFixed(1),
    display: `每损1%生命 +${(0.1 + qs * 0.035).toFixed(3)}%终伤 (极限+${((0.1 + qs * 0.035) * 100).toFixed(1)}%)`,
    raw: qs,
  };

  // 食神：法力回复
  const sg = S['食神'] || 0;
  stats['食神'] = {
    value: (5 + sg * 0.65).toFixed(1),
    display: `${(5 + sg * 0.65).toFixed(1)} 点/秒`,
    raw: sg,
  };

  // 伤官：技能伤害
  const so = S['伤官'] || 0;
  stats['伤官'] = {
    value: (so * 1.25).toFixed(1),
    display: `+${(so * 1.25).toFixed(1)}%`,
    raw: so,
  };

  // 正印：经验加成
  const zy = S['正印'] || 0;
  stats['正印'] = {
    value: (zy * 1.5).toFixed(1),
    display: `+${(zy * 1.5).toFixed(1)}%`,
    raw: zy,
  };

  // 偏印：冷却缩减（软上限）
  const py = S['偏印'] || 0;
  const cdr = (50 * (1 - Math.exp(-py / 35))).toFixed(1);
  stats['偏印'] = {
    value: cdr,
    display: `+${cdr}%`,
    raw: py,
  };

  // 正财：金币掉率
  const zc = S['正财'] || 0;
  stats['正财'] = {
    value: (zc * 2.5).toFixed(1),
    display: `+${(zc * 2.5).toFixed(1)}%`,
    raw: zc,
  };

  // 偏财：珍宝掉率
  const pc = S['偏财'] || 0;
  stats['偏财'] = {
    value: (pc * 1.1).toFixed(1),
    display: `+${(pc * 1.1).toFixed(1)}%`,
    raw: pc,
  };

  return stats;
}

// ── 命格称号评定 ────────────────────────────────────────────

export function calcTitle(shishenScores, rpgStats) {
  // 按积分排序
  const ranked = Object.entries(shishenScores)
    .sort((a, b) => b[1] - a[1]);
  const top1 = ranked[0][0];
  const top2 = ranked[1][0];
  const score1 = ranked[0][1];
  const score2 = ranked[1][1];

  // 单神独旺
  const SOLO_TITLES = {
    '比肩': { title: '金刚不坏体',   tag: '比肩格',   desc: '不动如山的重装巨盾，天生血牛，体魄无双。',                         build: '重装坦克·生存流' },
    '劫财': { title: '血海修罗',     tag: '劫财格',   desc: '以战养战的嗜血狂徒，越战越勇，生命偷取惊人。',                     build: '狂战士·吸血流' },
    '正官': { title: '天道执律者',   tag: '正官格',   desc: '言出法随的控场统帅，一言可定乾坤，敌方寸步难行。',               build: '控制流·统帅' },
    '七杀': { title: '背水天煞孤星', tag: '七杀格',   desc: '游走于生死边缘的狂暴刺客，残血时秒天秒地，高风险高回报。',       build: '修罗刺客·残血爆发' },
    '食神': { title: '逍遥灵泉仙',   tag: '食神格',   desc: '永不枯竭的法术机关枪，法力续航拉满，轻松吊打一切高消耗流派。',   build: '高频施法·续航流' },
    '伤官': { title: '傲世破法狂儒', tag: '伤官格',   desc: '才华横溢、打破常规的大魔导师，极致技能倍率，一击必杀。',         build: '极致爆发·法系' },
    '正印': { title: '天眷悟道人',   tag: '正印格',   desc: '满级大佬转世，别人练气你结丹，经验成长速度令人瞠目。',           build: '速成流·悟道境' },
    '偏印': { title: '奇门诡道仙',   tag: '偏印格',   desc: '无冷却无限连招的机关幻术师，诡异战法令对手防不胜防。',           build: '冷却缩减·幻术流' },
    '正财': { title: '万贯黄金主',   tag: '正财格',   desc: '钞能力战士，小怪爆金如雨，资源丰厚，装备成型奇快。',             build: '发育流·资源型' },
    '偏财': { title: '天命欧皇',     tag: '偏财格',   desc: '气运逆天的寻宝猎人，走路上都能踢到神器，珍宝掉率令人发指。',     build: '欧皇·寻宝猎人' },
  };

  // 双神联动
  const COMBO_TITLES = [
    { pair: new Set(['食神','七杀']),   title: '镇狱剑仙',   desc: '高频回蓝支撑残血狂暴，食神制杀，攻守兼备的剑仙之道。',           build: '食神制杀·剑仙' },
    { pair: new Set(['伤官','正印']),   title: '文武通神',   desc: '超高技能伤害配合极速升级，伤官配印，文武双修的全能法皇。',       build: '伤官配印·法皇' },
    { pair: new Set(['七杀','正印']),   title: '浴血神皇',   desc: '卖血增伤同时享受高额护体与经验成长，杀印相生，浴血封神。',       build: '杀印相生·神皇' },
    { pair: new Set(['正官','正印']),   title: '紫微星主',   desc: '强控加身、升级神速的团队核心领袖，官印相生，紫微当道。',         build: '官印相生·领袖' },
    { pair: new Set(['伤官','正财']),   title: '点石成金手', desc: '边打高额技能输出边狂爆金币，食伤生财，点石成金的传奇商战法师。', build: '食伤生财·金商' },
    { pair: new Set(['食神','正财']),   title: '点石成金手', desc: '边打高额技能输出边狂爆金币，食伤生财，点石成金的传奇商战法师。', build: '食伤生财·金商' },
    { pair: new Set(['伤官','偏财']),   title: '点石成金手', desc: '边打技能倍率边猛爆珍宝，食伤生财，气运与实力并存的宝藏猎人。',   build: '食伤生财·宝藏' },
  ];

  // 检查双神联动（前两名分别进入前两位，且第二高分≥10）
  const topPair = new Set([top1, top2]);
  for (const combo of COMBO_TITLES) {
    const comboKeys = [...combo.pair];
    if (topPair.has(comboKeys[0]) && topPair.has(comboKeys[1]) && score2 >= 10) {
      return { title: combo.title, tag: `${top1}+${top2}`, desc: combo.desc, build: combo.build, isCombo: true };
    }
  }

  // 单神独旺（积分比第二名高出 50% 以上，且 ≥ 20）
  if (score1 >= 20 && score1 >= score2 * 1.5 && SOLO_TITLES[top1]) {
    return { ...SOLO_TITLES[top1], isCombo: false };
  }

  // 中等称号：顶分 ≥ 15
  if (score1 >= 15 && SOLO_TITLES[top1]) {
    const base = SOLO_TITLES[top1];
    return { title: `初悟·${base.title}`, tag: top1, desc: `命格初现，${base.desc}`, build: base.build, isCombo: false };
  }

  // 一般称号
  const GENERIC = [
    { min: 8,  title: '初入玄途者', desc: '八字平和，五行均衡，全能发展型角色，无明显短板。', build: '均衡型' },
    { min: 0,  title: '混沌未开',  desc: '先天命格尚在孕育之中，等待造化点化，一切皆有可能。', build: '待定型' },
  ];
  for (const g of GENERIC) {
    if (score1 >= g.min) return { title: g.title, tag: top1, desc: g.desc, build: g.build, isCombo: false };
  }
  return { title: '混沌未开', tag: '?', desc: '先天命格尚在孕育之中。', build: '待定', isCombo: false };
}

// ── 综合评级 ────────────────────────────────────────────────

export function calcGrade(shishenScores) {
  const total = Object.values(shishenScores).reduce((a, b) => a + b, 0);
  const maxScore = Math.max(...Object.values(shishenScores));
  const diversity = Object.values(shishenScores).filter(s => s > 5).length;

  // 简单评级逻辑
  if (maxScore >= 50) return 'SSR · 天灵根';
  if (maxScore >= 40) return 'SR · 地灵根';
  if (maxScore >= 30) return 'R · 人灵根';
  if (diversity >= 6) return 'N+ · 五行均衡体';
  return 'N · 普通命格';
}

// ── 完整计算入口 ────────────────────────────────────────────

export function fullCalc(bazi) {
  const { shishenScores, wuxingScores, details, sourceMap } = calcWeights(bazi);
  const rpgStats = calcRPGStats(shishenScores);
  const titleData = calcTitle(shishenScores, rpgStats);
  const grade = calcGrade(shishenScores);

  // 获取前三十神（排序）
  const top3 = Object.entries(shishenScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ss, score]) => ({ ss, score, rpg: rpgStats[ss] }));

  return { shishenScores, wuxingScores, rpgStats, titleData, grade, top3, details, sourceMap };
}
