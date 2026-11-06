# dev2 功能保留与变基检查清单

本文记录 `dev2` 相对 `main` 的功能增量，以及这些增量与主线代码的结合点。下次变基应先阅读本文，再逐项核对代码和测试；不能仅凭提交标题、旧方案或一次自动合并判断功能是否保留。

## 1. 当前基线与使用范围

- 整理日期：2026-11-06。
- 主线基线：`main` 的 `7ae7dec`，对应 `v0.8.8` 标签。
- 功能基线：`dev2` 的 `c26aaab`，相对上述主线有 12 个提交（原有 11 个提交及本轮兼容提交）；本文档的本轮更新另计。
- 最近一次变基恢复分支：`codex/dev2-before-main-rebase-20261106`，指向变基前的 `253176e`。此前恢复分支仍保留；下次变基另建恢复分支，不覆盖已有恢复点。
- 本地变基不等于推送。变基后 `dev2` 与 `my/dev2` 的旧历史出现 ahead/behind 属于可能的正常结果，不能据此直接拉取、合并或强推。

提交哈希、版本、模型 ID 和业务配置是当前快照，不是下次变基必须照搬的常量。功能行为以当前实现及测试为准；新增需求应同步更新本文。

## 2. 必须识别的功能增量

| 编号 | 功能要素 | 主要实现与配置入口 | 不可丢失的行为 |
| --- | --- | --- | --- |
| F1 | 网页版服务器下发设置 | [serverSettings.ts](../src/lib/serverSettings.ts)、[App.tsx](../src/App.tsx)、[app-config.json](../public/app-config.json) | 同源加载、协议校验、剥离服务器 Key、失败回退。 |
| F2 | 默认服务与自定义模式隔离 | [store.ts](../src/store.ts)、[persistedState.ts](../src/lib/persistedState.ts)、[SettingsModal.tsx](../src/components/SettingsModal.tsx) | 默认服务首次开启，服务器参数只读；关闭后恢复本地备份，并兼容旧数据。 |
| F3 | 单一本地 API Key | [serverSettings.ts](../src/lib/serverSettings.ts)、[store.ts](../src/store.ts) | Key 注入实际使用的画廊和 Agent 配置；服务器缓存不含 Key。 |
| F4 | 画廊与 Agent 自动分流 | [app-config.json](../public/app-config.json)、[SettingsModal.tsx](../src/components/SettingsModal.tsx) | 按模式使用服务器指定 profile，不恢复历史上的手动 profile 切换。 |
| F5 | 主线新设置的服务器模式兼容 | [store.ts](../src/store.ts)、[serverSettings.ts](../src/lib/serverSettings.ts)、[persistedState.ts](../src/lib/persistedState.ts) | 允许选择服务器列出的模型，保留重试方式、批量提交、画板等本地偏好及 Agent 预置字段。 |
| F6 | dist-only Docker 部署 | [Dockerfile.dist](../deploy/Dockerfile.dist)、[Compose](../deploy/docker-compose.dist.yml)、[构建脚本](../deploy/build-dist-image.ps1) | 本地构建 dist、镜像仅打包产物、外置配置只读挂载、可移植运行变量。 |
| F7 | 代理部署与缓存防护 | [README](../README.md)、[nginx.conf](../deploy/nginx.conf)、[sw.js](../public/sw.js)、[.gitattributes](../.gitattributes) | 区分编译开关与运行开关；保留 `/api-proxy/`、配置 no-store 及脚本换行防护。 |
| F8 | 站点品牌与原项目署名 | [index.html](../index.html)、[Header.tsx](../src/components/Header.tsx)、[README](../README.md) | 显示 `GptImage2-XJ`，页头链接指向 stfei 仓库，保留原项目署名与许可。 |
| F9 | Web 与桌面客户端隔离 | [App.tsx](../src/App.tsx)、[store.ts](../src/store.ts)、[persistedState.ts](../src/lib/persistedState.ts)、[SettingsModal.tsx](../src/components/SettingsModal.tsx) | 默认服务只用于 Web；桌面端保持本地配置、SQLite 和原生代理，不能被 Web 的代理占位配置覆盖。 |

代理请求能力、画板、批量提交、多模型和 Agent 本身包含主线已有实现。`dev2` 的增量是部署方式、服务器模式适配及业务配置，不应以保留这些增量为由覆盖主线实现。

## 3. 服务器设置的行为契约

