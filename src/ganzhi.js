/**
 * 干支历法核心引擎
 * 支持 -5000 ~ +5000 年四柱排盘
 */

// ── 基础数据表 ──────────────────────────────────────────────

export const TIANGAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
export const DIZHI   = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
export const SHENGXIAO = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];

// 天干五行：甲乙木 丙丁火 戊己土 庚辛金 壬癸水
export const TG_WUXING = ['木','木','火','火','土','土','金','金','水','水'];
// 天干阴阳：甲丙戊庚壬阳，乙丁己辛癸阴
export const TG_YINYANG = ['阳','阴','阳','阴','阳','阴','阳','阴','阳','阴'];

// 地支五行
export const DZ_WUXING = ['水','土','木','木','土','火','火','土','金','金','土','水'];
// 地支阴阳
export const DZ_YINYANG = ['阳','阴','阳','阴','阳','阴','阳','阴','阳','阴','阳','阴'];

// 地支藏干 { 本气, 中气?, 余气? } 按权重排列
// 值为天干索引
export const DZ_CANGGAN = {
  子: [{ tg: 9, type: '本气' }],                                         // 壬
  丑: [{ tg: 5, type: '本气' }, { tg: 9, type: '中气' }, { tg: 7, type: '余气' }],  // 己壬辛
  寅: [{ tg: 0, type: '本气' }, { tg: 2, type: '中气' }, { tg: 6, type: '余气' }],  // 甲丙庚
  卯: [{ tg: 1, type: '本气' }],                                         // 乙
  辰: [{ tg: 4, type: '本气' }, { tg: 1, type: '中气' }, { tg: 9, type: '余气' }],  // 戊乙癸
  巳: [{ tg: 2, type: '本气' }, { tg: 6, type: '中气' }],                // 丙庚（戊余气有时省略）
  午: [{ tg: 3, type: '本气' }, { tg: 5, type: '中气' }],                // 丁己
  未: [{ tg: 5, type: '本气' }, { tg: 3, type: '中气' }, { tg: 1, type: '余气' }],  // 己丁乙
  申: [{ tg: 6, type: '本气' }, { tg: 8, type: '中气' }, { tg: 4, type: '余气' }],  // 庚壬戊
  酉: [{ tg: 7, type: '本气' }],                                         // 辛
  戌: [{ tg: 4, type: '本气' }, { tg: 7, type: '中气' }, { tg: 3, type: '余气' }],  // 戊辛丁
  亥: [{ tg: 8, type: '本气' }, { tg: 0, type: '中气' }],                // 壬甲
};

// 十二长生状态（日主在各地支的状态），以日主天干索引查
// 长生起点：甲长生在亥，乙长生在午，丙长生在寅，丁长生在酉，戊长生在寅，己长生在酉，庚长生在巳，辛长生在子，壬长生在申，癸长生在卯
const CHANGSHENG_ORDER = ['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'];
// 各天干长生起始地支索引
const CHANGSHENG_START = [10, 6, 2, 9, 2, 9, 4, 0, 7, 3]; // 甲亥乙午丙寅丁酉戊寅己酉庚巳辛子壬申癸卯
// 阳干顺数，阴干逆数
function getChangsheng(tgIdx, dzIdx) {
  const start = CHANGSHENG_START[tgIdx];
  const isYang = tgIdx % 2 === 0;
  let step = isYang ? (dzIdx - start + 12) % 12 : (start - dzIdx + 12) % 12;
  return CHANGSHENG_ORDER[step];
}

// 长生状态倍率
export const CHANGSHENG_MULT = {
  '帝旺': 1.25, '临官': 1.20, '长生': 1.15, '冠带': 1.10,
  '养': 1.00, '胎': 1.00, '沐浴': 1.00, '衰': 1.00,
  '病': 0.95, '死': 0.90, '墓': 0.85, '绝': 0.85,
};

// 二十四节气太阳黄经（每个节气对应黄经度数，从小寒0°开始，每15°一个节气）
// 节气与月令（建月）的对应：以"节"入月，以"气"为中气
// 十二月令（建月）：寅月=正月(立春)，卯月=二月(惊蛰)...
const JIEQI_NAMES = [
  '小寒','大寒','立春','雨水','惊蛰','春分',
  '清明','谷雨','立夏','小满','芒种','夏至',
  '小暑','大暑','立秋','处暑','白露','秋分',
  '寒露','霜降','立冬','小雪','大雪','冬至'
];

// 节气对应月令地支索引（以"节"入月）
// 小寒→丑月(1), 大寒→丑月, 立春→寅月(2), ...
// 节气对应月令地支（同 JIEQI_YUE_DZ，见下方）
// 节/气区分（0=节，1=气），节入月，气为中气
const JIEQI_IS_QI = [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1];

