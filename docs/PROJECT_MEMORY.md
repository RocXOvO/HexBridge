# HexBridge 项目记忆

> 最后更新：2026-08-13
> 当前基线：公开最新且唯一保留的正式 Release 为 `v0.1.10`，annotated tag 固定指向产品 / 记忆提交 `345c0d5443760a9dcc6717a96a6068b6101b16d1`。正式 Windows tag workflow 以 132 tests 和完整发布门禁成功，public channel 的 version / path / size / SHA-512 与正式 EXE 一致。`v0.1.9` Release / assets 已按策略删除，但 `v0.1.0` 至 `v0.1.10` Git tags 与源码历史全部保留。HB-020 与 HB-022 均保持 `IN PROGRESS`：Windows runner、packaged smokes 与受控回放不等于报告用户同机真实 WeGame 选人与交接复验，绝不能标 `FIXED` / `VERIFIED`。项目无商业代码签名，旧版本用户此次建议手动覆盖安装 v0.1.10。
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

凭据发现策略 / 来源：

1. Windows CIM 与 `Get-Process` 两种 UTF-8 PowerShell 策略并行读取 `LeagueClientUx.exe` / `LeagueClient.exe` 命令行中的 `--app-port` 和 `--remoting-auth-token`。
2. 进程相邻目录、手动游戏目录和常见安装目录中的 `lockfile`。
3. 已知日志目录中最新 `LeagueClientUx*.log` 的尾部。

性能与去重契约：进程策略最长约 2.6 秒，目录扫描约 600ms，多候选只读 probe 约 1.0 秒，完整发现路径有界约 4.2 秒；日志目录与日志文件在进入读取前分别做全局去重，不能因同一路径来自多个来源而重复扫描或重复报告。候选 probe 并行执行，只有真实白名单 LCU GET 成功后才能进入 connected。

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

### 3.2.1 可整合数据源审计（方案，尚未实现）

本节记录 2026-08-12 的数据源可行性审计，不表示相应适配器已经进入代码。当前实现仍以 `data.dtodo.cn` 提供英雄 / 海克斯目录和英雄详情，并以 Riot Data Dragon URL 提供英雄原画。引入任何新来源前，必须单独确认缓存版本、字段白名单、许可、失败回退、隐私与测试。

数据源定位：

1. **data.dtodo.cn（当前主统计源）**
   - 继续作为国服 ARAM Mayhem 聚合英雄 Tier / 胜率，以及英雄专属海克斯 `rank/tier` 的主来源。
   - 仍须遵守本节上方的用户 Key、credits、版本缓存、stale 标记和字段清洗契约。
2. **CommunityDragon（建议的海克斯静态目录源，未接入）**
   - 版本化资源 `https://raw.communitydragon.org/{patch}/cdragon/arena/zh_cn.json` 可提供海克斯静态目录、简中名称 / 描述、ID、rarity 和 icon。
   - 该资源没有英雄胜率、Tier、英雄专属 rank/tier 等统计字段，不能替代 data.dtodo 的统计职责。
   - 生产缓存必须 pin 明确 patch / 版本并记录来源版本，不能依赖 `latest`；上游变化时应按静态元数据迁移而非悄悄改变同版本缓存。
3. **Riot Data Dragon（当前静态资产源）**
   - 用于英雄、物品、版本信息、头像和原画等 Riot 静态资产。
   - 不包含 ARAM Mayhem 聚合统计或三张海克斯推荐数据，不能作为本模式的统计源。
4. **本地 LCU Match History（可选个人样本，未接入）**
   - 候选只读 GET：`/lol-match-history/v1/products/lol/current-summoner/matches`、`/lol-match-history/v1/games/{gameId}`。
   - 仅适合在用户设备上形成个人历史样本，不能替代聚合 Tier / 胜率；属于非官方、可能变化的 LCU 接口。
   - 会接触 PUUID 和战绩隐私，默认不得上传、遥测或跨设备同步。若未来实现，必须另行扩展只读 allowlist、最小化保存字段、明确本地保留 / 删除策略，并增加接口变化与隐私回归测试。
5. **Live Client Data API（可选对局上下文，未接入）**
   - 本地 `127.0.0.1:2999` 可补充对局中的玩家、英雄、事件等上下文。
   - 不提供海克斯界面的三张候选卡，也不提供国服聚合胜率 / Tier，因此不能替代 OCR 或主统计源。
6. **League Wiki MediaWiki Action API（英文规则交叉校验，未接入）**
   - `Module:MayhemAugmentData/data` 可用于英文名称、禁用状态和规则的交叉校验。
   - 内容受 CC BY-SA 3.0 约束；任何纳入或衍生发布都必须满足署名与相同方式共享要求，并与 HexBridge 的 PolyForm Noncommercial 代码 / 数据产物做好许可隔离。不能无声明地复制进主目录。
7. **Meraki Analytics（静态英雄 / 物品扩展，未接入）**
   - MIT 许可的静态英雄与物品数据可作为 Data Dragon 的补充。
   - 不含 ARAM Mayhem stats，不能承担胜率、Tier 或英雄专属海克斯排名职责。