### 3.1 加载、校验与缓存

- 文件固定为同源 `/app-config.json`，格式为 `{ "version": 1, "settings": { ... } }`。保持协议版本 `1`，沿用主线 `normalizeSettings()` / `apiProfiles.ts`，不另建一套 profile 类型。
- `profiles` 非空；每项 ID 有效且唯一；`activeProfileId` 必须存在。历史顶层 API 字段不能反向覆盖 profile 中的服务器参数。
- 网页版启动时先恢复持久化和处理预置配置，再加载服务器配置。请求使用 `cache: 'no-store'`；Nginx 对该文件发送 `Cache-Control: no-store`；Service Worker 对该路径直接请求网络，不返回旧配置缓存。
- 加载失败、HTTP 错误或配置无效时保留上次有效服务器缓存；没有缓存时使用内置设置，并提示用户。不能以错误响应覆盖有效缓存。
- `serverSettingsCache` 在创建、恢复和更新时均清除顶层和全部 profile 的 API Key。
- `app-config.json` 是公开的前端配置，不能放置服务端秘密。`providerDrafts` 是浏览器供应商草稿，不写入部署配置。
- URL 参数沿用主线的导入差异确认流程，先从地址栏清除，再提示用户。明确的 `apiKey` 参数仅在用户确认后写入 Web 的单一本地 Key；取消不能修改 Key，链接中的 URL/模型不能覆盖服务器受控参数。

### 3.2 服务器参数与 API 新属性

当前示例见 [public/app-config.json](../public/app-config.json)，字段说明见 [README](../README.md)。下次主线新增属性时，不能只解决 TypeScript 冲突，还要检查部署示例是否遗漏。

| 字段或字段组 | 当前语义与保留要求 |
| --- | --- |
| `profiles`、`customProviders`、`activeProfileId` | 保留业务 profile 和稳定 ID；画廊由 `activeProfileId` 决定。 |
| `isDefault` | 部署默认标记，与活动 ID 不是同一个字段；多配置示例只标记一个默认项，建议与画廊活动项一致。 |
| `model`、`selectedModel` | `model` 支持中英文逗号分隔的模型列表；`selectedModel` 是列表内的当前选择，不是可任意填写的新模型。 |
| `imageGenerationModel` | Responses API 的 `image_generation` 工具模型，与文本模型分开；留空时不发送工具模型 ID。 |
| `svgModel` | 输出 SVG 时使用的文本模型，默认 `gpt-6.1-sol`；必须经过解析、缓存、Key 注入和持久化保留。不要把它与图像模型混淆。 |
| `reasoningEffort` | Responses 推理强度：`none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`。无效值由主线归一化清除，回到其默认处理逻辑。 |
| `responseFormatB64Json` | `true` 要求兼容的 Images 接口返回 Base64；并非所有网关支持。`false` 可能在归一化后省略，不能把省略误判为功能丢失。 |
| `transparentBackgroundMethod` | `api` 使用接口透明背景；`local` 使用浏览器本地后处理。 |
| `apiMode`、`codexCli`、`apiProxy`、`timeout`、流式图片字段 | 沿用主线各供应商和 API 模式的归一化及实际请求语义，不能只保留 JSON 中的字段名。 |
| `agentApiConfigMode`、`agentTextProfileId`、`agentImageProfileId` | 保留 Agent 配置选择、图像分流及相关服务器参数；不能默认回退到画廊配置。 |

当前业务示例使用 `default-openai`（图片）与 `responses-api`（智能代理），两项 `apiKey` 均为空，`codexCli: false`、`apiProxy: true`。模型、地址、超时等值以部署文件为准，不应根据早期提交恢复旧值。

当前主线默认图像模型为 `gpt-image-2.6-sunburst`，默认 Responses/SVG 文本模型为 `gpt-6.1-sol`；部署文件显式指定的业务模型仍优先使用，不因主线缺省值更新而自动替换。当前业务文件保留 `gpt-image-2.5-sunburst` 等原值；如需使用复杂度、SVG 或 GIF，部署者需选择支持这些能力的 2.6 或更新模型，不能仅补字段就声称上游可用。

`complexity`、`frame_count`、`frame_duration_ms` 和 SVG/GIF 的 `output_format` 属于任务参数，继续使用主线 `TaskParams` 和参数归一化，不把它们误写成 API profile 属性。

