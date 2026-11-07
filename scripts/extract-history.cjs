// Extract the China catalogue without loading or executing the CeJS runtime.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = path.resolve(__dirname, '../data/history/sources');
const source = fs.readFileSync(path.join(directory, 'cejs_era_data.js'), 'utf8');
const start = source.indexOf('(CeL.era.pass_on.countries["中國"] = [');
const marker = ']).minute_offset = 8 * 60;';
const end = source.indexOf(marker, start);
if (start < 0 || end < 0) throw new Error('China catalogue boundaries not found');
const context = { CeL: { era: { pass_on: { countries: {}, last_day: '2101/1/29' } } } };
vm.runInNewContext(source.slice(start, end + marker.length), context, { timeout: 5000 });
const entries = context.CeL.era.pass_on.countries['中國'].map(entry => typeof entry === 'string' ? entry : entry.data);
if (!Array.isArray(entries) || entries.some(entry => typeof entry !== 'string')) {
  throw new Error('Unexpected CeJS catalogue structure');
}
fs.writeFileSync(path.join(directory, 'cejs_china.json'), JSON.stringify(entries, null, 2) + '\n');
console.log(`Extracted ${entries.length} Chinese chronology entries`);
