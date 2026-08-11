# HexBridge 项目记忆

> 最后更新：2026-08-12
> 当前基线：`v0.1.0` 首次代码审查修复后，本地 root commit 已创建、远端 push 待授权，尚未完成 Windows / WeGame 实机验收。
> 用途：记录不可丢失的产品边界、接口契约、审查缺陷和发布状态。后续修复应更新对应条目的“状态 / 验证”，不要另建平行记忆文档。

## 记忆维护规则

- 本文件不得记录 LCU token、API Key、PUUID、完整选人 session、截图内容或任何用户身份信息。
- 缺陷状态只使用：`OPEN`、`IN PROGRESS`、`FIXED / UNVERIFIED`、`VERIFIED`、`ACCEPTED RISK`。
- 将缺陷标为 `VERIFIED` 前，必须记录对应自动化测试；涉及 LCU、OCR、DPI、安装器或 Windows 安全存储的事项还要记录 Windows 实机结果。
- 修改产品边界、接口字段、缓存格式或发布流程时，先更新相应“契约”，再在文末变更记录追加一行。
- 不把“构建成功”等同于“Windows 实机可用”，也不把合成 OCR 烟测等同于真实游戏画面验收。

## 一、项目目标与硬边界

HexBridge 是面向 Windows 10/11 x64、国服 / WeGame、简体中文的海克斯大乱斗个人实验助手。V1 只对 `queueId=2400` 激活：选人阶段展示当前英雄和备战席英雄的 Tier / 胜率；对局中本地识别实际出现的三张海克斯并给出相对推荐。

不可突破的边界：

- LCU 只读。不得换英雄、交易、修改符文或装备集，不得调用任何 LCU 写接口。
- 不注入游戏进程，不自动点击，不替玩家完成英雄或海克斯选择。
- 不做账号系统、云后端、遥测、战绩上传或静默更新。
- 每位用户自行提供 `data.dtodo.cn` API Key；Renderer 永远不能读取明文 Key。
- 不保存或展示海克斯胜率、胜局、场次、pickRate；英雄胜率与 Tier 可以展示。
- 默认不保存截图；诊断模式也只能保存三张海克斯标题裁切区，绝不能保存完整屏幕。
- 定位为个人实验工具。Riot 当前政策对强化胜率展示、替玩家决策类产品存在风险；扩大分发前必须重新评估政策和数据授权。
- 许可为 PolyForm Noncommercial 1.0.0（source-available，非 OSI 开源）。Mineradio 仅是视觉理念参考，不复制其 GPL 代码、素材、品牌或原创视觉表达。

## 二、技术栈与关键模块

- Electron 43、Vue 3、TypeScript、electron-vite、electron-builder。
- `src/main/index.ts`：单实例、托盘、F8 全局热键、生命周期。
- `src/main/runtime.ts`：聚合 LCU、数据、OCR、推荐和窗口状态；当前主要状态机入口。
- `src/main/runtime-guards.ts`：snapshot 去重、OCR 启停、英雄详情提交与版本匹配守卫的可测试纯函数。
- `src/main/lcu/`：凭据发现、只读 HTTPS / WebSocket 客户端、session 归一化。
- `src/main/data-service.ts`：上游请求、Key 验证、版本缓存、错误状态。
- `src/main/ocr/`：显示器截取、门控、裁切和 PaddleOCR / ONNX 推理。
- `src/main/window-manager.ts`：主窗口、选人浮窗、海克斯浮窗、校准窗口。
- `src/main/ipc.ts` + `src/preload/index.ts`：Renderer 的唯一业务边界。
- `src/shared/data-normalize.ts`：上游字段白名单与隐私清洗。
- `src/shared/recommendations.ts`：英雄和海克斯的纯函数排序规则。
- `src/renderer/`：实时助手、英雄榜、设置、诊断及三个伴随窗口界面。

## 三、接口契约

### 3.1 LCU 只读契约

凭据发现顺序 / 来源：

1. Windows CIM 读取 `LeagueClientUx.exe` / `LeagueClient.exe` 命令行中的 `--app-port` 和 `--remoting-auth-token`。
2. 进程相邻目录或手动游戏目录中的 `lockfile`。
3. 已知日志目录中最新 `LeagueClientUx*.log` 的尾部。

