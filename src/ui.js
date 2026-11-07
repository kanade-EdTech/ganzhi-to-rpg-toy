/**
 * UI 交互层
 */
import { calcBazi, TIANGAN, DIZHI, TG_WUXING, DZ_WUXING, DZ_CANGGAN, hourToDZ, SHENGXIAO, CHANGSHENG_MULT, Solar, Lunar, LunarYear, LunarMonth, getSolarDays } from './ganzhi.js';
import { fullCalc, calcShishen, SHISHEN_RPG, WUXING_RPG, SHISHEN_NAMES } from './rpg.js';

// ── 状态 ─────────────────────────────────────────────────────

let state = {
  // 输入
  name: '',
  gender: '乾造',
  era: 'AD',          // AD | BC
  year: 2026, month: 11, day: 7,
  useLunar: false,
  hour: 14, minute: 30,
  useShichen: false,
  shichenIdx: 7,      // 默认未时（index in DIZHI，7=未）
  zishiType: 'early',  // early(早子时00-01) | late(晚子时23-24)

  // 计算结果
  result: null,
  compareSlots: [null, null],
};

const SHICHEN_LIST = [
  { name: '子时', range: '23:00-01:00', dz: 0  },
  { name: '丑时', range: '01:00-03:00', dz: 1  },
  { name: '寅时', range: '03:00-05:00', dz: 2  },
  { name: '卯时', range: '05:00-07:00', dz: 3  },
  { name: '辰时', range: '07:00-09:00', dz: 4  },
  { name: '巳时', range: '09:00-11:00', dz: 5  },
  { name: '午时', range: '11:00-13:00', dz: 6  },
  { name: '未时', range: '13:00-15:00', dz: 7  },
  { name: '申时', range: '15:00-17:00', dz: 8  },
  { name: '酉时', range: '17:00-19:00', dz: 9  },
  { name: '戌时', range: '19:00-21:00', dz: 10 },
  { name: '亥时', range: '21:00-23:00', dz: 11 },
];

const WUXING_CLASS = { '木':'wx-wood', '火':'wx-fire', '土':'wx-earth', '金':'wx-metal', '水':'wx-water' };

// 农历月份汉字名（index 1-12 → 正月/二月...冬月/腊月）
const LUNAR_MONTH_NAMES = [
  '', '正月','二月','三月','四月','五月','六月',
  '七月','八月','九月','十月','冬月','腊月',
];

// 数字 1-30 → 农历日汉字（初一、初二...初十、十一...二十、廿一...三十）
const LUNAR_DAY_NAMES = ['', '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
  '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

const TOTEM_CHARS = { '木':'🌿','火':'🔥','土':'⛰','金':'⚔','水':'💧' };

const ERA_ANCHORS = [
  { label: '上古神话', year: -3000 },
  { label: '夏商周',  year: -1000 },
  { label: '秦汉',   year: -221  },
  { label: '隋唐',   year: 618   },
  { label: '宋明',   year: 1127  },
  { label: '现代',   year: 2026  },
  { label: '赛博纪元', year: 3500 },
];

const RANDOM_NAMES = [
  '墨星','凌霄','紫幽','玄机','离火','坤灵','天枢','命轮',
  '渊凝','苍玄','霓裳','琅玕','九曜','虚照','清澜','阴符',
];

// ── 辅助函数 ─────────────────────────────────────────────────

function qualityClass(score) {
  if (score < 8)  return 'q-normal';
  if (score < 18) return 'q-good';
  if (score < 30) return 'q-rare';
  if (score < 45) return 'q-epic';
  return 'q-legend';
}

function getHourForCalc() {
  if (state.useShichen) {
    const sc = SHICHEN_LIST[state.shichenIdx];
    if (sc.dz === 0) {
      return state.zishiType === 'early' ? 0 : 23;
    }
    return sc.dz * 2 - 1; // 每个时辰起始小时
  }
  return state.hour;
}

function getEffectiveYear() {
  return state.era === 'BC' ? 1 - Math.abs(state.year) : Math.abs(state.year);
}

// ── 渲染工具 ─────────────────────────────────────────────────

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }

function setSegment(groupSel, value) {
  qsa(`${groupSel} button`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === value);
  });
}

// ── 初始化 UI ────────────────────────────────────────────────

export function initUI() {
  buildHeader();
  buildLeftPanel();
  buildRightPanel();
  buildTooltip();
  attachEvents();
  renderShichenGrid();
  updateTimeHint();
  updateYearDisplay();
  updateDatePreview();
}