### 3.3 默认服务开关、持久化与 Key 隔离

- 持久化版本当前保持 `4`；保存 `defaultServiceEnabled`、`customSettingsBackup`、`serverSettingsCache`、`defaultServiceApiKey`、`localPreferenceSettings`。
- 旧 `main` 的自定义设置迁移为可恢复备份；旧 `dev` 的默认服务状态及 Key 数据保持兼容。不能清空 IndexedDB 来回避迁移问题。
- 关闭默认服务：恢复 `customSettingsBackup` 并应用当前本地习惯，沿用主线预置配置策略。
- 重新开启：先备份当前自定义设置，再捕获当前自定义活动配置的 Key，应用服务器缓存或内置设置；清除任务复用的临时 profile 和 `reusedTaskApiModel`。
- 服务器重新注入配置时，同样清除临时复用状态；自定义模式下更新服务器缓存不覆盖正在使用的自定义设置。
- 默认服务使用一个本地 Key，不是每个服务器 profile 独立保存 Key。注入范围为活动 profile；`native` / `hybrid` 额外注入 Agent 文本 profile；`hybrid` 额外注入 Agent 图像 profile。其它 profile 的 Key 保持为空。
- 无密钥要求针对服务器配置与 `serverSettingsCache`。用户本地 Key 会持久化于浏览器，不能声称全部浏览器状态都没有 Key；自定义备份也可保留用户自己的 Key。
- 默认服务下的预置配置导入进入自定义备份，不覆盖运行中的服务器配置；保留 `previousPresetConfig.agent` 的主线稀疏字段语义。

### 3.4 桌面客户端边界

- Web 首次开启默认服务；Tauri 客户端首次关闭且不能通过 action 开启，不显示默认服务开关，也不加载打包的 `/app-config.json`。
- 客户端不使用 Web 的 `/api-proxy/`；保留主线 `apiFetch` 原生请求、本机网络代理、CLI/Skill、更新、保存位置及数据目录逻辑。
- Zustand 仍保持版本 `4`，但保留主线存储选择：Web 为 localStorage，客户端为预加载的 SQLite kv。不要把持久化版本误当作图片数据库的 schema 版本。
- 客户端旧 main 的版本 `2` 数据升级后仍使用原本地 profile、Key 和偏好；若读取带服务器模式标记的版本 `4` 数据，优先恢复自定义备份，不能让 Web 的 `0.0.0.0` 代理占位地址成为客户端 API。
- 保留主线的图片二进制存储、Agent 草稿、`markupImageId` 标注层、`imageSourceUrls` 链接来源及新增任务参数迁移，不能恢复旧版持久化模块整文件。

### 3.5 配置选择与模型选择是两件事

当前服务器模式按页面模式自动选择配置，不开放“当前配置”下拉框：

- 画廊使用 `activeProfileId`。
- Agent 主配置沿用 `getAgentTextApiProfile()`：`off` 使用活动 profile，`native` / `hybrid` 使用指定文本 profile；`hybrid` 的图像调用使用指定图像 profile。
- 当前部署为 `hybrid`，文本为 `responses-api`，图像为 `default-openai`。
- 设置页自动展示对应配置；API 与 Agent 参数仍只读，新增、复制、编辑、删除、拖动 profile 的入口不可用。

但首页允许选择服务器在该 profile 的 `model` 列表中列出的模型：

- `setSettings()` 只接受已存在服务器 profile 的合法 `selectedModel`，不能借同一次更新修改 `baseUrl`、`model` 列表或其它受控参数。
- 选择写入无密钥服务器缓存，可跨刷新及默认服务开关保留，不修改自定义备份。
- 重新加载时，只有相同 profile ID 且模型仍在新列表中才保留选择，否则使用新的服务器选择或列表首项。
- 任务复用需要恢复其模型时，也遵守服务器列表约束；实际请求继续使用主线模型解析逻辑。

### 3.6 本地习惯不被服务器覆盖

默认服务下允许编辑本地 Key 和下列本地偏好；这些偏好在服务器更新、模式切换和持久化恢复后仍应保留：