允许的 LCU 请求仅为以下 `GET`：

- `/lol-gameflow/v1/gameflow-phase`
- `/lol-gameflow/v1/session`
- `/lol-champ-select/v1/session`
- `/lol-champ-select/v1/current-champion`
- `/riotclient/region-locale`

同步契约：WAMP WebSocket 订阅 `OnJsonApiEvent`，同时保留 1 秒轮询兜底；401、超时或连接错误使凭据失效并触发重新发现。不得将 token 或带凭据 URL 写入日志。

统一输出 `ChampSelectSnapshot`：`phase`、`locale`、`queueId`、`modeActive`、`currentChampionId`、去重后的 `benchChampionIds`、`benchEnabled`、`updatedAt`。`modeActive` 当且仅当 `queueId===2400`。`carryForwardMatchContext()` 只在 `GameStart / InProgress / Reconnect` 中携带上一阶段已确认的 2400 队列和英雄；进入结束阶段、其他队列或新非比赛上下文时不得继续携带。

### 3.2 上游 API 契约

HexBridge 使用文档化的第三方接口 `https://data.dtodo.cn/api/v1/zh-CN/*`，不依赖 ARAMGG 官方客户端的 `/api/client/v1/*` 通道。

- `GET config.json`：公开配置，读取 `gamePatch`、`dataVersion`、`publishedAt`；缺失或空 `dataVersion` 时不得进入 `ready`，也不得用 `unknown` 版本写新缓存。
- `HEAD champions.json`：验证用户 Key，不消耗数据 credits。
- `GET champions.json`：版本变化或强制刷新时下载英雄目录。
- `GET augments.json`：版本变化或强制刷新时下载海克斯目录。
- `GET champions/{id}.json`：当前英雄的同版本详情缺失时按需获取。
- 鉴权：`Authorization: Bearer <user key>`，只允许主进程构造。
- Key 格式：当前接受 `hx_live_...` 或 `hx_test_...`；验证成功后才持久化。
- 状态：`missing | ready | stale | unauthorized | limited | offline | error`。401→`unauthorized`，429→`limited`，断网 / 超时→`offline`；存在旧目录时允许回退为 `stale`，但 UI 必须明确标记过期。
- 初始化和同英雄详情请求必须合并在途 Promise，避免并发重复消耗 credits 或重复写缓存；缓存恢复时用 `current.json` 恢复 `dataVersion`。
- Key 验证必须把候选 Key 直接用于 HEAD 请求，成功后才写入加密配置；失败时不持久化候选值，并保留原有有效 Key。

上游清洗白名单：

- 英雄：ID、alias、名称、称号、角色、图标、原画 URL、Tier、英雄胜率、补丁、日期、来源。
- 海克斯目录：ID、名称、图标、稀有度、稀有度名称、去 HTML 的描述、全局 Tier。
- 英雄专属海克斯：仅 `augmentId`、`rank`、`total`、`tier`。这里的 `total` 是排名总数，不是对局场次。
- 必须丢弃：海克斯 `winRate`、`wins`、`games`、`pickRate` 及其他未列字段。

### 3.3 IPC 契约

安全基线：`contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`、`webSecurity=true`、CSP；窗口拒绝新窗口。开发导航只允许与配置入口精确相同的 origin、pathname、search（hash 可用于四个内部窗口），生产导航只允许解析后精确等于打包 `dist/index.html` 的 `file:` 入口；`will-navigate` 与 `will-redirect` 使用同一守卫。Preload 只暴露 `window.hexbridge`，不暴露 Node、文件系统、网络客户端、LCU 凭据或 API Key。

允许的业务调用：

- `getState()` / `onStateChanged(callback)`
- `updateSettings(patch)`：只允许视觉模式、自动 OCR、两个浮窗开关、热键、游戏目录、显示器、校准区域、诊断截图开关。
- `validateAndSaveApiKey(key)` / `clearApiKey()`
- `refreshData()` / `triggerOcr()`
- `clearDiagnosticScreenshots()`
- `startCalibration()` / `completeCalibration(rects)` / `cancelCalibration()`
- `windowAction(minimize|maximize|close|quit)`