// ── 头部 ─────────────────────────────────────────────────────

function buildHeader() {
  qs('#app-header').innerHTML = `
    <div class="header-title">生辰造化 · 天干地支先天 RPG 数值推演器<span>ganzhi-to-rpg-toy</span></div>
    <div class="header-actions">
      <button class="btn btn-ghost" id="btn-random-header">🎲 随机OC</button>
    </div>`;
}

// ── 左栏 ─────────────────────────────────────────────────────

function buildLeftPanel() {
  qs('#panel-left').innerHTML = `
    <!-- 角色名与性别 -->
    <div class="card">
      <div class="card-title">角色信息</div>
      <div class="form-row">
        <input type="text" id="input-name" placeholder="输入你或 OC 的名字..." style="flex:1">
        <button class="btn btn-ghost" id="btn-random-name" title="随机姓名">🎲</button>
      </div>
      <div class="seg-ctrl" id="seg-gender">
        <button data-val="乾造" class="active">⚡乾造(男)</button>
        <button data-val="坤造">✨坤造(女)</button>
        <button data-val="无相">☯无相(OC)</button>
      </div>
    </div>

    <!-- 日期选择 -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">出生日期</div>
        <div class="seg-ctrl" id="seg-date-mode" style="width:auto">
          <button data-val="solar" class="active">☀️ 公历</button>
          <button data-val="lunar">🌙 农历</button>
        </div>
      </div>

      <!-- 纪元 -->
      <div class="form-row">
        <span class="form-label">纪年</span>
        <div class="seg-ctrl" id="seg-era" style="width:auto">
          <button data-val="AD" class="active">公元 AD</button>
          <button data-val="BC">公元前 BC</button>
        </div>
        <input type="number" id="input-year" value="2026" min="1" max="5000" style="width:80px">
        <span style="font-size:0.8rem;color:var(--text-dim)">年</span>
      </div>

      <!-- 快捷锚点 -->
      <div class="anchor-row" id="anchor-row"></div>

      <!-- 月日 -->
      <div class="form-row" style="margin-top:10px">
        <span class="form-label">月份</span>
        <select id="sel-month" style="flex:1"></select>
        <span class="form-label">日期</span>
        <select id="sel-day" style="flex:1"></select>
      </div>

      <!-- 农历闰月（仅农历模式显示）-->
      <div id="lunar-run-row" class="form-row" style="display:none">
        <label style="font-size:0.75rem;color:var(--text-dim);display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="cb-leap"> 闰月
        </label>
        <span id="leap-hint" style="font-size:0.68rem;color:var(--text-muted)"></span>
      </div>

      <!-- 互转预览 -->
      <div class="lunar-preview" id="date-preview">对应农历：计算中...</div>
    </div>

    <!-- 时间选择 -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">出生时间</div>
        <div class="seg-ctrl" id="seg-time-mode" style="width:auto">
          <button data-val="modern" class="active">🕒 现代时</button>
          <button data-val="shichen">☯️ 时辰</button>
        </div>
      </div>

      <!-- 现代时间 -->
      <div id="modern-time-ui">
        <div class="form-row">
          <input type="number" id="input-hour"   value="14" min="0" max="23" style="width:60px">
          <span style="color:var(--gold);font-size:1.1rem">:</span>
          <input type="number" id="input-minute" value="30" min="0" max="59" style="width:60px">
          <span id="time-hint" style="font-size:0.72rem;color:var(--text-dim);margin-left:6px"></span>
        </div>
      </div>

      <!-- 时辰方格 -->
      <div id="shichen-time-ui" style="display:none">
        <div class="shichen-grid" id="shichen-grid"></div>
        <div class="zishi-extra" id="zishi-extra">
          <button data-val="early" class="active">早子时 (00:00-01:00)</button>
          <button data-val="late">晚子时 (23:00-24:00)</button>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-primary" id="btn-calc">🔮 起盘造化 · 生成数值</button>
      <button class="btn btn-secondary" id="btn-random-oc">🎲 随机生辰（捏个OC）</button>
    </div>

    <!-- 四柱盘 -->
    <div class="card" id="pillar-card" style="display:none">
      <div class="card-title">四柱八字命盘</div>
      <div class="pillar-table" id="pillar-table"></div>
    </div>`;

  // 填充月份/日期选项
  populateMonthDay();
  buildAnchorRow();
}

