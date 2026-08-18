# Obsidian PDF Translate

Obsidian 插件：在内置 PDF 阅读器中划词翻译，弹窗显示结果。默认 Google Translate（免费），预留 OpenAI 兼容 LLM 接口。

## Language

**PDF 划词翻译 (PDF Selection Translation)**：
在 Obsidian 内置 PDF viewer 中选中文本后自动翻译；它是固定交互，不提供手动触发模式。
_Avoid_: PDF annotation translation, note translation, manual translation

**翻译弹窗 (Translation Popup)**：
划词后浮在 PDF 页面上的译文气泡，不重复显示原文；支持复制整段译文、重新翻译，译文与错误信息可选中并原生复制。
_Avoid_: tooltip, overlay, floating panel

**弹窗内选区 (Popup Selection)**：
位于翻译弹窗内的文本选择，用户可选中并复制；它不构成「当前划词」，不得触发新翻译或关闭弹窗。
_Avoid_: selection inside popup, active selection

**当前划词 (Current Selection)**：
PDF 阅读器中最近一次有效的文本选择，也是唯一允许更新翻译弹窗的请求对象。
_Avoid_: active selection, latest request

**有效划词 (Valid Selection)**：
去除首尾空白后含有至少一个字母或汉字、且不超过 5,000 字符的 PDF 文本选择。
_Avoid_: highlighted text, arbitrary selection

**翻译请求 (Translation Request)**：
当前划词向用户所选翻译服务发起的一次请求；新请求取代旧请求，旧结果不得覆盖新弹窗。
_Avoid_: API call, translation job

**文本整理 (Selection Normalization)**：
翻译前对 PDF 文本层产生的换行和英文断词进行修复，使请求文本尽量恢复为连续语句。
_Avoid_: cleanup, preprocessing

**LLM 接口 (LLM Endpoint)**：
OpenAI 兼容的 chat completions 协议接口（API key + baseURL + model），供接入 DeepSeek、OpenAI 等服务。
_Avoid_: custom GPT, AI service

**LLM 配置档 (LLM Profile)**：
用户以唯一名称保存在本机的一组 LLM 接口参数（Base URL、API key、model）与翻译提示词；可一键切换为当前配置档，目标语言不属于配置档。插件升级时，完整的旧 LLM 配置自动迁移为「默认配置」。
_Avoid_: preset, provider, account, endpoint

**当前配置档 (Active LLM Profile)**：
当前由 LLM 翻译服务实际使用并持久化的配置档；有未应用的配置草稿时，当前配置档仍保持不变，且不可直接删除。
_Avoid_: selected profile, current provider

**自定义配置状态 (Custom Configuration State)**：
配置草稿已应用为实际 LLM 参数、但未覆盖或另存为任何 LLM 配置档时的状态；原配置档内容保持不变。
_Avoid_: temporary profile, modified profile

**配置草稿 (Configuration Draft)**：
设置页输入框中尚未应用或保存的 LLM 参数；可直接用于连通性测试，但不得因测试而自动覆盖当前配置。
_Avoid_: temporary config, unsaved profile

**连通性测试 (Connection Test)**：
使用配置草稿发起一次极短的真实 chat completions 请求，同时验证 Base URL、API key、model 与协议响应；测试本身不保存或启用配置草稿。
_Avoid_: ping, health check, model list test

**翻译提示词 (Translation Prompt)**：
用户可编辑的 LLM 翻译指令，用于约束语言、风格和专业术语处理。
_Avoid_: system message, prompt template

**翻译服务 (Translation Service)**：
提供翻译能力的后端。首版两种：Google（免费、无 key）与 LLM 接口（需 key）。
_Avoid_: translator, engine

**插件 ID (Plugin ID)**：
manifest.json 中的唯一标识，也是 vault 内插件目录名（`.obsidian/plugins/<id>/`）；与命令 ID 前缀绑定，发布后不可改。
_Avoid_: app id, bundle id