- 输入与任务习惯：`clearInputAfterSubmit`、`persistInputOnRestart`、`reuseTaskApiProfileTemporarily`、`alwaysShowRetryButton`、`retryMode`、`allowPromptRewrite`、`taskCompletionNotification`、`enterSubmit`。
- 批量提交：`showBatchPrompt`、`batchPromptEnabled`、`batchPromptMode`、`batchPromptConcurrencyLimited`、`batchPromptConcurrency`。
- 参考图编辑：`referenceImageEditAction`，可选 `ask` / `sketch` / `mask`。
- 下载及 Agent 显示习惯：`zipDownloadRoutes`、`agentScrollToBottomAfterSubmit`、`agentMathFormattingPrompt`。
- 收藏夹及隐私：`saveTasksToActiveFavoriteCollection`、`privacyModeShortcut`。
- 外观：`colorMode`、`uiFont`、`uiFontName`、`monoFont`、`monoFontName`。
- 更新和客户端习惯：`autoCheckUpdate`、`writeLogFile`、`saveLocationMode`；仅客户端适用的选项仍由主线控制显示，不在 Web 强行显示。

`retryMode` 可选 `new`（默认新建）、`overwriteFailed`（覆盖失败任务）、`overwriteAll`（覆盖任何任务）。只有 `alwaysShowRetryButton: true` 时才允许 `overwriteAll`；关闭后归一化为 `overwriteFailed`。它必须能在默认服务下修改，并跨服务器刷新、持久化及模式切换保留。

服务器参数不等于上述偏好。主线新增设置时，先判断属于部署控制还是用户习惯，再同步 `LOCAL_PREFERENCE_KEYS`、偏好提取/应用、部署示例和测试，避免界面可改但刷新丢失。

数据管理界面仍允许处理任务和图片，默认服务下配置导入、导出、清除选项不可用。已知边界：导出/清除处理函数没有根据默认服务状态做完整的动作层二次过滤；这是独立待完善项，不应在变基验收中声称已完全防护，也不能未经授权借变基扩展修复范围。

## 4. dist 部署与代理的保留要求

- [Dockerfile.dist](../deploy/Dockerfile.dist) 只复制已经构建好的 `dist/`，不在镜像内重新运行 npm；保留 [专用 dockerignore](../deploy/Dockerfile.dist.dockerignore)。不要手工修改 `dist/`。
- [Compose](../deploy/docker-compose.dist.yml) 将外部配置只读挂载到 `/usr/share/nginx/html/app-config.json`，支持 `APP_CONFIG_PATH`、镜像名、标签、端口及容器名变量。
- 默认 `ENABLE_API_PROXY=false`，`API_PROXY_URL` 不固化私网地址。部署代理时显式提供 `ENABLE_API_PROXY=true` 和完整上游 `API_PROXY_URL`（例如 `https://api.example.com/v1`）；`LOCK_API_PROXY` 是可选的强制代理开关。
- 保留主线 [运行时注入脚本](../deploy/inject-api-url.sh) 和 [旧环境变量迁移脚本](../deploy/migrate-api-env.envsh)，包括其它部署/预置控制变量，不能只留下 dev2 新变量。
- Windows 构建保留 `.gitattributes` 对 `*.sh`、`*.envsh`、`Dockerfile*` 的 LF 规则，以及 Dockerfile 中入口脚本的 CRLF 清理。
- 同时保留主线 `* text=auto eol=lf` 和 PowerShell 的 CRLF 规则，不能用 dev2 三条脚本规则覆盖整个文件。
- 不跟踪 `.env.local` 或 `dev-proxy.config.json`。开发代理使用忽略的本地配置文件或显式环境变量，不把个人代理地址写入仓库；开发专用代理配置不会自动变成生产代理。

### 4.1 普通静态构建

```powershell
$env:VITE_API_PROXY_AVAILABLE='true'
$env:VITE_API_PROXY_LOCKED='false'
npm run build
```

这只启用前端能力：兼容的 profile 还需 `apiProxy: true`，静态服务器还需实际提供 `/api-proxy/` 转发。若前端强制代理，可设置 `VITE_API_PROXY_LOCKED='true'`。仅设置 `ENABLE_API_PROXY` 后执行普通 `npm run build` 不会开启前端代理。

编译变量会固化到产物，修改后须重建；同版本重新部署后需排查浏览器及 PWA 旧缓存。不要因为代理开关不可见就删除主线设置入口。

### 4.2 dist Docker 构建

[build-dist-image.ps1](../deploy/build-dist-image.ps1) 在构建时注入运行时占位符，由容器启动脚本按运行变量替换，并在结束时恢复之前的环境变量。与普通静态构建的固化变量方式不能混淆。