function populateMonthDay() {
  refreshMonthOptions();
  refreshDayOptions();
}

/** 月份下拉选项（公历/农历分别渲染） */
function refreshMonthOptions() {
  const selMonth = qs('#sel-month');
  const opts = Array.from({ length: 12 }, (_, i) => {
    const v = i + 1;
    const label = state.useLunar ? LUNAR_MONTH_NAMES[v] : `${v} 月`;
    return `<option value="${v}">${label}</option>`;
  }).join('');
  selMonth.innerHTML = opts;
  selMonth.value = state.month;
}

function refreshDayOptions() {
  const selDay = qs('#sel-day');
  const year   = getEffectiveYear();
  const month  = parseInt(qs('#sel-month').value);
  let validDays;
  if (state.useLunar) {
    const leapMonth = LunarYear.fromYear(year).getLeapMonth();
    const leap = qs('#cb-leap');
    leap.disabled = leapMonth !== month;
    if (leap.disabled) leap.checked = false;
    qs('#leap-hint').textContent = leapMonth ? `本年闰 ${LUNAR_MONTH_NAMES[leapMonth]}` : '本年无闰月';
    const lunarMonth = LunarMonth.fromYm(year, leap.checked ? -month : month);
    validDays = Array.from({ length: lunarMonth.getDayCount() }, (_, i) => i + 1);
  } else {
    validDays = getSolarDays(year, month);
  }
  const previous = Number(selDay.value) || state.day;
  const cur = validDays.includes(previous) ? previous : validDays.find(d => d >= previous) || validDays.at(-1);
  selDay.innerHTML = validDays.map(day => {
    const label = state.useLunar ? LUNAR_DAY_NAMES[day] : `${day} 日`;
    return `<option value="${day}"${day === cur ? ' selected' : ''}>${label}</option>`;
  }).join('');
  state.day = cur;
}

function buildAnchorRow() {
  qs('#anchor-row').innerHTML = ERA_ANCHORS.map(a =>
    `<button class="anchor-btn" data-year="${a.year}">${a.label}</button>`
  ).join('');
}

function buildRightPanel() {
  qs('#panel-right').innerHTML = `
    <div id="empty-state">
      <div class="empty-icon">🔮</div>
      <div class="empty-text">输入生辰信息<br>点击「起盘造化」生成你的先天命格</div>
    </div>
    <div id="result-area" style="display:none;flex-direction:column;gap:16px">
      <!-- 铭牌 -->
      <div id="banner-section" class="fade-in-up"></div>
      <!-- Top3 -->
      <div class="card">
        <div class="card-title">本命核心天赋</div>
        <div id="top3-section"></div>
      </div>
      <!-- 全属性 -->
      <div class="card">
        <div class="card-title">十神全属性矩阵</div>
        <div id="stats-section"></div>
      </div>
      <!-- 底部工具栏 -->
      <div id="footer-section">
        <button class="btn btn-ghost" id="btn-copy-md">📋 复制 Markdown 设定</button>
        <button class="btn btn-ghost" id="btn-compare">⚔️ 存入对比栏</button>
      </div>
    </div>`;
}

function buildTooltip() {
  const el = document.createElement('div');
  el.className = 'tooltip';
  el.id = 'tooltip';
  document.body.appendChild(el);
}

// ── 渲染时辰方格 ─────────────────────────────────────────────

function renderShichenGrid() {
  qs('#shichen-grid').innerHTML = SHICHEN_LIST.map((sc, i) =>
    `<button class="shichen-btn${i === state.shichenIdx ? ' active' : ''}" data-idx="${i}">
      ${sc.name}<span class="time-sub">${sc.range}</span>
    </button>`
  ).join('');
}

// ── 事件绑定 ─────────────────────────────────────────────────