校准矩形必须含左 / 中 / 右三块，`x/y/width/height` 均为 `[0,1]` 内数值、宽高大于 0，且不得越过归一化屏幕边界。Renderer 输入仍需在主进程重新校验。

### 3.4 OCR 契约

- `desktopCapturer` 只截取用户设置的显示器；依据 `bounds × scaleFactor` 请求物理尺寸。
- 默认标题区域使用归一化矩形，用户可以依次拖框校准左 / 中 / 右标题。
- 每 750ms 只做一个扫描任务；`busy` 时拒绝重入。
- 先对三块裁切做低成本灰度信号门控，至少两块命中才启动 OCR。
- 三块按左 / 中 / 右串行识别，中文标准化后精确或模糊匹配；置信度阈值不得低于 90%。
- 三张全部可靠识别才自动展示；组合去重；连续 3 次丢失后隐藏。F8 只强制重新截图 / 识别，不发送键鼠事件。
- 自动扫描只在 LCU 已连接且 `InProgress + queueId=2400` 时运行；断线 / 离局立即停表。在途扫描结束后必须再次检查连接和阶段，不能让旧结果重新显示浮窗。
- 当前英雄变化时应先立即同步 snapshot / 候选 UI，再在后台非阻塞补齐英雄详情；详情返回后仅在 `championId + requestSequence + dataVersion` 仍匹配时二次同步，不能让上游请求阻塞 1.5 秒界面刷新目标。
- 游戏要求无边框模式；独占全屏不在 V1 保证范围。

## 四、缓存、密钥与日志规则

- API Key 使用 Electron `safeStorage` 加密后写入 `electron-store`；若系统不支持安全存储则拒绝保存，不允许明文降级。
- 数据缓存位于 Electron `userData/data-cache`。
- 目录文件：`champions-{dataVersion}.json`、`augments-{dataVersion}.json`；`current.json` 只保存当前版本指针。
- 详情文件：`champion-detail-{dataVersion}-{championId}.json`。
- 写入必须先写同目录 `.tmp`，再原子 rename；只有完整目录通过数量 / 结构检查后才能切换 `current.json`。
- 旧缓存可用于 401/429/断网回退，但 UI 和浮窗必须显示“数据已过期”，不能把缓存命中伪装成成功刷新。
- 日志只保留内存环形缓冲（当前上限 180 行）；必须过滤 LCU token、API Key、PUUID 风格长标识和含凭据 URL。
- 诊断截图目录固定为 `userData/ocr-diagnostics`；默认关闭，仅在用户按 F8 手动识别时保存三块标题裁切，最多保留 60 张 PNG，并通过诊断页业务 IPC 一键清除（见缺陷 HB-008）。

## 五、推荐规则

- 当前英雄单独置顶。
- 备战席按 Tier 升序、英雄胜率降序、英雄 ID 升序；缺统计排在可靠统计之后。
- 当前英雄与备战席的总体最优项标记 `isBest`；相对当前英雄的胜率差只有双方胜率都存在时才计算。
- 三张海克斯比较键依次为：英雄专属 `rank`、英雄专属 `tier`、全局 `tier`。
- 排名键相同显示“并列”；无可靠数据时 `position=null` 且显示“暂无可靠数据”，不得制造排序。

## 六、代码审查缺陷登记

以下缺陷均由 2026-08-12 首次上传前审查发现；“原始证据”表示审查前代码路径可证实，不代表已有真实用户事故。所有代码修复已落地；需要真实 LCU / OCR 行为或尚缺直接集成测试的条目保持 `FIXED / UNVERIFIED`。

### HB-001 GameStart 阶段丢失当前英雄