主线字体变量也须贯穿整条链路：构建端的 `VITE_DEFAULT_UI_FONT`、`VITE_DEFAULT_MONO_FONT`、`VITE_BUILTIN_FONT_SOURCE` 使用占位符；Dockerfile 和 Compose 提供 `DEFAULT_UI_FONT`、`DEFAULT_MONO_FONT`、`BUILTIN_FONT_SOURCE`，启动脚本负责替换。保留 Nginx 的字体 MIME/gzip 配置，字体文件随 Vite 产物打包。

- 脚本默认安装依赖、编译、构建镜像并启动/重建容器；它不是只读校验命令。
- `-BuildOnly` 不启动容器，但仍会构建镜像且要求 Docker daemon 可用；`-SkipInstall` 和 `-NoCache` 的原有行为应保留。
- 只验证配置时使用 `docker compose -f deploy/docker-compose.dist.yml config`，不要执行 `up`。配置展开通过不能代替容器和上游请求实测。

## 5. 品牌与主线功能不能互相覆盖

- 页面标题和页头显示 `GptImage2-XJ`，页头 GitHub 链接为 `https://github.com/stfei/gpt_image_playground`。
- 关于界面保留原项目作者署名和原仓库/许可链接，不能把品牌替换扩大为移除原作者信息。
- README 同时保留主线新文档和 dev2 的服务器配置、dist Compose、代理编译说明。
- `public/sw.js` 保留服务器配置网络直读，同时 `CACHE_NAME` 跟随新的主线应用版本，不恢复旧版本缓存名。
- 冲突以主线拆分架构为基础移植。不要整块恢复旧 `store.ts`、设置弹窗、持久化模块、输入组件或 API 实现。
- 核对主线 Agent 对话、输入草稿、收藏、任务状态、画板、批量提交、多模型、重试方式、预置 Agent 配置等新增功能，以及各供应商的请求逻辑。涉及同一文件不等于应以 dev2 整文件替换。
- 覆盖式重试保留任务 ID、创建时间及收藏，清除旧结果并以 `startedAt` 计算本次耗时/超时；旧请求迟到响应不能覆盖新执行。Agent 图片任务始终新建，运行中及自动恢复中的任务不可重试。这些主线语义不能被旧 store 实现覆盖。
- 保留 v0.8.8 的桌面客户端、CLI/Skill、字体/颜色、隐私模式、收藏夹自动归档、链接导入确认、2.6 模型参数及 markup 图层能力；服务器模式只限制部署拥有的配置，不应误伤本地习惯。

优先检查 [types.ts](../src/types.ts)、[apiProfiles.ts](../src/lib/apiProfiles.ts)、[persistedState.ts](../src/lib/persistedState.ts)、[presetConfig.ts](../src/lib/presetConfig.ts)、[InputBar.tsx](../src/components/InputBar.tsx)、[SketchBoardModal.tsx](../src/components/SketchBoardModal.tsx)、[GeneralSettingsTab.tsx](../src/components/settings/GeneralSettingsTab.tsx) 的主线变化，再检查 dev2 接入点。

## 6. 已被后续修改取代的历史行为

- `9e49932` 曾允许手动切换服务器活动 profile 并记忆 ID；后续 `43f2602` 改为画廊/Agent 自动分流。不能按早期提交标题重新添加 `setDefaultServiceActiveProfile` 或记忆手动活动 ID。
- 早期方案曾因当时主线移除字段而删除 `referenceImageEditAction`；新版主线重新引入该字段支持画板/蒙版，当前必须保留并作为本地偏好。
- 早期服务器活动项、Agent 模式、模型和 `codexCli` 值可能与当前业务文件不同；以最终部署示例和测试为准。
- 最初“3 个逻辑提交”的历史目标不再对应当前分支的实际提交数量。下次应保留全部有效增量，不自行压缩或丢弃后续提交。

## 7. 下次变基的检查步骤

### 7.1 操作前与冲突处理

