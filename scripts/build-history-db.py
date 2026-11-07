"""Build an offline SQLite history database from the downloaded source snapshots.

Run `node scripts/extract-history.cjs` first, then this script. No dependencies.
"""
import csv
import hashlib
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'history'
SOURCES = DATA / 'sources'
SQL_SOURCE = SOURCES / 'dila' / 'authority_time_chinese' / 'authority_time_chinese.sql'
DATABASE = DATA / 'chinese-eras.sqlite'
STEMS = '甲乙丙丁戊己庚辛壬癸'
BRANCHES = '子丑寅卯辰巳午未申酉戌亥'


def parse_values(text):
    """Read MySQL INSERT literals, including escaped quotes and embedded delimiters."""
    token = re.compile(r"\s*(?:('(?:\\.|''|[^'\\])*')|(NULL)|(-?\d+)|([(),]))", re.S)
    position = 0
    row = None
    while position < len(text):
        match = token.match(text, position)
        if not match:
            if text[position:].strip():
                raise ValueError(f'Unrecognized SQL literal at {position}')
            break
        position = match.end()
        quoted, null, integer, punctuation = match.groups()
        if punctuation == '(':
            if row is not None:
                raise ValueError('Nested value group')
            row = []
        elif punctuation == ')':
            if row is None:
                raise ValueError('Unmatched value group')
            yield tuple(row)
            row = None
        elif quoted is not None:
            value = quoted[1:-1].replace("''", "'")
            escapes = {'0': '\0', 'n': '\n', 'r': '\r', 't': '\t', 'b': '\b', 'Z': '\x1a'}
            value = re.sub(r'\\(.)', lambda m: escapes.get(m[1], m[1]), value, flags=re.S)
            row.append(value)
        elif null:
            row.append(None)
        elif integer:
            row.append(int(integer))
    if row is not None:
        raise ValueError('Truncated SQL value group')


def import_dila(connection):
    text = SQL_SOURCE.read_text(encoding='utf-8-sig')
    if '-- Dump completed on 2012-02-09' not in text:
        raise ValueError('Incomplete DILA snapshot')
    schemas = {}
    for match in re.finditer(r'^CREATE TABLE `(\w+)` \((.*?)\n\) ENGINE=', text, re.M | re.S):
        table, definition = match.groups()
        fields = re.findall(r'^\s*`(\w+)`\s+(\w+)', definition, re.M)
        schemas[table] = fields
        columns = ','.join(f'"{name}" {"INTEGER" if "int" in kind else "TEXT"}' for name, kind in fields)
        connection.execute(f'CREATE TABLE "{table}" ({columns})')
    counts = {table: 0 for table in schemas}
    for match in re.finditer(r'^INSERT INTO `(\w+)` VALUES (.*);$', text, re.M):
        table, values = match.groups()
        columns = schemas[table]
        rows = list(parse_values(values))
        if any(len(row) != len(columns) for row in rows):
            raise ValueError(f'Column count mismatch in {table}')
        connection.executemany(f'INSERT INTO "{table}" VALUES ({",".join("?" for _ in columns)})', rows)
        counts[table] += len(rows)
    if counts.get('t_month', 0) < 40000:
        raise ValueError('Unexpectedly small DILA snapshot')
    return counts


def year_ganzhi(year):
    """Astronomical year numbering, with year zero = 1 BCE."""
    return STEMS[(year - 4) % 10] + BRANCHES[(year - 4) % 12]


