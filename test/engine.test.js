import test from 'node:test';
import assert from 'node:assert/strict';
import { calcBazi, gregorianToJDN, jdnToGregorian, getSolarDays, DZ_CANGGAN } from '../src/ganzhi.js';
import { Solar, Lunar, LunarYear, LunarMonth } from '../src/vendor/lunar.js';
import { calcWeights, calcShishen, calcRPGStats, fullCalc } from '../src/rpg.js';

test('甲子日基准与午夜换日', () => {
  assert.equal(calcBazi(2000, 1, 7, 12).day.name, '甲子');
  assert.equal(calcBazi(2000, 1, 7, 23).day.name, '甲子');
  assert.equal(calcBazi(2000, 1, 8, 0).day.name, '乙丑');
  assert.equal(calcBazi(2000, 1, 7, 23).hour.name, '丙子');
});

test('立春交节精确到分钟，年柱与月柱同步切换', () => {
  const before = calcBazi(2024, 2, 4, 16, 27);
  const after = calcBazi(2024, 2, 4, 16, 28);
  assert.equal(before.year.name, '癸卯');
  assert.equal(before.month.name, '乙丑');
  assert.equal(after.year.name, '甲辰');
  assert.equal(after.month.name, '丙寅');
});

test('农历转换、闰月与实际月份天数', () => {
  assert.equal(Lunar.fromYmd(2024, 1, 1).getSolar().toYmd(), '2024-02-10');
  assert.equal(LunarYear.fromYear(2023).getLeapMonth(), 2);
  assert.equal(Lunar.fromYmd(2023, -2, 1).getSolar().toYmd(), '2023-03-22');
  assert.equal(LunarMonth.fromYm(2023, -2).getDayCount(), 29);
  assert.throws(() => Lunar.fromYmd(2023, -2, 30));
});

test('非法日期与时间拒绝计算，历法切换日连续', () => {
  for (const input of [[2023,2,29,12], [2024,4,31,12], [1582,10,10,12],
    [2024,1,1,24], [2024,1,1,12,60], [5001,1,1,0], [NaN,1,1,0]]) {
    assert.throws(() => calcBazi(...input), RangeError);
  }
  assert.equal(getSolarDays(2024, 2).length, 29);
  assert.equal(getSolarDays(1582, 10).length, 21);
  assert.equal(gregorianToJDN(1582,10,15) - gregorianToJDN(1582,10,4), 1);
});

test('藏干、十二长生与十神映射', () => {
  assert.deepEqual(DZ_CANGGAN['寅'].map(x => x.tg), [0, 2, 4]);
  assert.deepEqual(DZ_CANGGAN['巳'].map(x => x.tg), [2, 6, 4]);
  assert.equal(calcBazi(2000, 1, 7, 22).hour.changsheng, '长生');
  assert.deepEqual(Array.from({length: 10}, (_, tg) => calcShishen(0, tg)),
    ['比肩','劫财','食神','伤官','偏财','正财','七杀','正官','偏印','正印']);
});

test('广域日期、数值有限性、积分守恒及藏干上限', () => {
  let count = 0;
  for (const year of [-5000,-4999,-3000,-221,0,1,100,1500,1582,1900,2000,2024,2026,3500,5000]) {
    for (let month = 1; month <= 12; month++) {
      for (const hour of [0,1,12,23]) {
        const day = 20;
        assert.deepEqual(jdnToGregorian(gregorianToJDN(year,month,day)), { year,month,day });
        const bazi = calcBazi(year,month,day,hour,30);
        for (const pillar of [bazi.year,bazi.month,bazi.day,bazi.hour]) {
          assert.ok(pillar.tg >= 0 && pillar.tg < 10);
          assert.ok(pillar.dz >= 0 && pillar.dz < 12);
        }
        if (year >= 1) {
          const expected = Solar.fromYmdHms(year,month,day,hour,30,0).getLunar().getEightChar();
          assert.deepEqual([bazi.year.name,bazi.month.name,bazi.day.name,bazi.hour.name],
            [expected.getYear(),expected.getMonth(),expected.getDay(),expected.getTime()]);
        }
        const weights = calcWeights(bazi);
        for (const pillar of ['年柱','月柱','日柱','时柱']) {
          const details = weights.details.filter(d => d.pillar === pillar);
          const main = details.filter(d => !d.isCang).reduce((sum,d) => sum+d.score,0);
          const hidden = details.filter(d => d.isCang).reduce((sum,d) => sum+d.score,0);
          assert.ok(hidden <= main / 3 + 1e-9);
          const branch = details.find(d => d.pos.includes('本气'));
          assert.ok(hidden <= branch.score / 3 + 1e-9);
        }
        const total = Object.values(weights.shishenScores).reduce((a,b) => a+b,0);
        assert.ok(Math.abs(total - weights.details.reduce((sum,d) => sum+d.score,0)) < 1e-8);
        const result = fullCalc(bazi);
        assert.equal(result.top3.length, 3);
        assert.ok(Object.values(result.rpgStats).every(stat => Number.isFinite(Number(stat.value))));
        count++;
      }
    }
  }
  assert.equal(count, 720);
});

test('卖血增益的极限值与每百分比公式一致', () => {
  for (const score of [0, 10, 60]) {
    const stat = calcRPGStats({'七杀': score})['七杀'];
    assert.ok(Math.abs(Number(stat.maxBuff) - Number(stat.value) * 100) < 0.11);
  }
});