- 严重度：高
- 状态：`FIXED / UNVERIFIED`（自动化通过，真实 LCU 状态链待验）
- 原始证据：`LcuClient.tick()` 只在 `phase==='ChampSelect'` 读取当前英雄，并且只在 `phase==='InProgress'` 且新值为空时继承旧值。`GameStart` 会产出 `currentChampionId=null`，Runtime 随即清空详情和浮窗状态。
- 影响：ChampSelect→GameStart 的短暂阶段会丢英雄详情；进入 InProgress 后可能无法恢复英雄专属海克斯推荐。
- 修复原则：把英雄身份作为一局游戏的状态机数据，在同一 `queueId=2400` 的 ChampSelect→GameStart→InProgress 过渡中保留；只在可证明进入新会话 / 非对局阶段时清空，避免把上一局英雄带入第二局。
- 代码修复：新增 `carryForwardMatchContext()`；在 `GameStart / InProgress / Reconnect` 中保留上一阶段已确认的 queue 2400 与当前英雄，结束阶段或其他队列按新 snapshot 清理。
- 验证：`tests/lcu.test.ts` 已覆盖 ChampSelect(A)→GameStart(null)→InProgress(null) 携带和 EndOfGame 清理；31 项总测试通过。Reconnect、第二局、token 轮换和实际 WeGame session 仍需 Windows 实机验证。

### HB-002 英雄详情异步竞态

- 严重度：高
- 状态：`FIXED / UNVERIFIED`（守卫单测通过，完整异步集成序列待补）
- 原始证据：`refreshCurrentDetail()` 在异步返回后直接赋值 `this.detail`。`handleLcuUpdate()` 的 sequence 检查发生在该赋值之后；A→B 快速切换时，较晚返回的 A 请求可覆盖 B 详情。
- 影响：OCR 识别三卡时可能用错误英雄的 rank/tier 排序。
- 修复原则：请求捕获预期 `championId` 和 generation；只在返回时仍匹配当前英雄 / 当前版本 / 最新 generation 才提交。排名前再次确认 `detail.championId===snapshot.currentChampionId`，不匹配则按无详情处理。
- 代码修复：Runtime 用 `championId + championRequestSequence` 守卫详情提交；排名前通过 `detailRanksForCurrentChampion()` 再校验 `championId + dataVersion`。DataService 合并同英雄在途详情请求。LCU 更新路径改为先同步 snapshot，再非阻塞后台补详情，详情仍匹配时才二次同步，避免上游请求阻塞选人界面刷新。
- 验证：`tests/runtime-guards.test.ts` 已覆盖过期 sequence 拒绝、错误英雄和错误版本详情不参与排名；31 项总测试、lint、typecheck、build 通过。尚缺用可控 Promise 覆盖 A/B 乱序返回以及“snapshot 立即 sync、详情后到”的 Runtime 集成测试。

### HB-003 LCU 断线后 OCR 继续运行

- 严重度：高
- 状态：`FIXED / UNVERIFIED`（启停守卫单测通过，真实断线与在途 OCR 待验）
- 原始证据：LCU `invalidate()` 将连接标为断开但保留旧 snapshot；若旧状态是 `InProgress + modeActive`，`updateScanLoop()` 不检查 `lcuState.connected`，750ms 扫描会继续。
- 影响：客户端 / 游戏结束或 LCU 重启期间持续截屏与 OCR，浪费资源并可能保留错误浮窗。
- 修复原则：自动扫描和手动触发都必须要求 LCU 已连接、当前阶段 InProgress、queue 2400；断线立即停止 timer 并隐藏 / 失效化推荐。重连且状态重新确认后再启动。
- 代码修复：`shouldRunOcr()` 加入 LCU connected 条件；自动和 F8 入口均 fail closed；断线 / 离局清空 overlay 并停表；scanner Promise 返回后再次校验连接、阶段和队列，防止在途旧结果重现浮窗。
- 验证：`tests/runtime-guards.test.ts` 已覆盖断线时 OCR 守卫为 false；31 项总测试通过。尚需受控 scanner 集成测试及 Windows 实机断线 / 重连验收。

### HB-004 生产环境静默回退 Demo API

