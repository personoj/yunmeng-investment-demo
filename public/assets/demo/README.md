# 招商资料与企业资源

`demo-data.json` 是三场景招商 Demo 的运行资料。它与 `../flows/` 的实际流记录、`../geo/` 的地图资源分别加载。替换这里的业务数据不会重画地形或修改流空间核心。

当前前台采用正式展示模式：隐藏示意、核验、待接入等工程标签，但下述数据状态、来源和空值仍完整保留；策略保存记录也保留原始依据。运行时湖北行政目录扩为 17 项，不修改原 Excel 131 条记录。省域画像色块的方法与策划配置见 `src/demo/regionPortraits.ts`。

## 当前资料

《全国招商Demo数据(1).xlsx》已全面接入：

| 工作表／分块 | 接入数量 |
| --- | ---: |
| 全国省市 | 31 省 + 100 市 |
| 统一产业链 | 10 条链、30 个上中下游环节 |
| 云梦年度指标 | 2021–2025 年，共 5 年 |
| 支柱产业 | 4 项 |
| 强链／补链证据 | 18 条 |
| 链长制记录 | 5 条 |
| 政策文件 | 5 份 |

保留地区指标、产业原话、对应统一产业链、来源及年度口径。GDP 单位为亿元，增长率和三产占比以百分点存储，例如 `6.4` 表示 6.4%。`null` 是缺失，`0` 是真实零值。当前原表仍缺 GDP 14 行、增速 16 行、至少一项三产占比 36 行；页面不会估算这些缺项。

在地名录识别 21 家企业或项目。仅有资源、生产基地、销售平台的描述保留在环节 `basis`，不会被创建为公司。新增公司名称保持采集原文，未提供的法人、注册资本、股东、精确坐标继续缺失。两个已有园区和一个规划目标分别标注，企业园区归属中的“未逐家核实”说明保留。

原表 18 条环节中，10 条列为强链；8 条补链依据是未找到／未核实资料，因此保存原表标签但标为待核实。旧电解液示例缺口已移除。“新材料”支柱可以跨新能源与化工，但不会把这两条链同时分配给每家企业；企业归属采用更明确的原表环节证据。

新宙邦、天赐材料等公开候选资料属于独立补充，不声称由这份 Excel 提供。新宙邦半导体化学品关联附官网产品页；华盛锂电总部与云梦项目使用不同 ID，已有投资不会显示成新的未落地项目。企业来源记录在 `companies[].sources`。

50 个城市的四维分数仍为模型示意。筛选结合实际地区产业关联与已收录企业，评分不代表真实投资概率或企业意向。策略中的洽谈方向也不代表企业或政府已作承诺。

## 文件

| 文件／目录 | 用途 |
| --- | --- |
| `demo-data.json` | 地区、产业链、画像、企业及示例模型分数 |
| `数据模板.xlsx` | 可继续采集的三个 sheet；产业目录已同步实际 30 环节 |
| `data-import-report.json` | 首次全面接入的行列覆盖、缺失数量、来源文件摘要与 SHA-256 |
| `company-logos/` | 可替换的公司标识、占位图、官方参考来源和生成提示词 |
| `brand-mark.svg` | Demo 产品标识 |

## 再次导入 Excel

从仓库根目录运行，替换为实际输入路径。实际交付表使用“全国省市／统一产业链／云梦画像”，采用 `--replace`；它处理纵向合并链名及云梦五个分块。

```powershell
& 'D:\conda\envs_dirs\codex\Scripts\python.exe' -B -X utf8 scripts/import_demo_excel.py --input 'D:\资料\全国招商Demo数据(1).xlsx' --base 'public/assets/demo/demo-data.json' --output 'work/demo-import.json' --report 'work/demo-import-report.json' --replace
```

检查报告后，写入运行文件：

```powershell
& 'D:\conda\envs_dirs\codex\Scripts\python.exe' -B -X utf8 scripts/import_demo_excel.py --input 'D:\资料\全国招商Demo数据(1).xlsx' --base 'public/assets/demo/demo-data.json' --output 'public/assets/demo/demo-data.json' --report 'work/demo-import-report.json' --replace
```

