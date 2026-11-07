# 中国历史年号与干支纪年数据库

下载日期为 2026-11-07。主文件为 `chinese-eras.sqlite`，可用 SQLite、DB Browser for SQLite 或程序直接查询。`manifest.json` 记录实际条数、来源地址和原始文件的 SHA-256。

## 数据来源与范围

- **DILA / 法鼓文理学院时间规范资料库**。直接下载官方中国部分 `authority_time_chinese.2012-02.zip`，原始版本发布于 2012 年 2 月。官方说明的历法覆盖范围为公元前 220 年至公元 1912 年。原始 SQL、历法月表、异名、注释及 S/P 状态完整保留在 `sources/dila` 与 SQLite 的 `t_*` 表中。
- **CeJS 中国纪年资料**。下载 `kanasimi/CeJS` 的 `data/date/era_data.js`，提取“中国”部分的 1,481 条纪年记录。包含先秦君主纪年、朝代年号、地方政权、民变政权、民国及现代纪年资料。逐条保留原文、名称、属性、原始起讫日期和存疑说明。

来源地址

- https://authority.dila.edu.tw/docs/open_content/download.php
- https://authority.dila.edu.tw/downloads/authority_time_chinese.2012-02.zip
- https://github.com/DILA-edu/Authority-Databases
- https://github.com/kanasimi/CeJS/blob/master/data/date/era_data.js

这些公开来源对小型、短命、存疑政权的收录有边界，不能据此宣称已考订完“中国历史上所有年号”。DILA 自身也注明部分政权未收录，部分时代起讫和延用状态尚未完全考订。数据库保留缺项与冲突，供后续补充。

## 表与导出文件

| 名称 | 内容 |
| --- | --- |
| `era_catalog` | DILA 的 932 条原始纪年实体，包含同名、继位、延用及无年号记录 |
| `era_year` | 从原始月记录汇总的 5,178 条年次、干支和日期范围，逐条保留来源状态 |
| `era_year_lookup` | 带朝代、君主、年号的查询视图 |
| `supplementary_catalog` | CeJS 中国部分的完整纪年目录，`record_kind` 区分年号、君主纪年和其他纪年 |
| `supplementary_era_year` | 根据 CeJS 起讫与 DILA 历史年界解析的补充逐年对照，保留解析方法 |
| `catalogue_review` | 起讫无法唯一解析或与 DILA 同朝、同君主、同年号的年次发生冲突的补充记录 |
| `all_era_years` | 两种来源的统一查询视图，包含 `source`、`source_record_id` 与 `quality` |
| `era-years.csv` | DILA 逐年对照，UTF-8 BOM 编码 |
| `all-era-years.csv` | 两种来源的逐年对照总表，UTF-8 BOM 编码 |
| `review.csv` | 待核对条目及原因 |

同一名称在不同朝代、君主甚至同一朝代中可能反复使用，查询时应保留实体 ID、来源、朝代与君主。两种来源的数据有重叠，总表行数不能作为去重后的年号数量。

DILA 的实体 798 缺少主年号名称，仍以空值完整保留。原始实体有四条没有月记录。已有名称的异名保存在 `t_era_names`，不会因同名而覆盖。

## 年界与日期约定

- DILA 的 `ganzhi` 直接来自历史月份记录。按 `era_id + era_year + ganzhi + source_status` 汇总，全部 56,327 条原始月份均能回溯到对应汇总记录。
- `nominal_year_astronomical` 表示年号年次对应的名义纪年年度，采用天文纪年。`0` 为公元前 1 年，`-139` 为公元前 140 年。该字段与每个自然日所属的公历年份可能不同。
- `first_gregorian` / `last_gregorian` 为原始 JDN 范围转换成的向前延伸格里高利历日期。与 CeJS 原文中 1582 年改历前使用的儒略历日期可能相差数天。
- 干支年度不等同于公历 1 月 1 日或八字排盘的立春年度。查询具体生日时仍需结合历史日期边界。
- DILA 的 `S` 为来源的标准记录，`P` 为来源的延用或假设推延记录。来源的 `S` 也带有原数据库的历史考订局限。默认查询通常应先选择 `S`。
- CeJS 的补充年次属于根据来源区间解析的数据，其方法显示在 `mapping_method`。省略结束日期时参照下一条原始记录，原始存疑说明显示在 `uncertainty`。这些条目适合候选检索，历史改元的精确日期仍需核对原始材料。
- CeJS 的冲突或无法唯一解析条目保存在 `catalogue_review`，其原始目录记录始终保留。不要将其直接当成已确定的年次映射。

## 查询示例

查询康熙六十一年的干支

```sql
SELECT dynasty_name, emperor_name, era_name, era_year, ganzhi,
       nominal_year_astronomical, first_gregorian, last_gregorian
FROM era_year_lookup
WHERE dynasty_name = '清' AND era_name = '康熙'
  AND era_year = 61 AND source_status = 'S';
```

结果对应 1722 年、壬寅。一个纪年年度可以跨到次年的公历日期。

查找某公元年度并列的各政权纪年

```sql
SELECT source, source_record_id, dynasty_name, emperor_name,
       era_name, era_year, ganzhi, quality
FROM all_era_years
WHERE nominal_year_astronomical = 1644
ORDER BY source, dynasty_name, era_name;
```

查询异名

```sql
SELECT c.*
FROM t_era_names n
JOIN era_catalog c ON c.era_id = n.era_id
WHERE n.name = '昇平';
```

## 重建与校验

在项目根目录执行以下命令即可离线重建，不需要安装第三方依赖

```text
node scripts/extract-history.cjs
python scripts/build-history-db.py
```

导入程序校验 SQL 快照完整性、逐行字段数量、SQLite 完整性、所有月份的汇总覆盖、干支与名义年份的一致性，并抽查康熙元年及六十一年、贞观元年、洪武元年和宣统三年。原始 SQL 只解析数据字面量，转换时使用本地 SQLite 表结构。

## 授权

DILA 数据包内的 README/COPYING 声明为 **CC BY-SA 3.0 Unported**，全文保存在 `sources/dila/authority_time_chinese/COPYING.txt`。官方网页页脚另有旧版授权标示，本次随下载包保存其原始授权文件。

CeJS 为 **BSD-3-Clause**，全文保存在 `sources/CeJS_LICENSE.txt`，原始数据文件内的引用与注释一并保留。数据库保留各来源的来源与授权信息，DILA 派生数据遵循其 CC BY-SA 条款。