- 严重度：高
- 状态：`VERIFIED`
- 原始证据：Renderer 直接使用 `window.hexbridge ?? demoApi`。打包环境若 preload 加载失败，会展示真实感演示数据，且 Key 验证 / 刷新 / OCR 返回假的成功消息。
- 影响：用户无法区分真实助手与演示状态，可能据此作出错误决策；安全故障被静默隐藏。
- 修复原则：demo 只能在明确的开发 / 浏览器预览条件下启用；生产构建缺失 bridge 必须 fail closed，显示“主进程桥接不可用”，禁用所有业务操作并记录可诊断错误。
- 代码修复：演示数据拆到动态模块，只有 `import.meta.env.DEV && VITE_HEXBRIDGE_DEMO==='true'` 才加载；生产缺 bridge 使用空状态与全部失败的 unavailable API，明确显示安全桥接错误。
- 验证：生产 renderer 构建产物已检查不含 demo payload；typecheck、build 通过。浏览器 demo 仍需显式环境变量，正式产物不会静默演示。

### HB-005 OCR 模型供应链未固定 / 未校验

- 严重度：高
- 状态：`VERIFIED`
- 原始证据：下载脚本使用 Hugging Face `resolve/main` 可变 URL，仅按最小文件大小接受下载和已存在文件，没有固定 revision 或 SHA-256；字典来自第三方仓库。
- 影响：上游内容变化、缓存污染或供应链攻击可把未经确认的模型 / 字典带入 GitHub Release。
- 修复原则：固定不可变 revision，记录每个文件的来源、许可证、精确字节数与 SHA-256；下载后和复用本地文件前都校验摘要；校验失败不得覆盖已知良好文件；CI 必须同样验证。
- 代码修复：检测模型、识别模型、字典分别固定到 3 个完整 Hugging Face commit；脚本对已有文件与下载文件同时校验精确字节数和 SHA-256。GitHub Actions 自身 actions 也固定到完整 commit SHA。
- 验证：本地三个 OCR asset checksum 全部通过，OCR smoke 输出 `HEXBRIDGE OCR`，Windows x64 目标打包通过。首个远端 GitHub Actions run 尚未发生，但供应链门禁已写入 workflow。

### HB-006 手动刷新误报成功

- 严重度：中
- 状态：`FIXED / UNVERIFIED`（数据层测试通过，Runtime / 缺版本返回文案缺直接测试）
- 原始证据：`DataService.initialize()` 捕获请求异常并只更新内部状态，不向调用者抛出；`runtime.refreshData()` 因而可在 401、429、offline / stale 后仍返回 `{ok:true, message:'数据已刷新'}`。
- 影响：UI toast 与真实数据状态冲突，用户误以为已拿到最新数据。
- 修复原则：刷新结果必须显式区分“已更新”“无需更新”“使用旧缓存”“刷新失败”；只有成功取得 / 验证目标版本才返回 `ok:true`。旧缓存仍可用，但 message 和状态必须说明 stale。
- 代码修复：`DataService.initialize()` 返回实际 `ApiConnectionState`，上游 config 缺空 `dataVersion` 时拒绝进入 ready。Runtime 先检查目录刷新状态，再在当前英雄详情完成后检查最终状态；目录成功但详情 429 / 断网也返回 `ok:false`。详情请求回退旧详情时把 limited / offline / error 统一标为 stale，并明确说明正在使用旧缓存。初始化和详情请求已去重，缓存恢复会恢复 dataVersion；候选 Key 在 HEAD 成功前不持久化。
- 验证：数据服务测试覆盖 401、Key 成功前不落盘、429、离线旧缓存 / dataVersion 恢复和并发 initialize 去重；31 项总测试通过。尚缺 config 缺 dataVersion、详情回退 stale 和 `runtime.refreshData()` 各 message / ok 组合的直接测试及真实上游验收。

### HB-007 全量状态广播过量