def jdn_gregorian(jdn):
    """Proleptic Gregorian civil date from integer Julian day number."""
    a = jdn + 32044
    b = (4 * a + 3) // 146097
    c = a - 146097 * b // 4
    d = (4 * c + 3) // 1461
    e = c - 1461 * d // 4
    m = (5 * e + 2) // 153
    day = e - (153 * m + 2) // 5 + 1
    month = m + 3 - 12 * (m // 10)
    year = 100 * b + d - 4800 + m // 10
    return year, month, day


def iso_date(jdn):
    year, month, day = jdn_gregorian(jdn)
    year_text = f'{year:04d}' if year >= 0 else f'-{abs(year):04d}'
    return f'{year_text}-{month:02d}-{day:02d}'


def build_years(connection):
    connection.executescript('''
        CREATE INDEX dila_month_era ON t_month(era_id,year);
        CREATE INDEX dila_month_dates ON t_month(first,last);
        CREATE TABLE era_year (
          id INTEGER PRIMARY KEY, era_id INTEGER NOT NULL, era_year INTEGER NOT NULL,
          ganzhi TEXT NOT NULL, source_status TEXT NOT NULL,
          first_jdn INTEGER NOT NULL, last_jdn INTEGER NOT NULL,
          first_gregorian TEXT NOT NULL, last_gregorian TEXT NOT NULL,
          nominal_year_astronomical INTEGER NOT NULL,
          UNIQUE(era_id,era_year,ganzhi,source_status)
        );
        CREATE INDEX era_year_ganzhi ON era_year(ganzhi);
        CREATE INDEX era_year_nominal ON era_year(nominal_year_astronomical);
        CREATE INDEX era_year_era ON era_year(era_id,era_year);
    ''')
    groups = connection.execute('''SELECT era_id,year,ganzhi,status,MIN(first),MAX(last)
        FROM t_month GROUP BY era_id,year,ganzhi,status ORDER BY era_id,year,MIN(first)''').fetchall()
    for era_id, ordinal, ganzhi, status, first, last in groups:
        start_year = jdn_gregorian(first)[0]
        candidates = [y for y in range(start_year - 2, start_year + 2) if year_ganzhi(y) == ganzhi]
        if len(candidates) != 1:
            raise ValueError(f'Ganzhi/year mismatch: {era_id}, {ordinal}, {ganzhi}')
        connection.execute('''INSERT INTO era_year
            (era_id,era_year,ganzhi,source_status,first_jdn,last_jdn,
             first_gregorian,last_gregorian,nominal_year_astronomical)
            VALUES (?,?,?,?,?,?,?,?,?)''',
            (era_id,ordinal,ganzhi,status,first,last,iso_date(first),iso_date(last),candidates[0]))
    connection.executescript('''
        CREATE VIEW era_catalog AS
        SELECT e.id AS era_id,n.name AS era_name,em.name AS emperor_name,
               d.name AS dynasty_name, MIN(y.first_jdn) AS first_jdn,
               MAX(y.last_jdn) AS last_jdn,COUNT(DISTINCT y.era_year) AS recorded_years
        FROM t_era e LEFT JOIN t_era_names n ON n.era_id=e.id AND n.ranking=0
        JOIN t_emperor p ON p.id=e.emperor_id
        LEFT JOIN t_emperor_names em ON em.emperor_id=p.id AND em.ranking=0
        LEFT JOIN t_dynasty_names d ON d.dynasty_id=p.dynasty_id AND d.ranking=0
        LEFT JOIN era_year y ON y.era_id=e.id
        GROUP BY e.id;
        CREATE VIEW era_year_lookup AS
        SELECT c.era_id,c.era_name,c.dynasty_name,c.emperor_name,y.era_year,y.ganzhi,
               y.nominal_year_astronomical,y.first_gregorian,y.last_gregorian,
               y.first_jdn,y.last_jdn,y.source_status
        FROM era_catalog c JOIN era_year y ON y.era_id=c.era_id;
    ''')


def import_catalogue(connection):
    """Retain the complete CeJS China catalogue, including uncertain records."""
    connection.execute('''CREATE TABLE supplementary_catalog (
        id INTEGER PRIMARY KEY, dynasty_name TEXT, emperor_name TEXT, era_name TEXT,
        record_kind TEXT NOT NULL, raw_name TEXT NOT NULL, raw_period TEXT NOT NULL,
        raw_calendar TEXT NOT NULL, uncertainty TEXT NOT NULL,
        attributes_json TEXT NOT NULL, raw_record TEXT NOT NULL)''')
    entries = json.loads((SOURCES / 'cejs_china.json').read_text(encoding='utf-8'))
    previous = []
    for index, raw in enumerate(entries, 1):
        fields = raw.split('|')
        names = fields[0].split('/')
        if len(names) == 1 and names[0]:
            names = [names[0], '', names[0]]
            previous = [names[0]]
            kind = 'other_chronology'
        else:
            if not names[0] and previous:
                names = previous[:max(len(previous) - len(names) + 1, 1)] + names[1:]
            names = [previous[i] if value == '=' and i < len(previous) else value for i,value in enumerate(names)]
            previous = names[:]
            kind = 'era_name' if len(names) >= 3 else 'ruler_year'
            if len(names) == 2:
                names.append(names[1])
        names += [''] * (3 - len(names))
        if not names[2]:
            kind = 'ruler_year'
        start_hint = period_date(fields[1].split('~')[0])
        if start_hint and start_hint[0] < -139:
            kind = 'pre_era_chronology'
        attributes = fields[3:]
        uncertain = [a for a in attributes if a == '疑' or a.startswith(('精=', '準='))]
        connection.execute('INSERT INTO supplementary_catalog VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            (index,*names[:3],kind,fields[0],fields[1],fields[2],
             '|'.join(uncertain),json.dumps(attributes,ensure_ascii=False),raw))
    connection.execute('CREATE INDEX supplementary_era_name ON supplementary_catalog(era_name)')


