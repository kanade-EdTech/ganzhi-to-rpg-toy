import { Solar, Lunar, LunarYear, LunarMonth, SolarUtil } from './vendor/lunar.js';
export { Solar, Lunar, LunarYear, LunarMonth };

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
  子: [{ tg: 9, type: '本气' }],                                         // 癸
  丑: [{ tg: 5, type: '本气' }, { tg: 9, type: '中气' }, { tg: 7, type: '余气' }],  // 己癸辛
  寅: [{ tg: 0, type: '本气' }, { tg: 2, type: '中气' }, { tg: 4, type: '余气' }],  // 甲丙戊
  卯: [{ tg: 1, type: '本气' }],                                         // 乙
  辰: [{ tg: 4, type: '本气' }, { tg: 1, type: '中气' }, { tg: 9, type: '余气' }],  // 戊乙癸
  巳: [{ tg: 2, type: '本气' }, { tg: 6, type: '中气' }, { tg: 4, type: '余气' }], // 丙庚戊
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
const CHANGSHENG_START = [11, 6, 2, 9, 2, 9, 5, 0, 8, 3]; // 甲亥乙午丙寅丁酉戊寅己酉庚巳辛子壬申癸卯
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

// 日期采用历法库的儒略历 / 格里高利历切换规则，年份采用天文纪年。
export function gregorianToJDN(year, month, day) {
  return Solar.fromYmd(year, month, day).getJulianDay();
}

export function jdnToGregorian(jdn) {
  const solar = Solar.fromJulianDay(jdn);
  return { year: solar.getYear(), month: solar.getMonth(), day: solar.getDay() };
}

export function hourToDZ(hour) {
  return Math.floor(((hour + 1) % 24) / 2);
}

export function getSolarDays(year, month) {
  const days = SolarUtil.getDaysOfMonth(year, month);
  return Array.from({ length: month === 10 && year === 1582 ? 31 : days }, (_, i) => i + 1)
    .filter(day => !(year === 1582 && month === 10 && day >= 5 && day <= 14));
}

/** 东八区标准时间排盘，默认午夜换日，时干沿用五鼠遁晚子时规则。 */
export function calcBazi(year, month, day, hour, minute = 0) {
  if (![year, month, day, hour, minute].every(Number.isInteger) ||
      year < -5000 || year > 5000 || month < 1 || month > 12 ||
      hour < 0 || hour > 23 || minute < 0 || minute > 59 ||
      !getSolarDays(year, month).includes(day)) {
    throw new RangeError('请输入有效的日期与时间（年份 -5000～5000）');
  }
  const solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
  const lunar = solar.getLunar();
  // 正模保证公元前的负儒略日也能连续推演干支。
  const mod = (n, base) => ((n % base) + base) % base;
  const dayOffset = Math.floor(gregorianToJDN(year, month, day) + 0.5) - 11;
  const dayTG = mod(dayOffset, 10);
  const hourDZ = hourToDZ(hour);
  const hourDayTG = mod(dayTG + (hour === 23 ? 1 : 0), 10);
  const makePillar = (tg, dz) => ({
    tg, dz, name: TIANGAN[tg] + DIZHI[dz], changsheng: getChangsheng(dayTG, dz),
  });
  return {
    year: makePillar(lunar.getYearGanIndexExact(), lunar.getYearZhiIndexExact()),
    month: makePillar(lunar.getMonthGanIndexExact(), lunar.getMonthZhiIndexExact()),
    day: makePillar(dayTG, mod(dayOffset, 12)),
    hour: makePillar((hourDayTG % 5 * 2 + hourDZ) % 10, hourDZ),
    dayMaster: dayTG,
  };
}