- 严重度：中
- 状态：`FIXED / UNVERIFIED`（snapshot 去重单测通过，窗口 IPC 缺直接测试）
- 原始证据：每次 1 秒 LCU tick 和多数 750ms OCR 未命中都会调用 `sync()`；`WindowManager.broadcast()` 将含完整英雄目录和最多 180 行日志的整个 `RuntimeState` 发给所有窗口，即使状态没有实质变化。
- 影响：序列化、IPC 和四个 Renderer 的响应式更新产生不必要 CPU / 内存 / GPU 开销，与“隐藏时暂停非必要工作”的目标冲突。
- 修复原则：对物质状态做 revision / 去重；按窗口发送所需切片，或至少不在相同 snapshot / 未命中状态上广播；诊断指标可低频节流。首次订阅和真正变化必须立即送达。
- 代码修复：`sameSnapshot()` 忽略仅 timestamp 的 tick，`sameLcuState()` 去重连接状态；OCR 仅在 overlay 实质变化时 sync；`WindowManager` 只向可见窗口广播，并在隐藏窗口重新显示时发送 latest state。英雄变化的 snapshot 在详情后台请求前立即同步。
- 验证：`tests/runtime-guards.test.ts` 覆盖 timestamp-only snapshot 相同与英雄变化不同；31 项总测试通过。尚缺 BrowserWindow mock 验证隐藏窗口零 IPC、显示时只补发一次，以及性能实测。

### HB-008 诊断截图缺少生命周期控制

- 严重度：中
- 状态：`FIXED / UNVERIFIED`（代码落地，文件生命周期测试待补）
- 原始证据：诊断模式每次扫描向 `userData/ocr-diagnostics` 写三张带时间戳 PNG；当前没有数量 / 容量 / TTL 上限，也没有清除入口。默认关闭且只保存标题裁切是已有保护，但不足以控制长期累积。
- 影响：磁盘无界增长，游戏界面文字在本地保留时间不可控。
- 修复原则：保持默认关闭；启用时给出本地保存提示；设置数量 / 总容量 / TTL 上限并在写入时清理；提供显式清除；继续禁止完整截图，日志不得记录图像内容。
- 代码修复：只有设置开启且 `manual=true`（F8）时保存三块标题裁切；写入前按文件名排序清理，最多保留 60 张 PNG；新增类型化 `clearDiagnosticScreenshots()` IPC 和诊断页清除按钮，目录固定在 `userData/ocr-diagnostics`。
- 验证：lint、typecheck、build 通过。尚缺临时目录测试验证自动扫描零写入、61+ 文件淘汰、固定目录清除边界；真实截图隐私与多次 F8 需实机验收。

### HB-009 生产依赖存在高危审计项

- 严重度：高
- 状态：`VERIFIED`
- 原始证据：2026-08-12 执行 `npm audit --package-lock-only --omit=dev` 报告 3 个 high：直接依赖 `ws@8.18.3` 命中 GHSA-58qx-3vcg-4xpx 与 GHSA-96hv-2xvq-fx4p；`onnxruntime-node@1.27.0` 经 `adm-zip<0.6.0` 命中 GHSA-xcpc-8h2w-3j85。
- 影响：WebSocket 可能发生内存泄露 / DoS；ONNX 安装依赖的 ZIP 处理可被构造输入触发高内存分配。实际可达性不同，但上传前不能忽略。
- 修复原则：`ws` 升级到已修复稳定版（审计建议至少 8.21.x）；ONNX 链路需选择经过 OCR 与 Windows 打包验证的安全版本或安全的依赖覆盖，不能为消除报告而盲目降级。更新 lockfile 后重新审计并记录任何无法消除项的可达性和临时缓解。
- 代码修复：`ws=8.21.3`；用 package override 固定 `onnxruntime-node` 的 `adm-zip=0.6.0`；同时升级 / 固定 `vite=7.3.6` 与顶层 `esbuild=0.28.1`，lockfile 已重建。
- 验证：全新 `npm ci` 成功；`npm audit` 全量与 `npm audit --omit=dev` 均为 0 vulnerabilities；31 tests、OCR checksum、OCR smoke、lint、typecheck、build、Windows x64 目标打包全部通过。

### HB-010 lint 命令不可执行