function attachEvents() {
  // 随机名字
  qs('#btn-random-name').addEventListener('click', () => {
    qs('#input-name').value = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    state.name = qs('#input-name').value;
  });

  // 性别分段
  qs('#seg-gender').addEventListener('click', e => {
    if (!e.target.dataset.val) return;
    state.gender = e.target.dataset.val;
    setSegment('#seg-gender', state.gender);
  });

  // 公历/农历切换
  qs('#seg-date-mode').addEventListener('click', e => {
    if (!e.target.dataset.val) return;
    state.useLunar = e.target.dataset.val === 'lunar';
    setSegment('#seg-date-mode', e.target.dataset.val);
    qs('#lunar-run-row').style.display = state.useLunar ? 'flex' : 'none';
    refreshMonthOptions();
    refreshDayOptions();
    updateDatePreview();
  });

  // 纪元
  qs('#seg-era').addEventListener('click', e => {
    if (!e.target.dataset.val) return;
    state.era = e.target.dataset.val;
    setSegment('#seg-era', state.era);
    refreshDayOptions();
    updateDatePreview();
  });

  // 年份输入
  qs('#input-year').addEventListener('input', e => {
    const value = Number(e.target.value);
    if (value < 0) { state.era = 'BC'; setSegment('#seg-era', 'BC'); e.target.value = Math.abs(value); }
    state.year = Math.min(5000, Math.max(1, Math.abs(Math.trunc(value)) || 1));
    e.target.value = state.year;
    updateYearDisplay();
    refreshDayOptions();
    updateDatePreview();
  });

  // 时代锚点
  qs('#anchor-row').addEventListener('click', e => {
    if (!e.target.dataset.year) return;
    const y = parseInt(e.target.dataset.year);
    state.era = y < 0 ? 'BC' : 'AD';
    state.year = Math.abs(y);
    setSegment('#seg-era', state.era);
    qs('#input-year').value = state.year;
    updateYearDisplay();
    refreshDayOptions();
    updateDatePreview();
  });

  // 月份
  qs('#sel-month').addEventListener('change', e => {
    state.month = parseInt(e.target.value);
    refreshDayOptions();
    updateDatePreview();
  });

  // 日期
  qs('#sel-day').addEventListener('change', e => {
    state.day = parseInt(e.target.value);
    updateDatePreview();
  });

  qs('#cb-leap').addEventListener('change', () => {
    refreshDayOptions();
    updateDatePreview();
  });

  // 现代/时辰切换
  qs('#seg-time-mode').addEventListener('click', e => {
    if (!e.target.dataset.val) return;
    state.useShichen = e.target.dataset.val === 'shichen';
    if (state.useShichen) {
      state.shichenIdx = hourToDZ(state.hour);
      state.zishiType = state.hour === 23 ? 'late' : 'early';
      renderShichenGrid();
      qs('#zishi-extra').classList.toggle('show', state.shichenIdx === 0);
      setSegment('#zishi-extra', state.zishiType);
    } else {
      state.hour = state.shichenIdx === 0 ? (state.zishiType === 'early' ? 0 : 23) : state.shichenIdx * 2 - 1;
      state.minute = 0;
      qs('#input-hour').value = state.hour;
      qs('#input-minute').value = 0;
    }
    setSegment('#seg-time-mode', e.target.dataset.val);
    qs('#modern-time-ui').style.display  = state.useShichen ? 'none' : 'block';
    qs('#shichen-time-ui').style.display = state.useShichen ? 'block' : 'none';
    updateTimeHint();
  });

  // 小时/分钟
  qs('#input-hour').addEventListener('input', e => {
    state.hour = Math.min(23, Math.max(0, parseInt(e.target.value) || 0));
    e.target.value = state.hour;
    updateTimeHint();
  });
  qs('#input-minute').addEventListener('input', e => {
    state.minute = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
    e.target.value = state.minute;
  });

  // 时辰方格点击
  qs('#shichen-grid').addEventListener('click', e => {
    const btn = e.target.closest('.shichen-btn');
    if (!btn) return;
    state.shichenIdx = parseInt(btn.dataset.idx);
    qsa('.shichen-btn').forEach(b => b.classList.toggle('active', b.dataset.idx == state.shichenIdx));
    // 子时微调
    const isZishi = state.shichenIdx === 0;
    qs('#zishi-extra').classList.toggle('show', isZishi);
    updateTimeHint();
  });

  // 子时类型
  qs('#zishi-extra').addEventListener('click', e => {
    if (!e.target.dataset.val) return;
    state.zishiType = e.target.dataset.val;
    qsa('#zishi-extra button').forEach(b => b.classList.toggle('active', b.dataset.val === state.zishiType));
  });

  // 随机OC
  const doRandom = () => {
    state.name = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    state.era   = 'AD';
    state.year  = 1900 + Math.floor(Math.random() * 130);
    state.month = 1 + Math.floor(Math.random() * 12);
    state.day   = 1 + Math.floor(Math.random() * 28);
    state.hour  = Math.floor(Math.random() * 24);
    state.minute = 0;
    state.gender = ['乾造','坤造','无相'][Math.floor(Math.random() * 3)];
    state.useLunar = false;
    state.useShichen = false;
    setSegment('#seg-date-mode', 'solar');
    setSegment('#seg-time-mode', 'modern');
    qs('#lunar-run-row').style.display = 'none';
    qs('#modern-time-ui').style.display = 'block';
    qs('#shichen-time-ui').style.display = 'none';
    qs('#cb-leap').checked = false;

    qs('#input-name').value = state.name;
    setSegment('#seg-gender', state.gender);
    setSegment('#seg-era', state.era);
    qs('#input-year').value = state.year;
    refreshMonthOptions();
    qs('#sel-month').value  = state.month;
    refreshDayOptions();
    qs('#sel-day').value    = state.day;
    qs('#input-hour').value = state.hour;
    qs('#input-minute').value = state.minute;
    updateDatePreview();
    updateTimeHint();

    doCalc();
  };
  qs('#btn-random-oc').addEventListener('click', doRandom);
  qs('#btn-random-header').addEventListener('click', doRandom);

  // 起盘按钮
  qs('#btn-calc').addEventListener('click', doCalc);

  // 复制 Markdown
  qs('#btn-copy-md').addEventListener('click', copyMarkdown);

  // 存入对比栏
  qs('#btn-compare').addEventListener('click', addToCompare);

  // 姓名输入
  qs('#input-name').addEventListener('input', e => { state.name = e.target.value; });

  // 全局 tooltip
  document.addEventListener('mouseover', handleTooltip);
  document.addEventListener('mousemove', moveTooltip);
  document.addEventListener('mouseout', e => {
    if (e.target.closest('[data-tip]')) qs('#tooltip').classList.remove('show');
  });
}

