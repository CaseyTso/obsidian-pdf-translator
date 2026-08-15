# PDF Translator

An [Obsidian](https://obsidian.md) plugin that translates selected text inside the built-in PDF viewer, showing the translation in a popup near your selection.

- **Google Translate** (free, no API key) for quick lookups
- **OpenAI-compatible LLM endpoints** (DeepSeek, OpenAI, or any compatible service) for higher-quality translation

[中文 README](README.zh-CN.md)

## Features

- **Select-to-translate inside Obsidian's PDF reader** — select text in a PDF and the translation appears in a popup automatically.
- **Popup follows your reading flow** — stays at the screen position where you selected text; scroll or switch pages and it stays put. New selections replace the old popup.
- **One-click copy** — copy the translation with a single click (icon shows a temporary check mark).
- **Target language setting** — translate to your chosen language globally.
- **LLM profiles** — save multiple named endpoint configurations (Base URL + API key + model + prompt) and switch between them instantly, with an in-place connection test that never saves or applies the tested draft.
- **Privacy-friendly connection test** — the test sends only a fixed `Hello` message, never PDF content, and never leaks your API key into logs or error text.

## Installation

### Community plugins (not yet published)

Follow [the community plugin submission guide](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) once the plugin is approved.

### Manual install (BRAT or direct)

1. Download the latest release from the [Releases](https://github.com/CaseyTso/obsidian-pdf-translator/releases) page (`main.js`, `manifest.json`, `styles.css`).
2. Copy the three files into `<your-vault>/.obsidian/plugins/obsidian-pdf-translator/`.
3. Reload Obsidian and enable **PDF Translator** in Settings → Community plugins.

> **Note for the current source tree:** the plugin builds from `src/` (TypeScript). The bundled `main.js` at the repo root is the compiled artifact — rebuild it with `npm run build` if you clone and change the source.

## Usage

1. Open a PDF in Obsidian's built-in viewer.
2. Select any text (up to 5,000 characters; leading/trailing whitespace is trimmed first).
3. A translation popup appears under your selection (or above/compressed to the larger side when space is tight).
4. Click the copy icon to copy the translation, or Esc / click elsewhere / make a new selection to dismiss.

## Configuration

Open **Settings → PDF Translator**:

| Setting | Description |
|---|---|
| Translation service | `Google` (free) or `LLM` (OpenAI-compatible endpoint) |
| Target language | Language code of the translation output (e.g. `zh-CN`, `en`) |
| LLM Base URL | e.g. `https://api.deepseek.com/v1` — must include `http(s)://` |
| LLM API key | Your API key (stored locally in Obsidian's data.json) |
| LLM Model | e.g. `deepseek-chat` |
| Translation prompt | Custom instruction for the model (language, style, terminology) |
| LLM Profiles | Save named configurations; switch with one click |
| Connection test | Send a fixed `Hello` request with the current draft; does not save or apply it |

### LLM profiles

- Profiles store: a unique name, Base URL, API key, model, and translation prompt.
- Switch the active profile from the dropdown; the target language is a global setting and not part of a profile.
- Legacy settings from plugin v1.0 are migrated automatically to a `默认配置` (default) profile on upgrade.
- A draft you type but don't save can be connection-tested without being applied; deleting a profile is blocked while it is the active one with unapplied draft changes.

## Credits

- The Google Translate request/response handling is adapted from [windingwind/zotero-pdf-translate](https://github.com/windingwind/zotero-pdf-translate) (AGPL-3.0), per [ADR-0001](docs/adr/0001-adopt-agpl-and-reuse-upstream-google-translation.md). Upstream copyright and license notices are preserved in the adapted source; Obsidian-specific PDF selection, popup, settings, and LLM interfaces are implemented independently.

## License

[AGPL-3.0](LICENSE) © CaseyTso