- 严重度：中
- 状态：`VERIFIED`
- 原始证据：`package.json` 有 `lint: "eslint ."`，但没有 ESLint 依赖和配置；GitHub Release workflow 也没有执行 lint。
- 影响：发布流程看似有静态检查入口，实际上无法复现，上传前可能遗漏未使用代码、Promise / 安全规则问题。
- 修复原则：加入与 TypeScript + Vue SFC + Node/Electron 匹配的 ESLint flat config 和固定依赖；排除构建产物 / 模型；把 `npm run lint` 加入 CI。规则应优先捕捉实际错误，不以大规模格式化掩盖功能修复。
- 代码修复：新增 ESLint flat config，覆盖 TypeScript、Vue SFC、Node / Electron 环境并忽略构建与模型产物；所需依赖已固定；Release workflow 在测试后执行 `npm run lint`，并在此前执行 audit。
- 验证：全新 `npm ci` 后 `npm run lint` 通过；typecheck / build 通过；workflow 已包含 audit 与 lint 门禁。首个远端 CI run 尚未发生。

### 附带安全与性能加固

- 导航：由前缀字符串判断改为开发环境精确 origin / pathname / search allowlist，以及生产环境精确 `file:` entry allowlist；同时守卫 navigate 与 redirect。
- 数据请求：初始化与同英雄详情请求合并在途 Promise；缓存恢复同步恢复 dataVersion；候选 Key 在 HEAD 验证成功前不持久化。
- 响应速度：英雄 / snapshot 变化立即同步，详情后台非阻塞补齐；详情到达且 sequence 仍匹配才再次同步，不把 API 延迟计入选人 UI 刷新路径。

## 七、当前自动化验证基线

2026-08-12 审查修复后基线：

- 删除依赖后全新 `npm ci` 成功。
- 7 个测试文件、31 项 Vitest 测试通过。
- `npm run lint`、Vue / TypeScript typecheck、electron-vite build 全部通过。
- `npm audit` 全量与 `npm audit --omit=dev` 均为 0 vulnerabilities。
- 三个 PaddleOCR asset 的固定字节数和 SHA-256 校验通过；合成 OCR smoke 输出 `HEXBRIDGE OCR`。
- 生产 renderer bundle 已检查不含 demo payload。
- electron-builder 的 Windows x64 NSIS + ZIP 目标打包通过。
- 审查前已对主界面、设置、英雄榜、选人浮窗和三卡浮窗做过浏览器视觉检查，未见控制台错误。

现有测试覆盖：上游字段清洗、401 / 429 / 离线缓存、Key 验证前不落盘、初始化去重、缓存 dataVersion 恢复、LCU 凭据解析与 snapshot 归一化、GameStart 携带 / EndOfGame 清理、只读 allowlist、1080p / 2K / 4K 裁切几何、OCR 文本匹配、英雄 / 海克斯排序、sequence / 详情版本 / OCR 启停 / snapshot 去重守卫。HB-002 的完整乱序请求、HB-003 的在途扫描断线、HB-006 的 Runtime toast、HB-007 的窗口 IPC 和 HB-008 的文件保留边界仍缺直接集成测试。

## 八、Windows / 游戏实机待验证

- Windows 10 与 Windows 11 x64 的安装、卸载、便携版启动、托盘、开机后首次 `safeStorage` 行为。
- WeGame / 国服客户端启动后 5 秒内发现 LCU；进程命令行、lockfile、日志、手动目录四种来源。
- 客户端重启、第二局、token / 端口轮换、ChampSelect→GameStart→InProgress→EndOfGame 全状态链。
- 抓取网络请求确认运行全程只出现白名单 LCU GET，没有写请求。
- 真实用户 Key 的 HEAD 验证、credits、生产数据字段、版本变化、401、429、断网与旧缓存恢复。
- 无边框游戏下真实三卡：稳定出现后约 1 秒展示，刷新动画期间不误识别，连续丢失正确隐藏，F8 重试。
- 1080p / 2K / 4K、100% / 125% / 150% DPI、多显示器、非主显示器、显示器热插拔和手动拖框校准。
- 单卡 / 双卡、长中文名、OCR 错字、缺图、相同组合、并列、无详情 / 旧详情。
- 游戏中浮窗不抢焦点、点击穿透、位置与卡位一致；主窗口隐藏 / 进入游戏后无持续背景渲染和明显 GPU 峰值。
- 未签名安装包的 SmartScreen 行为；当前不应宣称已代码签名。

## 九、发布与 GitHub 状态

