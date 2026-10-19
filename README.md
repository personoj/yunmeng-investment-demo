# 云梦招商策略 · 流空间 Demo

面向孝感市云梦县招商的非商用演示项目。React + TypeScript + Vite 管理三个业务场景和弹出层，OpenLayers 负责持续显示的地形、行政边界与人口／资本／技术流。外围 UI 按 `design/ui-v1/` 的六张设计稿实现，保留既有中央流线、箭头、城市节点和云梦靶点的渲染。

本 Demo 独立维护在 [`personoj/yunmeng-investment-demo`](https://github.com/personoj/yunmeng-investment-demo)。底图来源为 [`personoj/territorial-atlas`](https://github.com/personoj/territorial-atlas)，以 `b700093` 为分离基线并保留此前提交历史。代码、底图、流数据和业务素材均随本仓库保存，构建与运行不需要读取原底图仓库；后续 Demo 改动提交到本仓库。

地图接入全国 34 个省级区域的 imagegen 透明贴图、主分区与市县标签，支持全国 → 湖北 → 孝感 → 云梦连续下钻、缩放和拖动。北京市、天津市、上海市、重庆市及港澳使用区县／堂区作为主分区。业务采集表的范围是另行维护的 31 省 + 100 市，不与地图覆盖范围混为一谈。

## 开发与构建

使用 Node.js 20.19–20.x 或 22.12 及以上（本地验证版本为 24.10）。首次克隆后安装锁定依赖：

```sh
git clone https://github.com/personoj/yunmeng-investment-demo.git
cd yunmeng-investment-demo
npm ci
npm run dev
```

打开 [招商 Demo](http://127.0.0.1:4173/geographic.html?scene=national#national)。`index.html` 和 `geographic.html` 共用应用入口；原来的省市县 hash 地址继续可用。

```sh
npm run check    # TypeScript 检查
npm run build    # 检查并从源码构建 dist
npm run preview  # 预览构建产物；先停止同端口的开发服务器
```

开发服务器与预览服务器默认仅绑定 `127.0.0.1:4173`；可以用 `-- --port 4174` 指定其他端口。`npm run format` 格式化源码。

## 业务场景与演示

| 场景 | 页面内容 |
| --- | --- |
| 全国产业全景 | 三色省域产业画像；按地区查看指标、三产结构、产业原文及来源，湖北含完整 17 项市州／直管地区目录；按产业查看上中下游、城市分布与企业 |
| 云梦产业画像 | 2021–2025 年指标、支柱产业、在地企业、产业合作方向，以及链长制和政策资料 |
| 流空间匹配 | 既有人口／资本／技术流，产业与环节筛选、示例模型权重／阈值、城市排名与企业线索 |

企业详情和策略卡在当前地图上弹出，关闭后返回原场景。详情保留公开资料、产品、县域研判证据及缺失字段；策略卡可保存在当前浏览器，也可导出 HTML 后打印或另存为 PDF。页面两侧内容分别滚动；窄窗口通过“筛选与画像／分析结果”切换面板。

顶部为三场景导航，演示模式按钮和 DEMO 标签已移除。录屏路线为全国 → 云梦画像 → 选择产业环节 → 流空间匹配 → 企业详情 → 招商策略卡。现有资料默认展示电子信息上游与新宙邦半导体化学品线索；图谱中晶圆、芯片、手机和电脑采用 imagegen 写实素材，三节点等高对齐。

场景切换使用连续相机飞行、面板退出／进入、流线与底色渐变，支持快速反向切换及系统减少动态效果设置。云梦及父级资源在后台预加载，进入画像保持县域完整可见。实际渲染帧与验收记录保存在本地 `work/ui-polish/`。

省域色块采用农业特色、制造业集聚、现代服务三类相对产业画像。分类优先使用已有三产结构，缺失时采用显式策划配置；不将色块解释为各省 GDP 最大产业排名。算法、阈值和分类依据在 `src/demo/regionPortraits.ts`。`withHubeiDirectory()` 只在界面运行时增加 13 个湖北行政目录入口，原 Excel 的 131 条记录不变，新增条目的数值仍为空。

正式业务界面隐藏示意、核验和接入进度标签，完整状态和来源留在 JSON、导入报告及代码。该展示选择不改变数据性质或模型依据。云梦画像中的浮动图层卡片已移除，园区专题暂缓；乡镇界仍随县级底图显示，并可在右下地图工具中切换。

场景地址使用 `?scene=national`、`?scene=profile`、`?scene=flows`；hash 保留地图所在层级。全国按地区模式支持行政下钻，产业查看、县域画像和流空间模式将地图点击用于当前业务选择，避免选企业时误触省级跳转。

## 实际资料与 Excel 替换

用户提供的《全国招商Demo数据(1).xlsx》已全面替换省市指标、产业目录和云梦画像。运行数据为 [`public/assets/demo/demo-data.json`](public/assets/demo/demo-data.json)：31 省 + 100 市、10 条产业链的 30 个上中下游环节、5 年云梦指标、4 个支柱产业、18 条强链／补链证据、5 条链长制记录及 5 份政策。企业清单含 21 家在地企业或项目，以及独立来源的全国企业线索。

保留原文产业说法、来源、年份、单位和空值。原表的 8 条补链方向仅依据“未找到”“未核实”等资料状态，因此标为待核实，不能据此认定本地不存在该环节。2030 年产值目标与当前实际产值分开保留；规划园区不计入已收录现状园区。精确企业坐标、未公开的链长和链主、工商和股东等资料不补造。

新宙邦、天赐材料等全国候选企业的官网资料属于独立补充，来源随公司记录保留，不声称来自 Excel。华盛锂电总部与云梦华盛祥和项目分开记录，已有投资不包装成尚未落地的新目标。50 个城市的四维匹配分数仍为模型示意，性质说明保留内部资料，既有流文件独立使用。

完整字段及替换方式见 [`public/assets/demo/README.md`](public/assets/demo/README.md)，首次全面替换的覆盖记录见 [`data-import-report.json`](public/assets/demo/data-import-report.json)。顶部“2025 数据”提供 Excel 模板下载、JSON 导入／导出和恢复项目数据；浏览器不直接解析 Excel。

在仓库根目录执行以下命令，将 `--input` 换成实际文件路径，先检查输出与报告：

```powershell
& 'D:\conda\envs_dirs\codex\Scripts\python.exe' -B -X utf8 scripts/import_demo_excel.py --input 'D:\资料\全国招商Demo数据(1).xlsx' --base 'public/assets/demo/demo-data.json' --output 'work/demo-import.json' --report 'work/demo-import-report.json' --replace
```

确认后重复导入到运行资源：

```powershell
& 'D:\conda\envs_dirs\codex\Scripts\python.exe' -B -X utf8 scripts/import_demo_excel.py --input 'D:\资料\全国招商Demo数据(1).xlsx' --base 'public/assets/demo/demo-data.json' --output 'public/assets/demo/demo-data.json' --report 'work/demo-import-report.json' --replace
```

`--replace` 适配实际采集表“全国省市／统一产业链／云梦画像”，处理合并链名单元格及五个画像分块，完整替换对应资料，保留独立企业补充、已有 logo 和模型评分。任何错误都会阻止覆盖输出。原三页空模板的增量更新可省略 `--replace`，按已有 ID 合并。若缺少 Python 包，安装 `openpyxl`：

```powershell
uv pip install --python 'D:\conda\envs_dirs\codex\Scripts\python.exe' openpyxl
```

已在浏览器导入过 JSON 时，页面优先使用该浏览器保存的数据；更新项目文件后点击“恢复项目数据”即可读取新资源。发布静态站点前重新构建。

企业图标位于 `public/assets/demo/company-logos/`。新宙邦、中一科技、华盛锂电使用官方参考经 imagegen 重建的透明图形，云梦华盛项目复用集团图形；这些是生成复现图，非企业提供的商标原文件。参考链接和提示词见 [`SOURCES.md`](public/assets/demo/company-logos/SOURCES.md)。将确认后的图片放入该目录，更新 `companies[].logo`（例如 `assets/demo/company-logos/capchem.png`）即可替换；未配置图片的企业使用名称头像。

平台新标识位于 [`public/assets/demo/brand/`](public/assets/demo/brand/README.md)，从官方公开的云梦秦简、云纹、水纹文化元素出发设计，以深青绿配暖金，不是政府官方标识或标准色。产业产品图在 [`public/assets/demo/industry/`](public/assets/demo/industry/README.md)。四张新素材由内置 imagegen 生成，完整提示词和透明原图一同保留。

## 目录职责

```text
src/
  app/          页面组合与 React 状态
  components/   地图容器及可复用流线控件
  demo/         三场景面板、弹出层、数据校验与业务选择逻辑
  hooks/        地图生命周期与导航状态
  map/          独立 TypeScript 地图引擎、制图样式和类型
  styles/       界面 CSS，按基础、地图、控件和署名划分
  config/       资源入口等应用配置
  entries/      独立嵌入入口
public/
  assets/geo/   当前地图的运行贴图、GeoJSON 和区域配置
  assets/flows/ 用户提供的人口、资本、技术流及实际流排名
  assets/demo/  招商资料、Excel 模板、替换报告与企业标识
  licenses/     随运行库分发的许可证
index.html      React 主页面入口
geographic.html 兼容已有地址的页面入口
geographic-embed.html 独立地图嵌入入口
vite.config.ts  开发与生产构建配置
tsconfig.json   TypeScript 配置
package-lock.json 固定依赖版本
scripts/        Excel 导入、模板生成及数据验证脚本
design/ui-v1/   六张 UI 设计参考与逐页预览
dist/           自动生成的构建产物，不提交 Git
```

所有应用修改在 `src/` 中进行；更换运行资源时修改 `public/`。`dist/` 可由源码重新生成，构建时会清空并重建，请勿直接编辑或保存制作原稿到其中。

主页面使用 React 管理界面，地图内部帧由 OpenLayers 绘制。地图引擎不依赖 React，可供其他界面框架或原生 JavaScript 宿主复用。

## 地图组件接入

宿主为容器设置明确的宽高，加载 OpenLayers CSS，并提供运行资源的 URL：

```ts
import "ol/ol.css";
import "./src/styles/attribution.css";
import { GeographicPlanningMap } from "./src/map";

const map = new GeographicPlanningMap(container, {
  assetBase: "./assets/geo/",
});
await map.initialize();
map.fitRegion("hunan");
map.fitHubei();
map.fitNational();
map.setLabels(false);
map.setBusinessData(geojson); // WGS84 点、线、面
const unsubscribe = map.on("mapclick", ({ coordinate }) =>
  console.log(coordinate),
);
// 宿主卸载时：unsubscribe(); map.destroy();
```

`src/hooks/usePlanningMap.ts` 展示了 React 中的创建、事件订阅和卸载清理；StrictMode 重挂载会取消旧实例的资源请求。`geographic-embed.html` 展示了不依赖 React 的独立入口。

地址片段支持 `national` 和各省 ID，例如 `hubei / sichuan / shanghai / xinjiang / tibet / taiwan / hong-kong / macau`；完整列表见 `public/assets/geo/regions-style-a.json`。所有影像共用同一坐标视图，市县边界、文字和标记独立绘制。

地图引擎支持点击整块省域或地名选中并平滑聚焦。选中状态不受缩放或拖动影响；点击其他省、返回上级／全国，或宿主显式调用导航接口才会改变选择。主应用右侧提供放大、缩小、图层和返回上级／全国，保留独立地名与轻量比例尺；行政点击下钻在全国按地区模式中启用。

周边环境由 `SurroundingContext` 使用 OpenLayers 原生矢量层绘制：浅米灰陆地、淡蓝海洋、细淡国界与海岸线，配合26个国家和10处海域的中文标签。小国名称按缩放渐显，标签与中国地名共同避让；省域聚焦时周边线条和标注进一步淡化。地理数据打包在 `surrounding-context.geojson`，不依赖在线瓦片服务，沿用世界地形背景作为浅淡参考。中国及各省的 imagegen 纹理继续独立叠加。

全国首载读取底图、区域配置与轻量地点索引 `places-style-a.json`。当前省请求完整纹理、市界及按缩放出现的县界；可视近邻省只请求720px透明上下文图，淡化至约28%，远处保留全国简底。省界使用浅色衬线和灰绿主线，焦点交接渐变450ms。渐进加载根据缩放和可视范围更新，与省份选择状态分离。

近邻表依据实际几何距离（60km内、最多8省）预计算，再按视口筛选；`contextImage` 与 `neighbors` 字段位于区域注册表中。资源并发最多3个，离屏缓存目标8个区域，可见图层受保护。已访问的完整图可直接作为淡化上下文复用；未访问邻省不会因此下载完整图或市县面。宿主可通过 `search()` 和 `focusPlace()` 接入地点搜索，台湾地名同时支持常见简体输入；主应用另提供业务地区和产业链搜索。

`map.getLoadingState()` 返回 `fullTextures / contextTextures / wantedFull / wantedContext / roles / targetReady` 等状态，便于宿主集成和验证。34张上下文图合计约2.37MB，对应完整图约14.18MB（减少83.31%，不包括共用底图、代码及矢量数据）。

### 孝感市与云梦县下钻

在湖北视图点击孝感市区域或地名，可平滑进入孝感市全域；在孝感视图点击云梦县区域或地名，可继续进入云梦县。也可直接打开 `/geographic.html#xiaogan` 或 `/geographic.html#yunmeng`，刷新会恢复当前层级。缩放和拖动保留当前选择；未配置详细地图的县域继续作为市级背景。

页面已移除左上角层级导航。右侧工具栏的返回按钮按当前层级执行云梦 → 孝感 → 湖北 → 全国；放大、缩小和图层按钮保留。全国按地区模式可通过地图点击下钻；云梦画像保持县域业务视图，避免点击企业或空白处时触发行政层级切换。

孝感专属贴图通过 imagegen 生成，以现有湖北贴图为风格参照，以孝感行政轮廓、Mapzen 高程参考及用户提供的孝感参考图辅助定位。运行时按真实的行政矢量轮廓裁切图像边缘，独立绘制孝南区、孝昌县、大悟县、云梦县、应城市、安陆市和汉川市的边界及名称。图层保留周边地域并淡化，规划分区和发展轴线留作独立专题叠加。

`LocalDetailLayer` 复用于市、县两个层级，分别管理按需加载的贴图、边界、地名和加载状态。进入孝感后加载约 1.26MB 贴图及约 123KB 行政数据；进入云梦后再加载约 1.37MB 专属贴图和已核查的独立县界。县级贴图叠在市级底图上，保持周边空间连续；业务 GeoJSON 图层位于这些地图图层之上。

`city-details.json` 的 `cities`、`counties` 分别记录市、县的父级、省份、贴图及定位范围；`xiaogan-texture.json` 和 `yunmeng-texture.json` 保存生成与配准说明。云梦使用内置 imagegen，以现有孝感图为风格参照、已核查县界及高程参考为位置约束，保留规划专题为独立图层。生成 PNG 原像素及透明通道不变，运行时按 `yunmeng-boundary.geojson` 裁切边缘。

云梦县级视图叠加独立的乡镇界线与名称，覆盖 9 镇、3 乡，以及单独列出的县经济开发区。普通乡镇界用细实线，开发区界用虚线；不填充行政面，保持地形贴图可见。右侧图层按钮可整体隐藏或显示，关闭时恢复“云梦县”标签。标签使用区域内部点，仅用于排版，不表示政府驻地。

`SubdivisionOverlay` 管理独立的界线和文字层，资源由县级配置的 `subdivisionOverlay` 指向；当前为 `yunmeng-township-overlay.geojson`，只在进入云梦时加载（约 306KB）。完整来源面保存在 `yunmeng-townships.geojson`（约 408KB，运行页面不额外请求），可用于后续替换和复核；来源年份、坐标核对、处理方式见 `yunmeng-townships-metadata.json`。显示线只保留内部界线，并裁切到现有县界，原始乡镇面和县界不做拉伸或平移。规划图中的“中心城市”不直接等同于城关镇或开发区。

本次按用户确认的**非商用 demo**接入锐多宝公开乡镇矢量：提供方标称几何年份为 2020 年、查询目录为 2023 年。数据通过几何有效性、区域内标签及坐标一致性检查，尚未取得更新的官方勘界成果，不将其称为正式核准边界。提供方限制商业用途，来源署名与限制随项目保留。

宿主接口：

```ts
map.fitCity("xiaogan");
map.fitCounty("yunmeng");
map.fitParent(); // 云梦 → 孝感 → 湖北 → 全国
map.fitLocation("yunmeng", false); // 统一位置入口，可用于地址恢复
map.on("navigationchange", (location) => console.log(location));
map.on("citydetailchange", (detail) =>
  console.log(detail.loading, detail.error),
);
map.on("countydetailchange", (detail) =>
  console.log(detail.loading, detail.error),
);
map.getViewState().activeCityId;
map.getViewState().activeCountyId;
map.getLoadingState().cityDetail;
map.getLoadingState().countyDetail;
map.setTownships(false); // 独立隐藏乡镇界线和名称，保留县级地形与县界
map.getLayerState().townships;
map.getLayerState().townshipsAvailable;
```

`activeRegionId` 和 `regionchange` 继续表示父级省份；`navigationchange` 表示当前导航层级，`targetReady` 同时考虑选中的市县资料是否已准备完成。地点搜索的云梦结果通过 `focusPlace()` 进入对应县级贴图。

乡镇图层同时遵循全局 `setLabels()`、`setBoundaries()`；独立开关不改变相机和当前层级。返回孝感、省域或全国时县级图层随导航退出，不覆盖上级视图。

区域配置支持 `focusExtent`（EPSG:3857 默认取景范围）、`transitionZoom`、`maxZoom`、`cityFocusZoom` 和 `countyFocusZoom`。海南与台湾的默认取景聚焦主岛及近岸区域，远岛保持原始地理位置。缩放到不同大小的区域时，底图细节按该区域尺度渐显。

窄窗口会根据省域实际取景缩放适配细节阈值，保留当前省的清晰度；全国取景允许视口超出中心移动范围，避免宽屏裁掉地图南北两端。静态纹理在相机移动过程中即可准备，首次可绘制后开始淡入。

仓库同时包含招商业务界面、连续地图引擎和独立嵌入入口。早期图册、制作原稿和未使用的参考图层保存在本地归档中。

## 静态部署

执行 `npm ci`、`npm run build` 后，发布 `dist/` 的内容即可。Vite 使用相对资源基址，也可部署到静态站点的子目录。开发服务器只用于本地开发，`vite preview` 用于检查构建产物。

Git 跟踪源码、构建配置、依赖锁文件、数据导入脚本及运行资源。`dist/`、`node_modules/`、本地制作工具、QA 页面、过程文档和制作原稿由 `.gitignore` 排除。地图制作原稿保存在 `work/authoring-assets/geo/`，运行资源位于 `public/assets/geo/`、`public/assets/flows/` 和 `public/assets/demo/`。

## 资源与许可

地图纹理由 imagegen 生成，大多数行政区划来自 DataV，台湾分区来自国土测绘中心开放资料；香港陆地轮廓参考地政总署海面数据，澳门与海南主岛海岸线来自 OpenStreetMap / Geofabrik。地形与河湖位置参考 Natural Earth、Mapzen Terrain Tiles。资料署名与数据许可见 `public/licenses/map-data-sources.txt`；地图引擎包含共享署名控件，嵌入时应保留。启动时展示来源，5秒后或开始操作地图时收起为左下角的 ⓘ；点击入口可再次展开。

生成地形和水系为视觉示意，不能用于位置测量或规划判读。贴图与边界采用不同来源和精度，小岛与海湾仍受生成分辨率影响；某些台湾标签使用区域内部点，不代表政府驻地坐标。湖北原图对照的来源保存在 `public/assets/geo/manifest.json`。

港澳主分区的显示面按陆地裁切，避免行政海面填色遮住海峡。原始分区未覆盖的少量陆地保留纹理和省界，不推断行政归属。

OpenLayers、React 的许可证位于 `public/licenses/`。

## 流空间图层

在底图之上叠加 2025 年城市间的人口流、资本流、技术流（`src/map/FlowLayer.ts`），与底图共用同一个 OpenLayers 地图和 EPSG:3857 坐标，缩放、下钻时不会错位。进入“流空间匹配”，展开左侧“流线设置与实际排名”即可使用原有 `FlowPanel` 的三种范围：

- **全国主干**：每种流按流量从大到小累加，分三档显示：核心（累计占全国流量 30%）、主要（50%）、扩展（70%）。
- **孝感相关**：和孝感市往来的城市，可切换流入 / 流出，以及前 10 / 前 20 / 全部。
- **云梦明细**：云梦县自己的联合专利与上市公司投资记录。

视觉与交互（面向招商演示）：

- **规划图风格（默认）**：保留原有浅灰底图滤镜和中央流空间效果。流线画成带白色衬边的半透明色带和燕尾箭头，最强的几条沿线写上“××—×× 资本流”或企业名与金额；全国视图每类流只把最强的 6 条画成粗箭头通道，其余为细线。城市分三级符号：核心枢纽 ⊙、重要节点 ◎、一般节点 ●；云梦县使用深红县界和同心圆目标符号。
- **夜色风格**：在“流线设置与实际排名”中切换，或用 `?scene=flows&theme=night` 打开。底图反相为墨色，流线发光，强流上有彗星光点、云梦有雷达扫描。
- **动画**：切换筛选时流线按强度依次“生长”入场；规划图风格下主要通道中心的白色虚线沿流向移动，云梦有扩散圈；标签与城市名互相避让。系统开启“减少动态效果”时只显示静态画面。
- **悬停**：高亮该流线、压暗其他流，提示框显示起止城市、流量和排名。
- **统一看板**：顶部为三场景导航，左侧提供匹配条件及原有流线设置，右侧展示城市和企业，底部显示匹配结果数量与流类型图例。实际流排名与模型评分分别展示，评分性质在内部资料说明。
- **进入与退出**：外层透明度包装和原 replay 配合场景转场，保留既有绘制。旧 `FlowHud`／`useFlowTour` 的导览不作为主页面入口。

实现上，`FlowLayer` 是一个自绘 Canvas 的 OpenLayers 图层：静态内容（流线、节点、标签）只在视角、筛选或悬停变化时重画；动画画在单独的画布上，由自己的 `requestAnimationFrame` 驱动，不会让底图每帧重绘。曲线按二次贝塞尔从数据点精确还原，鼠标命中在地图坐标里计算。流线整体开关、重播和主题切换位于“流线设置与实际排名”内；切换到其他业务场景会隐藏流层。业务点位使用独立矢量层，未改写流线几何、节点或绘制样式。

数据在 `public/assets/flows/`，由单独的清洗脚本从三份原始 Excel 生成：

| 文件                     | 内容                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| `flows-national.geojson` | 全国主干流线（曲线 LineString，WGS84），带类型、流量、排名、累计占比、分档 |
| `flows-local.geojson`    | 孝感市相关流（城市级）和云梦县明细（区县级）                               |
| `flow-rankings.json`     | 城市流入排名前 10、孝感的全国排名、流入孝感的来源城市前 10                 |