// ── 计算主流程 ───────────────────────────────────────────────

function doCalc() {
  const year  = getEffectiveYear();
  const month = parseInt(qs('#sel-month').value);
  const day   = parseInt(qs('#sel-day').value);
  const hour  = getHourForCalc();

  state.name   = qs('#input-name').value.trim() || '无名造化者';
  state.gender = (qs('#seg-gender .active') || {}).dataset?.val || state.gender;

  const btn = qs('#btn-calc');
  btn.classList.add('loading');

  try {
    const minute = state.useShichen ? 0 : state.minute;
    const solar = state.useLunar
      ? Lunar.fromYmdHms(year, qs('#cb-leap').checked ? -month : month, day, hour, minute, 0).getSolar()
      : Solar.fromYmdHms(year, month, day, hour, minute, 0);
    const bazi = calcBazi(solar.getYear(), solar.getMonth(), solar.getDay(), hour, minute);
    const result = fullCalc(bazi);
    state.result = { bazi, ...result, name: state.name, gender: state.gender };
    renderResult(bazi, result);
  } catch (e) {
    console.error(e);
    alert('排盘出错：' + e.message);
  } finally {
    btn.classList.remove('loading');
  }
}

// ── 渲染结果 ─────────────────────────────────────────────────

function renderResult(bazi, result) {
  qs('#empty-state').style.display = 'none';
  const ra = qs('#result-area');
  ra.style.display = 'flex';
  ra.style.flexDirection = 'column';
  ra.style.gap = '16px';

  renderBanner(bazi, result);
  renderTop3(result);
  renderStats(result);
  renderPillar(bazi, result);
}

// ── 铭牌渲染 ─────────────────────────────────────────────────

function renderBanner(bazi, result) {
  const { titleData, grade, wuxingScores } = result;
  const dm = bazi.dayMaster;
  const dmWx = TG_WUXING[dm];
  const totem = TOTEM_CHARS[dmWx] || '🔮';

  // 五行占比
  const wxTotal = Object.values(wuxingScores).reduce((a, b) => a + b, 0) || 1;
  const wxBars = ['木','火','土','金','水'].map(wx => {
    const pct = ((wuxingScores[wx] || 0) / wxTotal * 100).toFixed(1);
    return `<div class="wx-bar-row">
      <span class="wx-bar-label ${WUXING_CLASS[wx]}">${wx}</span>
      <div class="wx-bar-track"><div class="wx-bar-fill" style="width:${pct}%;background:${WUXING_RPG[wx].color}"></div></div>
      <span class="wx-bar-pct">${pct}%</span>
    </div>`;
  }).join('');

  const genderTag = state.result.gender;

  qs('#banner-section').innerHTML = `
    <div class="banner-totem" style="border-color:${WUXING_RPG[dmWx].color};box-shadow:0 0 20px ${WUXING_RPG[dmWx].color}33">
      <div class="banner-totem-inner">${totem}</div>
    </div>
    <div class="banner-info">
      <div class="banner-name-row">
        <span class="banner-name">${escapeHTML(state.result.name)}</span>
        <span class="banner-gender">${genderTag}</span>
        <span class="banner-grade">${grade}</span>
      </div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px">
        日主：${['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'][dm]}${dmWx}（${TG_YINYANG(dm)}${dmWx}之体）
      </div>
      <div class="banner-title">【 ${titleData.title} · ${titleData.tag} 】</div>
      <div class="banner-desc">${titleData.desc}</div>
      <span class="banner-build">推荐流派：${titleData.build}</span>
    </div>
    <div class="banner-wuxing">${wxBars}</div>`;

  function TG_YINYANG(idx) {
    return ['阳','阴','阳','阴','阳','阴','阳','阴','阳','阴'][idx];
  }
}

