# 农历置闰万年历

已下载《寿星天文历》5.10 维护版，原作者许剑伟，下载日期为 2026-11-07。

- 压缩包为 `sxwnl.zip`。
- 电脑入口为 `sxwnl-main/src/index.htm`。
- 手机入口为 `sxwnl-main/src/indexmp.htm`。
- 农历与置闰算法在 `sxwnl-main/src/lunar.js`，天文算法在同目录的 `eph0.js` 和 `eph.js`。
- 软件内有历谱数据导出功能。

可以在浏览器中打开电脑入口。已有项目预览服务时，也可访问 `/data/calendar/sxwnl-main/src/index.htm`。

来源仓库的说明范围为公历天文纪年 -4712 至 9999 年，农历天文纪年 -3000 至 3000 年。远古日期的历史历法适用性应结合原作者说明和历史材料核对。该维护仓库标示为 5.10，其 README 另注明原作者正式发布至 5.09，后续差异见随包保存的原始说明。

已验证本地网页可以加载，并抽查以下置闰结果

| 公历日期 | 农历日期 | 该农历月天数 |
| --- | --- | --- |
| 2023-03-22 | 闰二月初一 | 29 |
| 2025-07-25 | 闰六月初一 | 29 |
| 2024-02-10 | 正月初一 | 29 |

下载来源为 https://github.com/sxwnl/sxwnl ，压缩包为 https://codeload.github.com/sxwnl/sxwnl/zip/refs/heads/main 。

压缩包 SHA-256 为 `42a3a0e83b7daeb02b429d17ec1c4855e220baf1c1300c7e5c4dc9b4436bcd67`。

原始源码、作者说明与版权声明随包保存，版权说明见 `sxwnl-main/src/sm1.htm`。原始算法文件按下载版本保存。