def historical_jdn(year, month, day):
    """CeJS civil dates use Julian dates before 1582-10-15."""
    a = (14 - month) // 12
    y, m = year + 4800 - a, month + 12 * a - 3
    base = day + (153 * m + 2) // 5 + 365 * y + y // 4
    return base - y // 100 + y // 400 - 32045 if (year,month,day) >= (1582,10,15) else base - 32083


def period_date(text, default_year=None):
    match = re.fullmatch(r'(?P<calendar>[^\d/-]*)(?P<year>-?\d+)(?:/(?P<month>\d+))?(?:/(?P<day>\d+))?', text)
    if not match:
        return None
    year = int(match['year'])
    month, day = match['month'], match['day']
    # An abbreviated end such as ~8/22 inherits the start year.
    if default_year is not None and month is not None and day is None and not match['calendar']:
        return default_year, year, int(month), ''
    year += year < 0  # CeJS uses historical BCE numbering without year zero.
    return year, int(month) if month else None, int(day) if day else None, match['calendar']


def build_supplementary_years(connection):
    """Resolve annual labels conservatively against the downloaded historical months.

    The period source and resolution method remain visible. Unresolved bounds are
    retained for review, rather than assigned invented year counts.
    """
    connection.executescript('''
        CREATE TABLE supplementary_era_year (
          catalog_id INTEGER NOT NULL REFERENCES supplementary_catalog(id),
          era_year INTEGER NOT NULL, nominal_year_astronomical INTEGER NOT NULL,
          ganzhi TEXT NOT NULL, mapping_method TEXT NOT NULL,
          PRIMARY KEY(catalog_id,era_year)
        );
        CREATE TABLE catalogue_review (
          catalog_id INTEGER PRIMARY KEY REFERENCES supplementary_catalog(id),
          reason TEXT NOT NULL
        );
    ''')
    records = connection.execute('SELECT id,record_kind,raw_period,raw_calendar,dynasty_name,raw_name FROM supplementary_catalog ORDER BY id').fetchall()
    def nominal_date(date, calendar, dynasty):
        year, month, day, named = date
        if named or month is None or ':CE' in calendar:
            return year, 'source_year_label'
        if day is None:
            return None
        jdn = historical_jdn(year,month,day)
        possibilities = connection.execute('''SELECT DISTINCT y.nominal_year_astronomical
            FROM era_year y JOIN era_catalog c ON c.era_id=y.era_id
            WHERE y.first_jdn<=? AND y.last_jdn>=? AND y.source_status='S' AND c.dynasty_name=?''',
            (jdn,jdn,dynasty)).fetchall()
        if not possibilities:
            possibilities = connection.execute('''SELECT DISTINCT nominal_year_astronomical
            FROM era_year WHERE first_jdn<=? AND last_jdn>=? AND source_status='S' ''', (jdn,jdn)).fetchall()
        # All historical calendar years overlapping the date must agree.
        if len(possibilities) == 1:
            return possibilities[0][0], 'historical_calendar_year'
        return None
    for index, (catalog_id,kind,period,calendar,dynasty,raw_name) in enumerate(records):
        if kind != 'era_name':
            continue
        bounds = period.split('~')
        start = period_date(bounds[0])
        end_text = bounds[1] if len(bounds) == 2 else ''
        inferred = not end_text
        if inferred and index+1 < len(records):
            end_text = records[index+1][2].split('~')[0]
        end = period_date(end_text, None if inferred or not start else start[0])
        start_year = nominal_date(start,calendar,dynasty) if start else None
        # End dates in the source are exclusive. Step back one civil day.
        if end and end[1] is not None and end[2] is not None:
            end_jdn = historical_jdn(end[0],end[1],end[2]) - 1
            # Convert back to the same hybrid civil calendar convention.
            if end_jdn >= 2299161:
                end = (*jdn_gregorian(end_jdn), '')
            else:
                c = end_jdn + 32082
                d = (4*c+3)//1461
                e = c - 1461*d//4
                m = (5*e+2)//153
                end = (d-4800+m//10,m+3-12*(m//10),e-(153*m+2)//5+1,'')
        end_year = nominal_date(end,calendar,dynasty) if end else None
        if inferred and end and end[1] is None and end_year:
            end_year = (end_year[0]-1,end_year[1])
        initial = re.match(r'^(\d+)/',calendar)
        ordinal_start = int(initial[1]) if initial else 1
        if raw_name.endswith('/=') and not initial and start_year and index:
            previous = connection.execute('''SELECT nominal_year_astronomical-era_year+1
                FROM supplementary_era_year WHERE catalog_id=? LIMIT 1''', (records[index-1][0],)).fetchone()
            if previous:
                ordinal_start = start_year[0] - previous[0] + 1
            else:
                start_year = None
        if not start_year or not end_year or not 0 <= end_year[0]-start_year[0] <= 150:
            connection.execute('INSERT INTO catalogue_review VALUES (?,?)',
                (catalog_id,'Period or annual boundary could not be resolved unambiguously from these sources'))
            continue
        method = start_year[1] + (';next_record_end' if inferred else ';explicit_end')
        for year in range(start_year[0],end_year[0]+1):
            connection.execute('INSERT INTO supplementary_era_year VALUES (?,?,?,?,?)',
                (catalog_id,ordinal_start+year-start_year[0],year,year_ganzhi(year),method))
    # A conflict between the two sources is retained as a review item.
    # Compare ruler as well as dynasty and title to avoid conflating reused eras.
    conflicts = connection.execute('''SELECT DISTINCT s.id
        FROM supplementary_catalog s JOIN supplementary_era_year y ON y.catalog_id=s.id
        JOIN era_year_lookup d ON d.dynasty_name=s.dynasty_name AND d.era_name=s.era_name
          AND d.emperor_name=s.emperor_name AND d.era_year=y.era_year
        WHERE NOT EXISTS (SELECT 1 FROM era_year_lookup m
          WHERE m.dynasty_name=s.dynasty_name AND m.era_name=s.era_name
          AND m.emperor_name=s.emperor_name AND m.era_year=y.era_year
          AND m.nominal_year_astronomical=y.nominal_year_astronomical)''').fetchall()
    for (catalog_id,) in conflicts:
        connection.execute('DELETE FROM supplementary_era_year WHERE catalog_id=?', (catalog_id,))
        connection.execute('INSERT OR REPLACE INTO catalogue_review VALUES (?,?)',
            (catalog_id,'Annual labels disagree with DILA for the same dynasty, ruler and era; retained for review'))


def validate(connection):
    assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert connection.execute('SELECT COUNT(*) FROM era_year WHERE first_jdn>last_jdn').fetchone()[0] == 0
    for dynasty, name, ordinal, year, ganzhi in [
        ('清','康熙',1,1662,'壬寅'), ('清','康熙',61,1722,'壬寅'),
        ('唐','貞觀',1,627,'丁亥'), ('明','洪武',1,1368,'戊申'),
        ('清','宣統',3,1911,'辛亥')]:
        rows = connection.execute('''SELECT nominal_year_astronomical,ganzhi
            FROM era_year_lookup WHERE dynasty_name=? AND era_name=? AND era_year=?''',
            (dynasty,name,ordinal)).fetchall()
        assert (year,ganzhi) in rows, (dynasty,name,ordinal,rows)
    missing = connection.execute('''SELECT COUNT(*) FROM t_month m LEFT JOIN era_year y
        ON y.era_id=m.era_id AND y.era_year=m.year AND y.ganzhi=m.ganzhi AND y.source_status=m.status
        WHERE y.id IS NULL''').fetchone()[0]
    assert missing == 0


def build():
    DATA.mkdir(parents=True, exist_ok=True)
    temporary = DATABASE.with_suffix('.sqlite.tmp')
    if temporary.exists():
        temporary.unlink()
    connection = sqlite3.connect(temporary)
    try:
        raw_counts = import_dila(connection)
        build_years(connection)
        import_catalogue(connection)
        build_supplementary_years(connection)
        validate(connection)
        connection.executescript('''
            CREATE VIEW all_era_years AS
            SELECT 'DILA' AS source,era_id AS source_record_id,dynasty_name,emperor_name,
                   era_name,era_year,ganzhi,nominal_year_astronomical,
                   source_status AS quality,first_gregorian,last_gregorian,
                   'source_month_records' AS mapping_method
            FROM era_year_lookup
            UNION ALL
            SELECT 'CeJS',s.id,s.dynasty_name,s.emperor_name,s.era_name,
                   y.era_year,y.ganzhi,y.nominal_year_astronomical,
                   CASE WHEN s.uncertainty='' THEN 'derived' ELSE s.uncertainty END,
                   NULL,NULL,y.mapping_method
            FROM supplementary_catalog s JOIN supplementary_era_year y ON y.catalog_id=s.id;
        ''')
        manifest = {
            'downloaded_on': '2026-11-07',
            'dila_source': 'https://authority.dila.edu.tw/downloads/authority_time_chinese.2012-02.zip',
            'dila_license': 'CC BY-SA 3.0 Unported, per archive README/COPYING',
            'cejs_source': 'https://github.com/kanasimi/CeJS/blob/master/data/date/era_data.js',
            'cejs_blob_sha': '9b64e74e361f72beab78849f6b4a105ce99fac26',
            'cejs_license': 'BSD-3-Clause',
            'raw_table_counts': raw_counts,
            'era_records': connection.execute('SELECT COUNT(*) FROM era_catalog').fetchone()[0],
            'era_year_records': connection.execute('SELECT COUNT(*) FROM era_year').fetchone()[0],
            'standard_year_records': connection.execute("SELECT COUNT(*) FROM era_year WHERE source_status='S'").fetchone()[0],
            'supplementary_chronology_records': connection.execute('SELECT COUNT(*) FROM supplementary_catalog').fetchone()[0],
            'supplementary_era_records': connection.execute("SELECT COUNT(*) FROM supplementary_catalog WHERE record_kind='era_name'").fetchone()[0],
            'supplementary_year_records': connection.execute('SELECT COUNT(*) FROM supplementary_era_year').fetchone()[0],
            'supplementary_eras_requiring_review': connection.execute('SELECT COUNT(*) FROM catalogue_review').fetchone()[0],
            'source_coverage_note': 'Source-specific records overlap. Reused eras, extensions, uncertain records and pre-era ruler chronologies are retained. These sources do not establish exhaustive coverage of every Chinese era.',
            'files_sha256': {str(p.relative_to(DATA)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in [SQL_SOURCE,SOURCES/'dila_chinese.zip',SOURCES/'cejs_era_data.js']},
        }
        connection.execute('CREATE TABLE metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL)')
        connection.executemany('INSERT INTO metadata VALUES (?,?)',
            [(key,json.dumps(value,ensure_ascii=False)) for key,value in manifest.items()])
        connection.commit()
        # Export a portable UTF-8 CSV for inspection and spreadsheet imports.
        cursor = connection.execute('SELECT * FROM era_year_lookup ORDER BY era_id,era_year,first_jdn')
        with (DATA/'era-years.csv').open('w',encoding='utf-8-sig',newline='') as output:
            writer = csv.writer(output)
            writer.writerow([col[0] for col in cursor.description])
            writer.writerows(cursor)
        for name,query in [
            ('all-era-years.csv','SELECT * FROM all_era_years ORDER BY nominal_year_astronomical,source,source_record_id,era_year'),
            ('review.csv','SELECT s.id,s.dynasty_name,s.emperor_name,s.era_name,s.raw_period,s.uncertainty,r.reason FROM catalogue_review r JOIN supplementary_catalog s ON s.id=r.catalog_id')]:
            cursor = connection.execute(query)
            with (DATA/name).open('w',encoding='utf-8-sig',newline='') as output:
                writer = csv.writer(output)
                writer.writerow([col[0] for col in cursor.description])
                writer.writerows(cursor)
        (DATA/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    finally:
        connection.close()
    temporary.replace(DATABASE)
    print(json.dumps(manifest,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    build()