// ── Top3 渲染 ────────────────────────────────────────────────

function renderTop3(result) {
  const { top3, sourceMap } = result;
  const container = qs('#top3-section');

  container.innerHTML = top3.map(({ ss, score, rpg }, rank) => {
    const rpgInfo = SHISHEN_RPG[ss];
    const qc = qualityClass(score);
    const sources = (sourceMap[ss] || [])
      .slice(0, 3)
      .map(d => `${d.pillar}[${d.char}]${d.isCang ? '(藏)' : ''}`)
      .join(' + ');

    return `<div class="top-card fade-in-up" style="animation-delay:${rank * 0.1}s;color:${rpgInfo.color}">
      <div class="top-card-seal ${qc}">${ss}</div>
      <div class="top-card-attr">${rpgInfo.attr}</div>
      <div class="top-card-value ${qc}">${rpg?.display || '-'}</div>
      <div class="top-card-source">来源：${sources || '本命底蕴'}</div>
      <div style="font-size:0.6rem;color:var(--text-muted);margin-top:2px">积分：${score.toFixed(1)} pt</div>
    </div>`;
  }).join('');
}

// ── 十神属性条渲染 ────────────────────────────────────────────

function renderStats(result) {
  const { shishenScores, rpgStats, sourceMap } = result;

  const GROUPS = [
    { title: '体魄与生存（比劫系）', items: ['比肩','劫财'] },
    { title: '威压与狂暴（官杀系）', items: ['正官','七杀'] },
    { title: '灵力与才华（食伤系）', items: ['食神','伤官'] },
    { title: '悟性与奇术（印枭系）', items: ['正印','偏印'] },
    { title: '气运与财源（财星系）', items: ['正财','偏财'] },
  ];

  const maxScore = Math.max(...Object.values(shishenScores), 1);

  let html = '';
  GROUPS.forEach(group => {
    html += `<div class="stat-group-title">${group.title}</div>`;
    group.items.forEach(ss => {
      const score = shishenScores[ss] || 0;
      const rpg   = rpgStats[ss];
      const rpgInfo = SHISHEN_RPG[ss];
      const qc    = qualityClass(score);
      const pct   = (score / maxScore * 100).toFixed(1);

      // tooltip 来源
      const sources = (sourceMap[ss] || []).map(d =>
        `${d.pillar}${d.pos}[${d.char}] ${d.isCang?'(藏)':''} +${d.score.toFixed(1)}pt ${d.changsheng}`
      ).join('\n');

      html += `<div class="stat-row" data-ss="${ss}"
          data-tip="${ss} · ${rpgInfo.attr}\n积分：${score.toFixed(1)} pt\n来源：\n${sources}"
          data-pillar-highlight="${[...new Set((sourceMap[ss]||[]).map(d=>d.pillar))].join(',')}">
        <div class="stat-seal ${qc}" style="color:${rpgInfo.color};border-color:${rpgInfo.color}33">${ss}</div>
        <div class="stat-name">${rpgInfo.attr}</div>
        <div class="stat-bar-track">
          <div class="stat-bar-fill" style="width:${pct}%;background:${rpgInfo.color}"></div>
        </div>
        <div class="stat-value">${rpg?.display || '-'}</div>
      </div>`;
    });
  });

  qs('#stats-section').innerHTML = html;

  // hover 高亮联动四柱
  qsa('.stat-row').forEach(row => {
    row.addEventListener('mouseenter', () => {
      const labels = (row.dataset.pillarHighlight || '').split(',').filter(Boolean);
      qsa('.pillar').forEach(p => {
        if (labels.includes(p.dataset.pillar)) {
          p.classList.add('highlight');
        }
      });
    });
    row.addEventListener('mouseleave', () => {
      qsa('.pillar').forEach(p => p.classList.remove('highlight'));
    });
  });
}