1. 确认当前分支、工作区、远端和未推送提交；保留用户修改。获取最新 `origin/main`，核对 `my/dev2` 是否出现未知提交。主线只允许快进；远端未知分叉时停止确认，不自动覆盖。已知的上次本地变基造成的分叉需单独识别。
2. 记录旧共同祖先、旧 dev2 HEAD 和主线目标 HEAD；创建新的 `codex/dev2-before-main-rebase-YYYYMMDD` 恢复分支，重名时另取唯一名称。
3. 变基时按 F1–F9 处理冲突，核对最新类型/设置字段。部署业务内容保留，主线架构与新增功能保留；不要用整文件 `ours` / `theirs` 跳过判断。
4. 完成后用 `git range-diff <旧共同祖先>..<恢复分支> main..dev2` 审查提交变化，用 `git diff main...dev2` 核查功能增量及是否回退主线代码。哈希变化是正常的，行为丢失不是。
5. 完成验证后确认工作区、恢复分支和提交范围。不擅自推送、强推或改写远端分支；不为匹配旧数量而自行压缩提交。

### 7.2 自动校验

在仓库根目录使用满足当前依赖要求的 Node.js（可优先使用 Node 24）和 npm。先构建，再运行定向与全量测试；启动期 Node/依赖错误应与测试断言失败区分。

主线开发/发布环境使用 Node 24。Windows 需使用同一 Node 安装对应的 npm，避免 PATH 中的 Node 已更新但 `npm.ps1` 仍调用其安装目录的旧 Node。

```powershell
npm run build
npm test -- --run src/lib/serverSettings.test.ts src/lib/persistedState.test.ts src/store.test.ts src/lib/apiProfiles.test.ts src/lib/presetAgent.test.ts src/lib/devProxy.test.ts src/lib/taskState.test.ts
npm test -- --run src/lib/tauriStorage.test.ts src/hooks/useImportLinks.test.ts src/lib/paramCompatibility.test.ts
npm test -- --run
git diff --check
Get-Content public/app-config.json -Raw | ConvertFrom-Json | Out-Null
docker compose -f deploy/docker-compose.dist.yml config
```

部署脚本只做语法解析，不执行脚本：

```powershell
$deployTokens = $null
$deployErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'deploy/build-dist-image.ps1'), [ref]$deployTokens, [ref]$deployErrors) | Out-Null
if ($deployErrors.Count) { throw ($deployErrors | Out-String) }
```

若缺少 Docker CLI 或测试运行环境，明确记为未验证，不用阅读配置代替实际执行结果。

依赖变化时按 AGENTS.md 运行 `npm run notices`；它需要 Rust/Cargo 和 cargo-about。缺少工具链时保留主线现有许可清单，明确记录未能重新生成，不临时删除许可生成要求。未修改安装器或 Rust 代码不等于安装包已实测。

定向测试至少核对以下组合；主线新增字段时扩展测试，不删断言绕过冲突：

- 服务器协议及 profile ID 校验；顶层/全部 profile 的服务器 Key 清除；新 API 属性经解析、缓存、Key 注入后保留正确语义。
- 加载失败使用缓存/内置设置；默认服务关闭再开启恢复备份与当前 Key；旧 main/dev 持久化数据升级。
- 画廊与 Agent 双 profile 的 `native` / `hybrid` Key 注入，非使用配置仍为空。
- 合法/非法模型选择、跨持久化恢复、服务器删模型后的回退，以及随模型选择提交的其它受控字段不能覆盖服务器参数。
- 批量、画板及其它本地习惯跨服务器刷新/模式切换保留；主线预置 Agent 字段和任务临时模型状态正确处理。
- 重试偏好合法值/旧数据缺省/非法值回退，关闭成功任务重试后的降级；默认服务下覆盖式重试使用服务器 profile 与本地 Key，缓存仍无 Key。
- 颜色、字体、快捷键、自动更新、日志、保存位置和收藏夹偏好的逐字段修改及跨刷新/模式恢复；桌面旧版本 2 数据和带服务器标记的版本 4 数据恢复。
- 链接 Key 的确认/取消及自定义模式原有导入行为；受控 API 参数不能被链接覆盖。

### 7.3 手动验收与未实测边界

- 设置页：默认服务首次开启；按画廊/Agent 展示对应只读配置；本地 Key 和习惯可改，profile 编辑入口不可用。
- 首页：切换服务器列表中的模型，刷新仍保留；服务器移除模型后正常回退；切换模式请求使用正确 profile 和 Key。
- 自定义模式：关闭默认服务后恢复原配置，编辑后重新开启不会污染服务器配置；再次关闭能恢复新备份。
- 主线：实际操作画板、批量提交、Agent 对话与草稿、收藏及任务复用，避免只测新增服务器模块。
- 代理：支持代理的构建中入口可见，开启后浏览器请求为同源 `/api-proxy/...`；实际部署时上游路径（含 `/v1`）、Key 转发和流式返回正确。
- PWA/配置：修改外置配置后刷新获得新内容，Service Worker 不返回旧 `app-config.json`。