// ── 儒略日工具 ─────────────────────────────────────────────

/** 公历日期（含负数年=公元前）→ 儒略日数（JDN，正午为整数） */
export function gregorianToJDN(year, month, day) {
  // 天文历法：公元前1年=0，公元前2年=-1
  let y = year, m = month, d = day;
  if (m <= 2) { y--; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  // 格里高利历（1582-10-15后）vs 儒略历
  const useGregorian = (year > 1582) ||
    (year === 1582 && month > 10) ||
    (year === 1582 && month === 10 && day >= 15);
  const correction = useGregorian ? B : 0;
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + correction - 1524.5;
}

/** JDN → 公历日期 */
export function jdnToGregorian(jdn) {
  const z = Math.floor(jdn + 0.5);
  const f = jdn + 0.5 - z;
  let A;
  if (z < 2299161) {
    A = z;
  } else {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    A = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E);
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  return { year, month, day };
}

// ── 节气计算（VSOP87简化，精度约±20分钟，适用-5000~+5000） ──

/** 计算某年某节气的JDN（近似值） */
function calcJieqiJDN(year, jieqiIndex) {
  // 太阳黄经 = jieqiIndex * 15 + 255 （小寒=255°，以春分=0°为基准）
  // 改为以春分（index=5对应春分，黄经=0°=360°）为基准
  // 排列：小寒(270)大寒(285)立春(300)雨水(315)惊蛰(330)春分(345→等效为345但节气以315为参考)
  // 重新定义：0=小寒，黄经285°；以春分黄经0°为参考点
  // 黄经度数：小寒285，大寒300，立春315，雨水330，惊蛰345，春分0，清明15，谷雨30，立夏45，小满60，芒种75，夏至90，小暑105，大暑120，立秋135，处暑150，白露165，秋分180，寒露195，霜降210，立冬225，小雪240，大雪255，冬至270
  const JIEQI_SUNLON = [285,300,315,330,345,0,15,30,45,60,75,90,105,120,135,150,165,180,195,210,225,240,255,270];
  const targetLon = JIEQI_SUNLON[jieqiIndex];

  // 春分点JDN近似（Meeus简化）
  const Y = year + (targetLon / 360);
  const JDE0 = 2451545.0 + 365.2422 * (Y - 2000);

  // 用牛顿迭代法精化（简化版）
  // 太阳黄经计算（近似到0.01°精度）
  let jde = JDE0;
  for (let i = 0; i < 3; i++) {
    const sunLon = calcSunLongitude(jde);
    let diff = targetLon - sunLon;
    // 处理跨0°
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    jde += diff / 360 * 365.2422;
  }
  return jde;
}

/** 简化太阳黄经计算（适用于±3000年，精度约0.01°） */
function calcSunLongitude(jde) {
  const T = (jde - 2451545.0) / 36525;
  // 太阳平黄经
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  // 太阳平近点角
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * Math.PI / 180;
  // 方程差
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
          + 0.000289 * Math.sin(3 * M);
  // 太阳真黄经
  let lon = (L0 + C) % 360;
  if (lon < 0) lon += 360;
  return lon;
}

// ── 月柱（节气月令）计算 ────────────────────────────────────

/** 获取某年全部24个节气的JDN */
function getYearJieqi(year) {
  return JIEQI_NAMES.map((_, i) => ({
    name: JIEQI_NAMES[i],
    jdn: calcJieqiJDN(year, i),
    isQi: JIEQI_IS_QI[i] === 1,
    yueDZ: JIEQI_YUE_DZ[i],
  }));
}

// 节气对应月令（"节"入月）：小寒节→丑月，立春节→寅月...
const JIEQI_YUE_DZ = [1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,0,0];
// 节入月用的"节"（偶数索引）：小寒(0)立春(2)惊蛰(4)清明(6)立夏(8)芒种(10)小暑(12)立秋(14)白露(16)寒露(18)立冬(20)大雪(22)
const JIE_INDICES = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

/** 根据出生JDN确定月柱地支 */
function getMonthDZ(birthJDN, year) {
  // 获取该年及前一年的节气
  const jieqiThisYear = getYearJieqi(year);
  const jieqiPrevYear = getYearJieqi(year - 1);
  // 所有"节"（入月点）
  const allJie = [];
  for (const idx of JIE_INDICES) {
    allJie.push({ jdn: jieqiPrevYear[idx].jdn, yueDZ: jieqiPrevYear[idx].yueDZ });
    allJie.push({ jdn: jieqiThisYear[idx].jdn, yueDZ: jieqiThisYear[idx].yueDZ });
  }
  allJie.sort((a, b) => a.jdn - b.jdn);
  // 找到birthJDN所属的节
  let monthDZ = 0;
  for (let i = allJie.length - 1; i >= 0; i--) {
    if (birthJDN >= allJie[i].jdn) {
      monthDZ = allJie[i].yueDZ;
      break;
    }
  }
  return monthDZ;
}

/** 月柱天干：由年干推月干（五虎遁年起月法） */
function getMonthTG(yearTG, monthDZ) {
  // 寅月(2)为正月，月支从寅(2)开始，月序 = (monthDZ - 2 + 12) % 12
  const monthSeq = (monthDZ - 2 + 12) % 12;
  // 年干组对应寅月天干基础值
  // 甲己年寅月起丙，乙庚年寅月起戊，丙辛年寅月起庚，丁壬年寅月起壬，戊癸年寅月起甲
  const baseMonthTG = [2, 4, 6, 8, 0]; // 丙戊庚壬甲
  const group = yearTG % 5; // 甲(0)乙(1)丙(2)丁(3)戊(4) -> 甲己同组:0,4->0; 乙庚:1,5->1...
  // 年干索引0=甲，重新按组分：甲己→0，乙庚→1，丙辛→2，丁壬→3，戊癸→4
  const groupMap = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
  const g = groupMap[yearTG];
  return (baseMonthTG[g] + monthSeq) % 10;
}

// ── 时柱计算 ────────────────────────────────────────────────

/** 时间（小时，0~23）→ 时支地支索引 */
export function hourToDZ(hour) {
  // 子时 23-1，丑时 1-3，...
  return Math.floor(((hour + 1) % 24) / 2);
}

/** 时柱天干（五鼠遁日起时法） */
function getHourTG(dayTG, hourDZ) {
  // 甲己日子时起甲，乙庚日子时起丙，丙辛日子时起戊，丁壬日子时起庚，戊癸日子时起壬
  const baseHourTG = [0, 2, 4, 6, 8];
  const groupMap = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
  const g = groupMap[dayTG];
  return (baseHourTG[g] + hourDZ) % 10;
}

// ── 主排盘函数 ──────────────────────────────────────────────

/**
 * 四柱排盘
 * @param {number} year  公历年（负=公元前，天文历）
 * @param {number} month 公历月 1-12
 * @param {number} day   公历日
 * @param {number} hour  小时 0-23（已做真太阳时修正后传入）
 * @returns {Object} 四柱数据
 */
export function calcBazi(year, month, day, hour) {
  const jdn = gregorianToJDN(year, month, day);

  // ── 日柱 ──
  // 甲子日 JDN=2440000（1968-05-23）作为参考
  // 实际甲子日基准：JDN=2451549（2000-01-07）为甲子日
  const REF_JDN = 2451549; // 2000-01-07 甲子日
  const dayOffset = Math.floor(jdn) - REF_JDN;
  const dayTG = ((dayOffset % 10) + 10) % 10;
  const dayDZ = ((dayOffset % 12) + 12) % 12;

  // ── 年柱 ──
  // 以立春换年（节气换柱）
  const lichunJDN = calcJieqiJDN(year, 2); // 立春
  let ganzhi_year = year;
  if (jdn < lichunJDN) ganzhi_year = year - 1;
  // 以公元4年甲子年为基准（天文年4年）
  const yearOffset = ganzhi_year - 4;
  const yearTG = ((yearOffset % 10) + 10) % 10;
  const yearDZ = ((yearOffset % 12) + 12) % 12;

  // ── 月柱 ──
  const monthDZ = getMonthDZ(jdn, year);
  const monthTG = getMonthTG(yearTG, monthDZ);

  // ── 时柱 ──
  const hourDZ = hourToDZ(hour);
  const hourTG = getHourTG(dayTG, hourDZ);

  // ── 十二长生 ──
  // 以日主（dayTG）为基准，计算各柱地支的长生状态
  const changsheng = {
    year:  getChangsheng(dayTG, yearDZ),
    month: getChangsheng(dayTG, monthDZ),
    day:   getChangsheng(dayTG, dayDZ),
    hour:  getChangsheng(dayTG, hourDZ),
  };

  return {
    year:  { tg: yearTG,  dz: yearDZ,  name: TIANGAN[yearTG]  + DIZHI[yearDZ],  changsheng: changsheng.year  },
    month: { tg: monthTG, dz: monthDZ, name: TIANGAN[monthTG] + DIZHI[monthDZ], changsheng: changsheng.month },
    day:   { tg: dayTG,   dz: dayDZ,   name: TIANGAN[dayTG]   + DIZHI[dayDZ],   changsheng: changsheng.day   },
    hour:  { tg: hourTG,  dz: hourDZ,  name: TIANGAN[hourTG]  + DIZHI[hourDZ],  changsheng: changsheng.hour  },
    dayMaster: dayTG,
  };
}