- 当前 Git：分支 `main`；本地 root commit `Initial HexBridge v0.1.0` 已创建。该提交会因纳入本文件的后续记忆更新而 amend，因此不在提交自身内容中记录其可变哈希。
- GitHub CLI 已登录用户 `RocXOvO`，但当前 OAuth 授权缺少创建 / 更新 GitHub Actions workflow 所需的 `workflow` scope。不得在本文件记录任何认证 token。
- GitHub 私有仓库已创建：[RocXOvO/HexBridge](https://github.com/RocXOvO/HexBridge)，visibility 为 `PRIVATE`；本地 `origin` 已配置为该仓库的 HTTPS 地址。`main` push 因上述 scope 缺失被 GitHub 拒绝，远端尚无源码。
- 当前发布阻塞：等待用户运行 `gh auth refresh -h github.com -s workflow` 完成授权，然后原样保留 `.github/workflows/release.yml` 并重试推送。不得通过删除、移走或绕过 workflow 文件解决授权问题。
- `.gitignore` 排除 `release/`、`dist/`、`dist-electron/`、`node_modules/` 和 OCR `.onnx/.txt`。首次源码 push 不会包含本地二进制或模型。
- 预定发布方式：推送 `v*` tag，`.github/workflows/release.yml` 在 Windows runner 上执行 `npm ci`、audit、下载 / 校验模型、OCR 烟测、测试、lint、typecheck、Windows 打包、校验和，并创建 GitHub Release。所有第三方 GitHub Actions 已固定到完整 commit SHA。
- 本地已有但被忽略的审查修复后 `v0.1.0` 产物：
  - `HexBridge-0.1.0-x64.exe`，198,154,924 bytes，SHA-256 `a59f330bec8b0ca9acd2efcc486a9e6e943270bb93889703fa327a2e107cbd9b`。
  - `HexBridge-0.1.0-x64.zip`，273,612,228 bytes，SHA-256 `6bfd26d70f2e9583d31d6438bc993a309b081d990b91fdf060f207feba438bf4`。
- 最终 `pack:win` 与 `checksums` 均 exit 0。上述文件证明 Windows x64 目标可以打包，不证明其已在 Windows / WeGame 实机运行；首次远端 GitHub Actions 也尚未执行。
- 当前无商业 Windows 代码签名证书，发布物会显示“未知发布者”并可能触发 SmartScreen。

## 十、后续变更记录

按以下格式追加，不改写历史结论：

```text
YYYY-MM-DD | 缺陷/契约 ID | 状态变化 | 代码摘要 | 自动化验证 | Windows/实机验证 | 提交/PR
```

- 2026-08-12 | 初始记忆 | 创建 | 记录 v0.1.0 架构、硬边界、10 项上传前审查缺陷与发布状态 | 基线 23 tests / typecheck / build / OCR smoke | 待验证 | 尚无 commit
- 2026-08-12 | HB-001～HB-010 | OPEN→修复后状态 | 修复比赛上下文、详情竞态 / 非阻塞同步、断线 OCR、生产 demo、模型供应链、缺版本 / 目录 / 详情刷新结果、广播、截图保留、依赖审计和 lint；附带收紧导航、请求去重与 Key 先验后存 | 全新 npm ci；7 files / 31 tests；audit 0；lint / typecheck / build；模型 checksum；OCR smoke；Windows x64 目标 pack / checksums exit 0 | Windows / WeGame 真实运行仍待验证，未代码签名 | 尚无 commit / remote
- 2026-08-12 | GitHub 远端 | 已创建私有仓库 | 创建 `RocXOvO/HexBridge`（PRIVATE）并配置本地 `origin` | 远端 URL 与本地 remote 已复核 | 不涉及 | 等待首个源码 commit / push
- 2026-08-12 | 初始提交 / push | 本地已提交、远端阻塞 | 创建 root commit `Initial HexBridge v0.1.0`；向 `origin/main` 推送时因 OAuth 缺少 `workflow` scope 被 GitHub 拒绝 | 本地 commit 与 remote 已复核；提交将 amend 纳入后续记忆更新，不在提交自身记录可变哈希 | 不涉及 | 等待用户执行 `gh auth refresh -h github.com -s workflow` 后重试；远端仍无源码
