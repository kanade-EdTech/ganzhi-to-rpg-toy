/**
 * 历史年号查询模块
 * 数据源：data/history/all-era-years.csv（DILA + CeJS 两源）
 * 优先级：DILA/S（标准）> CeJS/derived（补充）> DILA/P（延用）> 疑
 */

const CSV_URL = 'data/history/all-era-years.csv';

// 来源优先级：越小越优
const SOURCE_PRIORITY = {
  'DILA,S': 0,
  'DILA,P': 1,
  'CeJS,derived': 2,
  'CeJS,準=年': 2,
  'CeJS,疑': 3,
  'DILA,疑': 3,
};

let _loaded = false;
let _loading = null;
/** @type {Map<string, EraEntry[]>}  key = `${dynasty}\u0001${eraName}` */
let _index = null;
/** @type {{dynasty:string, count:number}[]} 朝代列表（按记录数降序） */
let _dynasties = null;

/**
 * 解析一行 CSV（简单版，无引号字段）
 */
function parseLine(line) {
  const parts = line.split(',');
  if (parts.length < 8) return null;
  return {
    source: parts[0],
    dynasty: parts[2],
    emperor: parts[3],
    eraName: parts[4],
    eraYear: parseInt(parts[5], 10),
    ganzhi: parts[6],
    astroYear: parseInt(parts[7], 10),
    quality: parts[8] || '',
  };
}

function sourceKey(rec) {
  return `${rec.source},${rec.quality}`;
}

/**
 * 加载并索引年号数据（懒加载，首次调用才 fetch）
 */
export async function loadEraData() {
  if (_loaded) return;
  if (_loading) return _loading;
  _loading = (async () => {
    const resp = await fetch(CSV_URL);
    if (!resp.ok) throw new Error(`加载年号数据失败：${resp.status}`);
    let text = await resp.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // 去 BOM
    const lines = text.split(/\r?\n/);

    _index = new Map();
    const dynastyCount = new Map();

    // 跳过表头
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const rec = parseLine(line);
      if (!rec || !rec.dynasty || !rec.eraName || isNaN(rec.eraYear) || isNaN(rec.astroYear)) continue;

      const key = `${rec.dynasty}\u0001${rec.eraName}`;
      const arr = _index.get(key);
      if (arr) {
        // 同 (dynasty, eraName, eraYear) 优先保留高优先级来源
        const existing = arr.find(e => e.eraYear === rec.eraYear);
        if (existing) {
          if ((SOURCE_PRIORITY[sourceKey(rec)] ?? 9) < (SOURCE_PRIORITY[sourceKey(existing)] ?? 9)) {
            Object.assign(existing, rec);
          }
          continue;
        }
        arr.push(rec);
      } else {
        _index.set(key, [rec]);
      }
      dynastyCount.set(rec.dynasty, (dynastyCount.get(rec.dynasty) || 0) + 1);
    }

    // 朝代按记录数降序
    _dynasties = [...dynastyCount.entries()]
      .map(([dynasty, count]) => ({ dynasty, count }))
      .sort((a, b) => b.count - a.count);

    _loaded = true;
    _loading = null;
  })();
  return _loading;
}

/**
 * 获取朝代列表（含每个朝代可用的年号）
 */
export async function getDynastyList() {
  await loadEraData();
  return _dynasties.map(d => d.dynasty);
}

/**
 * 获取某朝代下的所有年号（去重，按年次起始排序）
 * @returns {Promise<{eraName:string, emperor:string, yearMin:number, yearMax:number, ganzhiStart:string}[]>}
 */
export async function getErasByDynasty(dynasty) {
  await loadEraData();
  const result = [];
  for (const [key, arr] of _index) {
    const [dyn, eraName] = key.split('\u0001');
    if (dyn !== dynasty) continue;
    const years = arr.map(e => e.eraYear).sort((a, b) => a - b);
    const emperor = arr[0]?.emperor || '';
    result.push({
      eraName,
      emperor,
      yearMin: years[0],
      yearMax: years[years.length - 1],
      ganzhiStart: arr.find(e => e.eraYear === years[0])?.ganzhi || '',
    });
  }
  result.sort((a, b) => a.yearMin - b.yearMin);
  return result;
}

/**
 * 查询某年号某年次对应的天文纪年
 * @returns {Promise<{astroYear:number, ganzhi:string, dynasty:string, emperor:string, eraName:string, eraYear:number} | null>}
 */
export async function lookupEra(dynasty, eraName, eraYear) {
  await loadEraData();
  const key = `${dynasty}\u0001${eraName}`;
  const arr = _index.get(key);
  if (!arr) return null;
  const found = arr.find(e => e.eraYear === eraYear);
  if (!found) return null;
  return {
    astroYear: found.astroYear,
    ganzhi: found.ganzhi,
    dynasty: found.dynasty,
    emperor: found.emperor,
    eraName: found.eraName,
    eraYear: found.eraYear,
  };
}

/**
 * 天文纪年 → {era, year}（与 ui.js 的 state 对接）
 * astroYear = 0 → 公元前1年；astroYear = -1 → 公元前2年
 */
export function astroToState(astroYear) {
  if (astroYear > 0) return { era: 'AD', year: astroYear };
  return { era: 'BC', year: 1 - astroYear };
}