// ── 四柱盘渲染 ───────────────────────────────────────────────

function renderPillar(bazi, result) {
  const { sourceMap } = result;
  const card = qs('#pillar-card');
  card.style.display = 'block';

  const LABELS = ['年柱','月柱','日柱','时柱'];
  const pillars = [bazi.year, bazi.month, bazi.day, bazi.hour];

  qs('#pillar-table').innerHTML = pillars.map((p, i) => {
    const isDayMaster = i === 2;
    const tgWx = TG_WUXING[p.tg];
    const dzKey = DIZHI[p.dz];
    const dzWx  = DZ_WX(dzKey);
    const shengxiao = SHENGXIAO[p.dz];

    // 十神（日柱天干显示"日主"）
    const ssLabel = isDayMaster ? '日主/元神' : getShishenLabel(bazi.dayMaster, p.tg, result);
    const dzSS    = getShishenLabelByDZ(bazi.dayMaster, p.dz, result);

    // 藏干标签
    const cangList = DZ_CANGGAN[dzKey] || [];
    const cangTags = cangList.slice(1).map(c => {
      const cSS = getShishenByTG(bazi.dayMaster, c.tg, result);
      return `<span class="cang-tag" data-tip="${c.type}：${['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'][c.tg]} [${cSS}]">${['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'][c.tg]}</span>`;
    }).join('');

    const csClass = ['帝旺','临官','长生','冠带'].includes(p.changsheng) ? 'cs-strong'
                  : ['病','死','墓','绝'].includes(p.changsheng) ? 'cs-weak' : '';

    return `<div data-pillar="${LABELS[i]}" class="pillar${isDayMaster ? ' day-pillar' : ''}">
      <div class="pillar-label">${LABELS[i]}</div>
      <div class="pillar-shishen${isDayMaster ? ' rizhu' : ''}">${ssLabel}</div>
      <div class="pillar-tg ${WUXING_CLASS[tgWx]}">${TIANGAN[p.tg]}</div>
      <div class="pillar-dz ${WUXING_CLASS[dzWx]}" data-tip="${dzKey}·${shengxiao}·${dzWx}五行">${dzKey}<span class="pillar-benqi">${dzSS}</span></div>
      <div class="pillar-cang">${cangTags}</div>
      <div class="pillar-changsheng ${csClass}" data-tip="${p.changsheng}：该柱词条效力 ×${CHANGSHENG_MULT[p.changsheng].toFixed(2)}">${p.changsheng}</div>
    </div>`;
  }).join('');
}

function DZ_WX(dzKey) {
  const idx = DIZHI.indexOf(dzKey);
  return DZ_WUXING[idx] || '土';
}

function getShishenLabel(dm, tg, result) {
  // 从 sourceMap 里找最匹配的十神
  const char = TIANGAN[tg];
  for (const [ss, sources] of Object.entries(result.sourceMap)) {
    if (sources.some(s => s.char === char && s.pos === '天干')) return ss;
  }
  return '?';
}

function getShishenLabelByDZ(dm, dz, result) {
  const dzKey = DIZHI[dz];
  for (const [ss, sources] of Object.entries(result.sourceMap)) {
    if (sources.some(s => s.pos && s.pos.startsWith(`地支${dzKey}(本气)`))) return ss;
  }
  return '?';
}

function getShishenByTG(dm, tg, result) {
  const char = TIANGAN[tg];
  for (const [ss, sources] of Object.entries(result.sourceMap)) {
    if (sources.some(s => s.char === char)) return ss;
  }
  return '?';
}

// ── Tooltip ──────────────────────────────────────────────────

function handleTooltip(e) {
  const el = e.target.closest('[data-tip]');
  const tip = qs('#tooltip');
  if (!el) { tip.classList.remove('show'); return; }
  tip.textContent = el.dataset.tip;
  tip.classList.add('show');
}

function moveTooltip(e) {
  const tip = qs('#tooltip');
  if (!tip.classList.contains('show')) return;
  tip.style.left = (e.clientX + 14) + 'px';
  tip.style.top  = (e.clientY - 10) + 'px';
}

