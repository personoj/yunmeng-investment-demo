# 企业标识替换

默认 `demo-data.json` 中的 `companies[].logo` 为 `null`，页面使用统一占位；`placeholder.svg` 也是无品牌的占位图，不代表任何企业官方标识。

将确认后的标识放到本目录，例如 `capchem.png`，再把对应企业的 `logo` 改成 `assets/demo/company-logos/capchem.png`。页面使用固定比例容器和 `object-fit: contain`，无需修改组件。也可使用可访问的 HTTPS 图片地址。

建议提供透明 PNG、WebP 或经审核的 SVG，至少 256×256。图片生成模型制作的图案只有在用户确认后才替换，不能将生成图标当作已核对的官方 logo。

Excel 导入保留已有企业 ID、logo 及详情字段。新采集的企业只创建名称占位，不生成工商或股东数据。
