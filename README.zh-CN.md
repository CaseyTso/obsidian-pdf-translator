# PDF Translator（PDF 划词翻译）

一个 [Obsidian](https://obsidian.md) 插件：在 Obsidian 内置 PDF 阅读器中划词翻译，译文以弹窗形式显示在选区附近。

- **Google 翻译**（免费、无需 API key），适合快速查阅
- **OpenAI 兼容 LLM 接口**（DeepSeek、OpenAI 或任意兼容服务），适合高质量翻译

[English README](README.md)

## 功能特性

- **内置 PDF 阅读器内划词即译** — 在 PDF 中选中文本，译文自动出现在弹窗中。
- **弹窗跟随阅读流** — 弹窗停留在你划词时的屏幕位置；滚动或翻页不跟随，新的划词会替换旧弹窗。
- **一键复制** — 点击图标即可复制译文（图标短暂显示为对勾）。
- **目标语言设置** — 全局设置译文的目标语言。
- **LLM 配置档** — 保存多个命名接口配置（Base URL + API key + model + 提示词），一键切换；设置页内置连通性测试，测试不会保存或应用草稿。
- **隐私友好的连通性测试** — 测试仅发送固定的 `Hello` 短消息，不发送 PDF 文献内容；API key 不会出现在日志或错误文本中。

## 安装

### 社区插件（尚未上架）

待插件通过审核后，按[社区插件提交指南](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)操作。

### 手动安装（BRAT 或直接拷贝）

1. 从 [Releases](https://github.com/CaseyTso/obsidian-pdf-translator/releases) 页面下载最新发布的 `main.js`、`manifest.json`、`styles.css`。
2. 将三个文件复制到 `<你的库>/.obsidian/plugins/obsidian-pdf-translator/` 目录。
3. 重启 Obsidian，在「设置 → 第三方插件」中启用 **PDF Translator**。

> **源码树说明：** 插件由 `src/`（TypeScript）构建，仓库根目录的 `main.js` 是编译产物。克隆并修改源码后，请用 `npm run build` 重新构建。

## 使用方法

1. 在 Obsidian 内置阅读器中打开 PDF。
2. 选中任意文本（最多 5,000 字符；首尾空白会被自动去除）。
3. 译文弹窗出现在选区下方；下方空间不足时自动移到上方或压缩到空间更大的一侧。
4. 点击复制图标复制译文；按 Esc、点击别处或进行新的划词即可关闭弹窗。

## 配置说明

打开「设置 → PDF Translator」：

| 设置项 | 说明 |
|---|---|
| 翻译服务 | `Google`（免费）或 `LLM`（OpenAI 兼容接口） |
| 目标语言 | 译文目标语言代码（如 `zh-CN`、`en`） |
| LLM Base URL | 例如 `https://api.deepseek.com/v1` — 必须包含 `http(s)://` |
| LLM API key | 你的 API key（保存在 Obsidian 本地的 data.json 中） |
| LLM Model | 例如 `deepseek-chat` |
| 翻译提示词 | 自定义模型指令（语言、风格、术语处理） |
| LLM 配置档 | 保存命名配置，一键切换 |
| 连接测试 | 用当前草稿发送一次固定 `Hello` 测试；不会保存或应用草稿 |

### LLM 配置档

- 配置档保存：唯一名称、Base URL、API key、model、翻译提示词。
- 从下拉框切换当前配置档；目标语言是全局设置，不属于配置档。
- 插件升级时，v1.0 的旧配置自动迁移为 `默认配置` 配置档。
- 未保存的草稿可直接进行连通性测试而不会被应用；当前配置档存在未应用草稿时，不可直接删除。

## 致谢

- Google 翻译请求/响应处理改写自 [windingwind/zotero-pdf-translate](https://github.com/windingwind/zotero-pdf-translate)（AGPL-3.0），详见 [ADR-0001](docs/adr/0001-adopt-agpl-and-reuse-upstream-google-translation.md)。改写源码中保留上游版权与许可声明；Obsidian 专属的 PDF 划词、弹窗、设置与 LLM 接口均为独立实现。

## 许可证

[AGPL-3.0](LICENSE) © CaseyTso