自动测试、构建和 Compose 配置解析不能证明浏览器交互、容器运行或真实上游 API 可用。交接时分别列出已执行和未执行的项目；真实请求/启动容器须在授权和可用环境内完成。

## 8. 当前提交索引

以下索引用于定位当前功能的来历，不是未来固定的提交哈希，也不能替代最终行为检查。

| 当前提交 | 功能来源 |
| --- | --- |
| `076b062` | 服务器下发设置、默认服务、本地习惯/Key/备份隔离、持久化与测试。 |
| `728e446` | dist Dockerfile、Compose、PowerShell 构建脚本及部署防护。 |
| `49b108c` | 站点品牌与页头链接。 |
| `1df4b0a` | 业务部署配置调整。 |
| `9e49932` | 历史服务器 profile 切换及密钥隔离；手动切换部分已被后续提交取代。 |
| `e271a5e` | 前端代理构建方法及环境变量文档。 |
| `8d954aa` | 服务器配置与图片工具模型相关配置/说明调整。 |
| `43f2602` | 画廊与 Agent 自动分流及最终业务配置/文档。 |
| `388a00d` | 主线多模型选择、批量与画板本地偏好、预置 Agent 持久化兼容。 |
| `3792ed3` | 主线重试方式的服务器模式本地偏好、配置示例及持久化/实际调用回归覆盖。 |
| `d4de2e1` | 首版功能保留文档与 README 入口。 |
| `c26aaab` | v0.8.8 新偏好、SVG 模型、链接确认、Web/桌面隔离、版本 2/4 迁移及 dist 字体部署兼容。 |

## 9. v0.7.17 变基验证记录（2026-10-09）

- 原有 9 个提交全部重放，`range-diff` 显示补丁等价；另增 `c8560ae` 补齐重试偏好兼容，不推送远端。
- Node 24.19.0 下普通生产构建和支持代理的生产构建均通过；构建产物的服务器配置包含 `retryMode: "new"`。
- 定向测试 7 个文件、301 项通过；完整测试 37 个文件、656 项通过。
- `git diff --check`、服务器 JSON/空 Key 校验、PowerShell 部署脚本语法及 Docker Compose 配置展开通过，未启动容器。
- 主线类型、API 归一化、任务状态、任务卡片/详情、习惯设置、Agent API、输入与画板等重点文件与 `main` 一致；dev2 部署、品牌及 Vite 配置与变基前一致。
- 浏览器交互、容器运行和真实上游 API 请求未实测；不能将上述自动校验扩大解释为实际部署已验证。

## 10. v0.8.8 变基验证记录（2026-11-06）

- `main` 与 `v0.8.8` 标签均为 `7ae7dec`；原有 11 个提交全部重放，保留 `codex/dev2-before-main-rebase-20261106` 恢复分支，无远端推送。
- 冲突按主线架构移植，保留链接确认、SQLite kv 选择、下拉框滚动容器、颜色启动脚本和 Service Worker 顶层导航保护；README 不删除主线章节。
- 新增 10 项本地偏好及 `svgModel` 部署示例和回归覆盖；API Key 确认后注入，不直接自动导入；桌面端隔离 Web 服务器模式。
- Node 24.19.0 下最终普通生产构建通过；支持代理的构建及字体占位符检查通过；dist 脚本的全部运行时占位符另作产物校验。
- 定向测试首次 8 个文件 339 项通过；最终完整测试 68 个文件通过，934 项通过、1 项跳过。跳过项为主线已有的 fal SVG `provider_options` 测试，没有因变基新增跳过。
- PowerShell 部署脚本语法、服务器 JSON/空 Key/SVG 属性、Compose 配置展开和 `git diff --check` 通过；未启动容器。
- Rust 工程、依赖锁文件、现有第三方许可清单、CLI、原生请求、API 参数、隐私/外观核心和输入/画板组件与主线一致。
- 本机没有 Rust/Cargo，`npm run notices` 因 `cargo ENOENT` 未能重新生成，保留主线清单；Windows 安装包/原生运行、浏览器交互、容器运行和真实上游 API 请求未实测。
