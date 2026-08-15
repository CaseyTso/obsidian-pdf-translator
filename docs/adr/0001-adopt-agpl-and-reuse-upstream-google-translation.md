# 采用 AGPL-3.0 并允许复用上游 Google 翻译实现

本项目选择以 AGPL-3.0 开源，并允许按需改写或复用 windingwind/zotero-pdf-translate 中独立的 Google 翻译逻辑，而不是为了采用宽松许可证而重复实现同一逻辑。复用代码必须保留原项目的版权与许可说明；Zotero 专属 UI、设置和运行时接口不移植，Obsidian PDF 监听、弹窗、设置与 LLM 接口独立实现。

## Considered Options

- 仅参考交互、完全独立实现，并采用 MIT License。
- 复用必要的 AGPL 代码，项目整体采用 AGPL-3.0。

选择后者是因为用户明确接受公开源代码，并优先考虑可靠复用而非许可证宽松度。

## Consequences

发布时须提供对应源代码、保留上游署名与 AGPL-3.0 许可；不得将衍生版本重新许可为闭源或仅使用宽松许可证。

## Sources

- https://github.com/windingwind/zotero-pdf-translate
- https://github.com/windingwind/zotero-pdf-translate/blob/main/src/modules/services/google.ts
- https://github.com/windingwind/zotero-pdf-translate/blob/main/LICENSE