每次以当前运行文件为 `--base`，保留已经补充的企业官网资料、有效环节关联、logo 与城市示例评分。省市、产业环节和县画像按 Excel 全面替换，不把旧示例空缺当成新事实。错误时不覆盖输出；未知映射、非法数字、未处理的非空行／列会写入报告。收到新命名企业时，应同时核对报告中的企业关联和原文证据，避免把项目说明误认成法人。

原空模板的工作表名为“全国省市数据表／统一产业链名单／云梦画像”，用于增量填写时省略 `--replace`。该模式按 ID、地区和年份合并，未出现的旧记录保留；不要用它代替一次完整的采集表替换。

缺少读取依赖时执行：

```powershell
uv pip install --python 'D:\conda\envs_dirs\codex\Scripts\python.exe' openpyxl
```

页面“2025 数据”入口可下载模板、导入 JSON、导出当前 JSON 或恢复项目数据。浏览器导入只保存在当前浏览器，并通过 `validateDemoData()` 检查；不会覆盖仓库文件。若浏览器已有导入数据，修改运行 JSON 后需点击“恢复项目数据”。静态发布前执行 `npm run build`。

## 字段和替换约定

- `regions`：`name/level/parentId/year/gdp/growth/shares/pillars/priorities/chainIds/source/status`。产业原文与统一链映射分开保存。
- `chains[].stages`：`id/stage/name/products/aliases/source`。当前 ID 为 `<chainId>-upstream`、`-midstream`、`-downstream`，显示名是原文产品摘要。
- `profile`：`indicators/pillars/chainLinks/leaders/policies/parks`。规模文字保留实际值、同比和规划目标的不同口径。
- `chainLinks`：`reportedStatus` 保留原表强链／补链；`status` 为 `present/gap/unknown`；`evidenceStatus=pending` 表示依据待核实；`basis/source` 保留完整说明。
- `companies`：稳定 `id`、名称、所在城市、产品、链和环节、来源、logo。`local` 表示在地企业／项目，不能由此推断集团总部在云梦。`relationship=existing` 表示已有关联。
- `cities[].scores`：产业关联、可达性、人口流动、要素成本四个示例分数，当前城市模型目录独立于 100 市统计目录。
- `status=sample` 是示例，`missing` 是缺失，`verified` 表示已接入所列公开来源，不代表独立审计或官方核准。

## 标识替换

当前三张透明图形采用官方参考由内置 imagegen 复现：`capchem-imagegen.png`、`zhongyi-imagegen.png`、`huasheng-imagegen.png`。华盛云梦项目卡使用集团图形。它们是生成复现资源，非企业直接提供的商标原文件；官方参考及业务出处见 [company-logos/SOURCES.md](company-logos/SOURCES.md)，提示词随目录保留。

用确认后的透明 PNG、WebP 或 SVG 替换同名文件，或将新文件放入 `company-logos/` 后更新对应记录：

```json
{
  "id": "capchem",
  "logo": "assets/demo/company-logos/capchem.png"
}
```

`logo: null` 使用名称头像和 LOGO 占位。固定图标容器会等比适配图片，不需要改页面布局。没有核对来源的公司继续使用占位，不编造真实公司的官方标识。

## 验证命令

```powershell
& 'D:\conda\envs_dirs\codex\Scripts\python.exe' -B -X utf8 scripts/test_demo_import.py -v
& 'D:\conda\envs_dirs\codex\Scripts\python.exe' -B -X utf8 scripts/test_demo_collected.py --input 'D:\资料\全国招商Demo数据(1).xlsx'
node --experimental-strip-types scripts/test_demo_data.mjs
npm run check
```

源表检查覆盖数字与缺失、百分比格式、原文产业、合并链名、目标口径、18 条证据、政策、行列覆盖及重复导入时的官网资料和 logo 保留。它验证导入与原表一致，不代替对原始统计文件的业务审计。