// ── 辅助更新 ────────────────────────────────────────────────

function updateYearDisplay() {
  // 年份标签已由 DOM 反映
}

function updateTimeHint() {
  const h = state.useShichen
    ? (state.shichenIdx === 0 ? (state.zishiType === 'early' ? 0 : 23) : SHICHEN_LIST[state.shichenIdx].dz * 2 - 1)
    : state.hour;
  const dzIdx = hourToDZ(h);
  const scName = SHICHEN_LIST[dzIdx]?.name || '';
  const hintEl = qs('#time-hint');
  if (hintEl) hintEl.textContent = `当前对应：${scName}（${SHICHEN_LIST[dzIdx]?.range || ''}）`;
}

function updateDatePreview() {
  const el = qs('#date-preview');
  if (!el) return;
  try {
    const y = getEffectiveYear();
    const month = Number(qs('#sel-month').value);
    const day = Number(qs('#sel-day').value);
    if (state.useLunar) {
      const lunar = Lunar.fromYmd(y, qs('#cb-leap').checked ? -month : month, day);
      el.textContent = `对应公历：${lunar.getSolar().toYmd()}`;
    } else {
      const lunar = Solar.fromYmd(y, month, day).getLunar();
      el.textContent = `对应农历：${lunar.getYearInGanZhi()}年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
    }
  } catch (error) {
    el.textContent = `日期无效：${error.message}`;
  }
}

// ── 复制 Markdown ─────────────────────────────────────────────

async function copyMarkdown() {
  if (!state.result) return;
  const { bazi, shishenScores, rpgStats, titleData, grade } = state.result;
  const pillars = [bazi.year, bazi.month, bazi.day, bazi.hour];
  const LABELS  = ['年柱','月柱','日柱','时柱'];

  let md = `# ${state.result.name} · 先天命格设定\n\n`;
  md += `**命格称号**：【${titleData.title} · ${titleData.tag}】  \n`;
  md += `**先天潜力**：${grade}  \n`;
  md += `**推荐流派**：${titleData.build}  \n`;
  md += `**命格判词**：${titleData.desc}\n\n`;
  md += `## 四柱八字\n\n| 柱位 | ${LABELS.join(' | ')} |\n|:---|:---:|:---:|:---:|:---:|\n`;
  md += `| 天干 | ${pillars.map(p => TIANGAN[p.tg]).join(' | ')} |\n`;
  md += `| 地支 | ${pillars.map(p => DIZHI[p.dz]).join(' | ')} |\n`;
  md += `| 十二长生 | ${pillars.map(p => p.changsheng).join(' | ')} |\n\n`;
  md += `## RPG 先天属性\n\n`;
  SHISHEN_NAMES.forEach(ss => {
    md += `- **${ss}·${SHISHEN_RPG[ss].attr}**：${rpgStats[ss]?.display || '-'}\n`;
  });

  try {
    await navigator.clipboard.writeText(md);
    const btn = qs('#btn-copy-md');
    btn.textContent = '✅ 已复制';
    setTimeout(() => { btn.textContent = '📋 复制 Markdown 设定'; }, 2000);
  } catch (error) {
    alert('复制失败，请允许浏览器访问剪贴板后重试。');
  }
}

// ── 对比栏 ──────────────────────────────────────────────────

function addToCompare() {
  if (!state.result) return;
  const slot = state.compareSlots[0] === null ? 0 : 1;
  state.compareSlots[slot] = { name: state.result.name, result: state.result };
  if (state.compareSlots.some(s => s !== null)) {
    renderCompareBar();
  }
}

function renderCompareBar() {
  let bar = qs('#compare-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'compare-bar';
    document.body.appendChild(bar);
  }
  bar.classList.add('show');
  bar.innerHTML = state.compareSlots.map((slot, i) => {
    if (!slot) return `<div class="compare-slot empty">空位 ${i+1}（存入对比）</div>`;
    const top1 = Object.entries(slot.result.shishenScores).sort((a,b)=>b[1]-a[1])[0];
    return `<div class="compare-slot">
      <strong>${escapeHTML(slot.name)}</strong> · ${slot.result.titleData.title}<br>
      最强属性：${top1[0]} ${SHISHEN_RPG[top1[0]].attr} (${top1[1].toFixed(1)}pt)
    </div>`;
  }).join('') + `<button class="btn btn-ghost" onclick="document.getElementById('compare-bar').classList.remove('show')">关闭</button>`;
}