8. **Riot Match-V5（不可作为 Mayhem 主数据源）**
   - Riot `developer-relations` issue [#1109](https://github.com/RiotGames/developer-relations/issues/1109) 已关闭并标记为 expected behavior；Match-V5 查询 `queueId=2400` 返回 403。
   - 国服也不在 Riot 公共 API 路由内，因此 Match-V5 既不能覆盖本项目目标区域，也不能作为 Mayhem 主统计源或历史兜底。
9. **未文档化第三方站点接口（不采用）**
   - 对 OP.GG、U.GG、MetaSRC、PlayARAM、arammeta 等未发现可依赖的文档化公共 API。
   - 不把站点私有 XHR、逆向接口、Selenium / 浏览器抓取当作稳定生产上游；除稳定性外还涉及授权、反爬、字段漂移和再分发风险。

审计后的整合原则：聚合统计继续来自文档化且获授权的数据接口；静态海克斯元数据可评估 pin patch 的 CommunityDragon；Riot / Meraki 只补静态资产；LCU Match History 和 Live Client Data API 如接入也仅限本地最小化上下文；Wiki 只在满足 CC BY-SA 许可隔离时用于交叉校验；不使用私有网页抓取填补数据空缺。

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
- 验证：本地三个 OCR asset checksum 全部通过，OCR smoke 输出 `HEXBRIDGE OCR`，macOS 主机交叉构建 Windows x64 目标通过。首次 `v0.1.0` tag run 也已通过模型下载 / 校验和 OCR smoke；供应链门禁已在 Windows runner 执行到后续打包步骤。

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
- 验证：全新 `npm ci` 成功；`npm audit` 全量与 `npm audit --omit=dev` 均为 0 vulnerabilities；31 tests、OCR checksum、OCR smoke、lint、typecheck、build、macOS 主机交叉构建 Windows x64 目标全部通过。首次 `v0.1.0` tag run 的 Windows runner 也已通过 audit。

### HB-010 lint 命令不可执行

- 严重度：中
- 状态：`VERIFIED`
- 原始证据：`package.json` 有 `lint: "eslint ."`，但没有 ESLint 依赖和配置；GitHub Release workflow 也没有执行 lint。
- 影响：发布流程看似有静态检查入口，实际上无法复现，上传前可能遗漏未使用代码、Promise / 安全规则问题。
- 修复原则：加入与 TypeScript + Vue SFC + Node/Electron 匹配的 ESLint flat config 和固定依赖；排除构建产物 / 模型；把 `npm run lint` 加入 CI。规则应优先捕捉实际错误，不以大规模格式化掩盖功能修复。
- 代码修复：新增 ESLint flat config，覆盖 TypeScript、Vue SFC、Node / Electron 环境并忽略构建与模型产物；所需依赖已固定；Release workflow 在测试后执行 `npm run lint`，并在此前执行 audit。
- 验证：全新 `npm ci` 后 `npm run lint` 通过；typecheck / build 通过；workflow 已包含 audit 与 lint 门禁。首次 `v0.1.0` tag run 的 Windows runner 已实际通过 lint 与 typecheck。

### HB-011 electron-builder 在 tag 构建中隐式发布

- 严重度：高（Release 阻塞，不影响已构建应用的运行时逻辑）
- 状态：`VERIFIED`
- 原始证据：首次 `v0.1.0` tag workflow run [31517806148](https://github.com/RocXOvO/HexBridge/actions/runs/31517806148) 在 Windows `pack:win` 的最末阶段失败；此前的 `npm audit`、OCR models / smoke、31 tests、lint、typecheck 均通过。
- 根因：`electron-builder@26.15.3` 检测到 git tag 后隐式进入 publish 流程，但构建步骤没有也不应拥有 `GH_TOKEN`；同一 workflow 已另用 `softprops/action-gh-release` 负责 Release 上传，形成重复发布职责。
- 影响：NSIS / ZIP 构建流程在末尾被隐式发布错误判定为失败，后续 checksums、artifact upload 和 GitHub Release 创建均未执行。
- 修复原则：构建与发布职责必须分离。`electron-builder` 只产生本地 artifacts，唯一发布者为固定 commit SHA 的 `softprops/action-gh-release`；不得为了让 builder 隐式发布而扩大构建步骤 token 权限。
- 代码修复：`package.json` 的 `pack:win` 已增加 `--publish never`，显式禁止 electron-builder 发布；workflow 继续由 softprops 步骤上传 EXE、ZIP 和 `SHA256SUMS.txt`。
- 验证：macOS 本地完整执行 `npm run pack:win && npm run checksums` exit 0；随后 Windows Actions run [31519147662](https://github.com/RocXOvO/HexBridge/actions/runs/31519147662) 基于 commit `212a8f62` 成功，audit、OCR models / smoke、31 tests、lint、typecheck、pack:win、checksums、artifact upload、softprops Release 全部通过，耗时约 5m39s。GitHub Release 已实际创建，因此该 CI 缺陷完成验证；这仍不是 Windows / WeGame 应用运行验收。

### HB-012 sandboxed preload 以 ESM 输出导致安全桥接失效

- 严重度：阻断性（已发布应用的 Renderer 业务功能不可用）
- 状态：`VERIFIED`（preload / bridge / IPC / 安全偏好已由 source 与 Windows packaged EXE smoke 验证；不涵盖真实 WeGame / LCU 对局）
- 用户症状：安装 `v0.1.0` 后 Renderer 显示“安全桥接初始化失败”；界面壳仍能显示，但 `window.hexbridge` 不存在，所有依赖 IPC 的 LCU、数据、设置和 OCR 展示功能均不可用。
- 根因证据：`electron.vite.config.ts` 将 preload 强制输出为 `dist-electron/preload/index.mjs`；`window-manager.ts` 在 `sandbox=true` 的 BrowserWindow 中加载该 `.mjs`。构建产物首行为 ESM `import`。Electron 官方 ESM 文档明确 sandboxed preload 作为普通 JavaScript 运行，不支持 ESM imports，因此该组合必然在 preload 求值前失败。
- 复现：本机运行 `ELECTRON_ENABLE_LOGGING=1 npm run dev` 可 100% 复现 `Unable to load preload script ... index.mjs` 与 `SyntaxError: Cannot use import statement outside a module`；主窗口和两个伴随窗口均报错。与此同时主进程 OCR 模型仍正常加载，恰好解释“UI 能显示、Main 仍运行，但 bridge 缺失”的现象。
- 已排除：安装包 ASAR 内 preload 文件存在，解析后的路径也正确，因此不是文件漏打包或路径错误；问题与用户环境、WeGame、API Key 或重装无关。
- 原测试缺口：此前 7 个文件 / 31 项 unit tests 没有实际 preload / BrowserWindow 测试，Release workflow 只 build / package，不启动 Electron 应用，因此 HB-012 未被 CI 捕获。
- 代码修复：preload 改为单文件 CommonJS `dist-electron/preload/index.cjs`，Rollup 使用 `format: 'cjs' + inlineDynamicImports: true` 并移除 preload 的 dependency externalize，确保 sandbox 环境不含 ESM import；BrowserWindow 同步加载 `.cjs`。生产安全偏好继续保持 `sandbox=true`、`contextIsolation=true`、`webSecurity=true`、`nodeIntegration=false`，没有通过降低安全配置绕过问题。
- 诊断修复：`window-manager.ts` 新增受控 `preload-error` 监听，记录稳定错误代码、窗口名和错误类型；不把 preload 路径、错误正文或任何凭据直接写入应用日志。
- 回归门禁：新增 bundle verifier，要求 preload 目录只有 `index.cjs`、不含顶层 ESM import 且包含 Electron CommonJS require；新增真实 Electron source smoke，创建隐藏 BrowserWindow 后断言 `window.hexbridge`、`getState()` IPC 和四项安全偏好。Release workflow 增加 tag / package 版本一致性检查，并在 `pack:win` 后启动 `release/win-unpacked/HexBridge.exe` 执行同一 packaged smoke，再允许 checksums / 上传 / 发布。
- 本地验证：版本已升至 `0.1.1`。干净 `npm ci` 后，npm audit 0、31 tests、lint、typecheck、`git diff --check`、`verify:preload`、真实 source Electron bridge smoke 全部通过；macOS 主机交叉执行 `pack:win + checksums` exit 0。代码审查 subagent 未发现 P0 / P1；提出的 P2 smoke cleanup 已修复并重新运行通过。
- Windows 验证：workflow_dispatch run [31562903957](https://github.com/RocXOvO/HexBridge/actions/runs/31562903957) 基于 commit `2e6a726c9baae590c14d58cf4291a227ec05f3da` 成功；Windows x64 job [94008801457](https://github.com/RocXOvO/HexBridge/actions/runs/31562903957/job/94008801457) 用时约 4m40s。`npm run test:bridge:packaged` 实际启动 `release/win-unpacked/HexBridge.exe`，验证 CommonJS preload、`window.hexbridge`、`getState()` IPC 与四项安全偏好通过；同一 job 的 npm ci、audit、OCR、31 tests、lint、typecheck、pack:win、checksums、artifact upload 也全部通过。
- Release 验证：`v0.1.1` tag run [31563308769](https://github.com/RocXOvO/HexBridge/actions/runs/31563308769) / Windows x64 job [94009941106](https://github.com/RocXOvO/HexBridge/actions/runs/31563308769/job/94009941106) 基于 commit `e91926cad2ed8da40d9d03f1d33ffacc7a423c31` 成功，用时约 5m2s。tag / package 版本门禁、audit、OCR models / smoke、31 tests、lint、typecheck、pack:win、Windows packaged EXE bridge smoke、checksums、artifact upload 和 softprops Release 全部通过。
- 状态边界：HB-012 的技术修复及 tagged Windows packaged bridge 已验证，修复版 [v0.1.1](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.1) 已公开；`v0.1.0` 仍是已知损坏 Release，标题 / 说明已标“已知损坏，请勿下载”并指向 `v0.1.1`。packaged bridge smoke 是 Windows runner 上的最小启动验证，不包含安装器交互、真实 WeGame / 国服 LCU 连接、选人状态链或对局 OCR，因此不能宣称完成产品实机验收。

### HB-013 API Key“验证并保存”无可见响应

- 严重度：高（阻断上游数据初始化）
- 状态：`FIXED / UNVERIFIED`
- 用户症状：在 `v0.1.1` 设置页填写 API Key 后点击“验证并保存”，界面看起来没有任何反应。
- 代码修复：点击后立即进入 busy 并显示 inline 状态，提交路径用 `try/finally` 保证成功或失败都能解除 busy。合法 Key 完成 HEAD 验证和 `safeStorage` 加密保存后立即向用户返回成功；英雄 / 海克斯目录刷新改为后台执行，不再阻塞保存反馈。
- 错误与数据安全：Key 格式错误、401、429、Abort / 超时、offline、`safeStorage` 不可用均有区分文案；候选 Key 格式错误或验证失败时明确保留原有已验证 Key，不用失败候选覆盖旧值。界面和日志仍不得暴露 Key 明文。
- 自动化证据：相关修复已纳入当前 8 个测试文件 / 45 项测试及 lint、typecheck、diff-check、source bridge smoke 通过的本地基线；新增格式错误时保留旧 Key 的回归测试。尚无 Windows packaged 设置页和真实 Key 端到端证据，因此不能标记 `VERIFIED`。
- 必须验证的验收标准：点击后立即出现明确的进行中状态并防止重复提交；合法 Key 完成 HEAD 验证后仅以 `safeStorage` 加密形式持久化，界面明确显示成功且数据状态可继续进入初始化；401、429、断网、超时和本机加密不可用必须返回可区分、可操作的提示，失败 Key 不落盘；重启应用后可恢复已验证 Key 的可用状态；日志与 Renderer 状态不得暴露 Key 明文。需同时覆盖真实 packaged 应用、有效 / 无效 Key、首次保存与替换旧 Key。

### HB-014 OCR 三卡标题拖框校准交互不完整或含义不清

- 严重度：高（用户可能无法完成 OCR 前置配置，且黑屏式覆盖影响可恢复性）
- 状态：首帧黑屏 / Windows packaged 窄范围 `VERIFIED`；多显示器、DPI、真实游戏截图与完整三框识别仍 `FIXED / UNVERIFIED`
- 用户症状：“拖框校准三张标题”的含义不清；点击后除任务栏外的屏幕区域全部变黑，用户未看到可理解的后续操作。
- 确定根因：`CalibrationOverlay` 首次渲染时 `rects` 为空，但模板的 `v-show` 不会阻止 `:style="style(rects[slot])"` 求值；`style()` 直接读取 `undefined.x`，导致 Vue 首次 render / mount 抛错，最终 `#app.childElementCount === 0`，用户只看到校准页黑屏。
- 代码修复：`style(rect?)` 在 rect 缺失时返回空对象，避免首次渲染解引用 undefined；进入校准仍先隐藏主窗口并预热目标显示器截图，以内存截图作为底图，捕获设置 5 秒 deadline，校准 Renderer 同步挂载 / ready 后才显示覆盖窗口。`Esc`、取消、捕获 / 加载异常均恢复主窗口；显示器布局变化时清除旧框，保留安全诊断且不记录敏感内容。
- 多屏边界：已删除不安全的多屏 fallback；无法可靠确定目标显示器或捕获画面时必须失败退出并恢复，而不是展示可能来自错误屏幕的覆盖层。
- Windows packaged UI 证据：真实 CDP 驱动校准页，确认 1024×768 截图 data URL 可显示、中文说明计算字号为 14px、`#app` 成功挂载；发送 `Esc` 后校准窗口退出且主窗口恢复。该结果验证了已知首帧黑屏根因和 packaged Windows 的基本进入 / 退出路径。
- 剩余证据边界：unit tests 仍不覆盖 `WindowManager` / `desktopCapturer` 的所有异常、5 秒 deadline 或多屏变化；Windows UI smoke 使用受控截图，不等于 1080p / 2K / 4K、100%～150% DPI、多显示器或真实无边框游戏截图与完整三框 OCR。因此仅窄范围 `VERIFIED`，其余保持 `UNVERIFIED`。
- 必须验证的验收标准：进入前清楚说明需要在无边框游戏的海克斯界面依次框选左 / 中 / 右标题；进入后必须看到可辨识的捕获画面或明确设计的半透明遮罩、三个卡位标识、当前步骤、操作说明、确认与取消入口，不能只留下无说明的纯黑覆盖；`Esc` / 取消在任何阶段均能安全退出并恢复原窗口；捕获不可用时应直接退出并显示原因，不得把用户困在覆盖层；确认后保存基于目标显示器、分辨率和 DPI 的归一化区域，重新进入可正确回显；需在 1080p / 2K / 4K、100%～150% DPI、多显示器和无边框游戏 packaged 实机中验证三框裁切与 OCR 输入一致。

### HB-015 国服 / WeGame 已启动但 LCU 始终等待连接

- 严重度：阻断性（选人英雄读取与对局状态链不可用）
- 状态：`FIXED / UNVERIFIED`
- 用户症状：国服 / WeGame 客户端已经打开，`v0.1.1` 仍显示等待客户端，无法连接 LCU。
- 代码修复：Windows 进程发现改为 CIM 与 `Get-Process` 两种 UTF-8 PowerShell 策略并行；候选来源覆盖 command、相邻 lockfile、客户端日志、用户手动目录和常见安装目录。日志目录和日志文件分别全局去重；对去重后的多候选并行执行只读 probe，只有真实 LCU GET 成功后才进入 connected，不能仅凭解析到端口 / token 报已连接。CIM / 进程阶段约 2.6 秒、目录扫描约 600ms、probe 约 1.0 秒，完整发现有界约 4.2 秒。
- 状态与诊断：连接状态在发现 / 探测阶段提前 emit，降低 UI 长时间停留在无信息等待状态；逐来源、逐策略诊断保持脱敏，不记录 token、PUUID 或完整 session。30 秒是重复 debug 诊断日志的节流间隔，不代表每 30 秒生成一份新的发现报告。Windows packaged smoke 将断言 `Get-Process` strategy 返回 `ok` 或 `empty`，并覆盖 capture payload 的 Renderer 解码；这不等于真实中文安装路径、完整 LCU 发现或校准流程验收。
- 自动化证据：凭据发现 / snapshot 相关测试已扩充并纳入当前 8 个测试文件 / 45 项测试通过基线；Windows packaged smoke 已确认 `Get-Process` strategy 在 runner 上返回 `ok` 或 `empty`，但未使用真实中文安装路径或国服 WeGame / LCU，因此不能标记 `VERIFIED`。
- 必须验证的验收标准：在 Windows 10 / 11 x64 的真实国服 WeGame 环境中，客户端可用后 5 秒内经进程命令行、相邻 lockfile、用户指定目录或最新客户端日志中的至少一个受支持来源发现并验证当前 LCU 凭据；UI 从等待状态进入已连接并能只读获得 gameflow、queue、champ-select snapshot 和 locale；发现失败时诊断页显示脱敏的逐来源结果与可操作的下一步，但不记录 token、PUUID 或完整 session；客户端重启、第二局和 token / 端口轮换后能自动重连，结束或切换其他队列时正确清理上下文；网络抓包 / 请求审计确认只使用白名单 LCU GET 与事件订阅，不产生写请求。验收必须使用 packaged 应用和真实 WeGame / 国服 LCU，模拟 fixture 或 Windows 启动烟测不能替代。

### HB-016 客户端整体字体过小，中文可读性不足

- 严重度：中高（影响主流程、设置与诊断信息的持续可用性）
- 状态：`FIXED / UNVERIFIED`
- 用户症状：用户认为客户端整体字体太小。
- 代码修复：关键连接状态、错误提示和海克斯推荐理由统一提升到至少 14 CSS px，避免主流程信息落入辅助元信息字号。
- 自动化证据：样式修改已通过 lint、typecheck 与 source bridge smoke，但尚无逐页面视觉快照、计算字号审计和 Windows 100%～150% 缩放人工可读性证据，因此不能标记 `VERIFIED`。
- 必须验证的验收标准：Windows 100% 缩放下，主导航标签、正文、按钮 / 输入框 / 表单标签及诊断正文的计算字号均不得低于 14 CSS px；仅徽标、时间戳、表头辅助说明等非关键元信息可使用 12～13 CSS px，任何错误、连接状态、操作说明和可点击文字不得降到该辅助字号；中文使用既定 `Segoe UI Variable` / `Microsoft YaHei UI` 系统字体栈并保持正常字重、足够行高和清晰抗锯齿，不用字距压缩弥补空间；在 1080p / 2K / 4K、100% / 125% / 150% Windows 缩放、长英雄名 / 长诊断文案和主窗口最小支持尺寸下，无截断、重叠、异常换行或必须依赖系统放大镜的内容；主导航、实时助手、英雄榜、设置、诊断及两个浮窗需完成视觉快照和 Windows packaged 人工可读性验收。

### HB-017 未连接客户端时空状态缺少层次与轻量动态

- 严重度：中（不阻断功能，但影响首次使用反馈、等待感知和产品完成度）
- 状态：`FIXED / UNVERIFIED`
- 用户目标：客户端未连接 LCU 时，当前空状态过于静态，希望参考 Mineradio 的暗色层次和精细微交互增加一点动感。
- 代码修复：未连接空状态采用 HexBridge 独立实现的轻量动画；balanced 只播放一次引导动效，cinematic 使用低频环境变化，eco、`prefers-reduced-motion`、`InProgress` 及主窗口 hidden / 不可见状态均停用持续动画并回退静态表现。没有复制 Mineradio 的 GPL-3.0 代码、素材、品牌或具体原创视觉表达。
- 自动化证据：实现已通过 lint、typecheck 和 source bridge smoke；尚无三档视觉快照、reduced-motion 自动断言、窗口不可见重绘测量或 Windows packaged GPU / CPU 证据，因此不能标记 `VERIFIED`。
- 必须验证的验收标准：未连接状态应保留 HexBridge 独立的近黑蓝灰、雾青、暖金视觉语言，用克制的非粒子动态表达“正在发现客户端”，例如低频环境渐变、单次边框 / 状态脉冲或轻微层次呼吸；不得加入持续粒子、扫描线、3D 舞台、摄像机运动、高强度发光、动态噪点或 Mineradio 代码 / 素材。电影档和均衡档中动态应清楚可见但不干扰文字，普通状态切换遵守 160～240ms 微交互范围且不能暗示已经连接；省电档、`InProgress`、主窗口隐藏 / 最小化 / 不可见时必须停止持续动画并使用静态或仅必要显隐效果；`prefers-reduced-motion: reduce` 下完全静态且信息含义不丢失。需用三档性能模式、reduced-motion、连接 / 断开切换和窗口可见性做视觉快照，并在 packaged Windows 上确认后台无持续重绘和明显 GPU / CPU 峰值。

### HB-018 选人结束后对局上下文丢失，游戏内功能无法启动

- 严重度：阻断性（进入游戏后 OCR、海克斯推荐与对局浮窗不可用）
- 状态：`FIXED / UNVERIFIED`
- 用户症状：选人阶段结束后，当前英雄等信息直接消失；进入游戏后没有对局信息，后续功能尤其 OCR 和海克斯推荐失败。
- 确定根因：LCU 的 gameflow phase 与 champ-select / current-champion 端点不是原子快照；离开 `ChampSelect` 时选人端点可能先 404 或瞬态 `None`。旧流程把该空值写入相邻 snapshot，级联清除当前英雄、详情和 OCR / 推荐上下文，导致进入游戏后功能停用。
- 代码修复：新增独立 `MatchContextTracker`，不再让单次非原子 endpoint 空值直接清除本局上下文；HB-020 又将原短 grace 强化为 `selecting / launching / active + generation` 状态机。`None` / 未知 phase / transport handoff 使用不续期的 10 分钟 launching 租约，可靠进局证据升级为 12 小时 active 上限；明确 terminal phase、异队列或下一 `ChampSelect` 清理 / 换代；非 `ChampSelect` 阶段只清 bench，不清当前英雄 / 详情 / 推荐。断线后直接进入同 queue 的第二局也按新 generation 替换，避免复用上一局。
- 跨阶段上下文契约：在已确认 `queueId=2400` 的 `ChampSelect` 中，最后有效的 `currentChampionId`、英雄详情及其 `dataVersion`、可派生的英雄专属海克斯推荐上下文，必须跨 `ChampSelect → GameStart → InProgress → Reconnect` 保留。阶段切换时即使 champ-select session / current-champion 端点暂时为空，也不得以空 snapshot 覆盖已确认的本局上下文；详情异步返回仍必须遵守 `championId + requestSequence + dataVersion` 一致性守卫，不能把上一局或错误英雄详情带入本局。
- 清理边界：只有进入明确结束阶段（如 `EndOfGame`）、确认切换到其他队列 / 新比赛上下文、或 LCU 证据表明当前局已失效时，才清理携带的英雄、详情、推荐和 OCR 组合状态。普通 `GameStart` / `InProgress` 短暂空 session、WebSocket 重连或 token / 端口轮换不得提前清空；第二局开始时必须替换而非复用上一局上下文。
- OCR / 浮窗验收：真实国服 WeGame 无边框对局中，进入 launching / active 上下文后应继续显示本局英雄 / 数据版本，自动 OCR 守卫为启用状态；三卡稳定出现后约 1 秒内识别并基于本局英雄详情生成推荐浮窗，F8 可手动重试。选人→游戏过程中不得因 LCU transport 交接而出现上下文闪空、扫描停表或浮窗永久缺失；只有本局上下文明确定义为结束 / 换代时才停用并清除，同局 LCU 重连不得破坏当前 generation。
- 自动化证据：`v0.1.6` 预发布与正式 tag Windows workflows 均以 12 test files / 72 tests 通过，覆盖 10 分钟不续期 handoff 租约、active 上限 / 独立确认、phase-before-aux、旧 generation 拒绝、游戏进程解析、OCR 与 Renderer 交接状态；lint、typecheck、packaged UI / bridge 等完整门禁同样通过。真实国服 LCU / 进程时序、OCR 和浮窗仍未实机验证，因此不能标记 `VERIFIED`。
- 必须验证的验收标准：用可控 phase / snapshot 序列覆盖 `ChampSelect(英雄A, queue 2400) → GameStart(空 session) → InProgress(空 session) → Reconnect → EndOfGame`，断言 A 的英雄 / 详情 / 推荐上下文在比赛阶段保留并只在结束时清理；覆盖第二局英雄 B、其他队列和过期详情返回，断言不串局。Windows packaged 实机还需验证对局信息、自动 / F8 OCR 和推荐浮窗全链路。
- 隐私与日志：诊断只允许记录脱敏 phase、queueId、是否携带上下文、英雄数字 ID、状态转换原因和稳定错误代码；不得记录 LCU token、API Key、PUUID、完整 champ-select / gameflow session、带凭据 URL或未裁切截图。

### HB-019 客户端内自动更新

- 严重度：中高（不阻断当前版本功能，但每次升级都依赖用户手动下载 / 安装，易滞留在已知损坏版本）
- 状态：Windows packaged local-feed 检查 / 下载 / SHA-512 / 隔离 cache 窄范围 `VERIFIED`；真实 GitHub stable Release 已发布但客户端 check / download 与 `quitAndInstall` 实际安装仍 `FIXED / UNVERIFIED`
- 用户目标：客户端能够在应用内发现并安装新版本，避免每次前往 GitHub 手动下载安装包。
- 代码实现：集成 `electron-updater@6.8.9`，使用 GitHub stable provider，仅在 packaged Windows 启用；`autoDownload=false`、`autoInstallOnAppQuit=false`、禁用 prerelease 和 downgrade。Main 进程维护受控更新状态机，Renderer 只通过无参数、受限 preload / IPC 执行检查、确认下载和确认安装；设置页显示版本、进度、错误和重试。
- 发布源契约：更新元数据和二进制只允许来自公开仓库 [RocXOvO/HexBridge Releases](https://github.com/RocXOvO/HexBridge/releases)；默认稳定通道只接受非 draft、非 prerelease、语义版本高于当前版本的正式 Release，不自动降级，不把 Actions artifact、分支构建或本地交叉产物当更新源。下载前后必须校验版本、资产名 / 架构及发布清单；无商业代码签名期间必须在 UI 明示“未知发布者 / 可能触发 SmartScreen”，不得宣称签名验证已完成。
- 用户控制契约：允许启动后低频检查和设置页手动检查，但发现新版本后必须显示当前 / 新版本、Release 链接和更新说明，并由用户明确确认下载；下载完成后再次由用户确认退出并安装。不得后台静默安装、强制重启、绕过 UAC / SmartScreen，用户可选择稍后处理且正常继续当前会话。
- 状态与错误契约：UI 必须区分检查中、已是最新版、发现更新、等待确认、下载中、已下载待安装、安装启动、失败与取消；下载显示可理解的字节 / 百分比进度。断网、GitHub 限流、元数据错误、资产缺失、校验失败、磁盘空间不足、用户取消和安装启动失败必须给出脱敏、可操作提示，并提供有界重试或回到手动 Release 页的入口；失败不得损坏当前安装或删除仍需恢复的下载文件。
- 安全边界：所有网络检查、下载、校验和安装启动必须在 Main 进程；Renderer 只能通过 schema 校验的业务 preload / IPC 请求“检查、确认下载、取消、确认安装”并订阅有限状态，不能传入任意 URL、文件路径、命令行或 Release asset。导航仍受精确 allowlist 控制；日志 / 更新请求不得携带或泄露 GitHub OAuth token、LCU token、API Key、PUUID 或完整 session，公开 Release 下载不应依赖用户 GitHub 凭据。
- 生命周期契约：对局 `InProgress`、OCR 在途、校准窗口打开或安装退出可能影响游戏时，不自动弹出抢焦点窗口或启动安装；主窗口隐藏时可记录“发现更新”，待用户打开后提示。安装前安全停止 OCR / LCU 监听并保存允许持久化的设置，不上传游戏状态。
- 已实现安全边界：下载前必须显式确认，安装前再次确认；`modeActive` 对局流程或 phase `None` 时阻止安装。更新错误与 release notes 先脱敏再进入状态 / 日志。发布 workflow 包含 `latest.yml`、blockmap 和安装资产；校验器检查 updater 元数据及 SHA-512。SHA-512 仅证明下载内容与更新元数据一致，不证明发布者身份，也不能替代 Authenticode 商业签名；未签名提示与 SmartScreen 边界继续保留。
- Windows packaged 下载烟测实现：`test:update:packaged` 启动本地 generic feed，基于当前 patch 自动构造 `+1` 版本，生成对应 `latest.yml` 并复制安装包 / SHA-512；实际 packaged EXE 执行 check + download，但明确不调用 install。Updater adapter 改为 dynamic loader，使纯 unit tests 不导入 Electron 可执行模块。
- 烟测隔离与安全：generic feed 仅允许显式测试 flag / env 下的严格 loopback URL；进程使用独立 `--user-data-dir`、`LOCALAPPDATA` 和 `APPDATA`。断言 metadata 与 installer 请求均命中、下载目标位于隔离 cache；任务有界等待，退出时有界 `taskkill` 并清理临时目录。审查已修正 `noCache` pathname 和 cache 隔离问题，之后无 P0 / P1。
- 自动化与审查证据：`v0.1.6` 预发布 workflow_dispatch run [31614808777](https://github.com/RocXOvO/HexBridge/actions/runs/31614808777) / job [94174846929](https://github.com/RocXOvO/HexBridge/actions/runs/31614808777/job/94174846929) 用时约 4m59s；正式 tag run [31615319004](https://github.com/RocXOvO/HexBridge/actions/runs/31615319004) / job [94176558591](https://github.com/RocXOvO/HexBridge/actions/runs/31615319004/job/94176558591) 用时约 5m14s。两次均通过 Electron hydrate、版本门禁、audit、OCR、72 tests、lint、typecheck、pack、metadata verifier、packaged UI / bridge / updater download smokes、checksums 和 artifact；tag run 另完成公开 Release。
- 精确 updater smoke 证据：正式 tag run 合成 patch `0.1.7`，结果为 `availableVersion=0.1.7`、`downloaded=true`、`metadataRequests=1`、`installerRequests=1`、`isolatedCache=true`。这验证了 Windows packaged `v0.1.6` EXE 对严格 loopback generic feed 的 check / download、SHA-512 和隔离 cache 路径，不执行安装。
- 真实 channel 发布事实：公开、非 draft / prerelease 的 `v0.1.6` Release、`latest.yml`、blockmap 和 EXE 已实际发布，因此 GitHub stable channel 现在存在可供 `v0.1.5` 发现的更高正式版本。该事实只证明服务端发布源就绪，尚无用户 packaged `v0.1.5` 对 GitHub 发起 check、下载或安装的实机证据。
- 剩余边界：generic feed smoke 不等于公开 GitHub provider 请求，也不调用 `quitAndInstall`，不验证 UAC / SmartScreen、替换已安装版本或升级后重启。因此只能窄范围 `VERIFIED`；真实 GitHub `v0.1.5→v0.1.6` 客户端 check / download 和完整安装链仍未验证。`v0.1.3` 用户必须先手动安装 `v0.1.5` 或更新正式版一次，后续版本才可使用客户端内更新。
- 必须验证的验收标准：覆盖无更新、正式更新、忽略 prerelease / draft、版本相等 / 降级、元数据和资产篡改、下载取消 / 重试、断点失败、校验失败、磁盘不足及安装启动失败；断言 Renderer 不能注入 URL / 路径 / 命令。Windows packaged 应用需从旧正式版检查到测试 Release，展示进度，经两次明确确认后启动安装，并验证取消 / 稍后不影响当前版本；无签名环境下提示准确。在真实 GitHub 客户端 check / download 和实际安装链验收前，不得把 HB-019 整体标为 `VERIFIED`。

### HB-020 WeGame 选人到游戏客户端交接期上下文丢失

- 严重度：阻断性（交接后本局英雄 / 详情、OCR 和海克斯推荐可能不可用）
- 状态：`IN PROGRESS`（已确认迟到空 ChampSelect 的 P1 根因；修复候选尚待 Windows / 用户同机验证）
- 最新用户实机症状：用户再次报告，在选人阶段结束进入最后等待、LeagueClientUx 交接到另一个游戏客户端启动之前，HexBridge 仍读取不到或丢失当前英雄信息。早先截图明确显示 `v0.1.5`，但本次重新报告未附版本截图与完整脱敏时间线；不得把用户已安装某个更新版当作已知事实。
- 已确认 P1 根因：最后有效选人快照后，transport failure 将 tracker 切到 `launching`；LCU 短暂恢复时可返回迟到的 `phase=ChampSelect`，同时 champ-select session / current 已 404。旧 reducer 仅因 `launching→ChampSelect` 就将其当作下一局并先清 confirmed，10 分钟交接租约根本无机会执行；旧测试还将这一错误行为固化成预期。
- `v0.1.8` 候选修复：reducer 显式接收 endpoint `ok/empty/error/skipped`、可用的 `gameId` 身份与 destructive / partial 证据；partial poll 只允许 `GameStart/InProgress/Reconnect` 等非破坏性阶段单调推进，不得用局部 terminal / queue / new-select 清空上下文。迟到空 session、同 gameId 或无 ID 同英雄的 outgoing observation 保留旧上下文但不续租；异队列、不同英雄、不同 gameId 和真实终局仍清理 / 换代。日志只写 phase、队列 / 英雄 ID、endpoint 状态与受控 `lastDecision`，不写完整 session、token、PUUID 或路径。
- 既有尝试性实现：`MatchContextTracker` 使用 `selecting / launching / active` 与 generation，`None` / unknown / transport handoff 使用不续期租约；GameStart / InProgress / Reconnect、`League of Legends.exe` 进程证据或首次可靠三卡可尝试确认 active，terminal / 异队列 / 下一 ChampSelect 清理。`applyLcuPollResults` 先提交 phase 再处理 auxiliary failure；OCR 不依赖 `lcu.connected`，迟到结果以 generation + champion 守卫。上述代码存在且受单元测试覆盖，但真实报告证明它们尚未形成有效实机闭环。
- Renderer 状态：LCU transport 已断开但本局 context 仍在时，界面明确显示“LCU 已交接”和“游戏客户端接管中 · 本局信息已保留”，不再把该状态呈现成普通“等待客户端”。
- 自动化假闭环边界：此前模拟 phase / endpoint 的 72 / 73 / 80 tests、重命名 Node 为 `League of Legends.exe` 的 Windows 进程测试以及 packaged UI / bridge smokes，均没有运行真实 WeGame 交接链。它们只能证明局部函数和受控流程，已被证明不足以支持 HB-020 的修复结论；今后不得用这些测试数量、Windows 构建成功或重命名进程检测单独把 HB-020 写为 `FIXED`。
- post-v0.1.8 回放门禁：`tests/runtime-handoff.test.ts` 不再只测 reducer，而是把实际 `MatchContextTracker / applyLcuPollResults` 输出依次送入 `HexBridgeRuntime.handleLcuUpdate`；断言 transport detach、迟到空 session/current、partial InProgress 和再次断线期间，英雄详情对象、推荐 overlay、champion request sequence 与 OCR update path 均连续；只有不同 game identity / 不同正英雄的真实下一局才清旧详情并进入 generation 2。该门禁随 test-only commit `561f9e5` 已 push main，尚未进入 v0.1.8 tag；全量本地为 14 files / 100 passed + 1 Windows-only skipped。它提高回归覆盖，但仍不等于真实 WeGame 实机证据。
- 实机证据入口：`docs/WEGAME_HANDOFF_RUNBOOK.md` 固化同机验收的前置条件、selecting→launching→active→terminal→第二局状态不变量、明确失败判据、脱敏报告模板和状态升级规则。只允许从诊断页提供受控 `LCU match context transitioned` 行；不得索取 lockfile、token、完整 session、PUUID、API Key、用户名或本地路径。以后不得在没有按该清单复测的情况下关闭 HB-020。
- Windows 真实进程检测窄范围证据：tag 后 commit `4d03f948cd611b1ea60121506367cd0e4083e7da` 新增 Windows-only 集成测试，将实际 Node executable 复制为 `League of Legends.exe`，启动这一真实 Windows 进程，再由 production `isLeagueGameProcessRunning()` 经 `tasklist` 检测。post-release run [31617314812](https://github.com/RocXOvO/HexBridge/actions/runs/31617314812) / job [94183257885](https://github.com/RocXOvO/HexBridge/actions/runs/31617314812/job/94183257885) 中 `tests/game-process` 两项均通过，集成检测用时约 928ms。因此仅“预期映像名的真实 Windows 进程 → tasklist → production 检测函数”可标窄范围 `VERIFIED`。
- 窄范围限制：上述测试使用重命名后的 Node，不是国服 WeGame 实际启动的游戏进程；它不证明国服进程名确为 `League of Legends.exe`，也不触发 LeagueClientUx 退出、LCU 凭据 / 端口消失、match context 保留、英雄详情、OCR、终局或第二局。其“进程名→tasklist→生产检测函数”局部结果可保留为窄范围证据，但 HB-020 总体已回到 `IN PROGRESS`。
- 交接期契约：从 `ChampSelect` 最后有效快照开始，即使出现 LeagueClientUx 进程退出、LCU 凭据失效、端口消失、`GameStart` 前 phase / endpoint 空窗或游戏客户端尚未完全启动，也不得仅因这些暂态事件清除本局已确认的 `queueId=2400`、当前英雄、匹配的英雄详情 / `dataVersion`、推荐上下文和 OCR 启用前提。游戏客户端启动并进入 `GameStart` / `InProgress` 后应继续同一局上下文，且不得短暂回显上一局或其他队列数据。
- 必须采集的脱敏证据：按时间顺序记录 phase、LCU 连接状态、发现来源类别、凭据 / 端口是否可用、LeagueClientUx 与游戏客户端是否存在、match-context generation、是否携带英雄 / 详情以及每次保留或清理的原因码。不得记录 token、API Key、PUUID、完整 session、带凭据 URL 或未裁切截图。
- 防再犯与验收门禁：下一轮定位必须取得同一台真实 Windows + 国服 WeGame 的交接录制与脱敏状态链，或由该状态链生成可回放 fixture；内容覆盖最后一次有效 `ChampSelect` 英雄、最后等待、LeagueClientUx 退出 / 凭据或端口失效、`GameStart` 前空窗、实际游戏客户端进程启动及进入对局，全程断言英雄、详情、数据版本、推荐与 OCR 资格不丢失。没有这份真实状态证据时，任何代码修改和单元 / packaged 测试最多只能维持 `IN PROGRESS`。
- 状态升级规则：必须由报告问题的用户在同机、同 WeGame 环境复验交接全程成功，HB-020 才可升级为 `FIXED / UNVERIFIED`；至少再完成一整局（三卡 OCR / 推荐可用、终局正确清理）并进入第二局验证新英雄替换、不串局后，才可标为 `VERIFIED`。在此之前不得用模拟测试、CI 或其他机器的成功结果代替用户同机复验。

### HB-021 v0.1.5 实机无法发现正式更新

- 严重度：中高（用户无法通过已安装客户端进入更新流程，可能长期滞留在旧版本）
- 状态：`IN PROGRESS`
- 用户实机症状：已安装的 packaged `v0.1.5` 在设置页执行“检查更新”后进入 `error` 状态，显示“更新操作失败，已保留当前版本”，`availableVersion` 为空，未发现已经公开发布的正式 `v0.1.6`。
- 已确认的发现链证据：`v0.1.6` 发布时五项资产曾完整（其旧 Release / assets 现已按保留策略删除），但 `v0.1.5` 使用的 GitHub provider 发现链在当前环境实际遇到 GitHub API `403 rate-limit`，Releases `latest` 与 Atom 端点还出现连接 reset。该证据说明真实远端发现链存在可复现外部失败模式，但尚不能外推为所有用户网络环境的唯一根因。既有 `v0.1.5` 二进制无法远程替换其 updater 实现，用户需从当前 Release 页手动安装最新正式版一次。
- `v0.1.7` 正式实现：更新发现改为 Main-only 固定 raw stable channel，并保留 GitHub provider fallback；只信任 provider-aware 的官方 NSIS 资产 allowlist，提供细分稳定错误码和固定官方下载页。`UpdateManager` 使用 `checkInFlight` 保证并发互斥，只消费对应 `checkForUpdates()` 返回值所绑定 provider 的结果；早到 updater event 不得改写检查状态或把另一 provider 的结果串入当前请求。
- 通道 / 发布安全实现：通道发布 / 读取遵守单调版本。发布前 preflight 拒绝低于 public channel 的候选，并在任何 Release / channel 写入前分页枚举公开 stable Releases，发现更高版本立即 fail closed；远端 Release 若已是同版本，则要求五项资产及 metadata 全部一致后才 no-op；候选版本的 Release 已存在但不满足同版本一致性时拒绝覆盖。softprops 配置 `overwrite_files:false`；GitHub Actions concurrency 使用 `queue` 且 `max` 有界。`update-channel` 当前公开指向 `v0.1.10`。正式发布完成 public packaged 检查后只删除严格低版 stable Release / assets；cleanup 再次拒绝更高 stable，draft / prerelease 不删，所有 tags / 源码历史永久保留。
- 当前验证：`v0.1.10` 已完成 Windows 预发布与 tag workflows，public channel / packaged public check 和五项 Release assets 均完成；目前只保留该 Latest Release。installed 旧版本对真实 GitHub 的 check / download / `quitAndInstall` / UAC / 替换未完成，因此 HB-021 整体仍不得写为 `VERIFIED`。旧版本用户此次建议从当前 Release 页手动覆盖安装 v0.1.10。
- 诊断与隐私契约：诊断应区分 DNS / 无网络、超时、系统或企业代理、GitHub 限流、HTTP 404 / 其他状态、TLS / 证书、元数据格式 / 版本 / 资产缺失、校验和应用状态错误，并提供稳定错误码和可操作提示。日志与 UI 必须脱敏；不得记录或展示 API Key、GitHub / LCU token、URL query 参数、Authorization / Cookie、用户本地路径、用户名或完整下载缓存路径。
- 必须验证的验收标准：在真实 Windows installed packaged `v0.1.5` 上，连接公开 GitHub stable provider，能够发现非 draft / prerelease 的正式 `v0.1.6` 或后续更高版本，并正确填充 `availableVersion`、Release 信息和等待用户确认状态；分别覆盖正常直连、系统代理 / 无代理、断网 / DNS / 超时、404 / 资产缺失、TLS / 证书失败与恢复重试，断言错误分类准确、诊断脱敏且失败始终保留当前版本。发现更新后必须由用户显式确认才下载，下载完成后再次确认才安装；不得静默下载、静默安装、自动退出或绕过 UAC / SmartScreen。完成定位、修复和真实 installed packaged 回归前不得标为 `FIXED` 或 `VERIFIED`。

### HB-022 国服选人阶段当前英雄与选人浮窗不显示

- 严重度：阻断性（选人阶段核心英雄信息与紧凑浮窗不可用）
- 状态：`IN PROGRESS`（authority 修复已随 `v0.1.10` 发布，等待报告用户同机真实 WeGame 复测）
- 用户实机症状：用户报告进入国服 / WeGame 选人界面后，HexBridge 的当前英雄信息和选人浮窗直接不显示。报告所用 HexBridge 精确版本仍待用户确认；HB-022 不得与 HB-020 的交接期 P1 自动合并。
- 用户脱敏证据：LCU 发现阶段出现多个 candidate，最终选择的 source 为 `log`；credentials 已验证，随后应用只呈现 transport-connected / 旧版 raw 连接状态，没有周期 heartbeat，snapshot 持续为 phase `None`、queue 与 champion 均为 `null`，与选人界面不显示吻合。诊断时间后缀 `Z` 表示 UTC，用户按本地时间理解时产生困惑；本文件不记录任何端口值。
- 本轮用户日志事实：诊断中的 `Z` 确认为 UTC；当前 logger 已改成本地时间并附 UTC offset。真实日志显示 `candidateCount=2`，但最终仍选择 `source=log`；transport-connected 后 raw / normalized phase 都持续为 `None`。这进一步提示错误 candidate 或错误 authority 粘滞的高风险，但尚未通过用户同机验证确认唯一根因。本文件不记录日志中的端口、token、路径、进程身份或对局身份具体值。
- 代码审计判断：高概率主因是连接器接受首个“可鉴权”candidate 后长期粘滞，即使该 candidate 只返回 `None` / 空 endpoint，也没有在有界时间内对其他候选重新仲裁。审计还发现两个可能的遮蔽路径：fresh partial observation 可能覆盖已有正向字段，空英雄 catalog 可能让已取得的 champion ID 在 Renderer 中表现为无可展示英雄。以上是代码审计的高概率判断和次级风险，不是已经由用户同机证明的最终根因。
- `v0.1.9` 正式实现：candidate target 评分只有在 phase 明确为 `ChampSelect` 时才允许给当前选人证据加权；已知 terminal phase 的残留 queue / hero 不得被推断为活动选人，也不得触发 candidate 切换。仅 raw phase 为 `None` / unknown 时，才允许依据 `queueId=2400` 与正英雄等正向 endpoint 证据推断选人目标。候选池每 10 秒刷新，已连接空 candidate 使用 2 秒有界备选重探；所有 request 都有 hard timeout，机会性 probe 失败不得破坏当前有效连接。fresh partial 合并时保留已有正向字段，并增加只读 lobby GET 作为队列识别 fallback。
- `v0.1.10` authority 候选实现：LCU credentials 在 Main 内部保留进程身份与进程启动时刻，用于区分 authority 世代，但这些字段绝不进入日志、诊断页、Renderer 或 IPC 业务状态。新增 `LcuAuthorityRegistry`，以 endpoint alias 以及进程身份 / 启动时刻 / 路径形成强 alias：同 endpoint 的 log→process 发现、同一进程的 endpoint / 凭据轮换可绑定为同一 authority；进程标识复用但启动时刻不同必须隔离为新 authority。`ensure` 与 `promote` 共用 `retainedPriority`，避免两条路径对保留候选给出不一致优先级。
- `v0.1.10` match / transport 边界：transport authority 与 match lease 分离；来自外部 authority 的 Lobby、terminal 或完整 `queueId=2400` ChampSelect 都不能覆盖现有本局，只有相同 match identity 才允许重绑。current endpoint 为空时，可信 `GAME_STARTING` 或 `gameClient.running` 证据可推进交接；同局最后一次换英雄必须先采纳新英雄再进入交接。active 后出现同英雄且无 identity 的新 ChampSelect 必须开启新 generation，不能复用上一局；真实 terminal 与真实新局仍是明确清理 / 换代边界。
- 诊断与目录行为：诊断页每 15 秒刷新一次脱敏 heartbeat，时间显示为本地时区并带 UTC offset；面向用户的候选 / 连接诊断不再记录端口。英雄 catalog 为空时显式提示“目录不可用 / 已识别 ID 暂无法解析”，不得把已识别 champion 静默表现成未识别。
- 当前审查与验证：实现已完成最终只读审查，未发现 P0 / P1；本地 113 tests passed + 1 个 Windows-only skipped，source bridge / UI smokes、lint、typecheck、`git diff --check` 全部通过。候选 commit `68f3822665d7de02f3555d0e8becae04f7b65d05` 的 Windows workflow_dispatch run [31662678891](https://github.com/RocXOvO/HexBridge/actions/runs/31662678891) / job [94330609527](https://github.com/RocXOvO/HexBridge/actions/runs/31662678891/job/94330609527) 通过预发布门禁。正式产品 / tag commit 为 `8a6e6d20791f0596274b79704d229642b99a7a12`；tag run [31663071062](https://github.com/RocXOvO/HexBridge/actions/runs/31663071062) / job [94331796412](https://github.com/RocXOvO/HexBridge/actions/runs/31663071062/job/94331796412) 于 2026-08-13T03:09:58Z～03:15:40Z 成功，用时约 5m42s。113 passed + 1 Windows skip、packaged UI / bridge、synthetic updater、public channel 和正式发布步骤全部成功。该结果不运行真实 WeGame；报告用户同机选人仍未复验，HB-022 继续 `IN PROGRESS`。
- `v0.1.10` 当前验证：新增 production `LcuClient → HexBridgeRuntime` 回放，覆盖 authority alias / rotation、外部 authority 干扰、可信交接推进、同局最后换英雄、active 后同英雄无 identity 的第二局以及终局 / 新局边界。独立审查无 P0 / P1。candidate commit `cb2098c79842f61447ab933766b42ff45c1604c5` 的 Windows workflow_dispatch run [31665154616](https://github.com/RocXOvO/HexBridge/actions/runs/31665154616) / job [94338020977](https://github.com/RocXOvO/HexBridge/actions/runs/31665154616/job/94338020977) 通过候选门禁。正式 annotated tag / 产品 / 记忆提交为 `345c0d5443760a9dcc6717a96a6068b6101b16d1`；tag run [31665517026](https://github.com/RocXOvO/HexBridge/actions/runs/31665517026) / job [94339115148](https://github.com/RocXOvO/HexBridge/actions/runs/31665517026/job/94339115148) 成功，用时约 5m23s。132 tests、packaged UI / bridge、synthetic updater、public update check、Release、channel 写入与旧 Release cleanup 全部通过。该结果不运行真实 WeGame；报告用户同机复测前 HB-022 继续 `IN PROGRESS`。
- 既有证据边界：`v0.1.8` Windows 预发布 / tag CI、packaged UI / bridge smokes、reducer 单测和 post-tag Runtime handoff 模拟回放均未连接真实国服 WeGame，也未读取用户实际 `ChampSelect` session。它们不能证明真实国服选人阶段能获得当前英雄或显示浮窗，不能支持“已覆盖”“已修复”或用户环境异常等结论。
- 定位所需证据：仍须确认设置 / 关于页显示的完整应用版本；由诊断页导出带本地时区 offset 的候选发现、仲裁 / 重探、连接、heartbeat、queue / phase、session / current-champion endpoint 受控状态、snapshot 正向字段、catalog 状态、Runtime 提交和 champ-select 浮窗显隐决定。还需要将用户真实 session 的结构制作成字段级脱敏 fixture，只保留复现解析分支所需的结构、类型和匿名 / 合成 ID；不得索取或记录端口值、token、API Key、PUUID、用户名、安装 / 游戏路径、带凭据 URL、完整原始 session 或未裁切截图。
- 验收标准：Windows workflow / packaged 验证通过后，仍必须在报告问题的同一台 Windows + 国服 WeGame 上确认精确版本并真实进入 `queueId=2400` 的 `ChampSelect`；authority 应正确绑定同一进程的多来源 / 轮换并隔离进程复用，仲裁应脱离长期空 candidate，外部 authority 与 known terminal 残留不得误切换或覆盖本局。当前英雄一经客户端可靠确认，主界面与紧凑选人浮窗应显示同一英雄；最后换英雄、进入 GAME_STARTING / 游戏进程接管、active、终局与第二局都要保持正确 generation、清理和换代。只有同机诊断链证明该问题关闭后才可标为 `FIXED / UNVERIFIED`；再覆盖完整一局和第二局后才可考虑 `VERIFIED`。仅凭 CI、production 回放或其他机器成功不得升级状态。

### HB-013～HB-017 的 v0.1.3 packaged smoke 边界

- tag workflow 在 Windows runner 启动实际 unpacked EXE：bridge smoke 验证 CommonJS preload、bridge / IPC 和安全偏好；packaged UI smoke 验证 invalid-Key 反馈与 busy 恢复、关键文字 14px、三个 reduced-motion 选择器、1024×768 校准截图 data URL / Renderer 解码、中文说明 14px，以及真实 CDP `Esc` 后主窗口恢复。
- HB-014 的已知首帧崩溃和受控 packaged Windows 进入 / 退出路径因此可在窄范围标 `VERIFIED`。但该 smoke 不使用真实有效 Key、不连接国服 WeGame / LCU、不覆盖中文安装路径、多显示器、100%～150% DPI、真实游戏截图 / 完整三框 OCR，也不测量动效 GPU / CPU；HB-013、HB-015～HB-017 继续 `FIXED / UNVERIFIED`，HB-014 的剩余范围同样 `UNVERIFIED`。

### 附带安全与性能加固

- 导航：由前缀字符串判断改为开发环境精确 origin / pathname / search allowlist，以及生产环境精确 `file:` entry allowlist；同时守卫 navigate 与 redirect。
- 数据请求：初始化与同英雄详情请求合并在途 Promise；缓存恢复同步恢复 dataVersion；候选 Key 在 HEAD 验证成功前不持久化。
- 响应速度：英雄 / snapshot 变化立即同步，详情后台非阻塞补齐；详情到达且 sequence 仍匹配才再次同步，不把 API 延迟计入选人 UI 刷新路径。

## 七、当前自动化验证基线

2026-08-13 `v0.1.6` 正式 Release 自动化基线：

- 产品源码 / tag commit：`e47a172f266328acd68cf4f366e8f04423a36df3`。
- 预发布 workflow_dispatch run [31614808777](https://github.com/RocXOvO/HexBridge/actions/runs/31614808777) / job [94174846929](https://github.com/RocXOvO/HexBridge/actions/runs/31614808777/job/94174846929) 成功，用时约 4m59s。
- 正式 tag run [31615319004](https://github.com/RocXOvO/HexBridge/actions/runs/31615319004) / job [94176558591](https://github.com/RocXOvO/HexBridge/actions/runs/31615319004/job/94176558591) 成功，用时约 5m14s。
- 两次 Windows job 均通过 Electron hydrate、版本门禁、audit、OCR models / smoke、12 test files / 72 tests、lint、typecheck、pack:win、updater metadata verifier、packaged UI / bridge / updater download smokes、checksums 和 artifact upload；tag run 另由 softprops 成功创建公开正式 Release。
- packaged UI / bridge 继续验证 CommonJS preload、受限 IPC、安全偏好、Key 错误反馈、校准首帧与 Esc 恢复等受控路径；不等于真实 Key、WeGame / LCU、对局 OCR、多显示器 / DPI 或动效性能实机验收。
- packaged updater smoke 基于 `v0.1.6` 自动合成 `0.1.7`，得到 `availableVersion=0.1.7`、`downloaded=true`、`metadataRequests=1`、`installerRequests=1`、`isolatedCache=true`。证据只覆盖严格 loopback generic feed 的检查、下载、SHA-512 与隔离 cache，不覆盖真实 GitHub stable 请求、`quitAndInstall`、UAC / SmartScreen 或安装替换。
- 干净本地依赖验证为 `npm ci → hydrate Electron → audit 0 → OCR models checksum / smoke → 72 tests → lint → typecheck → source bridge / UI smoke → diff-check` 全通过。logger 只在真实 Electron 路径动态 import Electron，`runtime-actions` 使用 mock `ConfigStore`；CI 先串行 hydrate 并断言 executable 存在，再运行并行门禁，避免 Electron 43 首次下载的解压竞态。
- SHA-256 / SHA-512 只提供内容完整性证据，不是 Authenticode 发布者身份签名；无商业签名和 SmartScreen 边界不变。

`v0.1.6` tag 后 `main` Windows 门禁基线：

- commit `4d03f948cd611b1ea60121506367cd0e4083e7da` 新增 Windows-only 真实进程检测集成测试；commit `d5656b16c14e8248112c4d1f143fe42c7c2974e1` 修复 packaged UI smoke 在校准窗口正常自销毁时的 Esc / CDP 竞态。两项均已 push 到 `origin/main`，不改变 `v0.1.6` tag / Release 产品源码。
- workflow_dispatch run [31617314812](https://github.com/RocXOvO/HexBridge/actions/runs/31617314812) / job [94183257885](https://github.com/RocXOvO/HexBridge/actions/runs/31617314812/job/94183257885) 基于 `d5656b16` 成功，用时约 5m5s。Windows 12 test files / 73 tests、lint、typecheck、pack、update metadata、packaged UI / bridge / updater、checksums 和 artifact 全通过。
- `tests/game-process` 两项通过：测试复制实际 Node 为 `League of Legends.exe`、启动真实 Windows 进程，并由 production `isLeagueGameProcessRunning()` / `tasklist` 检出，集成项约 928ms。该证据只验证预期映像名到 production 检测函数的链路，不是 WeGame 实机。
- packaged UI smoke 通过 1024×768 截图校准、Esc 后 calibration target 销毁和主窗口恢复；updater synthetic `0.1.7` 为 `downloaded=true`、metadata / installer 各 1 次、`isolatedCache=true`。
- 首次 run [31616475936](https://github.com/RocXOvO/HexBridge/actions/runs/31616475936) attempt 1 中 73 tests 已通过，最终因既有 packaged UI smoke 的 Escape CDP race 发生门禁假失败：校准目标正常自销毁早于 CDP 命令返回。attempt 2 因新的修复提交出现而取消。审查确认该问题与产品交接改动无关；`d5656b16` 只对目标已正常关闭的 CDP 竞态作窄容错，之后仍严格断言 calibration target 消失、main target 存活和主窗口恢复。

`v0.1.7` HB-021 历史预发布与正式发布基线：

- clean npm ci、audit 0、12 test files / 80 tests：79 passed，1 个 Windows-only test skipped；lint、typecheck、`git diff --check`、source bridge / UI smoke、public `v0.1.6` channel verify、发布脚本 Node syntax check 全部通过。真实 GitHub 只读 preflight 对 `v0.1.7` 返回 `should_publish=true`。
- Main-only fixed raw stable channel + GitHub fallback、provider-aware 官方 NSIS allowlist、细分稳定错误码、固定官方下载页、`checkInFlight` + provider-bound 返回值、早到 event 隔离、通道单调版本 / 并发保护和 public packaged smoke 已实现；正式发布后 public `update-channel` 已指向 `v0.1.7`。
- 发布 preflight 拒绝低版本；同版本远端 Release 只有五项资产与 metadata 全一致才 no-op；候选 Release 已存在且不满足安全 no-op 时拒绝覆盖。softprops `overwrite_files:false`，GitHub Actions 使用有界 queue / max 并发。
- 第三轮只读审查无 P0 / P1并批准 Windows workflow。较早 macOS 交叉打包发生在最后互斥 / preflight 增量之前，不能当作当前候选最终产物；正式候选以随后 Windows workflow_dispatch 产物 / 门禁为预发布证据。真实 installed `v0.1.5→v0.1.7` check / download / install 仍未验证。
- Windows workflow_dispatch run [31621795206](https://github.com/RocXOvO/HexBridge/actions/runs/31621795206) / job [94198181530](https://github.com/RocXOvO/HexBridge/actions/runs/31621795206/job/94198181530) 基于完整 commit `5d2f0321afe7f79981211b2615eaab493c07e3ed` 成功，用时约 5m。`npm ci`、audit 0、public `v0.1.6` channel verify、OCR models / checksum / smoke、Windows 12 test files / 80 tests、lint、typecheck、pack、update metadata、packaged UI / bridge、local updater、checksums 和 artifact 全通过；候选 EXE size 199,023,316 bytes。
- packaged UI 覆盖 1024×768 校准；local updater synthetic `0.1.8` 结果为 `downloaded=true`、`metadataRequests=1`、`installerRequests=1`、`isolatedCache=true`。后续 `v0.1.7` tag run 已完成公开 channel / packaged check 与 Release；但仍不等于旧 installed 版本的 `quitAndInstall` / UAC / 实际替换验证。

`v0.1.7`～`v0.1.9` 历史正式发布与当前 `v0.1.10`：

- `v0.1.7` tag 为 `ea0c7e2`；其 Release 曾公开、非 draft / prerelease 且 public channel 当时对齐正式 EXE。`v0.1.8` 发布后已删除 v0.1.7 Release / assets，但 tag 和下列历史摘要保留。
- v0.1.7 历史五项资产：EXE 199,023,315 bytes / SHA-256 `c9873c8799f8d3d71890cb798df793b54f192cee21265b9605e2b702ba46ad58`；blockmap 201,427 bytes / `a888bc1a920da93e07c7b13b1323d42623f853da2c5e9a4563e59613233f31a3`；ZIP 274,209,255 bytes / `21ae2487b64dc7d9ccef3f1459755e68994d07ee860f2c2bb6c10203f4cd5989`；`latest.yml` 343 bytes / `f4e59e26461c50ac1f9191d117b6bdc90ffa981f347bd5f9a08630025c749f1e`；`SHA256SUMS.txt` 180 bytes / `b07671bdc0c7d22efed089177dd3f87b6309bf1aae820e09f4a5fdb3fd5e0e7b`。
- `v0.1.8` 已包含 HB-020 reducer / 浮窗 / 脱敏决策记录和 Release 保留策略；本地、Windows 预发布和正式 tag 门禁均通过。Release policy fixture 明确覆盖数值 semver、较低 stable、较高 draft / prerelease 和较高 stable fail-closed。它曾正式发布，v0.1.9 发布后其 Release / assets 已清理，但 tag / 源码历史保留；真实 WeGame 同机仍未复验，HB-020 保持 `IN PROGRESS`。
- 最终增量后的 macOS `pack:win + checksums` exit 0，updater metadata verifier 核对 `version=0.1.8`、EXE path / size / SHA-512 与唯一非空 blockmap；交叉候选 EXE 198,535,875 bytes / SHA-256 `46c55bc9224dc1a988a903be852898d8c6076e87ccdc8b28894941562ac8d8a2`，ZIP 274,099,763 bytes / SHA-256 `5634314c3dd9f86ca4d0340c71e9c3a2e8b6ca7bed1821b0937dbb054f26f83a`。这些仅是 macOS 交叉构建历史证据；正式资产以 Windows tagged Actions 结果为准并已另记。
- 发布前最终只读审查确认 HB-020 reducer、preflight 和 stable-only cleanup 无 P0 / P1，并要求先完成 Windows workflow_dispatch 后再打 tag；该顺序已执行成功。审查 / CI 仍不得外推为真实 WeGame 同机验证。
- `v0.1.9` 曾为公开、非 draft / prerelease 且唯一保留的正式 Release，tag / 产品提交 `8a6e6d20791f0596274b79704d229642b99a7a12`。正式 tag run [31663071062](https://github.com/RocXOvO/HexBridge/actions/runs/31663071062) / job [94331796412](https://github.com/RocXOvO/HexBridge/actions/runs/31663071062/job/94331796412) 于 2026-08-13T03:09:58Z～03:15:40Z 成功，约 5m42s；113 passed + 1 Windows skip、packaged UI / bridge、synthetic updater、public channel、Release 与旧 Release cleanup 全部成功。其 Release / assets 已在 v0.1.10 发布后删除，tag / 源码历史保留。
- `v0.1.9` 正式五项资产：EXE 199,026,359 bytes / SHA-256 `6314110381f87d079c2139a221b218e5b6b1063748499bc53bd373bfad61d7dd`；blockmap 201,461 bytes / `c97c606e7a95207928bc005e9dce381a2b42d288ecf4674a91edd65b7aceb5c3`；ZIP 274,213,311 bytes / `d8bc887972ef63f89e34d4f24e8c29b27302c98c8e8b4ad1c7bba71310ff1c5e`；`latest.yml` 343 bytes / `b2100ff9f938fe6de34bfce22d5fab395edbf53cc128464960b36dcc99f9b6de`；`SHA256SUMS.txt` 180 bytes / `f4ebf04b7041c825df42260d7cd7823909bcc167e8122997258bc0c661f473d6`。
- v0.1.9 Release notes 已明确候选仲裁 / 诊断修复、旧版本需手动下载安装 v0.1.9、未签名 / SmartScreen 边界以及真实 WeGame 仍待同机复验。发布存在与 CI 成功都不能升级 HB-022；报告用户同机选人通过前保持 `IN PROGRESS`。
- `v0.1.10` 当前为公开、非 draft / prerelease 且唯一保留的正式 Release，annotated tag / 产品 / 记忆提交 `345c0d5443760a9dcc6717a96a6068b6101b16d1`。正式 tag run [31665517026](https://github.com/RocXOvO/HexBridge/actions/runs/31665517026) / job [94339115148](https://github.com/RocXOvO/HexBridge/actions/runs/31665517026/job/94339115148) 成功，约 5m23s；132 tests、packaged UI / bridge、synthetic updater、public update check、Release、channel 与 cleanup 全部通过。
- `v0.1.10` 正式五项资产：EXE 199,028,315 bytes / SHA-256 `b64fb91c0c6692262caacb84212342f2209609662459619d270fe4b728b5c794`；ZIP 274,215,616 bytes / `1336f9a02dc43c52f110a0224a1ee1502465dbc28029ba7b7eee56cdb6abb043`；blockmap 201,550 bytes / `3d40cd0f1ff911b97f4c1093878eb1f0ac3dc08f20b790658f9d1b6712ad234b`；`latest.yml` 346 bytes / `78e4f2c1dbf707fe6f5b7d7eb352729c47fa95858c6dc2b9a3b9d20329180ced`；`SHA256SUMS.txt` 182 bytes / `8efdcf07691a38d76aaeeda419855cce451e8ec179e4c34e31503441f8142353`。public channel 的 version `0.1.10`、EXE path / size `199028315` 与 SHA-512 已核验一致。
- v0.1.10 Release notes 已明确 authority / match lease 修复边界、旧版本手动覆盖安装、未签名 / SmartScreen 以及真实 WeGame 仍待报告用户同机复验。发布存在与 CI 成功不能升级 HB-022；其状态继续 `IN PROGRESS`。

`v0.1.6` 发布前本地 / 交叉构建历史基线：

- clean `npm ci`、Electron hydrate、`npm audit` 0、OCR models checksum / OCR smoke、12 test files / 72 tests、lint、typecheck、`git diff --check`、source bridge / UI smokes 全部通过。
- 覆盖 10 分钟不续期 launching handoff 租约、12 小时 active 上限、phase 先于 auxiliary failure 提交、terminal / 异队列 / 下一 ChampSelect 清理、generation + champion active / OCR 原子守卫、`League of Legends.exe` tasklist 解析和 Renderer “LCU 已交接 / 本局信息已保留”状态。
- macOS `pack:win + checksums` exit 0，updater metadata verifier 通过。交叉构建候选：`HexBridge-0.1.6-x64.exe` 198,528,590 bytes，SHA-256 `85ec0ab6e8dc97b247e45575a02b765b0296b38f8fd761dd3ed4727aade9799f`；`HexBridge-0.1.6-x64.zip` 274,093,348 bytes，SHA-256 `c7449cd83003b7f45b86e47f547809128389f5340fee792889f9516a4d9c3c67`。
- `latest.yml` 的 `version=0.1.6`、path=`HexBridge-0.1.6-x64.exe`、size `198528590` 与交叉候选 EXE SHA-512 一致，当前版本 blockmap 已生成并通过 verifier。以上数值仅是发布前 macOS 面向 Windows 的交叉构建历史，不是正式 Release assets；正式摘要以下方 Windows tag run 资产为准，也仍不证明真实国服 WeGame 进程名、客户端交接时序或整局 OCR。

## 八、Windows / 游戏实机待验证

- Windows 10 与 Windows 11 x64 的安装、卸载、便携版启动、托盘、开机后首次 `safeStorage` 行为。
- HB-012 已在 source Electron 和 Windows unpacked packaged EXE 中验证 CommonJS preload、`window.hexbridge`、`getState()` IPC 和安全偏好；仍需安装版实际启动 / 卸载，并人工确认故障时 `preload-error` 可进入受控日志。自动烟测不能代替真实 WeGame / LCU 对局验收。
- WeGame / 国服客户端启动后 5 秒内发现 LCU；进程命令行、lockfile、日志、手动目录四种来源。
- 客户端重启、第二局、token / 端口轮换、ChampSelect→GameStart→InProgress→EndOfGame 全状态链。
- 抓取网络请求确认运行全程只出现白名单 LCU GET，没有写请求。
- 真实用户 Key 的 HEAD 验证、credits、生产数据字段、版本变化、401、429、断网与旧缓存恢复。
- HB-013：packaged 设置页“验证并保存”的忙碌、成功、分类失败、加密持久化与重启恢复全链路。
- HB-014：首帧挂载、受控截图显示、中文说明 14px、Esc / 主窗恢复已由 Windows packaged UI smoke 验证；仍待真实游戏截图、左中右三框保存 / 回显、归一化持久化与不同 DPI / 多显示器行为。
- HB-015：真实国服 WeGame 下四类 LCU 发现来源、5 秒连接、脱敏失败诊断、重启 / token 轮换与全程只读请求。
- HB-016：所有主页面和浮窗在 Windows 100%～150% 缩放下的计算字号、中文清晰度、长文案布局和最小窗口可读性。
- HB-017：未连接空状态在电影 / 均衡 / 省电、reduced-motion、InProgress 和窗口不可见条件下的视觉与渲染暂停行为。
- HB-018：自动化已覆盖 tracker 序列；仍需真实 `ChampSelect → GameStart → InProgress → Reconnect → EndOfGame` 中英雄 / 详情 / 推荐上下文、OCR、推荐浮窗、第二局替换与离局清理。
- HB-019：Windows packaged `v0.1.6→synthetic 0.1.7` local-feed check / download、SHA-512、隔离 cache 已验证，真实 GitHub `v0.1.6` 更新目标也已发布；仍需 packaged `v0.1.5` 对真实 GitHub 执行 check / download、显式确认安装、`quitAndInstall`、UAC / SmartScreen、实际替换 / 重启后版本和取消 / 错误全链路。`v0.1.3` 不含更新器，必须先手动安装 `v0.1.5` 或更新正式版一次。
- HB-020：当前为 `IN PROGRESS（迟到空 ChampSelect P1 根因已确认）`，此前“修复已随 v0.1.6 发布”的结论撤回。必须取得真实交接录制 / 脱敏状态链或可回放 fixture，覆盖最后有效 ChampSelect 英雄到实际游戏客户端启动的全程；用户同机复验前任何代码和模拟测试都不得升级为 FIXED，一整局 + 终局 + 第二局通过前不得 VERIFIED。
- HB-021：当前 `IN PROGRESS`。`v0.1.10` 延续 raw stable channel、GitHub fallback、官方资产 allowlist、错误分类、provider 结果绑定、单调 / 并发保护，public channel 和 packaged public smoke 已通过；仍缺 installed 旧版本真实 check / download / `quitAndInstall` / UAC / 实际替换链。旧版本用户此次建议从当前 Release 页手动覆盖安装 v0.1.10。
- HB-022：当前 `IN PROGRESS`。v0.1.9 发布后用户日志仍显示两个 candidate 中选中 log source 且 transport-connected 后 raw / normalized phase 长期 `None`，authority 绑定风险未完成实机闭环。`v0.1.10` 正式版新增 authority alias / 世代隔离、统一 retained priority、transport / match lease 分离、外部 authority 防覆盖、可信交接推进、最后换英雄优先采纳及第二局 / 终局 generation 边界；独立审查、Windows 候选与正式 tag workflow 的 132 tests、packaged UI / bridge / updater / public update check 均通过。真实 WeGame 报告用户同机复测仍未完成，发布成功不能把状态升级为 FIXED / VERIFIED。
- 无边框游戏下真实三卡：稳定出现后约 1 秒展示，刷新动画期间不误识别，连续丢失正确隐藏，F8 重试。
- 1080p / 2K / 4K、100% / 125% / 150% DPI、多显示器、非主显示器、显示器热插拔和手动拖框校准。
- 单卡 / 双卡、长中文名、OCR 错字、缺图、相同组合、并列、无详情 / 旧详情。
- 游戏中浮窗不抢焦点、点击穿透、位置与卡位一致；主窗口隐藏 / 进入游戏后无持续背景渲染和明显 GPU 峰值。
- 未签名安装包的 SmartScreen 行为；当前不应宣称已代码签名。

## 九、发布与 GitHub 状态

- 当前 Git / 版本：公开最新且唯一保留的 Release 为 `v0.1.10`，annotated tag / 产品 / 记忆提交为 `345c0d5443760a9dcc6717a96a6068b6101b16d1`。Release 公开、非 draft、非 prerelease；`v0.1.9` Release / assets 已清理，但远端 `v0.1.0` 至 `v0.1.10` Git tags 和源码历史全部原位保留，`v0.1.4` 从未有 Release。后续记忆提交可推进 main，不得移动或改写产品 tag。
- GitHub CLI 已登录用户 `RocXOvO`，用户已补充授权 GitHub Actions workflow 所需 scope。不得在本文件记录任何认证 token。
- GitHub 公开仓库：[RocXOvO/HexBridge](https://github.com/RocXOvO/HexBridge)，visibility 为 `PUBLIC`；本地 `origin` 已配置为该仓库的 HTTPS 地址。远端 `main` 已包含源码、测试、文档和 `.github/workflows/release.yml`。
- `.gitignore` 排除 `release/`、`dist/`、`dist-electron/`、`node_modules/` 和 OCR `.onnx/.txt`，因此源码 push 不包含本地二进制或模型。
- 发布职责契约：`pack:win` 必须带 `--publish never`，electron-builder 只构建；tag 必须与 `package.json` 版本完全一致。`.github/workflows/release.yml` 在 Windows runner 上执行 `npm ci`、串行 Electron hydrate / executable 断言、版本门禁、audit、模型下载 / 校验、OCR smoke、完整测试套件、lint、typecheck、Windows 打包、updater metadata verifier、packaged EXE UI / bridge / updater download smokes 和 checksums，最后仅由 `softprops/action-gh-release` 创建 / 上传 NSIS EXE、EXE blockmap、ZIP、`latest.yml` 与校验清单。smoke 中的 `Get-Process` strategy / capture decode、更新器 local-feed 下载均有明确窄范围，不能证明中文安装路径、完整校准、真实 LCU 或实际更新安装。所有第三方 GitHub Actions 固定到完整 commit SHA。
- `v0.1.0` 首次 run `31517806148` 的 HB-011 失败已由成功 run [31519147662](https://github.com/RocXOvO/HexBridge/actions/runs/31519147662) 关闭。成功 run 基于 commit `212a8f62`，所有步骤通过，耗时约 5m39s。
- `v0.1.0` Release 曾公开；2026-08-13 已按“只保留最新正式 Release”规则删除其 Release 记录与 assets，Git tag / 源码历史及下列历史摘要保留：
  - `HexBridge-0.1.0-x64.exe`，198,647,921 bytes，SHA-256 / GitHub asset digest `a6a1eded05232dec9921689706215da2275d344abde90ad4dac30ced1bc9bf4e`。
  - `HexBridge-0.1.0-x64.zip`，273,725,909 bytes，SHA-256 / GitHub asset digest `ae21508a3bd39e603e2cd0bf1425280e0db4204aeed312409cae765719a5dc9f`。
  - `SHA256SUMS.txt`，180 bytes，GitHub asset digest `d4418da855a0d11bdd52661ee03ab8fcdd8e216dbc747f75ff795fb8b4e13c75`；文件内容列出的 EXE / ZIP SHA-256 与对应 GitHub asset digest 一致。
- `v0.1.1` tag run [31563308769](https://github.com/RocXOvO/HexBridge/actions/runs/31563308769) / job [94009941106](https://github.com/RocXOvO/HexBridge/actions/runs/31563308769/job/94009941106) 基于 commit `e91926cad2ed8da40d9d03f1d33ffacc7a423c31` 成功，用时约 5m2s；tag / package gate、audit、OCR models / smoke、31 tests、lint、typecheck、pack:win、Windows packaged EXE bridge smoke、checksums、artifact upload 和 publish 全通过。
- `v0.1.1` Release 曾公开；2026-08-13 已删除其 Release 记录与 assets，Git tag / 源码历史及下列历史摘要保留：
  - `HexBridge-0.1.1-x64.exe`，198,648,807 bytes，SHA-256 / GitHub asset digest `eddf89e985d6e5e51bcf5019dc3b3997671f40b1a80bef543cc8d2d8340c3ef9`。
  - `HexBridge-0.1.1-x64.zip`，273,726,890 bytes，SHA-256 / GitHub asset digest `6a114772ca01dfcf312a3c498d9e29aebb7193021fe79b69705484407011ee76`。
  - `SHA256SUMS.txt`，180 bytes，GitHub asset digest `25bdac6625646fb119aa088d8fe3d693feb9899ef3633bd52cf8034190329dc4`。
- `v0.1.2` 预发布 workflow_dispatch run [31570202898](https://github.com/RocXOvO/HexBridge/actions/runs/31570202898) / job [94030356212](https://github.com/RocXOvO/HexBridge/actions/runs/31570202898/job/94030356212) 基于 commit `02ec4e586cce5f84f7072ebcb21ebf6edb4d3461` 成功，用时约 5m16s；Windows 构建、packaged smoke、checksums 和 artifact upload 全通过。
- `v0.1.2` tag run [31570576285](https://github.com/RocXOvO/HexBridge/actions/runs/31570576285) / job [94031484476](https://github.com/RocXOvO/HexBridge/actions/runs/31570576285/job/94031484476) 基于同一 commit 成功，用时约 4m53s；版本门禁、audit、OCR、45 tests、lint、typecheck、pack:win、packaged smoke、checksums、artifact upload 和 softprops publish 全通过。
- `v0.1.2` Release 曾公开；2026-08-13 已删除其 Release 记录与 assets，Git tag / 源码历史及下列历史摘要保留：
  - `HexBridge-0.1.2-x64.exe`，198,655,710 bytes，SHA-256 / GitHub asset digest `b52d62be60ec4f5ea82e4c3263351cd4e0791a7ccc7e77b7a43dfbff97cbd88d`。
  - `HexBridge-0.1.2-x64.zip`，273,735,618 bytes，SHA-256 / GitHub asset digest `bed7674f206124adab25f2cb66dbda4681bcdffc8ed31781e3eb0b197ca73a8d`。
  - `SHA256SUMS.txt`，180 bytes，GitHub asset digest `f33f137d1bbd860aec58fa9988a0b85cc40a5a3c5306f06b74d16c13e3dd2921`；文件内容列出的 EXE / ZIP SHA-256 与对应 GitHub asset digest 一致。
- `v0.1.3` tag run [31574503268](https://github.com/RocXOvO/HexBridge/actions/runs/31574503268) / job [94043480286](https://github.com/RocXOvO/HexBridge/actions/runs/31574503268/job/94043480286) 基于 commit `f23a8f716923851ee786094ca8a846b19f23a079` 成功，用时约 5m1s；版本门禁、audit、OCR、45 tests、lint、typecheck、pack:win、packaged bridge / UI smoke、checksums、artifact upload 和 softprops publish 全通过。
- `v0.1.3` Release 曾公开；2026-08-13 已删除其 Release 记录与 assets，Git tag / 源码历史及下列历史摘要保留：
  - `HexBridge-0.1.3-x64.exe`，198,655,756 bytes，SHA-256 / GitHub asset digest `653ae08ac5b7a0c3e82da72cf628e51dfb9be03bb44068a9cd4d7f1379aed089`。
  - `HexBridge-0.1.3-x64.zip`，273,735,887 bytes，SHA-256 / GitHub asset digest `0871a9571e650f6c484aee65386e4770442f92ae7f1c517e4be94d77144d4f17`。
  - `SHA256SUMS.txt`，180 bytes，SHA-256 / GitHub asset digest `05e8e2e76f11a34a79cf20ca5fb2acbd206a301d588f564b5aba238d0ee3857c`。
- 上述成功结果证明 Windows runner 的构建与发布链可用，不证明安装包已在真实 Windows + WeGame 对局中运行。
- `v0.1.0` 曾含 HB-012 preload 阻断缺陷，其 Release 已删除，不能作为功能可用基线。当前公开推荐版本为 `v0.1.10`；但 tagged packaged smoke 通过仍不代表真实 WeGame / LCU / 对局 OCR 实机验收。
- `v0.1.10` 是当前公开推荐且唯一保留的正式 Release，但 HB-020 与 HB-022 仍处于 `IN PROGRESS`，不能把该版本写成已由报告用户同机验证。HB-014 仅在首帧黑屏 / packaged Windows 受控截图与 Esc 恢复窄范围 `VERIFIED`；HB-013、HB-015～HB-018 及 HB-014 的实机剩余范围仍为 `FIXED / UNVERIFIED`。HB-019 仅 local-feed check / download / SHA-512 / cache 窄范围 `VERIFIED`，真实 installed 客户端更新 / 安装链仍未验证。
- HB-021 当前为 `IN PROGRESS`：`v0.1.10` 已正式发布，public channel 与 packaged public check 已指向 `0.1.10`；但旧 installed 客户端的真实 GitHub check / download / `quitAndInstall` / UAC / 版本替换仍未完成。不得把 workflow、synthetic updater 或服务端资产存在等同于真实客户端升级已验证；此次建议旧版本用户手动覆盖安装 v0.1.10。
- 当前无商业 Windows 代码签名证书，发布物会显示“未知发布者”并可能触发 SmartScreen。
- `v0.1.4` tag run [31606925983](https://github.com/RocXOvO/HexBridge/actions/runs/31606925983) / job [94148158581](https://github.com/RocXOvO/HexBridge/actions/runs/31606925983/job/94148158581) 失败，未创建 Release。根因是 Electron 43 在首次导入时惰性下载，Vitest 多 worker 并发解压同一 `cs.pak` 发生竞态；不是产品逻辑或 updater smoke 失败。tag `v0.1.4` 已存在并指向 `39758c1`，为保持发布历史不可变不得重写或删除。
- `v0.1.5` 修复了 `v0.1.4` 的 Electron hydrate 竞态：普通 unit tests 不依赖 Electron executable；logger 只在真实 Electron 环境动态 import，`runtime-actions` mock `ConfigStore`。CI 在测试前串行 hydrate Electron 并断言 exe 存在，随后才运行并行门禁；预发布与正式 tag Windows workflows 均通过。
- `v0.1.5` 预发布 workflow_dispatch run [31607991004](https://github.com/RocXOvO/HexBridge/actions/runs/31607991004) / job [94151803527](https://github.com/RocXOvO/HexBridge/actions/runs/31607991004/job/94151803527) 成功，用时约 4m55s；正式 tag run [31608478045](https://github.com/RocXOvO/HexBridge/actions/runs/31608478045) / job [94153439332](https://github.com/RocXOvO/HexBridge/actions/runs/31608478045/job/94153439332) 成功，用时约 5m36s。两次均通过 hydrate、版本门禁、audit、OCR、56 tests、lint、typecheck、pack、metadata、packaged UI / bridge / updater synthetic `0.1.6`、checksums 和 artifact；tag run 另完成 softprops Release。
- `v0.1.5` Release 曾公开；2026-08-13 已删除其 Release 记录与 assets，Git tag / 源码历史及下列历史摘要保留：
  - `HexBridge-0.1.5-x64.exe`，199,019,530 bytes，SHA-256 `0890a1e231952ba52a63812b612bf1d3a90a16559bc4c023c2f136250acff70d`。
  - `HexBridge-0.1.5-x64.exe.blockmap`，201,446 bytes，SHA-256 `52edb7ae14ace33f2c7a9170a12cc401d28b709629d47442fb8a0ecb223162fc`。
  - `HexBridge-0.1.5-x64.zip`，274,204,876 bytes，SHA-256 `84d880a7b35c7804519396398507ab628b6c71b9243cbd993be4c18d8ec44b84`。
  - `latest.yml`，343 bytes，SHA-256 `f197c40ebb07afd10e10cd9bfa2acef0abe4818e12e5d230198629e119ca47db`；内容中的 `version=0.1.5`、path=`HexBridge-0.1.5-x64.exe`、EXE size `199019530` 与 SHA-512 均和正式 EXE 一致。
  - `SHA256SUMS.txt`，180 bytes，GitHub asset digest `a934c98cda3c66d39322b46d9222723c96a37ce6f1eecbfa05701d10924b0ebf`；清单内 EXE / ZIP SHA-256 与对应正式 assets 一致。
- 正式 tag run 的 updater smoke 得到 `availableVersion=0.1.6`、`downloaded=true`、`metadataRequests=1`、`installerRequests=1`、`isolatedCache=true`。这只窄范围验证本地严格 loopback feed 的检查 / 下载，不验证真实 GitHub 下一正式版或 `quitAndInstall` / UAC / 实际替换。
- `v0.1.3` 用户需要手动安装 `v0.1.5` 一次；只有此后版本才可从客户端内进入更新流程。`latest.yml` 的 SHA-512 与资产 SHA-256 是完整性证据，不是发布者身份签名。
- `v0.1.6` 预发布 workflow_dispatch run [31614808777](https://github.com/RocXOvO/HexBridge/actions/runs/31614808777) / job [94174846929](https://github.com/RocXOvO/HexBridge/actions/runs/31614808777/job/94174846929) 成功，用时约 4m59s；正式 tag run [31615319004](https://github.com/RocXOvO/HexBridge/actions/runs/31615319004) / job [94176558591](https://github.com/RocXOvO/HexBridge/actions/runs/31615319004/job/94176558591) 成功，用时约 5m14s。两次均通过 hydrate、版本门禁、audit、OCR、72 tests、lint、typecheck、pack、metadata、packaged UI / bridge / updater synthetic `0.1.7`、checksums 和 artifact；tag run 另完成 softprops Release。
- `v0.1.6` Release 曾公开；2026-08-13 已删除其 Release 记录与 assets，Git tag / 源码历史及下列历史摘要保留：
  - `HexBridge-0.1.6-x64.exe`，199,021,292 bytes，SHA-256 / GitHub asset digest `71f55acbd6c291d60e70ea29498a4f8a491decd092f72290b243b01ceb96b730`。
  - `HexBridge-0.1.6-x64.exe.blockmap`，201,223 bytes，SHA-256 / GitHub asset digest `ce17b64ed35e578073a52b782b7d22ab850cee1465689953fe4b4ba94210b831`。
  - `HexBridge-0.1.6-x64.zip`，274,207,043 bytes，SHA-256 / GitHub asset digest `93c1c0e69271e218456bb9fc7881316bf87106befa8de5c5eb566da6ba9943b1`。
  - `latest.yml`，343 bytes，SHA-256 / GitHub asset digest `8f54c98ad7e71026ec5404cd22629860cbd4721362cf1bb65a91b409e3612d60`；内容中的 `version=0.1.6`、path=`HexBridge-0.1.6-x64.exe`、EXE size `199021292` 与 SHA-512 均和正式 EXE 一致，并由正式 workflow metadata verifier 核验。
  - `SHA256SUMS.txt`，180 bytes，SHA-256 / GitHub asset digest `58fc0655dc1ddc8d248f38c68459ac8ebc9f7d9d93e1d6a87b1c029098374b21`；清单内 EXE / ZIP SHA-256 与对应 GitHub asset digest 一致。
- 正式 tag run 的 updater smoke 得到 `availableVersion=0.1.7`、`downloaded=true`、`metadataRequests=1`、`installerRequests=1`、`isolatedCache=true`。GitHub 已发布可供 `v0.1.5` 发现的真实 `v0.1.6` stable Release，但尚无真实用户客户端 check / download / install 证据。
- 发布前 macOS `v0.1.6` 交叉候选摘要仅作历史验证；其大小 / SHA 与正式 Windows Actions assets 不同，不能继续当作当前发布物。

### 非阻断发布维护项

- GitHub Actions 仍有 Node 20 deprecated annotation。当前 workflow 中第三方 actions 固定到完整 commit SHA，runner 已临时强制它们使用 Node 24，且 `v0.1.10` 正式 run `31665517026` 成功，因此不是当前发布阻断项。
- 后续维护应在不放弃 commit SHA 固定的前提下，升级到官方声明原生支持 Node 24 的 actions commit，并重新跑 workflow_dispatch；不要仅依赖 runner 的临时强制兼容行为。

## 十、后续变更记录

按以下格式追加，不改写历史结论：

```text
YYYY-MM-DD | 缺陷/契约 ID | 状态变化 | 代码摘要 | 自动化验证 | Windows/实机验证 | 提交/PR
```

- 2026-08-12 | 初始记忆 | 创建 | 记录 v0.1.0 架构、硬边界、10 项上传前审查缺陷与发布状态 | 基线 23 tests / typecheck / build / OCR smoke | 待验证 | 尚无 commit
- 2026-08-12 | HB-001～HB-010 | OPEN→修复后状态 | 修复比赛上下文、详情竞态 / 非阻塞同步、断线 OCR、生产 demo、模型供应链、缺版本 / 目录 / 详情刷新结果、广播、截图保留、依赖审计和 lint；附带收紧导航、请求去重与 Key 先验后存 | 全新 npm ci；7 files / 31 tests；audit 0；lint / typecheck / build；模型 checksum；OCR smoke；Windows x64 目标 pack / checksums exit 0 | Windows / WeGame 真实运行仍待验证，未代码签名 | 尚无 commit / remote
- 2026-08-12 | GitHub 远端 | 已创建私有仓库 | 创建 `RocXOvO/HexBridge`（PRIVATE）并配置本地 `origin` | 远端 URL 与本地 remote 已复核 | 不涉及 | 等待首个源码 commit / push
- 2026-08-12 | 初始提交 / push | 本地已提交、远端阻塞 | 创建 root commit `Initial HexBridge v0.1.0`；向 `origin/main` 推送时因 OAuth 缺少 `workflow` scope 被 GitHub 拒绝 | 本地 commit 与 remote 已复核；提交将 amend 纳入后续记忆更新，不在提交自身记录可变哈希 | 不涉及 | 等待用户执行 `gh auth refresh -h github.com -s workflow` 后重试；远端仍无源码
- 2026-08-12 | GitHub 公开 / push | 阻塞已解除、源码已上线 | 用户补充 workflow scope，并按明确要求将 `RocXOvO/HexBridge` 从 PRIVATE 改为 PUBLIC；保留 workflow 后成功推送 root commit 到 `origin/main` | `main...origin/main`、PUBLIC visibility、远端默认分支和 workflow 文件已复核 | Windows / WeGame 真实运行仍待验证，未代码签名 | 源码已推送；尚无 release tag / GitHub Release
- 2026-08-12 | 可整合数据源审计 | 方案记录、未实现 | 明确 data.dtodo 主统计源；CommunityDragon / Data Dragon / Meraki 静态职责；本地 LCU Match History / Live Client 可选边界；Wiki CC BY-SA 隔离；Match-V5 queue 2400 / 国服不可用；拒绝私有网页抓取 | 基于公开接口与可用性审计，未新增代码或测试 | 新来源均待单独实现与验收 | 仅更新项目记忆
- 2026-08-12 | HB-011 / Release CI | 失败已定位，修复待 Windows 复验 | `v0.1.0` tag run 31517806148 的 Windows pack 末尾触发 electron-builder 隐式 publish；为 `pack:win` 增加 `--publish never`，保持 softprops 为唯一发布者 | 远端前置 audit / OCR / 31 tests / lint / typecheck 通过；macOS 本地 `pack:win && checksums` exit 0 | 不构成 Windows / WeGame 实机验收；仍需 Windows Actions 重新构建并创建 Release | fix 待提交 / 推送；GitHub Release 尚未创建
- 2026-08-12 | HB-011 / v0.1.0 Release | FIXED / UNVERIFIED→VERIFIED | commit `212a8f62` 的 Windows Actions run 31519147662 以 builder-only / softprops-only 职责完成发布 | audit、OCR models / smoke、31 tests、lint、typecheck、pack:win、checksums、artifact upload、Release 全通过；约 5m39s；asset digest 与 SHA256SUMS 一致 | 构建发布链已验证；Windows + WeGame 真实运行仍待验，未商业签名 | 公开 Release `v0.1.0`，非 draft / prerelease
- 2026-08-12 | HB-012 / preload bridge | DIAGNOSED / UNFIXED | 确认 sandboxed BrowserWindow 加载 ESM `index.mjs` 时发生 import 语法错误，导致 `window.hexbridge` 缺失；ASAR 文件与路径均正确 | 本机 logging dev 100% 复现；现有 31 tests 与 Release workflow 均不启动应用，故未覆盖 | 与用户环境 / WeGame / Key / 重装无关；修复后仍需 Windows 安装版启动与 IPC 烟测 | 仅完成诊断；无代码修复、无新 Release
- 2026-08-12 | HB-012 / v0.1.1 本地修复 | DIAGNOSED / UNFIXED→FIXED / UNVERIFIED | preload 改为单文件 CommonJS `index.cjs`；保留四项安全偏好；增加受控 preload-error、bundle verifier、真实 source / packaged bridge smoke、tag / package 版本门禁 | clean npm ci；audit 0；31 tests；lint / typecheck / diff-check / verify-preload / source Electron smoke；macOS cross pack + checksums；review 无 P0/P1，P2 cleanup 回归通过 | Windows Actions packaged EXE smoke 与 Windows + WeGame 实机仍待验证 | 版本已升 0.1.1；尚未提交 / 推送 / 发布
- 2026-08-12 | HB-012 / Windows packaged smoke | FIXED / UNVERIFIED→VERIFIED | commit `2e6a726c9baae590c14d58cf4291a227ec05f3da` 的 workflow_dispatch run 31562903957 / job 94008801457 启动实际 unpacked `HexBridge.exe` | npm ci、audit、OCR、31 tests、lint、typecheck、pack、packaged bridge / IPC / 安全偏好 smoke、checksums、artifact upload 全通过；约 4m40s | bridge 修复已验证；安装器与真实 WeGame / LCU 对局仍待验，未商业签名 | 0.1.1 已 commit / push main；尚无 tag / Release
- 2026-08-12 | Actions Node runtime | 非阻断维护 | runner 标注固定 actions 使用 Node 20 已 deprecated，并在当前运行中强制 Node 24 | run 31562903957 成功 | 不涉及游戏实机 | 后续升级到原生 Node 24 actions commit 并保留 SHA pin
- 2026-08-12 | HB-012 / v0.1.1 Release | VERIFIED / 已发布 | tag commit `e91926cad2ed8da40d9d03f1d33ffacc7a423c31` 的 Windows Actions run 31563308769 / job 94009941106 完成版本门禁、构建、packaged bridge smoke 与 softprops 发布 | audit、OCR models / smoke、31 tests、lint、typecheck、pack:win、checksums、artifact upload、Release 全通过；约 5m2s；正式 EXE / ZIP / SHA256SUMS 摘要已记录 | Windows packaged bridge 已验证；真实 WeGame / 国服 LCU / 对局 OCR、安装器人工流程仍待验，未商业签名 | 公开 Release `v0.1.1`，非 draft / prerelease；`v0.1.0` 已标“已知损坏，请勿下载”并指向修复版
- 2026-08-12 | HB-013 / Key 保存 | REPORTED / UNDIAGNOSED | 用户报告 `v0.1.1` 点击“验证并保存”无可见响应；尚未定位调用链或状态反馈环节 | 无新增自动化证据；需覆盖有效 / 无效 Key、分类错误、加密持久化和重启恢复 | packaged 应用真实 Key 全链路待验 | 仅登记症状与验收标准，无根因或修复
- 2026-08-12 | HB-014 / OCR 拖框校准 | REPORTED / UNDIAGNOSED | 用户报告入口含义不清，点击后除任务栏外屏幕变黑；尚不能区分预期遮罩、捕获或 Renderer 问题 | 无新增自动化证据；需覆盖可见三步引导、取消恢复、归一化区域与 DPI / 多显示器 | 无边框游戏 packaged 校准与 OCR 输入待验 | 仅登记症状与验收标准，无根因或修复
- 2026-08-12 | HB-015 / 国服 LCU 连接 | REPORTED / UNDIAGNOSED | 用户报告 WeGame / 国服客户端已开但仍显示等待客户端；缺少脱敏发现 / 探测证据 | 现有 fixture 与 bridge smoke 不能覆盖真实国服发现；需验证四类来源、状态同步和只读边界 | Windows 10 / 11 + 真实 WeGame / LCU 全状态链待验 | 仅登记症状与验收标准，无根因或修复
- 2026-08-12 | HB-016 / 字体可读性 | REPORTED / UNDIAGNOSED | 用户报告客户端整体字体过小；尚无页面、缩放与计算字号测量 | 需验证导航 / 正文 / 表单 / 诊断关键文字不低于 14 CSS px，并完成长中文与三档 DPI 视觉快照 | Windows packaged 多分辨率 / 缩放人工可读性待验 | 仅登记症状与验收标准，无根因或修复
- 2026-08-12 | HB-017 / 未连接空状态 | REPORTED / UNDIAGNOSED | 用户希望在独立 HexBridge 视觉语言内增加参考 Mineradio 层次感的轻量动态；禁止复制 GPL 代码素材 | 需覆盖电影 / 均衡可见、省电 / InProgress / 隐藏暂停、reduced-motion 静态和连接切换视觉快照 | Windows packaged 后台重绘与 GPU / CPU 行为待验 | 仅登记体验目标与验收标准，无设计稿或实现
- 2026-08-12 | HB-013～HB-017 / v0.1.2 本地修复 | REPORTED / UNDIAGNOSED→FIXED / UNVERIFIED | Key 即时反馈与分类错误 / 格式错误保留旧 Key；截图底图校准与超时恢复；CIM + Get-Process UTF-8、多来源并行 LCU probe、日志目录 / 文件全局去重与约 4.2s 有界发现；关键文字 14px；独立轻量空状态动效及性能守卫 | clean dependency、audit 0、OCR models / checksum / smoke、8 files / 45 unit tests、lint、typecheck、diff-check、source Electron bridge smoke 通过。unit tests 不覆盖 WindowManager / desktopCapturer 完整校准 | Windows Actions packaged smoke、真实 WeGame / 国服 LCU、OCR 校准、字体 / 动效性能均待验，不得标 VERIFIED | 本地版本 0.1.2；尚未 commit / push / tag / Release，公开最新仍为 v0.1.1
- 2026-08-12 | v0.1.2 / 第三轮与快速复审 | 可进入 Windows CI | 纠正证据边界：30s 仅为 debug 日志节流；45 tests 不覆盖 WindowManager / desktopCapturer；packaged smoke 仅检查 Get-Process strategy 与 capture payload / Renderer 解码 | 最后快速复审无新 P0 / P1，仍批准进入 Windows CI；较早 macOS cross pack 早于最终三项增量，仅作历史参考 | Windows packaged、中文路径、完整校准和真实 WeGame 仍待验 | 无状态升级；HB-013～HB-017 保持 FIXED / UNVERIFIED
- 2026-08-12 | v0.1.2 / Windows 预发布验证 | Windows packaged 门禁通过 | commit `02ec4e586cce5f84f7072ebcb21ebf6edb4d3461` 的 workflow_dispatch run 31570202898 / job 94030356212 构建实际 Windows x64 产物并运行 packaged smoke | audit、OCR、45 tests、lint、typecheck、pack:win、bridge / IPC / security / GetProcess / capture decode smoke、checksums、artifact upload 全通过；约 5m16s | 不覆盖真实 Key UI、完整校准、中文路径、WeGame / LCU、DPI 或动效性能 | HB-013～HB-017 保持 FIXED / UNVERIFIED
- 2026-08-12 | v0.1.2 / Release | 已发布；缺陷状态不升级 | 同一 commit 的 tag run 31570576285 / job 94031484476 完成版本门禁、Windows 构建、packaged smoke 与 softprops 发布 | audit、OCR、45 tests、lint、typecheck、pack:win、checksums、artifact、Release 全通过；约 4m53s；正式 EXE / ZIP / SHA256SUMS 摘要已记录且清单一致 | packaged smoke 通过但真实 WeGame / LCU / OCR / 中文路径 / DPI / 动效性能仍待验，无商业签名 | 公开 Release `v0.1.2`，非 draft / prerelease；main / tag / Release 均为 `02ec4e586cce5f84f7072ebcb21ebf6edb4d3461`
- 2026-08-12 | HB-014 / 校准首帧黑屏 | FIXED / UNVERIFIED→窄范围 VERIFIED | 确认空 `rects` 下 `v-show` 仍求值 `style(rects[slot])`，`undefined.x` 导致 Vue 首次 render / mount 崩溃；`style(rect?)` 缺失返回空对象，并保留截图预热、同步挂载、Esc / 异常恢复与安全诊断 | Windows packaged UI smoke 验证 1024×768 data URL、中文说明 14px、`#app` 挂载、真实 CDP Esc 与主窗恢复；bridge smoke 同时通过 | 首帧黑屏 / 受控 packaged Windows 进入退出已验证；多显示器、DPI、真实游戏截图和完整三框 OCR 仍 UNVERIFIED | 修复 / tag commit `f23a8f716923851ee786094ca8a846b19f23a079`
- 2026-08-12 | v0.1.3 / Release | 已发布 | tag run 31574503268 / job 94043480286 完成全门禁和 softprops 发布 | 版本门禁、audit、OCR、45 tests、lint、typecheck、pack:win、packaged bridge / UI smoke、checksums、artifact、Release 全通过；约 5m1s；正式资产摘要已记录 | HB-013 / 015 / 016 / 017 仍 FIXED / UNVERIFIED；HB-014 仅窄范围 VERIFIED；无商业签名 | 公开 Release `v0.1.3`，非 draft / prerelease；tag / Release 产品源码为 `f23a8f716923851ee786094ca8a846b19f23a079`，main 包含其后的记忆更新
- 2026-08-12 | HB-018 / 对局上下文丢失 | REPORTED / UNDIAGNOSED | 用户报告选人结束后英雄 / 对局信息消失，进入游戏后 OCR 与海克斯推荐失败；登记跨 GameStart / InProgress / Reconnect 携带与离局清理契约 | 无新增自动化证据；需覆盖空 session、第二局、其他队列、详情乱序和 OCR / 浮窗状态 | 真实国服 WeGame 选人到对局全链路待验 | 仅记录症状与验收标准，无根因或代码修复
- 2026-08-12 | HB-019 / 客户端内自动更新 | REPORTED / UNIMPLEMENTED | 规定 GitHub Releases 稳定通道、两次用户确认、非静默安装、进度 / 错误 / 重试、正式版与签名边界、Main-only 下载校验及 schema IPC | 尚无实现或测试；需覆盖版本 / 渠道 / 资产 / 校验 / 取消 / 失败及 IPC 注入防护 | Windows packaged 从旧正式版检查、下载、确认安装和取消全链路待验 | 仅记录产品与安全契约，不得宣称已支持自动更新
- 2026-08-12 | HB-018 / MatchContextTracker | REPORTED / UNDIAGNOSED→FIXED / UNVERIFIED | 确认非原子 LCU phase / champ-select 404 或 None 清空相邻 snapshot；新增独立 tracker、30s grace、enteredGame generation、terminal / 新队列清理、非选人 bench 清理及同 queue 第二局替换 | 55 tests 与 Windows workflow_dispatch 静态 / packaged 门禁通过；审查无 P0 / P1 | 真实 LCU、OCR / 海克斯浮窗仍待验；CI 无真实游戏数据，不升级状态 | 0.1.4 已 commit / push main，未 tag / Release
- 2026-08-12 | HB-019 / electron-updater | REPORTED / UNIMPLEMENTED→FIXED / UNVERIFIED | 集成 electron-updater 6.8.9、GitHub stable packaged-Windows provider、禁自动下载 / 退出安装 / prerelease / downgrade，Main 状态机、无参 IPC、双确认、modeActive / None 安装守卫、脱敏 notes / errors 及 latest.yml / blockmap / SHA512 workflow assets | 55 tests、lint、typecheck、diff-check、source bridge / UI smoke 通过；审查无 P0 / P1；macOS `pack:win + checksums` 与 metadata verifier 通过，latest / app-update / 唯一非空 blockmap 一致 | Windows Actions 和真实 `0.1.4→0.1.5` 更新未验；交叉打包与 SHA512 不等于 Windows 实机或身份签名 | 本地 0.1.4，未 commit / push / tag / Release
- 2026-08-12 | HB-019 / packaged updater download smoke | 窄范围 VERIFIED | 新增严格 loopback generic feed、patch +1 metadata / installer SHA512、实际 check / download 不 install；隔离 userData / LOCALAPPDATA / APPDATA 与 cache，断言请求 / 目标路径，有界 taskkill / 清理；UpdateManager dynamic adapter 避免 unit tests 导入 Electron 可执行模块 | Windows run 31606119110 / job 94145387680 通过：availableVersion 0.1.5、downloaded true、metadataRequests 1、installerRequests 1、isolatedCache true；全 job 55 tests / metadata / UI / bridge / checksums / artifact 均通过 | 真实 GitHub stable、quitAndInstall、UAC / SmartScreen、实际版本替换仍 UNVERIFIED | HB-019 仅 check/download/SHA512/cache 窄范围 VERIFIED；0.1.4 已 push main，未 tag / Release
- 2026-08-12 | v0.1.4 / tag CI | FAILED / 无 Release | 远端 tag 固定指向 `39758c1`；run 31606925983 / job 94148158581 在测试阶段失败 | Electron 43 首次 import 惰性下载，Vitest 多 worker 并发解压 `cs.pak` 竞态；未进入发布，未创建 Release | 不涉及真实 LCU / updater 安装验证 | tag 保持不移动 / 不删除；公开最新 Release 仍为 v0.1.3
- 2026-08-12 | v0.1.5 / Electron hydrate 修复候选 | FIXED / UNVERIFIED | logger 仅真实 Electron 动态 import；runtime-actions mock ConfigStore；Actions 在 npm ci 后串行 hydrate 并断言 exe，避免 worker 并发解压 | clean npm ci 前后验证：测试前 / 后 Electron binary 均不存在且 10 files / 56 tests 通过；随后 clean npm ci→hydrate→audit0→OCR→56 tests→lint/typecheck→source bridge/UI→diff 全过 | Windows Actions 尚未运行；0.1.5 smoke 将合成0.1.6，历史0.1.4结果不可外推 | 本地0.1.5尚未 commit/push/tag/release，不预写未来结果
- 2026-08-12 | v0.1.5 / Windows 预发布验证 | Windows packaged 全门禁通过 | 产品候选源码 `1569f5fb7ecbb3ad9e83c8573f26c01847c8b5af` 经 workflow_dispatch 构建，含串行 Electron hydrate、metadata 与 updater 下载烟测 | run 31607991004 / job 94151803527 成功，约 4m55s；hydrate、版本、audit、OCR、56 tests、lint、typecheck、pack、metadata、UI / bridge / synthetic 0.1.6 updater、checksums、artifact 全通过 | packaged synthetic 更新只验证 loopback check / download / SHA-512 / cache；真实 WeGame 与实际安装未验 | 预发布验证通过，未改变 v0.1.4 tag 历史
- 2026-08-12 | v0.1.5 / Release | 已发布；HB-018 状态不升级，HB-019 仅窄范围 VERIFIED | tag / 产品源码 `1569f5fb7ecbb3ad9e83c8573f26c01847c8b5af` 完成 Windows 构建、五项 updater / 发布资产与中文标题正式 Release | tag run 31608478045 / job 94153439332 成功，约 5m36s；全门禁、synthetic 0.1.6 updater、checksums、artifact 和 softprops Release 通过，正式资产摘要 / latest 元数据一致性已记录 | 真实国服 WeGame / LCU / OCR、GitHub 下一版、quitAndInstall / UAC / 实际替换仍待验；无商业签名；v0.1.3 用户需先手动安装一次 | 公开 Release `v0.1.5`，非 draft / prerelease；main 可包含 tag 后的记忆更新，不预写其提交哈希
- 2026-08-12 | HB-020 / WeGame 选人到游戏交接上下文 | REPORTED / UNDIAGNOSED | v0.1.5 用户报告选人最后等待、LeagueClientUx 向游戏客户端交接前英雄 / 对局信息仍丢失；登记进程退出、凭据 / 端口消失、GameStart 前空窗、游戏启动、上下文 / 详情 / OCR 连续性及终局 / 第二局清理契约 | 既有 56 tests 只覆盖模拟 phase / endpoint，packaged smokes 不启动真实 WeGame，均不能关闭该问题 | 真实 Windows + 国服 WeGame 完整交接时序待复现、定位与回归 | 只登记实机事实与验收标准；无根因或修复结论，不预写提交
- 2026-08-12 | HB-020 / 交接租约与独立 active 证据 | REPORTED / UNDIAGNOSED→FIXED / UNVERIFIED | 确认 LCU transport / phase endpoint 与 match context 错误耦合；tracker 改为 selecting / launching / active + generation、10 分钟不续期 handoff 与 12 小时 active 上限；GameStart 确认 entered-game 租约，InProgress / Reconnect 或 generation + champion 一致的 game process / 首次可靠三卡确认 active；phase 先于 aux failure 提交，OCR 脱离 lcu.connected 并拒绝旧 generation，Renderer 显示 LCU 已交接 | 本地 12 test files / 72 tests、typecheck、lint、git diff --check 全通过 | 真实 WeGame 交接、国服游戏进程名、完整一局 OCR / 终局 / 第二局仍未实机验证，不能标 VERIFIED | 尚未提交、tag 或发布；不预写未来 hash / Release
- 2026-08-12 | v0.1.6 / 本地候选与交叉打包 | 候选验证通过、未发布 | 本地版本升至 0.1.6，包含 HB-020 修复；updater metadata、latest.yml 与当前 blockmap 对齐候选 EXE | clean npm ci、Electron hydrate、audit 0、OCR checksum / smoke、12 test files / 72 tests、lint / typecheck / diff、source bridge / UI 全通过；macOS pack:win + checksums exit 0，metadata verifier 通过；候选 EXE / ZIP SHA-256 已记录 | 仅 macOS 交叉构建；Windows Actions、Windows packaged、真实 WeGame 交接与整局 OCR 均未验证 | 尚未 commit / push / tag / Release；公开最新仍为 v0.1.5，不预写未来 CI
- 2026-08-13 | v0.1.6 / Windows 预发布验证 | Windows packaged 全门禁通过 | 产品源码 `e47a172f266328acd68cf4f366e8f04423a36df3` 在 Windows runner 构建并执行 UI / bridge / updater synthetic 0.1.7 smokes | workflow_dispatch run 31614808777 / job 94174846929 成功，约 4m59s；hydrate、版本、audit、OCR、72 tests、lint、typecheck、pack、metadata、smokes、checksums、artifact 全通过 | 不等于真实 WeGame 交接、整局 OCR 或实际更新安装 | 产品提交已在 main；正式 tag run 结果另记
- 2026-08-13 | v0.1.6 / Release | 已发布；HB-020 保持 FIXED / UNVERIFIED，HB-019 仅窄范围 VERIFIED | tag / 产品源码 `e47a172f266328acd68cf4f366e8f04423a36df3` 完成 Windows 构建、五项 updater / 发布资产与公开正式 Release | tag run 31615319004 / job 94176558591 成功，约 5m14s；72 tests 与完整门禁、synthetic 0.1.7 updater、checksums、artifact、softprops Release 全通过；正式资产摘要与清单一致 | 真实 WeGame、国服进程名、整局 OCR、真实 GitHub 客户端 check / download / quitAndInstall / UAC / 替换仍未验证；无商业签名 | 公开 Release `v0.1.6`，非 draft / prerelease；记忆更新待另 commit / push，不预写其 hash
- 2026-08-13 | post-v0.1.6 / packaged UI smoke race | 门禁假失败→FIXED | run 31616475936 attempt 1 在 73 tests 通过后，Esc 使校准 target 正常自销毁早于 CDP 返回；attempt 2 因新提交出现取消；`d5656b16` 对目标已关闭竞态作窄容错，同时严格断言 calibration target 消失、main target 存活与主窗恢复 | 审查确认与产品交接改动无关；后续 run 31617314812 的 1024×768 校准 / Esc / 恢复 smoke 通过 | 不提供真实游戏校准或 WeGame 证据 | `d5656b16` 已 push origin/main；无新 tag / Release
- 2026-08-13 | HB-020 / Windows 真实进程检测 | 总体 FIXED / UNVERIFIED；进程检测链窄范围 VERIFIED | `4d03f948` 在 Windows 复制实际 Node 为 `League of Legends.exe` 并启动真实进程，由 production `isLeagueGameProcessRunning()` / tasklist 检测 | run 31617314812 / job 94183257885 基于 `d5656b16` 成功约 5m5s；12 test files / 73 tests，game-process 两项通过且集成项约 928ms；lint/typecheck/pack/metadata/UI/bridge/updater/checksums/artifact 全通过；synthetic 0.1.7 downloaded、请求各1、cache隔离 | 只验证预期进程名→tasklist→生产函数；真实 WeGame Ux退出、实际进程名/启动、LCU端口失效、英雄/详情/OCR连续、终局/第二局均未验，HB-020不得整体VERIFIED | `4d03f948`、`d5656b16` 已 push main；v0.1.6 tag/Release仍为 e47a172，无新发布
- 2026-08-13 | HB-021 / v0.1.5 真实 GitHub 更新检查 | REPORTED / UNDIAGNOSED | 用户实机 packaged v0.1.5 在设置页检查更新后显示 error /“更新操作失败，已保留当前版本”，availableVersion 为空，未发现公开 v0.1.6；仅登记症状、错误分类与隐私契约 | 服务端 v0.1.6 正式资产存在，loopback synthetic smoke 通过，但均不是 v0.1.5→真实 GitHub 请求证据 | 待覆盖 installed packaged 直连/代理/断网/404/TLS、脱敏诊断、正式版本发现、显式下载与非静默安装；不得记录 Key/token/query/local path | 无根因或修复结论；无代码、commit、tag 或 Release 变更
- 2026-08-13 | HB-021 / v0.1.7 更新通道候选（历史时点） | REPORTED / UNDIAGNOSED→IN PROGRESS | 当时观察到 v0.1.5 GitHub provider 链 API 403 rate-limit、latest / Atom reset；本地实现 fixed raw stable+GitHub fallback、provider-bound checkInFlight/早到event隔离、官方NSIS allowlist、错误码/下载页、单调/并发保护、发布preflight、禁覆盖和public smoke，当时 channel 仍指v0.1.6 | clean npm ci/audit0、12 files/80 tests（79+1 Windows skip）、lint/typecheck/diff、source bridge/UI、public verify、脚本node-check和真实GitHub只读preflight should_publish=true通过；第三轮审查无P0/P1 | 较早cross pack早于最后互斥/preflight增量；Windows workflow、public packaged、真实installed check/download/install当时均未验 | 此条记录候选阶段；后续正式发布事实见 v0.1.7 Release 条目
- 2026-08-13 | HB-021 / v0.1.7 Windows 预发布（历史时点） | IN PROGRESS（状态不升级） | 候选 commit `5d2f0321afe7f79981211b2615eaab493c07e3ed` 已 push main；workflow_dispatch 只执行预发布门禁，tag-only channel / Release步骤按预期skip | run31621795206/job94198181530 success约5m；npm ci/audit0/public v0.1.6/OCR/Windows 80 tests/lint/typecheck/pack（EXE 199,023,316 bytes）/metadata/UI packaged 1024×768/bridge/local synthetic0.1.8/checksums/artifact全过；updater downloaded=true、metadata1、installer1、isolatedCache=true | 当时未改public channel、未执行真实public v0.1.7 packaged check；installed旧版check/download/install未验 | 此条记录 tag 前状态；v0.1.7 后续已正式发布
- 2026-08-13 | HB-020 / 真实 WeGame 交接回归（初报时点） | FIXED / UNVERIFIED→IN PROGRESS（当时根因未定位） | 用户再次报告选人最后等待、LeagueClientUx 向另一个游戏客户端交接前仍读取不到 / 丢失英雄；撤回此前修复闭环，不猜根因 | 72/73/80 tests、重命名Node进程与packaged smokes均只覆盖受控路径，不能支持修复结论 | 初报时尚无脱敏状态时间线；后续已定位迟到空 ChampSelect 根因，见下一条，但仍须同机复验才可升级状态 | 此条保留问题初报历史，不代表当前根因未知
- 2026-08-13 | v0.1.7 / Release 与公开更新通道（历史时点） | 当时已发布；后由 v0.1.8 替代并删除 Release / assets | tag / 产品源码 `ea0c7e2` 完成 Windows 正式发布，public stable channel 当时指向 `0.1.7`，五项资产和 packaged public check 均完成 | GitHub Release 当时为 Latest、非 draft / prerelease；正式 EXE 199,023,315 bytes，SHA-256 `c9873c8799f8d3d71890cb798df793b54f192cee21265b9605e2b702ba46ad58` | installed 旧版真实 check / download / 安装替换仍未验证；无商业签名 | v0.1.7 tag / 源码历史保留，Release / assets 已由 v0.1.8 cleanup 删除
- 2026-08-13 | HB-020 / 迟到空 ChampSelect 确定根因与 v0.1.8 候选（发布前时点） | IN PROGRESS（代码候选已修，等待用户同机复验） | 真实交接中 transport 先将 tracker 置为 `launching`，随后 phase 仍迟到报告 `ChampSelect` 而 session / current endpoints 已 404 / empty；旧 reducer 把这类 observation 当作下一局，在租约判断前清空 confirmed context，Runtime 随即清英雄详情 / OCR / 浮窗。候选引入 endpoint presence、可选 game identity、partial observation 和受控 decision，区分 outgoing 与真实新 session；保留分支不得续租，不同正英雄 / 异队列 / 新 identity 必须换代 | 回放测试覆盖 outgoing endpoint race、partial GameStart / InProgress、终局 / 异队列 / 同 queue 第二局、租约超时和新英雄换代 | 仍缺报告用户同机 WeGame 交接、一整局 OCR / 推荐 / 终局和第二局；不得写为 FIXED / VERIFIED | 后续已随 v0.1.8 发布，但状态不升级
- 2026-08-13 | GitHub Release 保留策略（v0.1.8 发布前时点） | 旧 Release / assets 已删除，tags / 源码历史保留 | 手动删除 `v0.1.0/1/2/3/5/6` GitHub Release 记录与资产，当时只剩 `v0.1.7`；`v0.1.4` 本来无 Release。workflow 仅在新 strict-semver stable 已公开、public packaged 检查通过且没有更高 stable 时，删除严格低版本 stable Release；draft / prerelease 不动，所有 Git tags 永不删除 / 移动 | 当时只读 `gh release list` 确认仅 `v0.1.7`；后续正式发布均按策略清理前一 Release / assets | 删除 Release assets 不可恢复；历史下载摘要只作为审计记录，不表示资产仍可下载 | 此条记录历史时点；v0.1.10 发布后当前只剩 v0.1.10 Release，策略不变
- 2026-08-13 | v0.1.8 / Windows 预发布验证 | Windows packaged 全门禁通过；HB-020 状态不升级 | 产品提交 `4866011a2cc982e22e414472a911a1574f515260` 已 push main；workflow_dispatch 只执行候选门禁，tag-only Release / channel / cleanup 均按预期 skip | run [31627564190](https://github.com/RocXOvO/HexBridge/actions/runs/31627564190) / job `94217823684` 成功，约 5m19s；clean npm ci、audit 0、公开 `0.1.7` 通道、OCR、Windows 13 files / 100 tests、lint、typecheck、pack（EXE 199,024,335 bytes）、metadata、packaged UI / bridge、synthetic `0.1.9` updater、checksums和artifact全通过；updater `downloaded=true`、metadata / installer 请求各1、cache隔离 | 不等于真实 WeGame 交接、整局 OCR / 推荐、终局 / 第二局或实际更新安装；无商业签名 | 可进入正式 tag 门禁，尚未 tag / Release
- 2026-08-13 | v0.1.8 / Release 与保留策略执行 | 已发布；当前唯一保留的正式 Release；HB-020 保持 IN PROGRESS | annotated tag 指向产品提交 `b23b898b218b3e7a69bbc06b83bd3c88c7609db1`；正式 workflow 发布五项资产、写 public channel、回读 packaged public check，并删除旧 `v0.1.7` Release / assets，保留其 tag | run [31628139647](https://github.com/RocXOvO/HexBridge/actions/runs/31628139647) / job `94219791372` 成功，约 5m35s；Windows 100 tests及完整门禁全过。正式 EXE 199,024,334 bytes / SHA-256 `76b6320e1a0bafaca7a2fee0745aad069a436fc10c700964b57ba262e54463c2`；ZIP 274,210,661 bytes / SHA-256 `b6e411ce0cfc11ce6d9740007551e491fc6e6f844861b263da6dae0ad801bf78`；blockmap 201,291 bytes / SHA-256 `f08fe746f1874c5f88c07f157ee5bee89a6d5ddf46352a7a25c8c0955aacbbb2`；latest.yml SHA-256 `59649df2f2194619232e7e7a1ce833eb8cc8033a778d86348471aa019854b1e1`；SHA256SUMS SHA-256 `9742916869a281d1de7577caf354afbfcc736fb72cc00caf0d60d60cd7fa37a2`。public packaged check 为 channelVersion 0.1.8 / updateAvailable false | CI / Release 不能替代真实 WeGame 同机交接、一整局 OCR / 推荐、终局 / 第二局；无商业签名 | Release 非 draft / prerelease；当前 only Latest，历史 tags完整保留
- 2026-08-13 | HB-020 / Runtime 交接回放门禁 | IN PROGRESS（状态不升级） | 新增 reducer→Runtime 的实际状态回放，覆盖 detach→迟到空 ChampSelect→partial InProgress→再次断线→下一局新英雄；交接期不得清 detail / overlay 或递增 request sequence，真实新英雄必须清旧数据并换 generation | 本地全量 14 files / 100 passed + 1 Windows-only skipped，typecheck、lint、diff-check通过；commit `561f9e5` 已 push main | 仍是合成回放，不运行 WeGame、真实 LeagueClientUx / game process、截图或 OCR 模型，不得据此把 HB-020 升级 FIXED / VERIFIED | test-only，v0.1.8 Release 产品代码不变
- 2026-08-13 | HB-020 / 实机交接 runbook | IN PROGRESS（等待用户执行） | 新增 `docs/WEGAME_HANDOFF_RUNBOOK.md`，把真实同机状态链、不变量、失败判据、终局 / 第二局、脱敏字段与 FIXED / VERIFIED 升级门槛写为仓库契约；README 提供入口 | `git diff --check` 通过；内容与 Runtime 受控诊断字段及项目记忆一致 | 文档不能替代用户实际运行，目标仍未完成 | 待报告问题的同一机器手动覆盖安装当前 v0.1.10 后执行
- 2026-08-13 | HB-022 / 国服选人阶段当前英雄与浮窗不显示 | REPORTED / UNDIAGNOSED | 用户实机报告选人界面中当前英雄信息与选人浮窗直接不显示；精确应用版本尚待确认，当前无代码根因或修复结论 | `v0.1.8` Windows CI、packaged smokes 与模拟 handoff 回放均不运行真实国服 `ChampSelect`，不能证明该路径可用 | 待收集版本号、诊断页受控状态链及真实 session 字段级脱敏 fixture，并在同机 queueId 2400 选人阶段复现 / 验收；不得记录 token、路径或完整 session | 只登记实机事实与证据门禁，不与 HB-020 自动合并，不写已修复
- 2026-08-13 | HB-022 / 首轮脱敏诊断与候选仲裁草案 | REPORTED / UNDIAGNOSED→IN PROGRESS | 用户证据显示多 candidate、最终 source=log、credentials verified 后仍只有 transport-connected 且 snapshot 长期 None / null；代码审计高概率为首个可鉴权空 candidate 粘滞，另有 fresh partial / 空 catalog 遮蔽。草案采用 2400+hero 证据仲裁、None 有界重探、非致命机会性 probe、正向字段保留、lobby GET fallback、15 秒脱敏 heartbeat、本地 offset 时间和空 catalog 显式提示 | 当前尚无 review、自动化 tests 或 Windows 结果；`v0.1.8` 既有 CI / 模拟回放不能支持本问题修复结论 | 精确用户版本、真实 session 字段级脱敏 fixture、同机国服 ChampSelect 复验仍缺失；不得记录端口、token、路径或完整 session | 当前不得 FIXED / VERIFIED，等待审查与验证结果
- 2026-08-13 | HB-022 / v0.1.9 本地候选实现与终审 | IN PROGRESS（状态不升级） | target 评分强制 phase=ChampSelect；known terminal 残留不得推断 / 切换，只有 raw None / unknown 可凭 2400+hero 正向证据推断；候选池 10 秒刷新、2 秒有界重探、request hard timeout、机会性 probe 非致命、fresh partial 保留正向字段、lobby GET fallback；诊断 15 秒 heartbeat / 本地 offset / 不记录端口，空 catalog 显式提示 | 最终只读审查无 P0 / P1；本地 113 passed + 1 Windows-only skipped，source bridge / UI、lint、typecheck、diff-check 全通过 | Windows workflow、Windows packaged 和报告用户同机国服 ChampSelect 均未验证，不得 FIXED / VERIFIED | 本地版本已升 0.1.9，尚未 commit / push / tag / Release；公开最新仍为 v0.1.8
- 2026-08-13 | HB-022 / v0.1.9 Windows 预发布验证 | IN PROGRESS（状态不升级） | 候选 commit `68f3822665d7de02f3555d0e8becae04f7b65d05` 已 push main；workflow_dispatch 只运行候选门禁，正式 tag / Release 步骤按预期 skip | run 31662678891 / job 94330609527 于 03:02:29～03:08:02 success，约 5m33s；clean npm ci、audit0、public0.1.8、OCR、Windows113+1skip、lint/typecheck、pack/metadata、packaged UI+bridge、synthetic0.1.10 updater、checksums、artifact 全过 | 不连接真实 WeGame / LCU ChampSelect，不能证明用户问题已关闭，不得 FIXED / VERIFIED | 尚未 tag / Release；公开最新和 public channel 仍为 v0.1.8，不预写正式发布结果
- 2026-08-13 | v0.1.9 / 正式发布与 HB-022 边界 | Release 已发布；HB-022 保持 IN PROGRESS | tag / 产品提交 `8a6e6d20791f0596274b79704d229642b99a7a12`；正式 workflow 完成 Windows 门禁、五项资产、public channel、公开 Release 与旧 Release cleanup，v0.1.0～v0.1.9 tags 全保留 | run31663071062/job94331796412，03:09:58Z～03:15:40Z success约5m42s；113 pass+1 skip、packaged UI/bridge、synthetic updater、public channel全过；channel独立核验0.1.9/199026359 bytes，正式资产摘要已记录 | 不运行报告用户同机真实 WeGame ChampSelect，不能证明 HB-022 关闭；无商业签名，可能 SmartScreen | v0.1.9 为公开 non-draft/non-prerelease 唯一 Release；旧版本建议手动下载安装；HB-022 不得 FIXED / VERIFIED
- 2026-08-13 | HB-022 / v0.1.10 authority 与 match lease 本地候选 | IN PROGRESS（状态不升级） | 用户日志显示两个 candidate 中最终仍选 log source，transport-connected 后 raw / normalized None；候选新增内部进程世代 identity、endpoint / 强 alias registry、统一 retainedPriority、transport / match lease 分离、外部 authority 防覆盖、same-match 重绑、可信交接推进、最后换英雄、active 后同英雄无 identity 新 generation 及终局 / 新局边界；身份字段绝不输出日志 / Renderer | production LcuClient→Runtime 回放新增；本地 15 files / 131 passed + 1 Windows-only skipped，typecheck/lint/diff、source bridge/UI通过；独立审查无P0/P1并批准Windows候选 | Windows workflow、真实WeGame同机选人/交接、完整一局与第二局均未验；不得记录任何用户端口/token/path/进程或对局身份具体值 | 本地版本0.1.10，尚未commit/push/tag/release；公开最新仍v0.1.9，不得FIXED/VERIFIED
- 2026-08-13 | HB-022 / v0.1.10 Windows 候选验证 | IN PROGRESS（状态不升级） | candidate commit `cb2098c79842f61447ab933766b42ff45c1604c5` 已 push main；workflow_dispatch 仅运行候选门禁，tag-only Release / channel / cleanup 按预期 skip | run31665154616/job94338020977 success约5m2s；clean npm ci/hydrate/audit0/public0.1.9/OCR、Windows15 files/132 tests、lint/typecheck、pack EXE199028315、metadata、packaged UI 1024×768、bridge含LCU discovery策略、synthetic0.1.11 downloaded/metadata1/installer1/isolatedCache、checksums/artifact全过 | Windows runner与受控smokes不运行真实WeGame同机选人/交接，HB-022不得FIXED/VERIFIED；不记录敏感字段 | 尚未tag/release，公开Latest/channel仍v0.1.9，不预写正式结果
- 2026-08-13 | v0.1.10 / 正式发布与 HB-022 边界 | Release 已发布；HB-022 保持 IN PROGRESS | annotated tag / 产品 / 记忆提交 `345c0d5443760a9dcc6717a96a6068b6101b16d1`；正式 workflow 完成132 tests、packaged UI/bridge、synthetic updater、public update check、Release/channel/cleanup | run31665517026/job94339115148 success约5m23s；v0.1.10为公开non-draft/non-prerelease唯一Latest；五项资产和public channel version/path/size/SHA-512一致性已记录，v0.1.9 Release/assets已删、v0.1.0～v0.1.10 tags保留 | 不运行报告用户同机真实WeGame选人/交接，发布成功不能关闭HB-022；无商业签名，Node20 deprecated annotation非阻断 | Release notes含修复边界、手动覆盖安装、未签名与真实WeGame待验；HB-022不得FIXED/VERIFIED
