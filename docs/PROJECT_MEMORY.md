# HexBridge 项目记忆

> 最后更新：2026-08-14
> 当前基线：公开最新正式 Release 为 [v0.1.17](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.17)，于 2026-08-14T17:21:55Z 发布，为 Latest、non-draft、non-prerelease。annotated tag object `7b6b638af2a89e19f4bc7ac8623dd31ab0b40bd6` 指向产品 / 记忆 commit `d7edf9fc917d8e1645d109e88324589deb4f7140`；main 可包含 tag 后的本次记忆提交并领先 tag，但 Release 产品源码固定为该 tag 指向。正式 run `31724844667` / job `94530534700` success，约 5m54s；Windows 29 test files / 260 passed、真实 4K fixture 272ms，完整门禁、packaged UI / bridge、差分 updater、Release / public channel / packaged check 全通过。public v2 channel 为 `0.1.17 / 199,236,595 bytes`，public packaged check 为 `updateAvailable=false`。HB-039 / HB-040 与静默安装分流仍为 `FIXED / UNVERIFIED`；未签名 / SmartScreen、用户同机出装 / 空态和真实 installed 安装边界不变。
> 当前候选：`v0.1.18` 源码 commit `8b7bdac` 与 packaged UI smoke 竞态修复 commit `f24ff6f` 已 push main。首次 workflow_dispatch run `31729473777` / job `94545977255` 因 Vue Transition 后旧烟测过早查询校准入口而失败，产品校准功能仍存在；改为 `waitUntil` 等待稳定入口后，第二次 run `31730129727` / job `94548232662` success，约 5m33s，Windows 30 files / 264 passed + 1 Windows skip 及完整候选门禁全通过。当前尚未 tag / Release，公开 Latest 仍为 v0.1.17；真实 installed 更新和用户视觉仍未验证。
> 用途：记录不可丢失的产品边界、接口契约、审查缺陷和发布状态。后续修复应更新对应条目的“状态 / 验证”，不要另建平行记忆文档。

## 记忆维护规则

- 本文件不得记录 LCU token、API Key、PUUID、完整选人 session、截图内容或任何用户身份信息。
- 缺陷状态只使用：`OPEN`、`IN PROGRESS`、`FIXED / UNVERIFIED`、`VERIFIED`、`ACCEPTED RISK`。
- 将缺陷标为 `VERIFIED` 前，必须记录对应自动化测试；涉及 LCU、OCR、DPI、安装器或 Windows 安全存储的事项还要记录 Windows 实机结果。
- 修改产品边界、接口字段、缓存格式或发布流程时，先更新相应“契约”，再在文末变更记录追加一行。
- 不把“构建成功”等同于“Windows 实机可用”，也不把合成 OCR 烟测等同于真实游戏画面验收。

## 一、项目目标与硬边界

HexBridge 是面向 Windows 10/11 x64、国服 / WeGame、简体中文的海克斯大乱斗个人实验助手。当前模式识别契约支持 `queueId ∈ {2400, 3270}`：用户实机已确认国服自定义海克斯大乱斗从 Lobby 到 InProgress 使用 3270；2400 作为既有模式 ID 继续保留。国服正式匹配是否同样使用 3270 尚未实机确认，不得只凭自定义局外推。选人阶段展示当前英雄和备战席英雄的 Tier / 胜率；对局中本地识别实际出现的三张海克斯并给出相对推荐。

不可突破的边界：

- LCU 只读。不得换英雄、交易、修改符文或装备集，不得调用任何 LCU 写接口。
- 不注入游戏进程，不自动点击，不替玩家完成英雄或海克斯选择。
- 不做账号系统、云后端、遥测或战绩上传。更新必须由用户明确点击单一更新入口才可开始 check→download→install；不得在启动 / 普通退出时自动安装或在对局中安装。v0.1.18 候选由 Main 独占静默 NSIS 调用，Renderer 不得控制安装参数；UAC / SmartScreen 仍可能出现且不得绕过。
- 每位用户自行提供 `data.dtodo.cn` API Key；Renderer 永远不能读取明文 Key。
- 字段白名单继续禁止海克斯胜率、胜局和场次；英雄胜率与 Tier 可以展示。现已批准进入实施的唯一新增统计是 data.dtodo 单英雄详情 `augments[*].stats.pickRate`，仅表示当前英雄选择该海克斯的上游选取率，并且只能作次级展示；它不得参与排序、不得冒充全局数据、不得推导。批准实施不等于代码已完成或 Riot 政策已批准产品；详见 HB-030。
- 默认不保存截图；诊断模式也只能保存三张海克斯标题裁切区，绝不能保存完整屏幕。
- 定位为个人实验工具。Riot 当前政策对强化胜率展示、替玩家决策类产品存在风险；扩大分发前必须重新评估政策和数据授权。
- 许可为 PolyForm Noncommercial 1.0.0（source-available，非 OSI 开源）。Mineradio 仅是视觉理念参考，不复制其 GPL 代码、素材、品牌或原创视觉表达。

### 1.1 界面与视觉长期契约（目标与 v0.1.12 / v0.1.13 实现边界，尚未完整用户同机验证）

- 英雄原画可辨识度：实时助手背景中的当前英雄原画应保留足够轮廓、面部 / 武器特征与色彩关系，降低现有模糊和深色遮罩强度，使用户无需读取文字也能辨认英雄；前景文字对比度仍须满足可读性，不能靠把整幅原画压成低对比色块解决层次冲突。电影 / 均衡 / 省电三档可以采用不同处理成本，但都不得让英雄主体不可辨。
- 更新体验当前契约：v0.1.18 候选移除独立更新页和标题栏版本号，由受控全局入口发起一次明确的“应用更新”操作；Main 自行完成 check→download→安装，不再让 Renderer 分段编排检查 / 下载 / 安装。差分成功后走静默 NSIS，系统 UAC / SmartScreen 仍可能出现且不得绕过；对局中在调用前、检查后和下载后都必须 fail closed。此设计取代 v0.1.12 的独立更新页和 v0.1.17 的分段确认 UI，但不允许启动 / 退出时无用户触发自动安装。
- 游戏目录 UI：删除普通设置页中用户难以理解且非必要的“游戏目录”输入 / 选择 UI。底层手动目录发现 fallback 是否保留，必须由主线结合真实国服 LCU 发现证据、安全路径校验和支持成本单独审计；在结论前不得把底层 fallback 的存在当作继续暴露普通用户设置的理由，也不得贸然删除已证明必要的只读发现能力。
- 等待英雄动效：等待当前英雄 / 尚未取得英雄图像时，可在占位图周围加入克制、低频的轨道球旋转，作为“仍在等待数据”的状态提示；不得持续高亮、粒子喷发或干扰正文。`eco`、`InProgress`、窗口 hidden / 最小化 / 不可见以及 `prefers-reduced-motion: reduce` 时必须停止旋转并显示静态等价状态，不能让纯视觉动画继续占用后台渲染预算。
- 英雄榜信息减法：所有职业 / 定位名称必须使用简体中文；移除角色列和角色筛选中重复、用户价值低的展示，不在同一卡片 / 行内重复表达同一角色信息。Tier 不再作为额外拥挤列或浮动徽标，改为英雄卡背景条 / 边缘色带，同时保留准确的原始 Tier 文本或无障碍语义，不能只靠颜色区分，也不得把 Tier 改写成“强度顶尖”等主观宣传文案。
- 英雄榜选中反馈：鼠标点击或键盘导航选中某一英雄行 / 卡时，允许轻微上浮并播放低成本、短时或低频的极光流光，帮助用户确认当前焦点；不能持续大幅缩放、3D 倾斜或高强度发光。`eco`、`InProgress`、窗口 hidden / 最小化 / 不可见和 `prefers-reduced-motion: reduce` 时必须停止流动效果，保留静态边框 / 背景作为等价选中提示；键盘焦点必须清晰且不只靠颜色表达。
- 英雄榜搜索契约：搜索同时覆盖英雄简体中文名、称号 `title`、官方 / 上游 `alias`，以及可审计维护的简中常用别名表，例如“薇恩 / 暗夜猎手 / VN”应命中同一英雄。常用别名必须有显式数据表、来源 / 维护说明、唯一英雄映射和冲突测试，不能临时猜测、把用户输入写回上游字段或伪造 data.dtodo / Riot 提供了不存在的别名；展示时仍以正式英雄名 / 称号为准。
- 应用图标：重做 HexBridge 自有应用 icon，保证小尺寸轮廓清楚、透明边缘正确、暗 / 亮任务栏都可辨。Windows packaged 必须分别验证 EXE 文件图标、运行中任务栏图标、托盘图标和安装器图标均使用预期资源且非空 / 非 Electron 默认图标；多尺寸 ICO / PNG 资源、electron-builder 配置和运行时 tray 路径须保持一致。
- LCU 状态信息架构：移除侧栏左下角独立 LCU 状态块，把连接 / 等待状态合并到实时助手空态或页面标题状态，避免同一状态出现两份甚至互相矛盾。未启动 WeGame / LOL 或未发现可用 LCU 时，普通界面仅保留简洁的未连接状态；实时助手空态不再显示“启动 WeGame…”操作说明，也不再提供“立即重新检测”按钮；后台自动发现必须继续运行。候选数量、发现来源、端口不可达和 probe 原因只进入脱敏诊断，底层 retry IPC 可为诊断 / 恢复保留，但不得重新暴露为普通空态主操作。
- 配色重做：整体配色可重新设计为更高质量、更清晰的暗色层次与状态色系统，不受当前雾青 / 暖金的机械套用限制；必须形成 HexBridge 自己的色板、对比度、边框、背景与交互状态规范。可以参考优秀产品的信息层级和克制微交互，但不得复制 Mineradio、Codex 或其他第三方的代码、素材、品牌、图标、布局细节或原创视觉表达。
- 导航微交互：v0.1.18 候选为侧栏按钮增加克制的状态动效，并以 Vue `out-in` 模式执行页面进 / 退场；`prefers-reduced-motion` 与 `eco` 必须降级为静态或最小过渡，不能在隐藏 / 低资源路径持续动画。标题栏不再显示版本号；Windows packaged UI 已覆盖页面稳定后校准入口和校准流程，但尚无用户视觉验收。
- 自动视觉性能状态机：普通用户界面不得继续暴露“自动 / 电影 / 均衡 / 省电”的手动档位入口，视觉成本应由 Main 主导的自动状态机根据游戏阶段、窗口可见 / 焦点状态、GPU 可用性、系统内存和 reduced-motion 等证据决定。状态可在诊断页只读显示，但 Renderer 不得把任意手动档位写回设置；旧版已持久化的手动 `visualMode` 需安全迁移回自动且不能重置 OCR、浮窗、快捷键等无关设置。该目标与 `autoOcr` 是否开启相互独立，隐藏视觉入口不得顺带开启周期截图。
- 验收边界：上述目标虽已进入 v0.1.12，但不代表用户同机视觉 / 性能验收已经完成。验收仍需覆盖 1080p / 2K / 4K、100%～150% DPI、长中文英雄 / 职业名、自动性能状态迁移、reduced-motion、窗口可见性和 InProgress；通过逐页视觉快照、Windows packaged 人工可读性与后台 CPU / GPU / 重绘测量后才可写已完成。
- v0.1.12 / v0.1.13 当前边界：v0.1.12 新增独立“更新”导航 / 页面和可用更新 banner，并从设置页移除主要更新卡；设置页删除游戏目录 UI，但 Main / IPC 的手动目录 fallback 暂时保留。英雄榜移除角色筛选 / 列，搜索接入显式可审计的常用别名表并覆盖 `name / title / alias`，Tier 通过行背景色带表达，但准确 Tier 文本不得改写成“强度顶尖”等主观文案；点击 / 键盘焦点采用轻微上浮和极光，eco / hidden / reduced-motion 有静态降级。实时助手降低原画遮罩 / 模糊、把未连接状态合并到空态并删除侧栏独立 LCU 块，等待图保留受性能模式 / 可见性守卫的轨道动效。新 SVG icon 生成 1024 PNG 与 16～256 多尺寸 ICO，builder、窗口与托盘路径已接入；verifier 只检查格式、多尺寸与非空大小，尚未在 Windows EXE / 任务栏 / 托盘 / 安装器四处实看。v0.1.13 已移除普通设置页四档 `visualMode` 下拉框与 Renderer handler，并从受限设置 IPC 白名单移除该字段；revision 2 将旧手动 override 迁移为 `auto`，Main 通过独立 policy 根据窗口 / 游戏 / 资源状态决定实际档位。正式 Windows 门禁已通过，用户同机性能仍未完成，见 HB-028。
- v0.1.18 候选边界：独立更新页与其导航已移除，标题栏版本号也已移除；首次真实跨 `0.1.17→0.1.18` 更新后由 `ConfigStore` pending 状态弹出 curated 改进列表，关闭后持久化，新安装不得误弹。出装推荐继续保留，任何缺失分组仍明确显示“暂无数据”。该候选尚未进入 Windows / Release，不能把 source UI smoke 外推为真实升级或视觉完成。

## 二、技术栈与关键模块

- Electron 43、Vue 3、TypeScript、electron-vite、electron-builder。
- `src/main/index.ts`：单实例、托盘、可配置 OCR 全局热键、生命周期。
- `src/main/runtime.ts`：聚合 LCU、数据、OCR、推荐和窗口状态；当前主要状态机入口。
- `src/main/runtime-guards.ts`：snapshot 去重、OCR 启停、英雄详情提交与版本匹配守卫的可测试纯函数。
- `src/main/lcu/`：凭据发现、只读 HTTPS / WebSocket 客户端、session 归一化。
- `src/main/data-service.ts`：上游请求、Key 验证、版本缓存、错误状态。
- `src/main/ocr/`：显示器截取、门控、裁切和 PaddleOCR / ONNX 推理。
- `src/main/window-manager.ts`：主窗口、选人浮窗与校准窗口；当前 dirty 候选已删除自动 augment / 海克斯结果 BrowserWindow。
- `src/main/ipc.ts` + `src/preload/index.ts`：Renderer 的唯一业务边界。
- `src/shared/data-normalize.ts`：上游字段白名单与隐私清洗。
- `src/shared/recommendations.ts`：英雄和海克斯的纯函数排序规则。
- `src/renderer/`：实时助手、英雄榜、设置、诊断、选人伴随窗与校准界面；当前 dirty 候选已删除 `#augment` route 和 `AugmentOverlay.vue`，三卡 OCR 结果只进入实时助手。

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

统一输出 `ChampSelectSnapshot`：`phase`、`locale`、`queueId`、`modeActive`、`currentChampionId`、去重后的 `benchChampionIds`、`benchEnabled`、`updatedAt`。当前契约中 `modeActive` 当且仅当 `queueId ∈ {2400, 3270}`。`carryForwardMatchContext()` 只在 `GameStart / InProgress / Reconnect` 中携带上一阶段已确认的受支持队列与英雄；进入结束阶段、其他队列或新非比赛上下文时不得继续携带。

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
- 英雄专属海克斯：`augmentId`、`rank`、`total`、`tier`，以及 data.dtodo 单英雄详情 `augments[*].stats` 继承 `PublicStats.pickRate` 的英雄专属 `pickRate`。这里的 `total` 是排名总数，不是对局场次；`pickRate` 必须是有限的 0～1 数值，否则清洗为 `null`。
- 当前英雄出装：只允许消费已经由同一 `GET champions/{id}.json` 返回的文档化 `builds` 数组，不得为出装另行发起 API 请求或消耗 credits。默认只展示 `builds[0]` 自身的出门装、第一组核心装和情境装备，不得跨 build / 流派拼接，也不得把 `fullItems` 或 `itemOrders` 伪装成“六神装”。每件装备只有在详情明确给出正整数 ID、非空名称和合法 HTTPS 图标时才可展示；缺名、缺图或分组为空时明确显示“暂无数据”，不得补齐或推断。UI 必须标注上游 `iesdev` 来源与补丁。
- 必须丢弃：海克斯 `winRate`、`wins`、`games` 及其他未列字段。全局目录或其他来源中的 `pickRate` 不在批准范围，必须丢弃；不得用 `rank`、`tier`、`total`、个人样本或其他字段推导选取率。
- 详情缓存 schema 契约：v0.1.17 候选使用本地 schema v3，不得只依赖上游 `dataVersion`。v1 / v2 即使 `dataVersion` 相同也不能作为正常命中；只有网络失败时才允许作 stale `rank / tier` 回退，且其 `builds` 必须为空，不得伪造 `pickRate` 或出装。详情提交和 Renderer 消费仍须通过 `championId + dataVersion` 一致性守卫；schema / 数值校验失败不得伪装成 0%。

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
- `updateSettings(patch)`：当前实现只允许视觉模式、自动 OCR、两个浮窗开关、热键、游戏目录、显示器、校准区域、诊断截图开关。长期界面契约要求删除普通设置页的游戏目录 UI；Main / IPC 中手动目录 fallback 是否继续保留须经主线审计后决定。若保留，只能是严格路径校验、明确诊断用途的受控 fallback，不能重新成为普通用户必填项或任意文件系统入口。
- `validateAndSaveApiKey(key)` / `clearApiKey()`
- `refreshData()` / `triggerOcr()`
- `clearDiagnosticScreenshots()`
- `startCalibration()` / `completeCalibration(rects)` / `cancelCalibration()`
- `windowAction(minimize|maximize|close|quit)`
- v0.1.18 更新业务 IPC 只暴露 sender 受限、无参数的 `applyUpdate()`；旧的 Renderer `check / download / install / openRelease` IPC 已移除。Main 独占版本检查、下载模式判定、下载与安装顺序，Renderer 不能传 URL、silent 开关、installer 路径或命令行；调用前、检查后、下载后三处都必须重新验证不在对局中。
- API Key 申请入口只允许 Main 打开固定 `https://data.dtodo.cn/developer.html`，Renderer 只能发送 sender 受限的无参业务意图，不能传入或改写 URL。Key 明文、申请页地址选择和导航仍不得落到 Renderer 的任意网络能力。

校准矩形必须含左 / 中 / 右三块，`x/y/width/height` 均为 `[0,1]` 内数值、宽高大于 0，且不得越过归一化屏幕边界。Renderer 输入仍需在主进程重新校验。

### 3.4 OCR 契约

- `desktopCapturer` 只截取用户设置的显示器；依据 `bounds × scaleFactor` 请求物理尺寸。
- 默认标题区域使用归一化矩形，用户可以依次拖框校准左 / 中 / 右标题。
- v0.1.12 默认关闭自动 OCR；v0.1.16 候选进一步要求只有本局为 `active` 且 Main 窗口可见时才调度自动扫描。用户显式开启后每 2 秒只允许一个自动扫描任务，先做最大宽 960px 的低分辨率标题 ROI 门控，信号命中后才进入 full OCR；`busy` 时拒绝自动重入。手动按钮 / 当前配置快捷键只触发一次有界捕获，不经过周期门控，并可为取得优先级等待在途自动任务最多 1.5 秒。
- 先对三块裁切做低成本灰度信号门控，至少两块命中才启动 OCR。
- 三块按左 / 中 / 右串行识别，中文标准化后精确或模糊匹配；置信度阈值不得低于 90%。
- 三张全部可靠识别才自动展示；组合去重。v0.1.16 候选对同一组三卡 full OCR 成功一次后不重复识别，不可靠结果最多重试两次，连续两次明确 absence 才重置 gate / round 扫描 tracker；该重置只允许后续重新识别，不得清除 HB-034 规定的上一组可靠展示结果。当前配置的手动快捷键只强制重新截图 / 识别，不发送键鼠事件；其原子注册与 Windows 游戏前台未验证边界见 HB-025。
- 识别结果呈现契约按用户 v0.1.13 实机反馈修正：海克斯三卡结果与推荐应作为实时助手页的对局内容显示，不得识别成功后打开覆盖屏幕顶部的大块黑色浮窗。是否保留任何小型伴随窗口须由 HB-029 重新审计；当前用户明确否定的“黑屏顶部浮窗”不得作为完成态。
- 自动扫描只在保留的目标本局上下文为 `active + queueId ∈ {2400, 3270}`、Main 可见、自动 OCR 已显式开启且 Runtime 未 stopping 时运行；LCU transport 交接本身不能否定仍有效的 active generation。离局 / generation 或 champion 变化、Main hidden / minimized、关闭自动 OCR或 stopping 必须停表；在途扫描结束后再次以 scan epoch + generation + champion + stopping 原子校验，旧结果不得进入新局或重新显示已移除的浮窗。
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
- 诊断截图目录固定为 `userData/ocr-diagnostics`；默认关闭，仅在用户通过按钮或当前配置快捷键手动识别时保存三块标题裁切，最多保留 60 张 PNG，并通过诊断页业务 IPC 一键清除（见缺陷 HB-008）。

## 五、推荐规则

- 当前英雄单独置顶。
- 备战席按 Tier 升序、英雄胜率降序、英雄 ID 升序；缺统计排在可靠统计之后。
- 当前英雄与备战席的总体最优项标记 `isBest`；相对当前英雄的胜率差只有双方胜率都存在时才计算。
- 三张海克斯比较键依次为：英雄专属 `rank`、英雄专属 `tier`、全局 `tier`。
- 排名键相同显示“并列”；无可靠数据时 `position=null` 且显示“暂无可靠数据”，不得制造排序。
- 英雄专属 `rank` 仍是上游官方顺序的最高优先级；`tier` 与获准的英雄专属 `pickRate` 只能展示，`pickRate` 不得覆盖、调整或打破官方 rank 顺序，也不得作为 tie-breaker。缺失选取率必须为 `null` 并显示“暂无数据”，不能显示 0%。

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
- v0.1.18 候选设置收口：申请 API Key 的按钮只通过 Main sender 校验后的无参 IPC 打开固定 `https://data.dtodo.cn/developer.html`，Renderer 不能提供 URL；设置说明已精简，但 Key 验证 / 保存、safeStorage 和失败保留旧 Key 的安全契约不变。该外链和文案尚未经过 Windows packaged / 用户验收。
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
- 后续等待英雄视觉目标：当客户端已连接但当前英雄 / 英雄图尚未到达时，占位图周围增加克制、低频的轨道球旋转，并用静态文案保留同一语义。该目标尚未实现；`eco`、`InProgress`、hidden / 最小化 / 不可见和 reduced-motion 必须立即停转，且不得因此扩大 HB-026 的捕获 / 渲染性能风险。

### HB-018 选人结束后对局上下文丢失，游戏内功能无法启动

- 严重度：阻断性（进入游戏后 OCR、海克斯推荐与对局浮窗不可用）
- 状态：`FIXED / UNVERIFIED`
- 用户症状：选人阶段结束后，当前英雄等信息直接消失；进入游戏后没有对局信息，后续功能尤其 OCR 和海克斯推荐失败。
- 确定根因：LCU 的 gameflow phase 与 champ-select / current-champion 端点不是原子快照；离开 `ChampSelect` 时选人端点可能先 404 或瞬态 `None`。旧流程把该空值写入相邻 snapshot，级联清除当前英雄、详情和 OCR / 推荐上下文，导致进入游戏后功能停用。
- 代码修复：新增独立 `MatchContextTracker`，不再让单次非原子 endpoint 空值直接清除本局上下文；HB-020 又将原短 grace 强化为 `selecting / launching / active + generation` 状态机。`None` / 未知 phase / transport handoff 使用不续期的 10 分钟 launching 租约，可靠进局证据升级为 12 小时 active 上限；明确 terminal phase、异队列或下一 `ChampSelect` 清理 / 换代；非 `ChampSelect` 阶段只清 bench，不清当前英雄 / 详情 / 推荐。断线后直接进入同 queue 的第二局也按新 generation 替换，避免复用上一局。
- 跨阶段上下文契约：在已确认 `queueId ∈ {2400, 3270}` 的 `ChampSelect` 中，最后有效的 `currentChampionId`、英雄详情及其 `dataVersion`、可派生的英雄专属海克斯推荐上下文，必须跨 `ChampSelect → GameStart → InProgress → Reconnect` 保留。阶段切换时即使 champ-select session / current-champion 端点暂时为空，也不得以空 snapshot 覆盖已确认的本局上下文；详情异步返回仍必须遵守 `championId + requestSequence + dataVersion` 一致性守卫，不能把上一局或错误英雄详情带入本局。
- 清理边界：只有进入明确结束阶段（如 `EndOfGame`）、确认切换到其他队列 / 新比赛上下文、或 LCU 证据表明当前局已失效时，才清理携带的英雄、详情、推荐和 OCR 组合状态。普通 `GameStart` / `InProgress` 短暂空 session、WebSocket 重连或 token / 端口轮换不得提前清空；第二局开始时必须替换而非复用上一局上下文。
- OCR / 结果验收：真实国服 WeGame 无边框对局中，进入 launching / active 上下文后应继续显示本局英雄 / 数据版本；默认关闭自动 OCR 时由按钮 / 当前配置快捷键做单次识别，用户显式开启后才按 2 秒低分辨率门控周期自动识别，并基于本局英雄详情把推荐结果写入实时助手页面。选人→游戏过程中不得因 LCU transport 交接而出现上下文闪空、扫描停表或结果永久缺失；不得自动弹出用户已否定的黑屏顶部浮窗，详见 HB-029。只有本局上下文明确定义为结束 / 换代时才停用并清除，同局 LCU 重连不得破坏当前 generation。
- 自动化证据：`v0.1.6` 预发布与正式 tag Windows workflows 均以 12 test files / 72 tests 通过，覆盖 10 分钟不续期 handoff 租约、active 上限 / 独立确认、phase-before-aux、旧 generation 拒绝、游戏进程解析、OCR 与 Renderer 交接状态；lint、typecheck、packaged UI / bridge 等完整门禁同样通过。真实国服 LCU / 进程时序、OCR 和浮窗仍未实机验证，因此不能标记 `VERIFIED`。
- 必须验证的验收标准：用可控 phase / snapshot 序列覆盖 `ChampSelect(英雄A, queue 2400/3270) → GameStart(空 session) → InProgress(空 session) → Reconnect → EndOfGame`，断言 A 的英雄 / 详情 / 推荐上下文在比赛阶段保留并只在结束时清理；覆盖第二局英雄 B、其他队列和过期详情返回，断言不串局。Windows packaged 实机还需验证对局信息、自动 / 当前配置快捷键 OCR 和实时助手内推荐结果全链路。
- 隐私与日志：诊断只允许记录脱敏 phase、queueId、是否携带上下文、英雄数字 ID、状态转换原因和稳定错误代码；不得记录 LCU token、API Key、PUUID、完整 champ-select / gameflow session、带凭据 URL或未裁切截图。

### HB-019 客户端内自动更新

- 严重度：中高（不阻断当前版本功能，但每次升级都依赖用户手动下载 / 安装，易滞留在已知损坏版本）
- 状态：Windows packaged local-feed 检查 / 下载 / SHA-512 / 隔离 cache 窄范围 `VERIFIED`；真实 GitHub stable Release 已发布但客户端 check / download 与 `quitAndInstall` 实际安装仍 `FIXED / UNVERIFIED`
- 安装交互子项状态：`FIXED / UNVERIFIED`。v0.1.17 的 Main `downloadMode` 分流已发布但未做真实 installed 安装；v0.1.18 候选进一步改为无参 `applyUpdate` 单次显式触发，Main 完成 check→download→静默 NSIS install。当前只通过本地 source 门禁，尚无 Windows workflow 或 installed 实机证据，HB-019 总体不得标为 `VERIFIED`。
- 用户目标：客户端能够在应用内发现并安装新版本，避免每次前往 GitHub 手动下载安装包。
- 代码实现：集成 `electron-updater@6.8.9`，使用 GitHub stable provider，仅在 packaged Windows 启用；禁用 prerelease 和 downgrade，且不得在启动 / 普通退出时自动安装。v0.1.18 候选移除独立更新页和旧 `check / download / install / openRelease` Renderer IPC，Main 只接受 sender 受限的无参 `applyUpdate`，自行编排检查、下载和安装。
- 界面演进：v0.1.12 曾使用独立更新页；v0.1.18 候选已删除该页面 / 导航及标题栏版本号，以单一全局入口发起更新。首次真实跨 `0.1.17→0.1.18` 更新后通过 `ConfigStore` pending 状态展示 curated 改进列表，关闭即持久化；全新安装不弹出，不能把首次启动误判为跨版本升级。
- 发布源契约：更新元数据和二进制只允许来自公开仓库 [RocXOvO/HexBridge Releases](https://github.com/RocXOvO/HexBridge/releases)；默认稳定通道只接受非 draft、非 prerelease、语义版本高于当前版本的正式 Release，不自动降级，不把 Actions artifact、分支构建或本地交叉产物当更新源。下载前后必须校验版本、资产名 / 架构及发布清单；无商业代码签名期间必须在 UI 明示“未知发布者 / 可能触发 SmartScreen”，不得宣称签名验证已完成。
- 用户控制契约：v0.1.18 候选只有用户点击单一更新入口才开始本次 check→download→install；不得在启动、普通退出或后台检查中自行安装。Main 在调用前、检查完成后和下载完成后都重新验证非对局状态，任一阶段进入对局即终止安装链。确认后的静默 NSIS 仍可能触发 UAC / SmartScreen，应用不得绕过或承诺消失。
- 状态与错误契约：UI 必须区分检查中、已是最新版、发现更新、等待确认、下载中、已下载待安装、安装启动、失败与取消；下载显示可理解的字节 / 百分比进度。断网、GitHub 限流、元数据错误、资产缺失、校验失败、磁盘空间不足、用户取消和安装启动失败必须给出脱敏、可操作提示，并提供有界重试或回到手动 Release 页的入口；失败不得损坏当前安装或删除仍需恢复的下载文件。
- 安全边界：所有网络检查、下载、校验和安装启动必须在 Main 进程；Renderer 只能通过 schema / sender 校验的无参 `applyUpdate` 发起一次业务意图，不能传入任意 URL、文件路径、命令行、Release asset 或安装参数。导航仍受精确 allowlist 控制；日志 / 更新请求不得携带或泄露 GitHub OAuth token、LCU token、API Key、PUUID 或完整 session，公开 Release 下载不应依赖用户 GitHub 凭据。
- 生命周期契约：对局 `InProgress`、OCR 在途、校准窗口打开或安装退出可能影响游戏时，不自动弹出抢焦点窗口或启动安装；对局中即使差分包已下载也必须阻止“重启更新”。启动或正常退出时不得因已下载更新而未经确认自动安装。安装前安全停止 OCR / LCU 监听并保存允许持久化的设置，不上传游戏状态。
- v0.1.17 历史实现边界：当时下载与安装 / 重启分别确认，并按 `downloadMode` 决定静默或普通安装；该实现仍是发布历史，不再是 v0.1.18 当前 Renderer 交互契约。v0.1.18 的单击应用更新仍是一次明确用户操作，不能演变为未确认的启动 / 退出自动安装。
- 已实现安全边界：v0.1.18 候选以一次明确 `applyUpdate` 作为整条链的用户授权，并在调用前 / 检查后 / 下载后重复执行 `modeActive` 对局守卫；更新错误与 release notes 先脱敏再进入状态 / 日志。发布 workflow 包含 `latest.yml`、blockmap 和安装资产；校验器检查 updater 元数据及 SHA-512。SHA-512 仅证明下载内容与更新元数据一致，不证明发布者身份，也不能替代 Authenticode 商业签名；未签名提示与 SmartScreen 边界继续保留。
- Windows packaged 下载烟测实现：`test:update:packaged` 启动本地 generic feed，基于当前 patch 自动构造 `+1` 版本，生成对应 `latest.yml` 并复制安装包 / SHA-512；实际 packaged EXE 执行 check + download，但明确不调用 install。Updater adapter 改为 dynamic loader，使纯 unit tests 不导入 Electron 可执行模块。
- 烟测隔离与安全：generic feed 仅允许显式测试 flag / env 下的严格 loopback URL；进程使用独立 `--user-data-dir`、`LOCALAPPDATA` 和 `APPDATA`。断言 metadata 与 installer 请求均命中、下载目标位于隔离 cache；任务有界等待，退出时有界 `taskkill` 并清理临时目录。审查已修正 `noCache` pathname 和 cache 隔离问题，之后无 P0 / P1。
- 自动化与审查证据：`v0.1.6` 预发布 workflow_dispatch run [31614808777](https://github.com/RocXOvO/HexBridge/actions/runs/31614808777) / job [94174846929](https://github.com/RocXOvO/HexBridge/actions/runs/31614808777/job/94174846929) 用时约 4m59s；正式 tag run [31615319004](https://github.com/RocXOvO/HexBridge/actions/runs/31615319004) / job [94176558591](https://github.com/RocXOvO/HexBridge/actions/runs/31615319004/job/94176558591) 用时约 5m14s。两次均通过 Electron hydrate、版本门禁、audit、OCR、72 tests、lint、typecheck、pack、metadata verifier、packaged UI / bridge / updater download smokes、checksums 和 artifact；tag run 另完成公开 Release。
- 精确 updater smoke 证据：正式 tag run 合成 patch `0.1.7`，结果为 `availableVersion=0.1.7`、`downloaded=true`、`metadataRequests=1`、`installerRequests=1`、`isolatedCache=true`。这验证了 Windows packaged `v0.1.6` EXE 对严格 loopback generic feed 的 check / download、SHA-512 和隔离 cache 路径，不执行安装。
- 真实 channel 发布事实：公开、非 draft / prerelease 的 `v0.1.6` Release、`latest.yml`、blockmap 和 EXE 已实际发布，因此 GitHub stable channel 现在存在可供 `v0.1.5` 发现的更高正式版本。该事实只证明服务端发布源就绪，尚无用户 packaged `v0.1.5` 对 GitHub 发起 check、下载或安装的实机证据。
- 剩余边界：generic feed smoke 不等于公开 GitHub provider 请求，也不调用 `quitAndInstall`，不验证 UAC / SmartScreen、替换已安装版本或升级后重启。因此只能窄范围 `VERIFIED`；真实 GitHub `v0.1.5→v0.1.6` 客户端 check / download 和完整安装链仍未验证。`v0.1.3` 用户必须先手动安装 `v0.1.5` 或更新正式版一次，后续版本才可使用客户端内更新。
- 必须验证的验收标准：覆盖无更新、正式更新、忽略 prerelease / draft、版本相等 / 降级、元数据和资产篡改、下载失败 / 重试、断点失败、校验失败、磁盘不足及安装启动失败；断言 Renderer 不能注入 URL / 路径 / 命令 / silent 开关。Windows installed 应用需从 v0.1.17 检查到 v0.1.18 或后续测试 Release，单击后完整执行 check→download→静默 NSIS→重启版本回读；分别在调用前、检查后、下载后切入对局并断言 fail closed。另须验证启动 / 普通退出不自动安装、UAC / SmartScreen 与未签名提示准确，以及跨版本 curated 改进列表只弹一次、关闭持久化、全新安装不弹。在真实 GitHub 客户端和实际安装链验收前，不得把 HB-019 整体标为 `VERIFIED`。

### HB-020 WeGame 选人到游戏客户端交接期上下文丢失

- 严重度：阻断性（交接后本局英雄 / 详情、OCR 和海克斯推荐可能不可用）
- 状态：`IN PROGRESS`（最新用户脱敏日志已覆盖连续两局的 active / 英雄保留、终局清理与第二局换代子链；三卡 OCR / 推荐和真实游戏性能仍未闭环，不能标整体 `VERIFIED`）
- v0.1.11 用户同机真实回归：选人阶段与最后等待阶段均能正常显示当前英雄；在 League 启动独立游戏客户端之前的交接空窗，主窗口当前英雄再次消失并回到“等待选择英雄”。这证明 3270 / actions / trailing-poll 修复只关闭了此前的选人阶段拒绝，尚未关闭跨客户端交接问题。当前没有足够的脱敏状态链确认这次清空发生在哪个 reducer / transport / process / Renderer 分支，不得把既有根因直接套用为本次新根因。
- 本轮高概率根因（尚未实机终证）：独立游戏进程首次被检测到后，旧路径会立即把 `launching` 提升为 `active`；随后 launcher / LCU 在交接空窗给出瞬时 `Lobby / WaitingForStats / EndOfGame` 等 terminal-like phase 时，旧 tracker 对 active 上下文缺少交接确认或独立进程心跳宽限，可能直接清空英雄。另一条高概率路径是 raw phase 为 `None`、gameflow 没有 queue 时，lobby fallback 暂时给出其他队列；旧逻辑没有区分 queue 来自 gameflow 还是 lobby fallback，可能把该暂态值当可信异队列并清空。这两条来自代码路径与已知症状的对应关系，不是用户日志已经证明的唯一根因。
- v0.1.13 交接实现：poll evidence 新增 `queueSource = gameflow | lobby | none`；只有可靠 gameflow queue 或完整新 ChampSelect 才能原子结束 / 换代，`None + lobby fallback` 的异队列先进入有界确认而不立即破坏旧局。独立游戏进程检测不再只是一次性 active 信号：Runtime 在 `launching / active` 期间每 2 秒检查，按 generation + champion 原子守卫调用 `confirmGameActive`，tracker 保存独立游戏心跳。第二轮审查发现并修正 P1：即使 phase 是 `FailedToLaunch / TerminatedInError`，刚刚确认仍在运行的独立游戏进程也必须优先于 launcher 的瞬时失败 phase；只有没有 fresh 独立进程心跳时，明确失败才可立即清理。真实 gameflow 异队列与完整下一 ChampSelect 仍必须换代，不能把宽限变成串局。
- v0.1.13 用户同机脱敏时间线（不记录端口、凭据、路径、英雄 ID或完整 session）：应用最初在无客户端进程时保持 detached / no match；WeGame / LCU 启动后完成只读连接，依次观察目标队列 3270 的 Lobby、Matchmaking、ChampSelect。ChampSelect 从空英雄进入 `selecting / generation 1`，最后一次换英雄仍在同一 generation；随后进入 `launching`，再到 `InProgress / active`，全程保留同一最终英雄和 retained authority。对局结束侧先出现 `WaitingForStats` / 空 phase，游戏进程退出确认后才清理到 `matchStage=none`。这证明本次报告机器上“选人结束→独立游戏客户端启动→InProgress”的英雄连续性子项已通过，也证明清理并非发生在交接空窗；但单次时间线未覆盖第二局，且终局 phase / 退出清理语义仍需按 runbook 单独复核，因此 HB-020 总体继续 `IN PROGRESS`。
- 最新两局用户日志证据（不记录端口、路径、身份、凭据或完整 session）：同一报告机器的脱敏时间线现已覆盖连续两局；每局在 LCU active 期间都保持该局已确认英雄，终局均清理旧 match context，下一局建立新的本局上下文而未复用上一局英雄。它补齐 HB-020 的终局清理与第二局换代正向实机证据；但附件同时在 23:12 记录热键手动 OCR 返回 `BUSY`，表明 OCR / 推荐可用性仍未闭环，所以不能把“本局上下文生命周期通过”外推成整个产品链 `VERIFIED`。
- 范围冻结：用户已明确确认不再发生交接时英雄丢失，最新两局日志又覆盖终局清理与第二局换代；不得继续把 `normalize` / handoff reducer 当作当前主线反复修改，也不得为了尚未复现的交接问题扩大租约或放松清理边界。只有未来同机出现新的脱敏反例时才重新打开上下文状态机；当前 HB-020 剩余工作限定为 OCR / 推荐结果与同一 generation 的正确联动，以及正式匹配 queue 等尚未采集的产品边界。
- 第二轮审查另一 P1 与 dirty 修正：`tasklist` 结果从 boolean 改为 `running | not-running | error`。`GameProcessExitGuard` 必须针对同一 generation + champion 先真实观察到 `running`，之后仅在 active 状态下连续观察 `not-running` 满 4 秒才允许报告退出；`error` 中断负向确认，launching 阶段绝不据此清理。退出 guard 成立后仍由 tracker 检查 5 秒独立心跳已经过期，generation + champion 仍匹配时才原子清除上下文。这样 tasklist 暂态错误、第一次未发现、旧 generation 迟到结果都不能结束本局。
- 证据来源隔离：可靠三卡 `augment-interface` 仍可把上下文推进 active，但不能写入 / 刷新“独立游戏进程仍在运行”的 heartbeat；只有真实 game-process `running` 结果能够续该心跳，避免 OCR 自身把已经退出的游戏无限续租。
- 自动化与实机证据边界：P1 增量覆盖 fresh heartbeat 优先 terminal failure、tri-state tasklist、同 generation / champion 的 running→4 秒连续 not-running、error 中断、launching 不清、5 秒心跳过期原子清理及 augment-interface 不续进程心跳；v0.1.13 正式 Windows 200-test 门禁通过。最新两局用户日志又补齐报告机器上的交接、active 英雄保留、终局清理与第二局换代，但没有补齐 OCR / 推荐和性能；因此只能把 LCU match-context 生命周期子链记为实机通过，HB-020 总体继续 `IN PROGRESS`。
- v0.1.12 交接实现：`MatchContextTracker` 在本局尚未成为 active 时，把 launcher-side `Lobby / WaitingForStats / PreEndOfGame / EndOfGame`、空 / 未知 phase、partial observation 和结构存在但英雄 / identity 已消失的 outgoing ChampSelect 视为可能的 handoff，提交 `launching + handoffCommitted` 并使用有界 launching 租约保留已确认英雄 / 详情，而不是沿用旧 15 秒 terminal confirmation 清空；不同正英雄、可靠新 identity、明确失败和租约到期仍须换代 / 清理。production `LcuClient → Runtime` 回放已覆盖 3270 选人后短暂 Lobby 再到 InProgress，断言 generation、英雄详情、overlay、request sequence 与 OCR 资格连续。这是针对实机症状的保守实现，不是已经确认的新根因或修复闭环。
- 首轮审查 P1 修正：可信且显式的异队列 observation 现在先于 launcher-side terminal / Lobby 宽限处理；它会立即清理旧本局，而不再被 handoff grace 暂时保留。只有来自可信 authority 的显式异队列可以破坏上下文，外部 / 未信任 authority 仍不能覆盖旧局。对应测试与最终只读审查已通过，但 Windows 与真实第二局 / 转入其他队列尚未完成。
- 后续审查 P1 修正：当可信同一 poll 给出完整受支持 `ChampSelect`，且 queue 从 2400 切到 3270 或从 3270 切到 2400 时，tracker 直接把它作为新局原子换代：更新 queue / hero、进入 `selecting` 并只递增一次 generation，不得先经过清空快照、handoff 宽限或把另一受支持 queue 错当普通异队列终止。当前只由 2400↔3270 两向目标测试证明，完整 Runtime 链、Windows 与真实同机换队列仍未验证。
- 最新用户实机证据：用户 v0.1.10 同机日志完整覆盖自定义海克斯大乱斗 Lobby→Matchmaking→ChampSelect→InProgress，实际 queue 始终为 3270。ChampSelect 已有有效英雄，但旧代码只接受 2400，因此 match context 从未建立；InProgress 选人 endpoint skipped 后英雄为 null。这已直接解释本次“选人有英雄但进局丢上下文”，不再把它归因于未确认的游戏进程名或单纯 transport 断线。
- 已确认 P1 根因：最后有效选人快照后，transport failure 将 tracker 切到 `launching`；LCU 短暂恢复时可返回迟到的 `phase=ChampSelect`，同时 champ-select session / current 已 404。旧 reducer 仅因 `launching→ChampSelect` 就将其当作下一局并先清 confirmed，10 分钟交接租约根本无机会执行；旧测试还将这一错误行为固化成预期。
- 新增确定根因：v0.1.10 的目标模式判定仅接受 2400，真实自定义局的 3270 因而在有效 ChampSelect 阶段仍得到 `modeActive=false / matchStage=none / generation=0`。当前修正必须让 2400 / 3270 共用同一目标队列判定，而不是在 LCU client、tracker、Runtime、Renderer 或 OCR 各自硬编码；正式匹配实际 queue ID 仍待实机确认。
- `v0.1.8` 候选修复：reducer 显式接收 endpoint `ok/empty/error/skipped`、可用的 `gameId` 身份与 destructive / partial 证据；partial poll 只允许 `GameStart/InProgress/Reconnect` 等非破坏性阶段单调推进，不得用局部 terminal / queue / new-select 清空上下文。迟到空 session、同 gameId 或无 ID 同英雄的 outgoing observation 保留旧上下文但不续租；异队列、不同英雄、不同 gameId 和真实终局仍清理 / 换代。日志只写 phase、队列 / 英雄 ID、endpoint 状态与受控 `lastDecision`，不写完整 session、token、PUUID 或路径。
- 既有尝试性实现：`MatchContextTracker` 使用 `selecting / launching / active` 与 generation，`None` / unknown / transport handoff 使用不续期租约；GameStart / InProgress / Reconnect、`League of Legends.exe` 进程证据或首次可靠三卡可尝试确认 active，terminal / 异队列 / 下一 ChampSelect 清理。`applyLcuPollResults` 先提交 phase 再处理 auxiliary failure；OCR 不依赖 `lcu.connected`，迟到结果以 generation + champion 守卫。上述代码存在且受单元测试覆盖，但真实报告证明它们尚未形成有效实机闭环。
- Renderer 状态：LCU transport 已断开但本局 context 仍在时，界面明确显示“LCU 已交接”和“游戏客户端接管中 · 本局信息已保留”，不再把该状态呈现成普通“等待客户端”。
- 自动化假闭环边界：此前模拟 phase / endpoint 的 72 / 73 / 80 tests、v0.1.11 的 139 passed + 1 Windows skip、重命名 Node 为 `League of Legends.exe` 的 Windows 进程测试以及 packaged UI / bridge smokes，均没有运行真实 WeGame 交接链。用户 v0.1.11 同机回归已再次证明它们只能覆盖局部函数和受控流程，不足以支持 HB-020 的修复结论；今后不得用测试数量、Windows 构建成功或重命名进程检测单独把 HB-020 写为 `FIXED`。
- post-v0.1.8 回放门禁：`tests/runtime-handoff.test.ts` 不再只测 reducer，而是把实际 `MatchContextTracker / applyLcuPollResults` 输出依次送入 `HexBridgeRuntime.handleLcuUpdate`；断言 transport detach、迟到空 session/current、partial InProgress 和再次断线期间，英雄详情对象、推荐 overlay、champion request sequence 与 OCR update path 均连续；只有不同 game identity / 不同正英雄的真实下一局才清旧详情并进入 generation 2。该门禁随 test-only commit `561f9e5` 已 push main，尚未进入 v0.1.8 tag；全量本地为 14 files / 100 passed + 1 Windows-only skipped。它提高回归覆盖，但仍不等于真实 WeGame 实机证据。
- 实机证据入口：`docs/WEGAME_HANDOFF_RUNBOOK.md` 固化同机验收的前置条件、selecting→launching→active→terminal→第二局状态不变量、明确失败判据、脱敏报告模板和状态升级规则。只允许从诊断页提供受控 `LCU match context transitioned` 行；不得索取 lockfile、token、完整 session、PUUID、API Key、用户名或本地路径。以后不得在没有按该清单复测的情况下关闭 HB-020。
- Windows 真实进程检测窄范围证据：tag 后 commit `4d03f948cd611b1ea60121506367cd0e4083e7da` 新增 Windows-only 集成测试，将实际 Node executable 复制为 `League of Legends.exe`，启动这一真实 Windows 进程，再由 production `isLeagueGameProcessRunning()` 经 `tasklist` 检测。post-release run [31617314812](https://github.com/RocXOvO/HexBridge/actions/runs/31617314812) / job [94183257885](https://github.com/RocXOvO/HexBridge/actions/runs/31617314812/job/94183257885) 中 `tests/game-process` 两项均通过，集成检测用时约 928ms。因此仅“预期映像名的真实 Windows 进程 → tasklist → production 检测函数”可标窄范围 `VERIFIED`。
- 窄范围限制：上述测试使用重命名后的 Node，不是国服 WeGame 实际启动的游戏进程；它不证明国服进程名确为 `League of Legends.exe`，也不触发 LeagueClientUx 退出、LCU 凭据 / 端口消失、match context 保留、英雄详情、OCR、终局或第二局。其“进程名→tasklist→生产检测函数”局部结果可保留为窄范围证据，但 HB-020 总体已回到 `IN PROGRESS`。
- 交接期契约：从 `ChampSelect` 最后有效快照开始，即使出现 LeagueClientUx 进程退出、LCU 凭据失效、端口消失、`GameStart` 前 phase / endpoint 空窗或游戏客户端尚未完全启动，也不得仅因这些暂态事件清除本局已确认的受支持队列（2400 或 3270）、当前英雄、匹配的英雄详情 / `dataVersion`、推荐上下文和 OCR 启用前提。游戏客户端启动并进入 `GameStart` / `InProgress` 后应继续同一局上下文，且不得短暂回显上一局或其他队列数据。
- 必须采集的脱敏证据：按时间顺序记录 phase、LCU 连接状态、发现来源类别、凭据 / 端口是否可用、LeagueClientUx 与游戏客户端是否存在、match-context generation、是否携带英雄 / 详情以及每次保留或清理的原因码。不得记录 token、API Key、PUUID、完整 session、带凭据 URL 或未裁切截图。
- 防再犯与验收门禁：下一轮定位必须取得同一台真实 Windows + 国服 WeGame 的交接录制与脱敏状态链，或由该状态链生成可回放 fixture；内容覆盖最后一次有效 `ChampSelect` 英雄、最后等待、LeagueClientUx 退出 / 凭据或端口失效、`GameStart` 前空窗、实际游戏客户端进程启动及进入对局，全程断言英雄、详情、数据版本、推荐与 OCR 资格不丢失。没有这份真实状态证据时，任何代码修改和单元 / packaged 测试最多只能维持 `IN PROGRESS`。
- 状态升级规则：报告问题用户已在同机、同 WeGame 环境以连续两局日志证明交接至 InProgress、active 英雄保留、终局清理和第二局不串英雄；这些具体子项可记为通过。HB-020 仍包含三卡 OCR / 实时助手推荐与本局 generation 对齐，23:12 的 `BUSY` 反而证明该链仍有可用性问题；只有报告用户同机完成三卡触发、推荐展示、跨轮与离局清理后，才能重新评估总体 `FIXED / UNVERIFIED` 或 `VERIFIED`。不得用模拟测试、CI 或其他机器结果补齐。

### HB-021 v0.1.5 实机无法发现正式更新

- 严重度：中高（用户无法通过已安装客户端进入更新流程，可能长期滞留在旧版本）
- 状态：`IN PROGRESS`
- 用户实机症状：已安装的 packaged `v0.1.5` 在设置页执行“检查更新”后进入 `error` 状态，显示“更新操作失败，已保留当前版本”，`availableVersion` 为空，未发现已经公开发布的正式 `v0.1.6`。
- 已确认的发现链证据：`v0.1.6` 发布时五项资产曾完整（其旧 Release / assets 现已按保留策略删除），但 `v0.1.5` 使用的 GitHub provider 发现链在当前环境实际遇到 GitHub API `403 rate-limit`，Releases `latest` 与 Atom 端点还出现连接 reset。该证据说明真实远端发现链存在可复现外部失败模式，但尚不能外推为所有用户网络环境的唯一根因。既有 `v0.1.5` 二进制无法远程替换其 updater 实现，用户需从当前 Release 页手动安装最新正式版一次。
- `v0.1.7` 正式实现：更新发现改为 Main-only 固定 raw stable channel，并保留 GitHub provider fallback；只信任 provider-aware 的官方 NSIS 资产 allowlist，提供细分稳定错误码和固定官方下载页。`UpdateManager` 使用 `checkInFlight` 保证并发互斥，只消费对应 `checkForUpdates()` 返回值所绑定 provider 的结果；早到 updater event 不得改写检查状态或把另一 provider 的结果串入当前请求。
- 通道 / 发布安全实现：通道发布 / 读取遵守单调版本。发布前 preflight 拒绝低于 public channel 的候选，并在任何 Release / channel 写入前分页枚举公开 stable Releases，发现更高版本立即 fail closed；远端 Release 若已是同版本，则要求五项资产及 metadata 全部一致后才 no-op；候选版本的 Release 已存在但不满足同版本一致性时拒绝覆盖。softprops 配置 `overwrite_files:false`；GitHub Actions concurrency 使用 `queue` 且 `max` 有界。`update-channel` 当前公开指向 `v0.1.14`。旧 workflow 曾删除低版 stable Release / assets；该策略已移除，v0.1.14 发布后 v0.1.11～v0.1.13 Releases 均保留，至少 v0.1.12 / v0.1.13 五资产确认完整。以后所有正式 GitHub Releases / assets / tags 永久保留，任何 workflow 都不得删除远端历史 Release。
- 当前验证：`v0.1.14` 已完成正式 Windows tag workflow、public channel / packaged public check 与五项 Release assets，且 v0.1.11～v0.1.13 Releases 仍在；已删除的 v0.1.0～v0.1.10 Release / assets 不可恢复且不得伪称存在。installed 旧版本对真实 GitHub 的 check / download / `quitAndInstall` / UAC / 替换仍未完成，因此 HB-021 整体不得写为 `VERIFIED`。旧版本用户可从当前 Release 页手动覆盖安装 v0.1.14。
- 诊断与隐私契约：诊断应区分 DNS / 无网络、超时、系统或企业代理、GitHub 限流、HTTP 404 / 其他状态、TLS / 证书、元数据格式 / 版本 / 资产缺失、校验和应用状态错误，并提供稳定错误码和可操作提示。日志与 UI 必须脱敏；不得记录或展示 API Key、GitHub / LCU token、URL query 参数、Authorization / Cookie、用户本地路径、用户名或完整下载缓存路径。
- 必须验证的验收标准：在真实 Windows installed packaged 上连接公开 GitHub stable provider，能够发现非 draft / prerelease 的更高正式版，并正确填充 `availableVersion`、Release 信息和等待用户确认状态；分别覆盖正常直连、系统代理 / 无代理、断网 / DNS / 超时、404 / 资产缺失、TLS / 证书失败与恢复重试，断言错误分类准确、诊断脱敏且失败始终保留当前版本。发现更新后必须由用户显式确认才下载，下载完成后再次确认“重启更新”；差分模式可在该确认后静默执行 NSIS，完整包 fallback 必须明示并进入普通安装向导。不得静默下载、对局中安装、启动 / 退出时未经确认自动安装或绕过 UAC / SmartScreen。完成定位、实现和真实 installed packaged 回归前不得标为 `FIXED` 或 `VERIFIED`。

### HB-022 国服选人阶段当前英雄与选人浮窗不显示

- 严重度：阻断性（选人阶段核心英雄信息与紧凑浮窗不可用）
- 状态：`IN PROGRESS`（最新用户日志已覆盖两局英雄保留、终局清理与第二局换代；实时助手三卡 OCR / 推荐仍待同机闭环）
- 用户实机症状：用户在 v0.1.10、国服 / WeGame 自定义海克斯大乱斗中报告当前英雄、选人浮窗和进局上下文不显示。该问题与 HB-020 的跨阶段上下文直接相关，但两个缺陷状态仍分别维护，均不得提前关闭。
- v0.1.11 用户同机真实回归：3270 修复后，选人阶段与最后等待阶段已能正常显示当前英雄；但在 League 启动独立游戏客户端之前的交接空窗，主窗口当前英雄再次消失并回到“等待选择英雄”。因此 HB-022 的选人阶段子问题已有正向实机证据，跨客户端交接子问题仍真实失败；HB-020 / HB-022 均继续 `IN PROGRESS`。当前证据不足以确定新的清空分支，不猜根因。
- v0.1.13 用户同机更新：新的脱敏时间线推翻了“当前版本交接仍失败”的现状判断——目标队列 3270 的最终英雄在同一 generation 内从 selecting 经 launching 连续进入 InProgress / active，直到游戏进程退出确认后才清理。故 HB-022 的“选人英雄显示 + 最后等待 + 独立游戏客户端启动前后连续性”子项可记为通过；历史 v0.1.11 回归失败保留为旧版本事实。由于附件未证明第二局新 generation、完整终局 UI / 浮窗行为和正式匹配 queue，HB-022 总体仍为 `IN PROGRESS`，不得写整体 `FIXED` / `VERIFIED`。
- 最新两局用户日志更新：连续两局均在 active 阶段保留各自英雄，终局正确清理，下一局建立新上下文；因此 HB-022 的“选人 / 交接 / 终局 / 第二局不串英雄”子链已有报告用户同机正向证据。附件没有证明正式匹配 queue，也没有证明每轮 OCR / 英雄详情 / 三卡推荐在实时助手正确出现和换代；总体继续 `IN PROGRESS`，不标 `FIXED` / `VERIFIED`。
- 当前工作焦点不再是选人 / handoff normalize：HB-022 的终局和第二局英雄换代已有两局日志正向证据，后续只跟踪实时助手内 OCR / 三卡推荐是否与同一 generation 对齐及正式匹配 queue；23:12 热键到达但返回 `BUSY` 归 HB-025 / HB-026，黑屏顶部浮窗与实时助手结果归 HB-029，英雄专属选取率归 HB-030。
- v0.1.12 实现边界：HB-022 复用 HB-020 的 `launching + handoffCommitted` 保留策略，并继续保留 `{2400,3270}`、actions hero、authority / generation 守卫；实时助手空态也区分“未发现客户端”和“已连接但等待英雄”。回放只能证明代码对已知合成 phase 序列有效，不能代替报告用户同机的独立游戏客户端启动前空窗。
- v0.1.13 实现与边界：HB-022 复用 HB-020 的 `queueSource`、tri-state game-process、exit guard、独立游戏心跳和 generation + champion 原子守卫；正式 Windows 门禁及上述用户同机脱敏时间线均证明选人最后一帧到独立游戏客户端稳定运行期间的英雄连续性。附件没有保存 / 提供完整 session，符合隐私契约；也不包含第二局或完整终局验收，因此状态继续 `IN PROGRESS`。
- 用户脱敏证据：LCU 发现阶段出现多个 candidate，最终选择的 source 为 `log`；credentials 已验证，随后应用只呈现 transport-connected / 旧版 raw 连接状态，没有周期 heartbeat，snapshot 持续为 phase `None`、queue 与 champion 均为 `null`，与选人界面不显示吻合。诊断时间后缀 `Z` 表示 UTC，用户按本地时间理解时产生困惑；本文件不记录任何端口值。
- 本轮用户日志事实：诊断中的 `Z` 确认为 UTC；当前 logger 已改成本地时间并附 UTC offset。真实日志显示 `candidateCount=2`，但最终仍选择 `source=log`；transport-connected 后 raw / normalized phase 都持续为 `None`。这进一步提示错误 candidate 或错误 authority 粘滞的高风险，但尚未通过用户同机验证确认唯一根因。本文件不记录日志中的端口、token、路径、进程身份或对局身份具体值。
- v0.1.10 确定根因证据：用户同机日志显示实际自定义海克斯大乱斗从 Lobby、Matchmaking、ChampSelect 到 InProgress 全程 `queueId=3270`。ChampSelect endpoint 已给出有效当前英雄，但旧代码仅把 2400 视为目标模式，因此 tracker 始终为 `matchStage=none`、generation 0、context decision none；进入 InProgress 后选人 endpoint 按阶段 skipped，英雄随即回到 null，主窗口重新显示“等待选择英雄”。这条完整链已经证明“未接受 3270”是本次上下文丢失的直接根因；authority 风险仍作为独立加固背景保留，但不是本次已证实的主因。
- 游戏进程证据边界：任务管理器 Processes 页首项显示 `League of Legends (TM) Client`，但该显示名称不是可用于 tasklist 匹配的可执行文件镜像名，且不是本次丢上下文主因。实际 EXE image name 仍需用户在 Details 页确认，不得从 Processes 显示名推断。
- 首次英雄延迟观察：用户主观观察首次选择约 2～3 秒；日志从 ChampSelect 空状态到出现有效英雄约 3.7 秒，但用户实际点击时点未知，因此当前不能据此断定 UI、LCU endpoint 或轮询存在确定的额外延迟缺陷。后续验收须以带本地 offset 的点击 / endpoint / snapshot 时间链测量。
- 代码审计判断：高概率主因是连接器接受首个“可鉴权”candidate 后长期粘滞，即使该 candidate 只返回 `None` / 空 endpoint，也没有在有界时间内对其他候选重新仲裁。审计还发现两个可能的遮蔽路径：fresh partial observation 可能覆盖已有正向字段，空英雄 catalog 可能让已取得的 champion ID 在 Renderer 中表现为无可展示英雄。以上是代码审计的高概率判断和次级风险，不是已经由用户同机证明的最终根因。
- `v0.1.9` 正式实现：candidate target 评分只有在 phase 明确为 `ChampSelect` 时才允许给当前选人证据加权；已知 terminal phase 的残留 queue / hero 不得被推断为活动选人，也不得触发 candidate 切换。仅 raw phase 为 `None` / unknown 时，才允许依据 `queueId=2400` 与正英雄等正向 endpoint 证据推断选人目标。候选池每 10 秒刷新，已连接空 candidate 使用 2 秒有界备选重探；所有 request 都有 hard timeout，机会性 probe 失败不得破坏当前有效连接。fresh partial 合并时保留已有正向字段，并增加只读 lobby GET 作为队列识别 fallback。
- `v0.1.10` authority 候选实现：LCU credentials 在 Main 内部保留进程身份与进程启动时刻，用于区分 authority 世代，但这些字段绝不进入日志、诊断页、Renderer 或 IPC 业务状态。新增 `LcuAuthorityRegistry`，以 endpoint alias 以及进程身份 / 启动时刻 / 路径形成强 alias：同 endpoint 的 log→process 发现、同一进程的 endpoint / 凭据轮换可绑定为同一 authority；进程标识复用但启动时刻不同必须隔离为新 authority。`ensure` 与 `promote` 共用 `retainedPriority`，避免两条路径对保留候选给出不一致优先级。
- `v0.1.10` match / transport 边界：transport authority 与 match lease 分离；来自外部 authority 的 Lobby、terminal 或完整 `queueId=2400` ChampSelect 都不能覆盖现有本局，只有相同 match identity 才允许重绑。current endpoint 为空时，可信 `GAME_STARTING` 或 `gameClient.running` 证据可推进交接；同局最后一次换英雄必须先采纳新英雄再进入交接。active 后出现同英雄且无 identity 的新 ChampSelect 必须开启新 generation，不能复用上一局；真实 terminal 与真实新局仍是明确清理 / 换代边界。
- `v0.1.11` 本地候选：共享目标队列集合统一为 `{2400, 3270}`，所有 mode activation、candidate scoring、match tracker、Runtime 与 OCR 资格引用同一判定；2400 继续保留，国服正式匹配是否也使用 3270 尚未实机确认。current-champion endpoint 为空时，actions fallback 只接受按本地时间顺序最新的有效 pick：`pick=0` 明确屏蔽更旧 pick / intent，ban 动作始终忽略，可靠 current / myTeam 英雄优先于 actions。对只有 WAMP event、没有常规 poll 的更新安排一次有界去重 trailing poll；事件风暴期间只补一次。
- `v0.1.11` production 回放：3270 路径覆盖空英雄→actions 英雄→Runtime `selecting / generation 1`→detail / overlay→InProgress `active` 且 generation 不变。transport 路径覆盖 `ECONNREFUSED` detach 后出现双 candidate：外部进程的 Lobby 450 与 live log（无进程身份）可凭同 match identity 重绑，随后进入 InProgress；第二局必须生成 generation 2。该回放也断言 event-only trailing-poll 风暴只产生一次补拉。
- `v0.1.11` 当前验证：最终只读复审未发现运行时代码 P0 / P1。clean 本地、macOS 交叉打包和 candidate commit `46859c9243ede21628646165d0685ddc1288c7d7` 的 Windows workflow_dispatch run [31667866337](https://github.com/RocXOvO/HexBridge/actions/runs/31667866337) / job [94346222231](https://github.com/RocXOvO/HexBridge/actions/runs/31667866337/job/94346222231) 均通过。正式 annotated tag 指向产品提交 `20debe3483d8747008de240a9c9a1adcb2304c08`，tag object `4141f3ed…`；tag run [31668236682](https://github.com/RocXOvO/HexBridge/actions/runs/31668236682) / job [94347366998](https://github.com/RocXOvO/HexBridge/actions/runs/31668236682/job/94347366998) 于 04:49:30Z～04:54:48Z 成功，用时约 5m18s。139 passed + 1 Windows skip、packaged UI / bridge、synthetic updater、public channel `0.1.11`、public packaged check、publish 与 cleanup 全部通过。这些结果不运行真实 WeGame，并已被上述用户同机交接回归证明不足以关闭缺陷；HB-020 / HB-022 继续 `IN PROGRESS`。
- 诊断与目录行为：诊断页每 15 秒刷新一次脱敏 heartbeat，时间显示为本地时区并带 UTC offset；面向用户的候选 / 连接诊断不再记录端口。英雄 catalog 为空时显式提示“目录不可用 / 已识别 ID 暂无法解析”，不得把已识别 champion 静默表现成未识别。
- 当前审查与验证：实现已完成最终只读审查，未发现 P0 / P1；本地 113 tests passed + 1 个 Windows-only skipped，source bridge / UI smokes、lint、typecheck、`git diff --check` 全部通过。候选 commit `68f3822665d7de02f3555d0e8becae04f7b65d05` 的 Windows workflow_dispatch run [31662678891](https://github.com/RocXOvO/HexBridge/actions/runs/31662678891) / job [94330609527](https://github.com/RocXOvO/HexBridge/actions/runs/31662678891/job/94330609527) 通过预发布门禁。正式产品 / tag commit 为 `8a6e6d20791f0596274b79704d229642b99a7a12`；tag run [31663071062](https://github.com/RocXOvO/HexBridge/actions/runs/31663071062) / job [94331796412](https://github.com/RocXOvO/HexBridge/actions/runs/31663071062/job/94331796412) 于 2026-08-13T03:09:58Z～03:15:40Z 成功，用时约 5m42s。113 passed + 1 Windows skip、packaged UI / bridge、synthetic updater、public channel 和正式发布步骤全部成功。该结果不运行真实 WeGame；报告用户同机选人仍未复验，HB-022 继续 `IN PROGRESS`。
- `v0.1.10` 当前验证：新增 production `LcuClient → HexBridgeRuntime` 回放，覆盖 authority alias / rotation、外部 authority 干扰、可信交接推进、同局最后换英雄、active 后同英雄无 identity 的第二局以及终局 / 新局边界。独立审查无 P0 / P1。candidate commit `cb2098c79842f61447ab933766b42ff45c1604c5` 的 Windows workflow_dispatch run [31665154616](https://github.com/RocXOvO/HexBridge/actions/runs/31665154616) / job [94338020977](https://github.com/RocXOvO/HexBridge/actions/runs/31665154616/job/94338020977) 通过候选门禁。正式 annotated tag / 产品 / 记忆提交为 `345c0d5443760a9dcc6717a96a6068b6101b16d1`；tag run [31665517026](https://github.com/RocXOvO/HexBridge/actions/runs/31665517026) / job [94339115148](https://github.com/RocXOvO/HexBridge/actions/runs/31665517026/job/94339115148) 成功，用时约 5m23s。132 tests、packaged UI / bridge、synthetic updater、public update check、Release、channel 写入与旧 Release cleanup 全部通过。该结果不运行真实 WeGame；报告用户同机复测前 HB-022 继续 `IN PROGRESS`。
- 既有证据边界：`v0.1.8` Windows 预发布 / tag CI、packaged UI / bridge smokes、reducer 单测和 post-tag Runtime handoff 模拟回放均未连接真实国服 WeGame，也未读取用户实际 `ChampSelect` session。它们不能证明真实国服选人阶段能获得当前英雄或显示浮窗，不能支持“已覆盖”“已修复”或用户环境异常等结论。
- 定位所需证据：仍须确认设置 / 关于页显示的完整应用版本；由诊断页导出带本地时区 offset 的候选发现、仲裁 / 重探、连接、heartbeat、queue / phase、session / current-champion endpoint 受控状态、snapshot 正向字段、catalog 状态、Runtime 提交和 champ-select 浮窗显隐决定。还需要将用户真实 session 的结构制作成字段级脱敏 fixture，只保留复现解析分支所需的结构、类型和匿名 / 合成 ID；不得索取或记录端口值、token、API Key、PUUID、用户名、安装 / 游戏路径、带凭据 URL、完整原始 session 或未裁切截图。
- 验收标准：报告问题的同一台 Windows + 国服 WeGame 已在连续两局 3270 自定义局证明当前英雄从 ChampSelect / 最后换英雄经 launching 到 active 保持、终局清理并在第二局换代；仍须另行确认正式匹配实际 queue ID，并保留 2400 回归。authority 应正确绑定同一进程的多来源 / 轮换并隔离进程复用，仲裁应脱离长期空 candidate，外部 authority 与 known terminal 残留不得误切换或覆盖本局。实时助手 OCR / 推荐仍不得串局或被后台 busy 长期阻断；完成这些剩余实机步骤前总体继续 `IN PROGRESS`。仅凭局部 tests、CI、production 回放或其他机器成功不得升级状态。

### HB-023 Windows 客户端更新通常退化为约 199 MB 完整包下载

- 严重度：中（更新仍可安全完成，但每次可能重复传输完整安装包，影响带宽、时间和用户对“自动更新”的预期）
- 状态：`IN PROGRESS`；v0.1.12 已通过远端保留与本地 cleanup 门禁，但差分链、真实 public 抓包和 Windows N→N+1 尚未实现 / 验证。
- 用户症状与归因边界：Windows 客户端更新通常下载约 199 MB 的完整安装 EXE；这不是用户 Windows 故障。HexBridge 当前使用的 electron-updater / NSIS 具备差分下载能力，正式 Release 也发布当前版本的 versioned `.exe.blockmap`。然而“具备能力 / 资产存在”不等于某次更新实际执行了差分。
- 代码审计推断：旧 workflow 的远端 cleanup 已删除上一正式版本的 Release / assets。手动安装、updater cache 已清空或本地没有 `current.blockmap` 的受支持旧客户端，因而可能无法取得旧版本 blockmap；electron-updater 在缺少可用旧 blockmap、blockmap 损坏或服务器不满足差分条件时会安全 fallback 到完整 EXE。该链能解释约 199 MB 下载，但目前仅是基于代码与历史发布资产生命周期的高概率推断，不得写成已 `VERIFIED` 的本次根因。用户要求删除的其实是本地构建产物，不是 GitHub 历史 Release；后续不再删除远端旧 Release / assets。
- 现有证据缺口：`v0.1.11` 的 synthetic updater smoke 只证明 packaged 应用能够 check / download、校验 SHA-512 并使用隔离 cache；它没有断言请求旧 / 新 blockmap、HTTP `Range` / `206`、差分传输字节数或“未触发 full-download fallback”，因此不能称为差分下载 smoke。现有 public packaged check 也只验证 stable channel / 资产一致性，不证明真实 installed N→N+1 的差分链。
- 发布与元数据保留契约：从当前仍存在的 v0.1.11 起，全部历史正式 GitHub Releases / assets / tags 必须永久保留，后续 workflow 绝不能删除远端旧 Release。所有仍受支持源版本的 versioned blockmap 也须随 Release 或在额外的稳定、不可变官方通道按明确版本窗口保留；发布 N+1 时必须先上传并回读验证 N 与 N+1 blockmap，再公开指向 N+1 的 `latest.yml`。跨多版本更新必须按已声明的保留窗口选择可用差分路径，窗口外才允许明确回退完整包。
- 当前发布实现：release workflow 中旧的 `gh release delete` 远端 cleanup 已移除，CI 增加静态 retention verifier，拒绝 workflow 出现远端 Release / tag 删除命令。`pack:win` 在构建前运行本地 `release/` cleanup：目标固定为仓库根下精确 `release` 目录，拒绝该目录为符号链接或目标逃逸，随后清空其中既有条目，使本次构建结束后只留下当前产物；测试断言目录外文件不受影响。当前采用“精确目录预清空”而不是按 semver 逐文件保留窗口；v0.1.14 正式 Windows workflow 已通过且 v0.1.11～v0.1.13 远端 Releases 保留，但仍没有真实旧 / 新 blockmap 网络请求或差分下载证明。
- 客户端与安全契约：客户端应通过 `previousBlockmapBaseUrlOverride` 或等价机制，把旧 blockmap 查询固定到上述官方稳定地址；URL 必须受严格 scheme / host / pathname / filename allowlist 约束，不接受 Renderer、Release notes 或远端任意重定向注入，不携带 GitHub OAuth token、LCU token、API Key、Cookie 或其他凭据。blockmap 与最终安装包校验仍须 fail closed；SHA-512 是内容完整性证据，不是商业代码签名。
- UI 契约：更新卡片必须明确显示当前使用“差分下载”还是“完整包下载”，展示实际已下载 / 总下载字节与进度。若 blockmap 缺失 / 损坏、服务端不支持 Range 或差分初始化失败，应先显示“差分不可用，改用完整包”及脱敏原因，再安全回退；不得仍标记为差分，也不得把完整 EXE 大小误当差分传输量。
- 安装分流契约：差分下载完成后，仍须等待用户在应用内明确确认“重启更新”，随后才可使用静默 NSIS。若本次已 fallback 为完整安装包，UI 必须在确认前明示该模式，并使用普通安装向导，不能沿用差分包的静默参数。v0.1.17 本地候选已由 Main 将可信 `downloadMode=differential` 映射为 `quitAndInstall(true, true)`，将 `full / cache / unknown` 映射为 `quitAndInstall(false, true)`；两者都不得在对局中安装，也不得在启动 / 退出时未经本次确认自动安装，且不能绕过 UAC / SmartScreen。该分流子项为 `FIXED / UNVERIFIED`，Windows installed 安装仍未验证；HB-023 的真实差分总体继续 `IN PROGRESS`。
- 必须验证的验收标准：在真实 Windows installed packaged N→N+1 上分别清空 updater cache 与保留已有 cache 执行 public 更新；差分成功路径必须观察到旧 / 新 blockmap 请求和 HTTP `Range` / `206`，实际 installer 网络传输量显著小于完整 EXE，最终 SHA-512 校验、应用内二次确认、静默 NSIS、重启后版本替换均通过，并断言未触发 full-download fallback。另行破坏 / 移除 blockmap及模拟服务器不支持 Range，验证 UI 准确切换到“完整安装包”，绝不使用静默参数并安全完成普通安装；再覆盖对局阻止、启动 / 退出不自动安装、UAC / SmartScreen 可能出现和保留窗口内 / 外跨版本策略。只有保留通道、客户端地址约束、UI 和上述真实网络 / 安装门禁全部完成，才可升级状态。

### HB-024 4K 校准引导与 OCR 标题区域契约不一致

- 严重度：高（校准完成后仍无法识别三张海克斯，核心推荐流程不可用）
- 状态：`IN PROGRESS`；校准首帧 guard 与焦点语义烟测修正均已审查，Windows candidate workflow 全绿；但真实用户 4K 校准 / OCR 现场链仍未完成，不得写 `FIXED` / `VERIFIED`。
- 用户实机证据：v0.1.11、4K 环境中，用户依据现有校准交互将三个框覆盖三张整卡，而程序实际要求的是每张卡的标题区域；保存校准后，无论按当前 F8 快捷键还是点击手动识别按钮，仍提示未识别。界面没有让“应框标题而不是整卡”的约束足够明确，也没有在保存前证明裁切可被 OCR 识别；这是引导 / 契约失败，不能归责用户。
- 交互契约：校准流程应优先自动定位三张标题 ROI；需要手动框选时，必须用明确图示、文案和约束只允许框标题，并解释左 / 中 / 右对应关系。不得只给全屏暗层与三个可任意覆盖整卡的框后，把错误结果延迟到游戏内才暴露。
- 校准验证契约：每个框都应提供实时裁切预览，并显示该裁切的 OCR 文本、置信度和匹配结果；标题区域越界、尺寸 / 比例不合理、文字为空或置信度不足时，不能保存，或必须明确标记失败原因并提供重框 / 自动定位。保存成功只表示三框通过可解释验证，不能仅表示坐标已持久化。
- v0.1.12 实现：交互改为要求按左 / 中 / 右框住三张完整卡片，以更适合 4K 的大目标降低用户瞄准文字难度；几何门禁检查最小宽高、整卡纵横特征和左右顺序，并在框内标出将被自动提取的标题带。共享几何函数把整卡映射到相对 `x+10% / y+39% / width 80% / height 17%` 的标题 ROI；scanner 对默认标题框与旧 / 新校准统一走 `titleRectForCalibration`，OCR 匹配会分别比较原始全文及按换行 / 分隔符拆出的每一行，避免描述行稀释标题相似度。保存前 Renderer 必须经受限 IPC 请求 Main 使用校准会话内存截图与当前海克斯目录逐块 OCR，只有左 / 中 / 右 3/3 均可靠匹配才继续持久化；失败显示识别数量并拒绝保存。
- 真实 fixture 边界：从用户提供的 4K 校准截图只提取并保留三块 title-only fixture，预期标题为“由心及物 / 冰寒 / 虹吸”；原始完整截图不进入仓库。`test:ocr:fixture` 使用真实 PaddleOCR ONNX 模型逐块识别并要求标题出现在 OCR 行中，本地已通过，workflow 也已接入该脚本。它证明这三块裁切可被当前模型识别，不等于 Windows packaged 校准、实时用户画面、4K / DPI / 多屏或任意海克斯标题已经验证；当前 UI 也仍没有连续实时裁切预览、置信度数值和逐框匹配详情。
- 后续审查 P1 修正：校准会话中的完整内存截图只允许当前受管校准窗口的 `webContents` 经 IPC 读取 / 预览 / 完成 / 取消；启动校准只允许主窗口 sender。Main 逐调用核对 sender 与受管窗口身份，普通主窗口、其他浮窗或陈旧 / 替换后的 Renderer 不能调用校准上下文 IPC。该隔离目前只有目标测试与 typecheck / lint 证据，尚未经过 Windows packaged 多窗口攻击性烟测；title-only fixture 规则不因此放宽。
- Windows packaged 首帧失败：workflow_dispatch run [31681231963](https://github.com/RocXOvO/HexBridge/actions/runs/31681231963) / job [94386905747](https://github.com/RocXOvO/HexBridge/actions/runs/31681231963/job/94386905747) 到 packaged UI calibration 才失败。烟测诊断为 route ready、bridge 存在，但 `#app` 子元素数为 0；说明 preload / 路由正常而 Vue 校准页没有完成首次 mount。
- 确定根因与首帧修复：title-band 新模板使用 `v-show`，即使元素不可见仍会先求值 `looksLikeWholeCard(rects[slot])`；初始 `rects[slot]` 为 `undefined`，旧 helper 读取其字段并在 Vue 首次 render 抛错。修复让 `looksLikeWholeCard` 接受 optional rect 并在缺失时返回 false，同时把 title-band 改为 `v-if`，并新增 undefined / null 回归测试。修复审查无 P0 / P1，commit `f74c0ef` 已 push；retry 中校准显示、Esc、窗口销毁和主窗重新可见均通过，因此首帧根因范围已有 Windows packaged 正向证据，但 HB-024 总体仍不升级。
- 第二次 Windows 烟测失败与修正：retry run [31681888143](https://github.com/RocXOvO/HexBridge/actions/runs/31681888143) / job [94388977148](https://github.com/RocXOvO/HexBridge/actions/runs/31681888143/job/94388977148) 最终只失败在烟测把“主窗恢复”硬编码为必须同时 `focused=true` 且 `paused=false`。无交互 Windows runner 可能合法拒绝 focus；产品也故意在 unfocused 时暂停装饰 / 非必要工作。烟测修正为 `hidden=false` 即窗口恢复，并按实际焦点分别断言 focused→unpaused、unfocused→paused，不放宽校准窗口已销毁、主 target 存活和可见性的断言。修正复审无 P0 / P1，commit `0f7b8b9` 已 push。
- 第三次 Windows packaged 正向证据：workflow_dispatch run [31682463869](https://github.com/RocXOvO/HexBridge/actions/runs/31682463869) / job [94390815147](https://github.com/RocXOvO/HexBridge/actions/runs/31682463869/job/94390815147) 成功；校准截图为 1024×768，校准窗口能显示，完整截图 IPC sender isolation、Esc 关闭和主窗恢复均通过。恢复状态实际为 `hidden=false / focused=false / paused=true`，与无交互 runner 和产品暂停契约一致。该窄范围 Windows packaged 证据不等于用户 4K / DPI / 多屏校准或实际 3/3 OCR 保存闭环。
- v0.1.16 候选 OCR 基础设施：模型在应用启动后有界预热，失败进入 60 秒 cooldown，手动识别和校准验证可显式 force retry，避免自动后台失败永久阻断人工路径；PP-OCR detector 输入上限降至 640，ONNX Runtime 线程配置为 intra-op 2 / inter-op 1并使用 sequential execution。本机真实 4K title-only fixture 最近一次为 134ms；Windows 候选 run 中同一 fixture 为 270ms。这些只是固定 fixture 性能，不证明用户 Windows 4K 校准、任意标题或实时截图链。
- 验收标准：真实 Windows 4K 下覆盖 100%～150% DPI、主 / 非主显示器、多显示器不同缩放与窗口位置，验证自动定位或明确标题框选、实时裁切预览、OCR 文本 / 置信度、保存 / 取消 / 重启回显；保存后的手动按钮与配置快捷键均能对同一画面给出一致识别。还需覆盖整卡误框、空白、单 / 双卡、低置信度、显示器热插拔和不安全跨屏，断言不合格配置不能静默保存且诊断不含未裁切全屏或敏感信息。

### HB-025 OCR 手动识别全局快捷键不可配置

- 严重度：中（固定 F8 可能与游戏、录屏或其他软件冲突，用户无法选择适合自己的触发键）
- 状态：`IN PROGRESS`；v0.1.12 已包含原子替换与受限 IPC且最终审查无 P0 / P1，Windows 全局注册和完整交互尚未完成。
- 用户目标：OCR 截图 / 手动识别快捷键应由用户在设置页自定义，不再固定为 F8；按钮触发与快捷键触发必须调用同一个单次识别业务路径。
- 配置契约：设置页应捕获并规范化受支持的 Windows 全局快捷键组合，保存前检查格式、系统保留键、应用内重复绑定和全局注册冲突。注册失败必须保留上一有效快捷键并显示可操作原因；提供恢复默认，设置须加密要求之外的普通本地持久化并在重启后恢复。
- 生命周期与安全：快捷键应仅由 Main 进程通过受限 IPC 注册 / 注销，Renderer 不能注入任意命令或脚本。修改时先验证新组合，再原子替换旧注册；应用退出时注销。不得覆盖 Windows 系统保留键或在未成功注册时谎报已生效。
- v0.1.12 实现：Main 的 `OcrHotkeyManager` 先验证并注册新 accelerator，只有成功后才注销旧键；冲突 / 异常保留原键，配置持久化失败时尝试恢复旧注册，启动时无效配置可回退 F8，退出时注销。若新键已经成为真实活动注册，但配置写盘失败且旧键回滚也失败，结果必须返回 `HOTKEY_ROLLBACK_FAILED`、报告真实 `activeHotkey`，Runtime 以仅限本次运行的 active override 向 UI / 托盘展示实际生效键，不能回显磁盘旧值或谎报已恢复。受限 IPC 只接受短字符串；当前校验允许 F1～F12，或 Ctrl / Alt / Shift 加字母 / 数字，拒绝无修饰字母 / 数字与 `Alt+F4`。设置页已提供录制入口，诊断按钮 / 托盘文案读取当前键；当前尚无独立“恢复默认”按钮、真实 Windows 游戏前台注册 / 冲突 / 重启证据，不能视为完整实现。
- 后续审查 P1 修正：Runtime 不再只按本次结果的错误码决定 override，而是在每次注册 / 保存 / 回滚结果后持续比较真实 `activeHotkey` 与当前持久化 hotkey；两者不同就保留 active override，相同才清除。这样一次 rollback 双失败后，后续冲突 / 无效修改也不会把 UI 回退成未实际注册的磁盘值。目标测试与最终只读审查已通过，真实 Windows 全局注册仍未完成。
- 启动快捷键 P1 修正：空字符串 active 是明确业务状态，表示当前没有任何全局 OCR 快捷键注册成功，不能用 truthy 判断退回 persisted 文案。启动时若默认 F8 本身冲突，或自定义配置注册失败且 fallback F8 也冲突，Runtime 保留空 active override；设置页、托盘和诊断入口统一显示未注册状态，不得声称 F8 可用，同时仍允许用户录制新组合键恢复。新增两项测试覆盖上述两条启动路径；它们未运行真实 Windows `globalShortcut`，状态仍为 `IN PROGRESS`。
- v0.1.13 用户同机实机证据：游戏处于前台时，配置的全局 OCR 快捷键按下无反应，但实时助手内的手动识别按钮可以触发并得到识别结果。这证明 OCR 单次业务路径至少可由按钮调用，也直接推翻“Windows 前台 globalShortcut 已闭环”的任何推断；当前还不能从症状区分注册未成功、活动键展示与真实注册不一致、被游戏 / 系统拦截或按键事件到达后未触发业务调用。定位需记录脱敏的 persisted / active 是否一致、注册状态 / 错误码和单次触发计数，不得记录用户本地路径或敏感凭据。
- 最新用户日志证据：23:12 的受控状态记录热键来源手动 OCR 返回 `BUSY`。这证明该次游戏前台快捷键已到达 Main 共用手动路径，也把这一次“无结果”收窄为后台自动任务占用 single-flight，而非本次按键完全未注册 / 未送达；但单次事件不能证明默认键、自定义键、冲突、重启和所有游戏前台组合均正常，HB-025 继续 `IN PROGRESS`。日志不得保留具体按键、端口、路径、身份或截图。
- 统一手动 OCR 状态契约：快捷键、托盘入口和实时助手按钮必须调用同一 Main 业务路径，并向 Renderer / 诊断只暴露稳定的 `code`、`source`、`timestamp`、`message`（或等价固定字段）。`source` 只能是受控枚举，用于区分 hotkey / tray / button，不记录具体按键内容；状态、日志和 IPC 不得包含截图数据、OCR 裁切路径、token、API Key、PUUID、完整 session、带凭据 URL 或其他敏感字段。成功、busy、不可用、捕获失败、识别失败必须在三个入口得到一致反馈，不能让快捷键静默无响应。
- v0.1.14 正式实现：实时助手按钮、全局快捷键与托盘入口统一调用同一 Main 触发函数；诊断状态固定为 `manualOcr.code / source / timestamp / message`，触发 sequence 防止较早任务结果覆盖较新的手动触发，`SCAN_ERROR` 映射为 `error`。手动 OCR 日志只保留受控 `source`、稳定 `code`、`duration` 和 `errorName`；普通异常 message、本地路径、截图内容和敏感字段均不记录。
- v0.1.16 候选仲裁：手动 OCR 遇到自动任务 busy 时取得优先权，最多等待在途自动扫描 1.5 秒；无论成功、失败、超时、epoch 失效或异常，自动调度状态都必须在 finally 路径恢复，不能让一次手动请求永久停掉或重复开启自动循环。scan epoch 与 generation / champion / stopping 守卫阻止旧任务提交。该候选已通过本地测试、审查与 Windows packaged 候选门禁，但报告用户同机热键复测尚未运行，HB-025 不升级。
- 验收标准：覆盖默认键、自定义单键 / 组合键、冲突、注册失败、非法 / 系统保留键、恢复默认、连续修改、持久化与重启；在真实游戏前台时全局生效且只触发一次单次捕获，设置输入框聚焦时不得误触发。按钮与快捷键的识别状态、错误和 OCR 结果一致。

### HB-026 切屏或进入游戏后 HexBridge 导致性能下降

- 严重度：高（影响游戏帧率 / 帧时间，关闭 HexBridge 后恢复）
- 状态：`IN PROGRESS`；v0.1.16 已公开发布并通过 Windows Actions 的代码 / packaged 窄门禁，但真实 4K 游戏 frametime / CPU / GPU 和报告用户同机复测未完成；不得写已修复或 `VERIFIED`。
- 用户实机症状：切屏或进入游戏后出现明显性能下降，关闭 HexBridge 后恢复。周期性 `desktopCapturer` / OCR 是高概率调查方向，但当前没有 CPU / GPU、捕获频率或调用栈证据，不得写成已确认根因。
- 捕获预算契约：默认不得持续执行高成本全屏抓取或全分辨率 OCR。自动模式只允许低频、低分辨率、严格 ROI 的廉价界面门控，命中后才进入 OCR；用户必须能彻底关闭自动模式。手动快捷键 / 按钮只触发一次有界捕获与识别，不得启动隐式循环。
- 调度契约：capture / OCR 必须 single-flight，上一任务未完成时不得堆积；窗口隐藏、最小化、不可见或自动识别关闭时暂停非必要任务。`InProgress` 路径必须有明确捕获频率、CPU / GPU 和耗时预算，连续未命中应退避；省电档与 `prefers-reduced-motion` 不得继续运行与视觉无关的高成本后台循环。
- v0.1.12 实现：新配置和一次性迁移只把 `autoOcr` 设为 `false`，明确保留用户原有 `visualMode` 与其他设置；用户显式重新开启后，Runtime 的自动周期从 750ms 放宽为 2 秒。每次自动 tick 先只请求最大宽 960 的显示器缩略图并裁三个标题 ROI，至少两块低成本信号命中后才再请求最大宽 1920 的 OCR 帧；未命中不启动 OCR。手动按钮 / 快捷键跳过轮询门控，只做一次最大宽 1920 的有界捕获；scanner 继续用 `busy` 实现 single-flight。单测覆盖迁移保留各视觉档、自动 miss 只捕获 960、hit 才追加 1920、手动只捕获一次 1920。当前尚未实现 / 证明主窗口 hidden 时停止 Main 自动扫描，也没有连续 miss 退避和真实 4K FPS / CPU / GPU 数据。
- 最新实机定位证据：用户日志在 23:12 显示热键手动 OCR 返回 `BUSY`，直接证明后台自动扫描曾在用户需要手动识别时占用 single-flight。该事实说明 OCR 调度 / 仲裁确实参与用户可见失败，但没有 CPU / GPU / frametime、捕获频率或调用栈，仍不能把整个切屏卡顿唯一归因于 OCR。
- v0.1.16 候选调度：自动扫描仅允许 `active + Main visible + autoOcr enabled`；固定 2 秒 tick 先做 960px gate。对同一组三卡，full OCR 成功一次即停止重复识别，不可靠结果最多尝试两次；连续两次明确 absence 才同步重置 gate / round tracker，且不清除最后可靠展示结果。错误按连续次数进入 4 / 8 / 15 秒退避。scan epoch 结合 generation、champion 与 stopping 在所有异步提交前校验；手动优先最多等待 busy 1.5 秒，并在所有路径恢复自动调度。
- v0.1.16 候选捕获 / OCR 成本：手动捕获请求最大宽 1440 的 `NativeImage`，在 Main 内直接裁三块标题 ROI，随后恢复原窗口状态；不再把全屏编码为 PNG，也不再通过 sharp 对全屏做三次解码。PP-OCR detector 最大输入 640，ONNX Runtime 使用 intra-op 2 / inter-op 1和 sequential execution；模型启动预热，失败后自动路径 cooldown 60 秒，手动 / 校准允许 force retry。游戏进程探测在 launching 约每 3 秒、active 约每 10 秒执行，并取消进入阶段时的立即 tasklist 调用，降低切换峰值。
- v0.1.16 验证：本地 29 test files / 254 passed + 1 skipped，typecheck、lint、`git diff --check`、真实 4K fixture（最近一次 134ms）、source bridge / UI smoke 和 version gate 全通过；独立最终审查 P0 / P1 为 0。候选 run `31718519456` / job `94509290728` 与正式 tag run `31719527780` / job `94512675558` 均 success；正式 Windows 门禁实际运行 29 test files / 255 passed、真实 4K fixture 278ms，完整门禁、Release / channel 和 public packaged check 通过。该 runner 结果不是真实 Windows 游戏性能验收；报告用户同机性能数据仍缺，因此 HB-026 保持 `IN PROGRESS`。
- 后续审查 P1 修正：`visualMode` 已重新纳入受限设置 IPC 白名单，设置页恢复“自动 / 电影 / 均衡 / 省电”选择并写回同一配置；revision migration 只关闭 `autoOcr`，不得重置已有 visual mode。目标测试覆盖各旧视觉选择迁移后保持不变；Renderer 交互、持久化重启和三档实际视觉 / 性能仍待 Windows 验证。
- 验收标准：在真实 Windows 4K 游戏、固定场景和相同画质下，记录基线、HexBridge 空闲、自动模式、单次手动识别及关闭 HexBridge后的游戏 FPS / 1% low / frametime，HexBridge CPU / GPU / 内存、capture / OCR 次数与单次耗时；进行多轮切屏、进入对局、隐藏 / 最小化和关闭前后对照。自动模式须符合声明预算且无持续帧时间尖峰，关闭自动识别后捕获计数必须归零，手动触发只增加一次；任何优化在这些真实 4K 数据前不得标 `FIXED`。

### HB-027 未启动 WeGame / LOL 时普通界面仍显示不可达候选

- 严重度：中（误导用户认为客户端已被发现但发生端口故障，并把内部发现细节暴露为普通状态）
- 状态：`IN PROGRESS`；v0.1.12 已包含普通未启动提示与脱敏 debug，代码审查已通过但真实 Windows 恢复链尚未完成。
- 用户实机症状：未启动 WeGame / LOL 时，界面仍显示“检测到一个候选，但候选端口未接听”。旧日志、残留 lockfile 或其他不可达候选不应等同于活跃客户端，也不应让普通用户承担理解候选端口的负担。
- 状态契约：进程发现为 0 且所有只读 candidate probes 均失败 / 不可达时，LCU 必须保持 disconnected / not-found，不得标记 connected、connecting-success 或“已检测到客户端”。普通界面统一显示“客户端未启动或未发现”，并按上一节信息架构合并到实时助手空态 / 标题状态；侧栏不再保留独立 LCU 状态块。
- 诊断边界：candidate 数量、来源类别（process / lockfile / log / manual）、是否过期、probe timeout / refused 等只允许进入脱敏诊断，用稳定原因码帮助定位；不得在普通 UI 显示端口，不得记录实际端口、token、带凭据 URL、本地路径或完整日志内容。候选存在只代表发现线索，不代表 transport 或 LCU authority 已验证。
- 代码审计方向：审查发现层是否把 stale log / lockfile candidate 的“存在”过早映射为用户可见连接状态，以及 Runtime / Renderer 是否混用了 discovery-candidate 与 verified transport；这只是待验证方向，不能写成已诊断根因。
- v0.1.12 实现：发现结果无 candidate，或 `processCount=0`、未配置 manual 且所有 candidate probes 不可达时，连接状态保持 `connected=false / source=null`，普通 `lastError` 归一为“英雄联盟客户端未启动或尚未发现”；有进程 / manual 线索但不可用时显示“暂时不可用，正在后台重试”。候选数量、processCount 与归类后的失败原因只写脱敏 debug。实时助手空态直接显示“英雄联盟客户端未启动或未发现”与重试入口，侧栏独立状态块已删除；诊断页仍保留系统健康详情。当前尚未用真实残留 lockfile / log + 随后启动 WeGame 验证 5 秒恢复目标。
- 后续用户决策：上述 v0.1.12 空态的“启动 WeGame…”说明和“立即重新检测”重试入口将从实时助手移除；后台自动发现与诊断 / 底层 retry IPC 继续保留。该 UI / README 收口另见 HB-039，尚未实现验证。
- 验收标准：真实 Windows 上覆盖 WeGame / LOL 从未启动、已退出但残留日志 / lockfile、候选端口拒绝 / 超时、多条全部失败候选，断言普通 UI 始终只显示“客户端未启动或未发现”、`connected=false` 且诊断原因准确脱敏。随后启动 WeGame，应用须无需重启自动重新发现并在既定 5 秒目标内连接；再覆盖客户端重启、token / 端口轮换和旧候选与新进程候选并存，确认不会粘滞旧线索或延迟恢复。完成代码审查、修复和上述真实 packaged 验收前不得标 `FIXED`。

### HB-028 视觉性能仍暴露手动档位，未形成用户要求的全自动状态机

- 严重度：中（不直接破坏核心数据，但增加用户决策负担，并使动效 / 性能行为难以形成单一可审计来源）
- 状态：`IN PROGRESS`；用户要求的入口移除、IPC 收口、配置迁移与自动 policy 已有 dirty 候选并通过本地门禁，但独立第二轮审查、Windows 和用户同机性能验证尚未完成。
- v0.1.12 基线：设置页仍显示“自动 / 电影 / 均衡 / 省电”下拉框；设置 IPC 白名单接受 `visualMode`；Runtime 在 `launching / active` 时强制 `eco`，其他阶段可直接采用非 `auto` 手动值。该公开版本不满足“隐藏手动入口、自动状态机唯一决策”。
- v0.1.13 实现：Renderer 已删除视觉档位卡片、下拉框与写入 handler；Main 设置 IPC 白名单不再接受 `visualMode`。设置 revision 2 会把旧版持久化的 `cinematic / balanced / eco` override 迁移为 `auto`，同时保留 `autoOcr`、浮窗、热键、校准、显示器与其他无关设置。Runtime 不再读取手动 override 选择实际档位，而是调用独立纯 policy，并监听主窗口 show / hide / focus / blur / minimize / restore 及时同步状态。
- 自动 policy 草案：GPU acceleration 不可用或系统内存低于既定阈值时为 `eco`；主窗口 hidden / minimized 时为 `eco`；match stage 为 `launching / active` 时为 `eco`；正常可见但失焦时为 `balanced`；资源充足、非游戏阶段且主窗口前台聚焦时为 `cinematic`。Renderer 的 document visibility / focus class 与 reduced-motion CSS 继续提供更严格的渲染暂停；Main policy 决定档位，Renderer 不得反向覆盖。
- 当前验证：最终复审无 P0 / P1；纯 policy、revision 2 迁移与 source UI / IPC 写入口删除已进入最新 clean 23 files / 199 passed + 1 Windows skip 全链，audit 0、OCR、lint / typecheck、source bridge / UI、icon / retention 与 diff-check 均通过。macOS cross pack / metadata / checksums 成功，但 Windows packaged UI、窗口事件实机和 4K CPU / GPU / 重绘测量仍未完成，因此不得写 `FIXED` / `VERIFIED`。
- 产品契约：普通设置、快捷入口和托盘不得提供手动选择电影 / 均衡 / 省电档；允许诊断页只读显示当前自动状态和触发原因。Main 应成为视觉成本状态的唯一业务来源，至少区分正常前台、低资源、`launching / active`、hidden / minimized / unfocused 和 reduced-motion；默认策略与切换优先级须显式、确定且无快速抖动。隐藏 / 不可见、游戏中、低资源或 reduced-motion 时必须暂停或降级装饰性背景、轨道球和极光，不能只改标签而继续重绘。
- 迁移与安全：旧配置中的 `cinematic / balanced / eco` 只能迁移为自动策略，不得重置 `autoOcr`、浮窗开关、诊断截图、热键或其他无关设置；删除 Renderer 写入口后，preload / IPC schema 也应拒绝手动视觉档位写入。自动视觉状态与 OCR 捕获调度保持解耦，任何视觉迁移不得把默认关闭的自动 OCR 打开。
- 验收标准：单测覆盖迁移、状态优先级、阶段 / GPU / 内存 / 可见性转换、抖动抑制和 Renderer 无写入口；source / packaged UI 断言普通界面无手动档位控件、诊断只读状态与 Main 一致。真实 Windows 4K 下覆盖空闲前台、切屏、最小化、`ChampSelect→launching→InProgress→terminal` 和 reduced-motion，记录状态迁移、CPU / GPU / 重绘并确认 hidden / active 期间装饰动画停止。独立复审与 Windows packaged 门禁完成前保持 `IN PROGRESS`；报告用户同机视觉 / 性能复测前不得写 `FIXED` / `VERIFIED`。

### HB-029 OCR 识别结果以黑屏顶部浮窗呈现，不符合实时助手信息架构

- 严重度：中高（识别本身可用，但结果覆盖游戏画面、视觉突兀且与用户期望的信息位置不一致）
- 状态：`IN PROGRESS`（v0.1.14 候选已移除自动 augment 窗口并把结果收口到实时助手，最终审查无 P0 / P1；Windows 与用户同机仍未完成，不得写 `FIXED` / `VERIFIED`）
- 用户实机症状与明确目标：点击实时助手内的手动按钮能够完成识别，但成功后出现覆盖屏幕顶部的大块黑色浮窗；用户明确认为该呈现不符合需求，识别到的三张卡及推荐应显示在实时助手页面内，而不是用黑屏式顶部覆盖层展示。不能把“OCR 返回结果”误记成“呈现体验已完成”。
- 产品契约：实时助手应在同一对局上下文中显示左 / 中 / 右三张识别结果、排序 / 并列 / 暂无数据、简短依据、英雄专属选取率（仅在 HB-030 契约下有可靠值时）与识别时间 / 错误。自动全屏 / 顶部 augment 结果窗口必须删除或彻底停用，不得自动打开大块纯黑或近黑的屏幕覆盖层。主窗口已经 hidden / 最小化时，识别完成只更新状态，不得调用 show / focus / restore；用户主动打开实时助手后读取本局最后可靠结果。
- 当前 v0.1.14 候选实现：augment BrowserWindow、`#augment` Renderer route 与 `AugmentOverlay.vue` 已移除，OCR 结果只写入主窗口的共享状态；OCR 状态同步不会调用主窗口 `show`、`focus` 或 `restore`。按钮 / 快捷键 / 托盘的结果均来自 HB-025 所述同一 Main 触发路径和 sequence 守卫。本地 24 files / 210 passed + 1 skip、build、source Electron UI / bridge 等既有门禁通过，最终审查无 P0 / P1；新增 Renderer 契约测试将纳入提交但尚未进入新的完整计数。Windows packaged 以及报告用户同机“无黑屏覆盖 + 主窗口不抢焦点 + 实时助手三卡可见”仍待验收。
- 验收标准：按钮与配置快捷键识别成功后都更新同一实时助手结果模型；识别失败 / 部分失败 / 并列 / stale 数据在页面内有明确状态。真实 Windows 无边框游戏中不得出现黑屏顶部覆盖，主窗口 hidden 时不得为显示结果强抢焦点；用户重新打开实时助手后仍能看到本局最后可靠结果。需覆盖 OCR 连续刷新、同组合去重、离局清理和第二局换代。未经实现、Windows packaged 与用户同机确认不得标 `FIXED` / `VERIFIED`。

### HB-030 当前英雄的海克斯卡牌选取率次级展示

- 严重度：中高（用户明确需求；若来源、口径或排序使用错误，会违反数据最小化与政策边界）
- 状态：`IN PROGRESS`（已批准窄范围且 v0.1.14 候选已实现清洗 / 缓存 / 展示链，最终审查无 P0 / P1；Windows 与用户同机仍未完成，不能写 `FIXED` / `VERIFIED`）
- 批准的数据来源与含义：[data.dtodo 官方文档](https://data.dtodo.cn/api/v1/zh-CN/docs/cf-data-api.md)说明 `/champions/{championId}.json` 的 `augments[*].stats` 继承 `PublicStats.pickRate`，取值 0～1。本项目只批准这一“单英雄详情 + 当前 championId + 对应 augmentId”的英雄专属 `pickRate` 作为三卡次级展示；全局目录、其他英雄、个人样本或不明来源的 pickRate 均不能冒充。
- 排序契约：data.dtodo 明确以 `rank` 为优先顺序；`tier` / `pickRate` 仅用于展示。现有三卡推荐必须继续以英雄专属 rank 为首要依据，不得使用 pickRate 重排、打破并列、覆盖官方顺序或生成新的 1/2/3 决策。不得从 `rank / tier / total` 反推选取率。
- 清洗与缓存契约：只接受有限且位于 `[0,1]` 的数值，缺失 / 非法为 `null`，UI 显示“暂无数据”而非 0%。英雄详情缓存必须引入 / 提升本地 schema 版本；旧缓存即使上游 `dataVersion` 相同，也不能永久命中缺少 pickRate 的结构，须重新获取或可靠迁移。401 / 429 / 离线回退的旧值必须继承 stale 标记。
- 当前 v0.1.14 候选实现：`pickRate` 只接受 JavaScript `number` 且必须位于 `[0,1]`，来源与区域经过显式 allowlist；其他类型、越界值和不允许来源归一为 `null`。推荐排序继续以既有 `rank` 为准，`pickRate` 不参与重排或 tie-break；`winRate / wins / games` 继续在清洗层彻底剔除。英雄详情缓存已升为本地 v2 schema；legacy 同 `dataVersion` 详情只允许以 stale 的 `rank / tier` 回退，不能伪造或永久缺失后冒充新的 `pickRate`。该实现进入本轮 24 files / 210 passed + 1 skip 本地全链，首轮 P1 已修且最终审查无 P0 / P1；Windows packaged 和报告用户同机三卡仍待完成。
- UI 与解释契约：实时助手三卡上标注这是“data.dtodo 单英雄统计 / 当前英雄选取率”，并显示或可追溯 `dataVersion`、`gamePatch` 与 stale 状态；百分比是上游聚合统计展示，不得宣传为精确概率、推荐正确率、胜率或 Riot 政策认可。数据口径不完整时不得自行补充样本量或置信结论。
- 政策边界：继续彻底丢弃并禁止展示海克斯 `winRate / wins / games`。Riot 当前政策明确禁止海克斯胜率，并反对产品替玩家作决定；本次批准只是在个人实验工具中展示上游英雄专属选取率，不代表 Riot 审批、注册或允许扩大分发。若扩大分发，必须重新评估政策、数据授权并完成所需注册。
- 验收标准：清洗、缓存 schema 迁移、同 dataVersion 旧缓存刷新、null / stale、百分比格式、来源 / patch 标注和“不参与排序”均须自动化覆盖；Windows packaged 与用户同机三卡还需确认 rank 顺序不变、选取率与当前英雄详情对应。完成代码审查、测试与实机前保持 `IN PROGRESS`。

### HB-031 Tier 背景条使用主观“强度顶尖”文案

- 严重度：中（改变上游 Tier 的准确语义，容易让用户误认为是新的统计结论）
- 状态：`IN PROGRESS`（v0.1.14 候选已恢复肉眼可见原始 Tier且最终审查无 P0 / P1；Windows 视觉与用户同机尚未完成）
- 用户目标与契约：Tier 可以通过英雄卡背景条 / 边缘色带降低界面拥挤，但必须在卡片 / 行内显示肉眼可见的上游原始、可审计 Tier 文字或等价明确标签，例如 `Tier 1` / `S`；只放在 `sr-only` 不算满足。不得替换成“强度顶尖”等主观宣传描述，也不得让颜色成为唯一信息载体。若需要中文辅助说明，只能作为次级、定义明确且与上游值一一映射的解释，不能冒充数据字段。
- 当前 dirty 候选实现：英雄卡 Tier 背景条内直接显示肉眼可见的原始 `Tn` 文本，不再只依赖 `sr-only` 或颜色，也不再显示“强度顶尖”。该变化已进入本轮本地测试 / build / source UI 门禁，但最终复审、Windows packaged 人工可读性和用户同机视觉仍未完成。
- 验收标准：英雄榜、实时助手、选人卡和无障碍文本对同一英雄使用一致 Tier；未知 / stale 状态准确显示，不把缺失映射成顶尖。搜索 / 排序仍按真实 Tier 数据而非营销文案，视觉快照覆盖各 Tier、缺失值、长中文和高对比模式。完成最终代码审查、测试和 Windows packaged 人工验收前保持 `IN PROGRESS`。

### HB-032 托盘“退出”触发已销毁 BrowserWindow 主进程错误

- 严重度：高（用户无法从标准托盘入口干净退出，且主进程直接抛出未捕获生命周期错误）
- 状态：`FIXED / UNVERIFIED`（代码、最终复审与 Windows packaged `shutdownLifecycle` 窄门禁通过；报告用户同机托盘右键退出尚未复测）
- 用户实机症状：从 Windows 右下角托盘右键选择“退出”后，应用弹出主进程错误 `TypeError: Object has been destroyed`。该记录只保留错误类型和受控调用链，不记录用户安装目录、用户名或其他完整本地路径。
- 已确认竞态：退出流程开始销毁 BrowserWindow 后，窗口事件仍触发 `WindowManager.activityChanged`，继而进入 `HexBridgeRuntime.sync` 和 `WindowManager.sync`；同步路径随后访问已销毁的 BrowserWindow 对象并抛错。现有证据足以确认生命周期 / 重入竞态，但尚未证明应在哪一层修复，也不能预写修复已经有效。
- 当前 dirty 草案：托盘 quit handler 在发起退出前先调用 `prepareToQuit`；WindowManager 进入 `quitting` 后切断 activity callback，所有 sync fail-closed，`getLiveWindow` 会删除 destroyed 引用，窗口 `closed` 事件也从受管 map 删除自身。`HexBridgeRuntime.stop` 同样先进入 `prepareToQuit`，避免其他停止入口绕过生命周期门禁。source Electron bridge smoke 使用真实 BrowserWindow 模拟 `prepareToQuit → destroy → late sync`，并断言 `shutdownLifecycle`，用于覆盖此前纯函数 / source UI 未触达的真实对象销毁路径。
- 当前验证：clean `npm ci` / audit 0；25 test files / 213 passed + 1 Windows skip、typecheck、lint、source Electron bridge / UI 和 `git diff --check` 通过。该证据只说明 dirty 草案的本地回归链通过；代码审查和 Windows workflow retry 尚未完成，报告用户同机托盘退出也尚未复测，因此状态继续 `IN PROGRESS`。
- 后续审查 P1 与两阶段 dirty 修正：退出生命周期不能只保护托盘路径，也不能把可失败的安装准备误作不可撤销退出。WindowManager 使用 `preparedInstallToken` 表示可撤销安装准备，使用 `quitCommitted` 表示不可撤销退出；`prepareForUpdateInstall` 生成并返回 token，`prepareToQuit` 提交退出并清除待安装 token。cancel 只有在 token 与当前准备一致且尚未 commit 时才允许恢复；迟到、旧 token 或 commit 后的 cancel 必须无效。
- Updater / Runtime 顺序：UpdateManager 保存本次 install token，在 `quitAndInstall` 同步抛错或安装期 error 时以同 token 取消；`quitAndInstall` 返回后还要检查是否已收到 error，避免同步 emit error 后又把状态误当成功。Runtime 向 WindowManager 暴露 prepare / cancel，真正 `app.quit` 路径进入 commit；安装失败只回滚当前未 commit 的准备，不得复活已进入真实退出的应用。
- 校准异步边界：WindowManager 增加 lifecycle epoch；启动校准在入口及每个 `await` 返回后核对 epoch / quitting / live window。prepare 时递增 epoch 并销毁仍存活的校准窗；退出期 `createWindow` 必须拒绝；`waitRenderer` 同时监听 `closed`，close / catch 分支只操作 live BrowserWindow。这样 capture pending 与退出交错时，迟到结果不能新建、显示或访问已销毁窗口；安装失败 cancel 后则允许明确恢复正常创建流程。
- P1 增量与最终本地验证：新增 begin→commit→late cancel、同步 emit error、token 顺序、旧 token 不能撤销新 token，以及既有 `capture pending → prepare` / cancel 后 resume 测试。最终复审无 P0 / P1并批准 Windows；最新 `npm test` 精确结果为 25 test files passed、219 tests passed + 1 skipped（220 total）。source Electron UI、真实 4K OCR、Release retention / icon、typecheck、lint、source Electron bridge smoke 与 `git diff --check` 全通过。
- Windows 候选证据：workflow_dispatch run [31697118111](https://github.com/RocXOvO/HexBridge/actions/runs/31697118111) / job [94437330072](https://github.com/RocXOvO/HexBridge/actions/runs/31697118111/job/94437330072) 基于 commit `34d14b45156eb762480c7d13af72dca2fd20ed2b` success，约 5m8s。clean dependencies / audit 0、public 0.1.13、OCR synthetic + 真实 4K、25 files / 219 pass + 1 skip、lint / typecheck / retention、pack / metadata、packaged UI、packaged bridge（含真实 BrowserWindow `shutdownLifecycle`）、synthetic updater、checksums 和 artifact 全通过；tag-only 发布步骤按预期 skip。此窄范围足以把代码状态记为 `FIXED / UNVERIFIED`，但没有通过 Windows 系统托盘菜单执行报告用户的完整退出交互，也没有报告用户同机复测，不能标 `VERIFIED`。
- 生命周期契约：托盘退出必须先进入单向 shutdown 状态，停止或忽略后续窗口 activity / Runtime sync、定时器、IPC 广播与可能重建窗口的逻辑；任何 BrowserWindow 调用前都要依据受管引用与 `isDestroyed()` 做一致守卫。退出顺序应有唯一所有者，并保证窗口 `close / closed / hide / blur` 等尾部事件不会把已销毁对象重新送入同步路径。
- 验收标准：真实 Windows packaged 中连续多次覆盖托盘退出、主窗口可见 / hidden / 最小化、选人伴随窗 / 校准窗存在、OCR 在途、LCU 轮询 / 数据请求在途等状态；每次都须无主进程异常、无窗口重建、无残留进程，并在有界时间内退出。自动化至少应在真实 Electron 生命周期中模拟 activityChanged 与 destroy 交错，断言 sync 不访问 destroyed BrowserWindow，且 release workflow 必须在 tag 前执行 packaged 托盘退出烟测。修复、Windows workflow 与用户同机复测完成前不得标 `FIXED` / `VERIFIED`。

### HB-033 installed 客户端更新仍显示或可能下载完整 EXE 量级

- 严重度：中高（自动更新可用但未实现用户期望的显著差分节省，并占用较多时间与流量）
- 状态：`IN PROGRESS`（v0.1.15 正式 Windows / public 差分窄门禁已通过，但 v0.1.14→v0.1.15 用户同机仍看到 / 可能下载约 200 MB；尚未证明真实网络差分或 full fallback）
- 用户实机症状：从 v0.1.13 更新到 v0.1.14 时曾下载约 190 MB；从 v0.1.14 更新到 v0.1.15 时又看到 / 可能下载约 200 MB，均与完整 EXE 量级一致。后一次更新实际由 v0.1.14 旧客户端执行，v0.1.15 新增的单 Range 实现不能反向注入旧客户端，因此 v0.1.15 发布链通过不能推翻该用户观察。当前没有同机网络请求、传输字节或 updater 受控诊断，尚不能区分 UI 在下载前先展示 `latest.yml` 的完整 installer metadata size，还是网络确实触发 full-download fallback；禁止把“看到约 200 MB”直接写成已确认全量下载，也禁止写成差分已修复。
- 差分契约：受支持源版本必须能取得不可变的旧 / 新 versioned blockmap；客户端只允许请求固定官方通道，验证 metadata / SHA-512 后使用 HTTP Range / 206 拉取差异块，实际 installer 网络传输量须显著小于完整 EXE。缺 blockmap、摘要损坏、服务器无 Range 或差分应用失败时允许安全回退完整包，但 UI 必须明确显示“已改用完整安装包”和预计 / 实际下载量，不能继续把完整下载呈现为差分。
- 安装交互契约：差分下载完成后，用户仍须在应用内明确确认“重启更新”，确认后才可以静默 NSIS 执行更新。完整包 fallback 不得使用静默路径，必须明示“完整安装包”并保留普通安装向导。v0.1.17 本地候选已在 Main 按可信 `downloadMode` 实现分流：`differential` 调用 `quitAndInstall(true, true)`，`full / cache / unknown` 调用 `quitAndInstall(false, true)`；Renderer 无权传入安装参数。两条路径都不得对局中安装，也不得在启动 / 退出时未经确认自动安装；不绕过 UAC / SmartScreen，也不承诺它们不会出现。该安装分流子项为 `FIXED / UNVERIFIED`，Windows installed 尚未验证，HB-033 总体继续 `IN PROGRESS`。
- v0.1.15 本地候选：引入 v2 single-range 差分协议；Windows packaged smoke 设计会读取真实上一正式 Release 的 EXE / blockmap，要求 metadata 首次请求 `302` 后下载路径发出 Range、服务返回 `206`、full installer 请求数为 0，实际传输量低于完整包 25%。legacy root 永久固定为 v0.1.14，不随 public channel 漂移；无法差分时普通 UI 使用明确中文说明已改用完整安装包。发布流程使用自有 draft 幂等发布，只有唯一 starter 的 0 字节占位资产允许删除，远端历史正式资产仍不可删；public channel 必须在正式资产回读验证后最后写入。
- Windows 候选证据：run `31707962223` 的 smoke 使用真实 previous Release v0.1.14 资产，但为被测 v0.1.15 应用人工 seed 旧 installer cache；因被测 EXE 自身版本是 v0.1.15，合成目标为 v0.1.16。结果为 `downloaded=true`、`differentialDownload=true`、metadata 1 次、old blockmap 1 次、new blockmap 1 次、installer Range 12 次、redirect 3 次、`installerTransferredBytes=1,335,875`，完整 installer 为 199,233,286 bytes，`isolatedCache=true`；门禁同时断言完整 installer 请求为 0。该结果只证明“旧 installer cache 已存在”时 v0.1.15 算法可走 v2 差分，不证明普通 installed 客户端实际具备该 cache，也不等于用户 v0.1.14 从 public channel 检查 / 下载 / 安装 v0.1.15 的真实链，更不覆盖 UAC / SmartScreen / 进程替换。
- 正式发布证据：tag run `31708642394` 以同样的 previous v0.1.14 资产再次通过差分门禁，并在正式资产发布 / v2 channel 写入后完成 public verify 和 packaged public check；public channel 为 0.1.15 / 199,233,286 bytes，当前 packaged 0.1.15 检查结果 `updateAvailable=false`。这将 HB-033 的 Windows / public protocol 范围形成正向证据，但没有执行用户已安装 v0.1.14 的真实下载、安装确认、UAC、进程替换和重启后版本检查，因此总体仍为 `IN PROGRESS`。
- 下一版验收边界：必须由真实 Windows installed v0.1.15 执行 v0.1.15→v0.1.16（或下一正式版本）更新，分别覆盖没有可用旧 installer cache 与已有 cache。记录脱敏状态时间线和实际网络累计字节，确认 UI 显示的是 metadata full size、预计差分量还是已下载量；同时核对旧 / 新 blockmap、Range / 206、是否发出完整 installer 请求、SHA-512、应用内“重启更新”确认、静默 NSIS、UAC、替换 / 重启后版本。无 cache 或差分失败时必须明示“完整安装包”并验证普通安装向导，断言未沿用静默参数。另覆盖对局阻止、启动 / 退出不自动安装、blockmap 缺失 / 损坏、Range 不支持和差分应用失败，确认中文提示、安全 fallback 以及 UAC / SmartScreen 仍可正常出现。不得记录带查询参数 URL、token、用户路径或安装目录。

### HB-034 三卡识别结果数秒后被连续丢帧清除

- 严重度：高（用户来不及查看或比较已经成功识别的三卡推荐）
- 状态：`IN PROGRESS`（v0.1.15 正式版已实现 round 保留；真实多轮游戏仍未验证）
- 用户实机症状：三张海克斯成功识别并显示后，结果在数秒内消失。当前不能从症状判断是界面检测丢失、OCR 连续未命中、阶段同步、timer 或 Renderer 状态覆盖，禁止猜根因。
- 状态契约：一组已可靠识别的三卡结果必须作为本轮最后可靠结果保留。连续丢帧、OCR 未识别、窗口暂时消失、动画过渡或 HexBridge 窗口显隐均不得清除；只有下一轮海克斯选择界面被正向、可靠检测到时，才进入新的 round 并清理 / 替换旧结果。终局 / 新游戏的既有 generation 边界仍可清理，不能把跨局保留扩大成陈旧结果泄漏。
- v0.1.15 本地候选：新增 `AugmentRound` 状态；成功结果跨界面空窗 / 连续 miss 保留，只有下一轮界面可靠正向出现时换代。手动触发得到 unreliable 结果时允许安全清理旧轮，避免用户明确重试后继续展示不可确认的旧组合；终局与新 generation 边界继续清理。
- 验收标准：自动化覆盖成功结果→长时间 miss / 界面消失仍保留、同轮重复结果去重、正向检测下一轮后清旧结果、终局与第二局换代；真实一整局覆盖多轮海克斯，确认用户可持续查看上一轮结果直到下一轮明确出现。

### HB-035 Windows 安装 / 桌面图标与客户端运行图标不一致

- 严重度：中（品牌识别混乱，用户无法确认不同入口是否属于同一应用）
- 状态：`IN PROGRESS`（v0.1.15 正式版已统一 ICO / Logo 并更换更新导航图标；Windows 实看尚未完成）
- 用户目标：以用户认可的桌面快捷方式图标作为唯一 HexBridge 主图标来源，统一 Windows 桌面快捷方式、安装器、EXE、任务栏、窗口标题 / 运行图标与托盘；更新导航入口改用新的、语义清楚且风格一致的独立图标，不能继续复用容易混淆的旧符号。
- 契约：所有主图标必须由同一受控源生成所需 ICO / PNG 尺寸，透明边缘和小尺寸轮廓一致；更新导航图标属于应用内导航资产，不得冒充主应用 icon。不得复制第三方品牌、代码或素材。
- v0.1.15 本地候选：Windows builder / 安装器、窗口与托盘统一使用同一 ICO / Logo 资源链，更新导航改为独立的新图标；icon verifier 已通过。该静态 / 构建前证据不替代桌面快捷方式、任务栏缓存、窗口标题、托盘和覆盖安装后的真实 Windows 视觉检查。
- 验收标准：Windows 安装后逐项截取 / 检查安装器、桌面快捷方式、EXE 属性、任务栏、窗口标题 / 运行图标、托盘和更新导航；要求主图标一致、非 Electron 默认、缓存刷新 / 覆盖安装后不残留旧图标，更新导航图标清晰可辨。

### HB-036 手动 OCR 截图可能捕获 HexBridge 自身遮挡窗口

- 严重度：高（应用自身遮挡三卡会直接导致 OCR 失败或误识别）
- 状态：`IN PROGRESS`（v0.1.15 正式版已实现手动截图前隐藏 / 后恢复；Windows 合成器与真实游戏尚未验证）
- 手动捕获契约：按钮、快捷键与托盘的同一 Main 手动 OCR 路径，在截图前必须记录所有可能遮挡目标的 HexBridge 受管窗口原始可见 / 最小化 / 焦点状态，将这些窗口隐藏，等待 Windows 桌面合成器完成至少一个可证明的稳定帧后再截图。捕获成功、失败、超时或异常后都须按原状态恢复；原本 hidden / 最小化的窗口不得被唤醒，原本失焦的窗口不得抢焦点。
- 隐私与失败边界：完整屏幕帧只能在内存中用于一次有界检测 / OCR，不得保存到磁盘、日志或 Renderer；诊断保存仍只允许经既有开关保存三张标题裁切。隐藏 / 恢复必须有生命周期 epoch / destroyed window 守卫，退出或安装期间不得重建窗口。
- v0.1.15 本地候选：手动 OCR 前记录 main / champion 窗口状态并隐藏，等待合成后截图，再以 `showInactive` 等不抢焦点方式按原可见状态恢复；原本 hidden 的窗口不恢复。完整帧仍只驻留内存，未放宽全屏保存边界。
- 验收标准：Windows packaged 覆盖主窗、选人伴随窗、校准窗、toast / 菜单可能遮挡，断言截图像素中不存在 HexBridge 窗口且捕获后可见 / 焦点状态精确恢复；覆盖 capture 失败、窗口销毁、退出竞态与多显示器。真实游戏前台按钮 / 快捷键结果应一致。

### HB-037 用户可见更新状态与推荐依据未完整中文化

- 严重度：中（影响简体中文产品一致性与推荐解释可读性）
- 状态：`IN PROGRESS`（v0.1.15 正式版已中文化状态与推荐依据；Windows / 用户视觉仍未验）
- UI 文案契约：删除更新页底部面向普通用户的“安装确认 / 未签名 / SHA-512”堆叠说明；两次用户确认、差分 / 完整包安装分流、未签名和校验边界继续完整保留在 README、Release notes、诊断 / 校验资料与实际确认流程中，不得删除或伪称已签名。所有用户可见状态枚举与 fallback，包括 `downloading`，必须映射为自然简体中文，不能直接渲染内部 code。
- 推荐解释契约：三卡推荐依据使用简洁、自然、可核对的中文，明确 rank / tier / 当前英雄选取率的上游口径，不输出字段名拼接、机器式中英混排或夸大结论；pickRate 仍不参与排序，海克斯胜率 / wins / games 继续禁止。
- v0.1.15 本地候选：更新状态与 fallback 映射为简体中文，更新页移除底部普通用户技术说明；三卡依据使用自然中文并明确为上游当前英雄专属推荐，不改变 rank 排序和 pickRate 次级展示边界。README / Release 中未签名、校验与用户确认说明继续保留。
- 验收标准：建立用户可见字符串清单 / 快照，覆盖更新全部状态与错误、三卡成功 / 并列 / 暂无数据 / stale、长中文和缺字段；断言内部英文 code 只留诊断，普通 UI 无上述底部技术说明，README / Release 安全边界仍在。

### HB-038 底部 toast 无有界消失与替换策略

- 严重度：中（提示长期遮挡页面，多个结果叠加或过期状态误导用户）
- 状态：`IN PROGRESS`（v0.1.15 正式版已实现有界 toast；Windows / 用户交互尚未验）
- 交互契约：底部瞬时 toast 必须有明确、可测试的最大显示时长并自动消失；后续 toast 到达时替换前一个，不叠加队列或让旧提示继续占位。成功 / 普通信息可较短，错误可适度延长但仍有界；重复同消息不得无限续期。页面内的持续业务状态、进度、错误详情和诊断卡可以继续保留，不能为让 toast 消失而清除真实状态。
- 可访问性与生命周期：toast 替换 / 消失应尊重 reduced-motion，并提供静态淡出或无动画等价行为；窗口 hidden / 销毁、路由切换、退出时清 timer，迟到 timer 不得清除较新的 toast。
- v0.1.15 本地候选：成功 / 普通 toast 最长 4.5 秒，错误 toast 最长 8 秒；新提示立即替换旧提示，sequence / timer 守卫防止旧 timer 清除新消息。页面内持续状态不随 toast 消失。
- 验收标准：fake timer 覆盖自动消失、后消息替换、旧 timer 不清新消息、重复消息、错误时长、路由 / 窗口销毁；packaged UI 验证不遮挡关键按钮且页面持续状态仍存在。

### HB-039 实时助手未连接空态仍包含冗余说明和手动重试

- 严重度：低中（不阻断自动发现，但空态操作噪声与实际后台行为重复）
- 状态：`FIXED / UNVERIFIED`（v0.1.17 Windows 候选已通过，尚无用户同机恢复证据）
- 用户决策：实时助手未连接空态移除“启动 WeGame…”类说明和“立即重新检测”按钮，只保留简洁、不误导的未连接状态。后台自动发现、有界重试和客户端启动后自动恢复能力必须保留，不得因删除按钮而停止运行。
- 诊断 / IPC 边界：诊断页或 Main 内部可保留受限 retry IPC 以支持排障，但普通 Renderer 不得传入端口、凭据、路径或候选。README 不得再指引用户点击已删除的“立即重新检测”按钮；需要的恢复说明应描述后台会自动重试和诊断入口。
- v0.1.17 本地实现：实时助手空态已删除上述说明与按钮；后台自动发现不变，诊断页 / 底层受限 retry 继续保留。独立终审 P0 / P1 为 0，source UI smoke 与本地完整门禁通过；这不替代真实 Windows 从未启动到启动 WeGame 的自动恢复。
- 验收标准：source / packaged UI 断言空态不含上述说明与按钮，README 不含过期点击指引；真实 Windows 从无客户端到启动 WeGame 时无需手动操作即自动恢复，诊断 retry 仍受限且无敏感字段。

### HB-040 实时助手当前英雄出装推荐

- 严重度：中（新增用户价值，但若跨流派拼装或误解上游字段会直接误导出装）
- 状态：`FIXED / UNVERIFIED`（v0.1.17 Windows 候选的数据 / UI / 缓存门禁已通过，尚无用户同机数据验收）
- 数据契约：只消费当前已按英雄请求的 data.dtodo 单英雄详情中文档化 `builds` 数组，不新增 endpoint、请求、credits 或隐式后台刷新。默认仅选 `builds[0]`，且出门装、第一组核心装和情境装备必须全部来自该同一 build；不得跨 build / 流派混合。
- 字段语义：`fullItems` 和 `itemOrders` 只能按上游文档语义处理，绝不标记、拼接或推断为“六神装”。装备图标与名称只来自已展开详情的受控字段，不从其他 build 补齐；只有正整数装备 ID、非空名称和合法 HTTPS 图标同时存在时才展示，缺名、缺图或分组为空时 UI 明确显示“暂无数据”。
- 来源与缓存：实时助手标注该出装为 `iesdev` 上游数据并显示对应补丁 / stale 状态。v0.1.17 候选将英雄详情缓存升至 schema v3；v1 / v2 仅在网络失败时允许作为 stale `rank / tier` fallback，并强制 `builds=[]`，不能伪造出装。详情异步提交仍受 `championId + dataVersion` 守卫，防止旧英雄 / 旧版本覆盖当前卡片。
- 验证证据：独立终审 P0 / P1 为 0；本地 `npm audit --audit-level=high` 为 0，29 test files / 259 passed + 1 Windows-only skipped，typecheck、lint、diff-check、source Electron bridge / UI smoke 与 v0.1.17 release version gate 全通过。Windows candidate workflow 又以 29 files / 260 passed、packaged UI / bridge 全绿；候选已 push main，但尚未 tag / Release，也没有用户同机验收。
- 验收标准：清洗测试覆盖空 builds、多 build 不混合、只取第一组核心装、情境装备、缺图 / 缺名、schema 迁移和 stale fallback；请求计数断言不会因展示出装新增 API 请求 / credits。Renderer 快照覆盖来源 / 补丁、暂无数据、长装备名和图标缺失；在 Windows packaged 与用户同机验收前不得标 `VERIFIED`。

### HB-013～HB-017 的 v0.1.3 packaged smoke 边界

- tag workflow 在 Windows runner 启动实际 unpacked EXE：bridge smoke 验证 CommonJS preload、bridge / IPC 和安全偏好；packaged UI smoke 验证 invalid-Key 反馈与 busy 恢复、关键文字 14px、三个 reduced-motion 选择器、1024×768 校准截图 data URL / Renderer 解码、中文说明 14px，以及真实 CDP `Esc` 后主窗口恢复。
- HB-014 的已知首帧崩溃和受控 packaged Windows 进入 / 退出路径因此可在窄范围标 `VERIFIED`。但该 smoke 不使用真实有效 Key、不连接国服 WeGame / LCU、不覆盖中文安装路径、多显示器、100%～150% DPI、真实游戏截图 / 完整三框 OCR，也不测量动效 GPU / CPU；HB-013、HB-015～HB-017 继续 `FIXED / UNVERIFIED`，HB-014 的剩余范围同样 `UNVERIFIED`。

### 附带安全与性能加固

- 导航：由前缀字符串判断改为开发环境精确 origin / pathname / search allowlist，以及生产环境精确 `file:` entry allowlist；同时守卫 navigate 与 redirect。
- 数据请求：初始化与同英雄详情请求合并在途 Promise；缓存恢复同步恢复 dataVersion；候选 Key 在 HEAD 验证成功前不持久化。
- 响应速度：英雄 / snapshot 变化立即同步，详情后台非阻塞补齐；详情到达且 sequence 仍匹配才再次同步，不把 API 延迟计入选人 UI 刷新路径。

## 七、当前自动化验证基线

2026-08-14 `v0.1.18` Windows 候选基线（已 push，未 tag / Release）：

- 侧栏按钮加入受控微动效，Vue 页面使用 `out-in` 进 / 退场，`reduced-motion` / `eco` 有静态降级；标题栏移除版本。独立更新页和旧 Renderer `check / download / install / openRelease` IPC 已删除，Main 只接受 sender 受限无参 `applyUpdate`，并在调用前、检查后、下载后三处阻止对局安装。
- 用户单击后由 Main 执行 check→download→silent NSIS install；启动 / 普通退出不自动安装，UAC / SmartScreen 仍可能出现。首次真实跨 `0.1.17→0.1.18` 使用 `ConfigStore` pending 展示 curated 改进列表，关闭后持久化；全新安装不弹。
- 设置中的 API Key 申请只打开 Main 固定 `https://data.dtodo.cn/developer.html`，Renderer 无权传 URL；文案已精简。当前英雄出装推荐继续保留，同一 `builds[0]` 分组缺失时明确“暂无数据”。
- 最终审查修复 P1 后无已知 P0 / P1；本地 30 test files / 264 passed + 1 Windows-only skipped，typecheck、lint、`git diff --check`、source Electron bridge / UI、build 与 preload 全通过。
- 源码 commit `8b7bdac` 与烟测竞态修复 commit `f24ff6f` 已 push main。首次 workflow_dispatch run `31729473777` / job `94545977255` 失败：页面已引入 Vue Transition，旧 packaged UI smoke 在转场完成前过早查找校准入口；产品校准功能存在，因此这是烟测时序竞态，不是校准功能回归。修复仅把入口检查改为 `waitUntil` 等待稳定功能入口。
- 第二次 workflow_dispatch run `31730129727` / job `94548232662` success，约 5m33s：clean `npm ci`、audit、public 0.1.17、OCR fixture、Windows 30 files / 264 passed + 1 Windows skip、lint、typecheck、retention / legacy、pack、metadata、packaged UI + calibration、packaged bridge、synthetic differential updater、checksums 与 artifact 全通过；tag-only 步骤按预期 skip。
- 当前尚未 tag / Release，公开 Latest 仍为 v0.1.17。更新 installed 链、跨版本改进弹窗、Windows 用户视觉 / 动效与固定外链仍不得据 runner 写 `VERIFIED`。

2026-08-14 `v0.1.17` Windows 候选基线（已 push，未 tag / Release）：

- 实时助手已显示当前英雄 data.dtodo 单英雄详情中 documented `builds[0]` 的同一路线出门装、第一组核心装与情境装备，标注 `iesdev` 与补丁；没有新增 endpoint、请求或 credits，不跨 build，也不消费 `fullItems / itemOrders`。装备须同时具备正整数 ID、非空名称与合法 HTTPS 图标，否则相应分组明确显示“暂无数据”。
- 英雄详情缓存升至 schema v3；v1 / v2 只在网络失败时作为 stale `rank / tier` 回退且 `builds` 为空，详情提交仍由 `championId + dataVersion` 守卫。实时助手未连接空态已移除说明和“立即重新检测”，后台自动发现与诊断 / 底层 retry 不变。
- Main 依据可信 `downloadMode` 分流安装：`differential` 使用 `quitAndInstall(true, true)`，`full / cache / unknown` 使用 `quitAndInstall(false, true)`；下载与重启各自仍需显式确认，对局中阻止安装，启动 / 退出不自动安装，且不绕过 UAC / SmartScreen。
- 独立终审 P0 / P1 为 0。本地 `npm audit --audit-level=high` 为 0，29 test files / 259 passed + 1 Windows-only skipped，typecheck、lint、`git diff --check`、source Electron bridge smoke、source UI smoke 与 v0.1.17 release version gate 全通过。
- 源码 / 记忆 commit `d8c9b2cd8456adee9ede304566404dc235b1f47f` 已 push main。workflow_dispatch run `31724223555` / job `94528479256` 于 17:08:42Z～17:13:56Z success，约 5m16s：clean `npm ci` / hydrate、audit high 0、public 0.1.16、OCR synthetic + 真实 4K fixture 285ms、Windows 29 test files / 260 passed、lint、typecheck、retention / legacy、pack、metadata、packaged UI / bridge、差分 updater、checksums 与 artifact 全通过；候选 EXE 为 199,236,658 bytes。
- 差分 smoke 从 previous 0.1.16 合成 available 0.1.18：`differentialDownload=true`、metadata 1 次、old / new blockmap 各1、Range 10、redirect 3、传输 1,181,506 / 199,236,658 bytes、`isolatedCache=true`。Actions artifact ID `9190725113`，zip 473,416,560 bytes，digest `e41d1fe443394226c4dc64c6e120d5b97f3b8e1e3fb3390e379f598acb8fc462`。
- tag-only 发布 / channel 步骤按预期 skip；尚未创建 tag / Release，公开 Latest 仍为 v0.1.16。上述结果只能支持 HB-019 安装分流、HB-039 与 HB-040 为 `FIXED / UNVERIFIED`；真实 installed 静默 NSIS、完整包普通安装器和用户同机空态 / 出装仍未验证。

2026-08-14 `v0.1.17` 正式 Release 基线：

- annotated tag object `7b6b638af2a89e19f4bc7ac8623dd31ab0b40bd6` 指向产品 / 记忆 commit `d7edf9fc917d8e1645d109e88324589deb4f7140`。tag run `31724844667` / job `94530534700` 于 17:16:11Z～17:22:05Z success，约 5m54s；Windows 29 files / 260 tests、真实 4K fixture 272ms、完整门禁、packaged UI / bridge、差分 updater、public channel、Release 与 public packaged check 全通过。
- 差分 smoke 从 previous 0.1.16 合成 available 0.1.18：old / new blockmap 各1、Range 11、redirect 3、传输 1,235,951 / 199,236,595 bytes、`isolatedCache=true`。该证据仍不等于报告用户 installed 客户端实际完成静默 NSIS、完整包普通安装器、UAC / SmartScreen、替换与重启。
- Release [v0.1.17](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.17) 于 17:21:55Z 公开，为 Latest、non-draft、non-prerelease。public v2 channel 核验 `0.1.17 / 199,236,595 bytes`，public packaged check 为 `updateAvailable=false`；历史正式 Releases / assets / tags 继续保留。
- 正式五项资产：
  - EXE：199,236,595 bytes，SHA-256 `7e76155f10dc33beed787f6b9e79a332e44eed550822f32b1c67205585644e15`。
  - blockmap：201,319 bytes，SHA-256 `b431a0bb624d241b47b1f3c8a5a17c1f043a1696dadab7da6c38251c3834d600`。
  - ZIP：274,389,976 bytes，SHA-256 `739588e0be6717ce4b089155ca1fb8ca6d718d3b53e7ccefcf6347349c6312d1`。
  - `latest.yml`：346 bytes，SHA-256 `e0d90b215065ee1a38f35b41e5c9ea5fb72abc678ec3e800fd7e6327df77bec3`。
  - `SHA256SUMS.txt`：182 bytes，SHA-256 `a9dc2f4efa0896014c862e1975cc58a2e4e21b43f189dafbdae88ae10f5a8ea5`。
- Actions artifact ID `9190979002`，473,416,475 bytes，digest 前缀 `6697dfc…`。HB-039 / HB-040 与安装分流保持 `FIXED / UNVERIFIED`；用户同机空态 / 出装 / installed 安装未验，未签名与 SmartScreen 边界不变。

2026-08-13 `v0.1.12` 正式 Release 自动化基线：

- 失败前候选完整链为 22 test files / 179 passed + 1 Windows-only skipped；typecheck、lint、source Electron bridge smoke、source UI smoke、真实 4K title-only ONNX fixture、icon verifier、Release retention verifier 与 `git diff --check` 全通过。该时点最终只读审查未发现 P0 / P1并批准进入 Windows，但随后 packaged UI 首帧失败证明 source smoke 没覆盖初始空 rect 模板求值。
- macOS 主机交叉执行 `pack:win`、updater metadata verifier 与 checksums 成功。非正式候选 EXE 为 198,688,252 bytes、SHA-256 前缀 `711a7444…`；ZIP SHA-256 前缀 `872ccb48…`。本地 `latest.yml` 的 version / path / size / SHA-512 与 `v0.1.12` EXE 一致，配套 blockmap 存在且通过本地 metadata 核验。截短摘要与 macOS 交叉产物只供候选诊断，正式资产必须以后续 Windows tag workflow 为准。
- Windows workflow_dispatch run [31681231963](https://github.com/RocXOvO/HexBridge/actions/runs/31681231963) / job [94386905747](https://github.com/RocXOvO/HexBridge/actions/runs/31681231963/job/94386905747) 中 build、真实 4K ONNX fixture、179 passed + 1 Windows skip、lint、typecheck、pack 和 metadata 均通过，仅 packaged UI calibration 失败；后续 bridge / updater / checksums / artifact 不得默认为已执行成功。
- 首帧 guard 修正审查无 P0 / P1，commit `f74c0ef` 已 push。Windows retry run [31681888143](https://github.com/RocXOvO/HexBridge/actions/runs/31681888143) / job [94388977148](https://github.com/RocXOvO/HexBridge/actions/runs/31681888143/job/94388977148) 通过 prechecks、build、pack、metadata，以及 packaged calibration 的显示 / Esc / close / 主窗重新可见；最终只在“恢复后必须有焦点且不暂停”的烟测断言失败。
- smoke gate 修正复审无 P0 / P1，commit `0f7b8b9` 已 push。Windows workflow_dispatch run [31682463869](https://github.com/RocXOvO/HexBridge/actions/runs/31682463869) / job [94390815147](https://github.com/RocXOvO/HexBridge/actions/runs/31682463869/job/94390815147) 基于完整 commit `0f7b8b93…` success，用时约 5m7s。
- 本次 Windows 全链：clean `npm ci`、audit 0、public `0.1.11` channel、OCR 模型合成 smoke + 真实 4K title-only fixture、22 test files / 179 passed + 1 Windows-only skip、lint、typecheck、Release retention verifier、pack（候选 EXE 199,180,738 bytes）、updater metadata verifier、packaged UI、packaged bridge、synthetic `0.1.13` updater download、checksums 与 artifact upload 全通过；tag-only channel / Release 步骤按预期 skip。
- packaged UI 校准窄范围：1024×768 截图、校准页首帧、sender isolation、Esc、校准窗口销毁和主窗恢复通过；无交互 runner 最终状态为 `hidden=false / focused=false / paused=true`，准确验证“可见但失焦时暂停”。它不运行真实用户 4K / DPI / 多屏、真实 OCR 目录保存、全局快捷键冲突或 WeGame。
- 正式 annotated tag 指向产品提交 `648390c19c3667c3b66909ce2444003e30e16ce9`。tag run [31683239843](https://github.com/RocXOvO/HexBridge/actions/runs/31683239843) / job [94393297681](https://github.com/RocXOvO/HexBridge/actions/runs/31683239843/job/94393297681) success，用时约 5m44s；clean dependencies、audit、OCR synthetic + 真实 4K、22 test files / 179 passed + 1 Windows-only skip、lint、typecheck、retention verifier、pack / metadata、packaged UI / bridge、synthetic update、public update check、checksums、artifact / Release 发布全部通过。
- 正式 Release [v0.1.12](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.12) 发布时为公开 Latest，非 draft / prerelease；public channel verifier 当时核验 `version=0.1.12`、EXE size 199,180,739 bytes，metadata 与正式资产一致。当前 Latest 已由 v0.1.15 接替，但 v0.1.12 Release / 资产继续保留。
- 正式五项资产：
  - EXE：199,180,739 bytes，SHA-256 `2150657a75ae9761ccda3a0f6ebf68eef6499a407e53b440e078575a4af817b0`。
  - blockmap：201,089 bytes，SHA-256 `00fd9c2ded4dbda86af5d3a5ffe4a6b778a6437f01ae9449f7b1f161a8e3f567`。
  - ZIP：274,332,041 bytes，SHA-256 `f24bf6cf5caa4044e847ee50e833d4c84b9961ba6dba6da4527f12be5a643f3f`。
  - `latest.yml`：346 bytes，SHA-256 `302b8f09de98b6d0b79eeaf13ab8a8281a92eabacac7165fa60b3115b8b984cc`。
  - `SHA256SUMS.txt`：182 bytes，SHA-256 `375028efcb44a0e630eb1627c48320b9074550231eeb5d54ad4b17f0e1551f70`。
- 远端 retention 正向证据：v0.1.12 发布后，v0.1.11 Release 及其 EXE / blockmap / ZIP / latest / checksums 五项资产仍完整存在。它证明新 workflow 没有删除上一正式版本和差分所需旧 blockmap；不证明 electron-updater 实际请求旧 / 新 blockmap、使用 Range / 206 或显著减少传输量。
- 新增 / 扩展的自动化覆盖：launcher-side terminal / Lobby 空窗与 outgoing empty ChampSelect 的交接保留，以及可信显式异队列在宽限前清理；整卡→标题 ROI 几何、OCR 原文 / 多行择优、保存前内存截图 3/3 目录匹配；热键格式、冲突、先注册新键后注销旧键、持久化失败回滚、双失败 active override、默认 F8 启动冲突及自定义 + F8 fallback 双冲突；配置迁移只关闭 auto OCR 并保留 visual mode；自动 OCR 960px gate miss / hit 后 1920px OCR / 手动单帧；搜索 name / title / alias / 显式常用别名；本地 `release/` 精确目录清理和 symlink 拒绝。真实 ONNX fixture 只覆盖仓库内三块用户 4K 来源的 title-only 裁切，不保存原始截图。
- icon verifier 仅证明生成的 PNG 签名、ICO 多尺寸目录和文件非空；retention verifier 仅静态拒绝 workflow 中已知远端 Release / tag 删除命令。它们不等于 Windows EXE / 任务栏 / 托盘 / 安装器视觉验证，也不证明所有未来删除变体都被语义分析捕获。
- v0.1.12 正式 Release workflow 当时已全绿，但实时用户 4K / DPI / 多屏校准、真实 WeGame 交接 / LCU 恢复、Windows 全局快捷键和游戏性能采样尚未完成；title-only ONNX fixture、1024×768 packaged 校准和合成 updater 不等于这些实机闭环。此条保留 v0.1.12 时点证据；后续 v0.1.13 用户同机已补齐交接连续性子项，但 HB-020 / HB-022 的终局 / 第二局以及 HB-023～HB-031 各自剩余范围仍不得据旧门禁升级为 `FIXED` / `VERIFIED`。

v0.1.13 实施与发布基线（保留候选阶段历史）：

- 第二轮审查发现并修正两个 P1：fresh 独立游戏进程 heartbeat 必须先于 `FailedToLaunch / TerminatedInError` 清理；tasklist 必须 tri-state，并由 `GameProcessExitGuard` 在同 generation / champion、先见 running、active 中连续 not-running 满 4 秒、无 error 的条件下确认退出，再由 tracker 的 5 秒心跳过期守卫原子清理。`augment-interface` 不得刷新独立进程 heartbeat。最终复审已无 P0 / P1。
- 最新 clean 本地全链：`npm ci`、audit 0、OCR models / checksum、synthetic OCR smoke、真实 4K title-only ONNX fixture、23 test files / 199 passed + 1 Windows-only skipped、lint、typecheck、source Electron bridge smoke、source UI smoke、icon verifier、Release retention verifier 与 `git diff --check` 全通过。
- macOS cross `pack:win`、updater metadata verifier 与 checksums 成功。非正式候选资产：EXE 198,688,597 bytes，SHA-256 `b3879ffb66feee33d18239d0c019e08427ad5d63ba795c056f093f67b1c89468`；blockmap 201,144 bytes，SHA-256 `756f3ce5cb26984bb8f9b9240804789d992a95a40ec4dcced98c76e4f1286109`；ZIP 274,219,240 bytes，SHA-256 `801809b55377c5d5a44a9f57b179c3890ec567522902664437f56038ee084dbf`；`latest.yml` 346 bytes，SHA-256 `f7f5762110fca2c21bb6376b05e145b83cdeb0ea7b6289b788cb45432a08da44`；`SHA256SUMS.txt` 182 bytes，SHA-256 `aa3326367761521374a908bab93356d1e550635cf4b62554ae9c4f80c90c37a4`。
- metadata 核验：`latest.yml` 的 `version=0.1.13`、path、EXE size 与 SHA-512 均和候选 EXE 一致，唯一 versioned blockmap 非空；`SHA256SUMS.txt` 只列当前 0.1.13 EXE / ZIP 且与上述摘要一致。以上只是 macOS 面向 Windows 的交叉构建，不是正式 Windows Actions 资产。
- `clean-local-release` 在本轮 pack 前从精确仓库 `release/` 删除 7 个旧本地产物；symlink / 越界守卫与 retention verifier 继续通过。该动作没有调用 GitHub API、没有删除或改写任何远端 Release / assets / tags；远端保留语义不变。
- 上述本地交叉打包完成时尚未 commit / push、运行 Windows workflow 或创建 tag / Release；随后状态见下列各条。报告用户同机 WeGame 交接和 4K 性能当时及正式发布后仍未复验；HB-020、HB-022、HB-028 及其他实机缺口继续 `IN PROGRESS`，不得写 `FIXED` / `VERIFIED`。
- 随后候选 commit `8b482b1` 已 push main。Windows workflow_dispatch run [31688606924](https://github.com/RocXOvO/HexBridge/actions/runs/31688606924) / job [94410471102](https://github.com/RocXOvO/HexBridge/actions/runs/31688606924/job/94410471102) 失败：clean dependencies / audit、OCR models / synthetic + 真实 4K、23 files / 199 passed + 1 Windows skip、lint、typecheck、retention、pack 与 updater metadata 均通过；失败仅发生在 packaged UI smoke 第一次发送 CDP `Runtime.enable` 的固定 5 秒等待。日志已显示产品进程与 DevTools endpoint 启动，但烟测尚未执行 bridge、视觉状态、校准或其他 UI 断言，因此不能把该结果解释成产品 UI / preload / 功能失败；失败后续 packaged bridge / updater / checksums / artifact 步骤也不得默认为已执行。
- main 与 calibration 两处 `Runtime.enable` 单步超时从 5 秒放宽至 10 秒后，第二次 Windows workflow_dispatch run [31689142006](https://github.com/RocXOvO/HexBridge/actions/runs/31689142006) / job [94412154784](https://github.com/RocXOvO/HexBridge/actions/runs/31689142006/job/94412154784) 的 clean dependencies / audit、OCR models / synthetic + 真实 4K、23 files / 199 passed + 1 Windows skip、lint、typecheck、retention、pack 与 updater metadata 均通过；packaged UI 已越过 CDP 建连、显示校准页并取得校准截图。失败时观测为 `hiddenPause={hidden:false,paused:true}`：无交互 Windows runner 中 `document.hidden` 不代表原生 `BrowserWindow.hide`，且产品性能 class 已按策略暂停，因此该失败不能解释为校准窗口未显示、未暂停或产品性能守卫失效。
- 第二次失败后的 smoke 草案仅将“校准进行中”的性能断言收敛为必须 `paused=true`；仍保留校准截图 / toolbar、真实 Esc、校准 target 消失、main target 存活、主窗口恢复 `hidden=false`，以及恢复后 focus↔paused 一致性的全部断言。45 秒总 hard stop 与其他失败条件不变。提交前独立审查无 P0 / P1，local node-check、lint、source UI standalone 与 `git diff --check` 通过；后续 Windows 结果见下一条，不能仅凭这段草案证据升级任何 HB 状态。
- 上述 smoke 修正已纳入 commit `f4156f9` 并 push main。第三次 Windows workflow_dispatch run [31689676821](https://github.com/RocXOvO/HexBridge/actions/runs/31689676821) / job [94413841034](https://github.com/RocXOvO/HexBridge/actions/runs/31689676821/job/94413841034) success，约 3m53s：OCR 真实 4K、Windows 23 test files / 200 tests（无 skip）、lint、typecheck、retention、pack、updater metadata、packaged UI、packaged bridge、synthetic updater、checksums 与 artifact 全通过；候选 EXE 为 199,181,319 bytes。packaged UI 的校准截图为 1024×768，结束后主窗口状态为 `hidden=false / focused=false / paused=true`，符合无交互 runner 与自动性能策略。tag-only 发布步骤按预期跳过，未创建 tag / Release；这一成功门禁不替代真实 WeGame 同机交接、用户 4K / DPI / 多屏或性能验收，所有相关 HB 继续 `IN PROGRESS`。
- v0.1.13 正式 annotated tag object `6d38e740…` 指向产品提交 `9ef1a11e…`。tag run [31690145526](https://github.com/RocXOvO/HexBridge/actions/runs/31690145526) / job [94415337106](https://github.com/RocXOvO/HexBridge/actions/runs/31690145526/job/94415337106) success，约 5m25s；Windows 200 tests、packaged UI / bridge、synthetic + public updater、Release 与 channel 等完整门禁均通过。Release [v0.1.13](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.13) 公开、Latest、non-draft、non-prerelease；public channel verifier 核验 `version=0.1.13`、EXE size 199,181,321 bytes。
- v0.1.13 正式五项资产：EXE 199,181,321 bytes / SHA-256 `8c2af430…`；blockmap 201,342 bytes / `91277724…`；ZIP 274,332,673 bytes / `a3d0e260…`；`latest.yml` 346 bytes / `b25737b1…`；`SHA256SUMS.txt` 182 bytes / `629c02c9…`。这些是正式 Windows tag workflow 资产摘要；截短哈希不得用于替代完整校验清单。
- v0.1.13 发布后 v0.1.11 / v0.1.12 的 Release 及各自五项资产仍完整保留，全部 tags 也保留，继续提供远端 retention 正向证据。真实 installed N→N+1 的旧 / 新 blockmap、Range / 206、实际传输量、安装替换与 fallback 仍未验证；相关 HB 状态不升级。

v0.1.14 正式发布基线：

- tag / 产品提交 `5bd64052ec9262f38bbea0351e28c889d69009e3`。正式 tag workflow run [31697626369](https://github.com/RocXOvO/HexBridge/actions/runs/31697626369) / job [94438937472](https://github.com/RocXOvO/HexBridge/actions/runs/31697626369/job/94438937472) success，约 5m36s。
- 正式 Windows 门禁：audit 0、OCR synthetic + 真实 4K、25 test files / 219 passed + 1 Windows-only skip、lint、typecheck、retention、pack / updater metadata、packaged UI、packaged bridge（含 `shutdownLifecycle`）、synthetic updater、checksums、public update check、Release publish 全通过。
- Release [v0.1.14](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.14) 发布时为公开 Latest、non-draft、non-prerelease。public channel 当时核验 `version=0.1.14`、EXE size `199,183,989 bytes`、SHA-512 `+20kE08T2vRQ1K8oQN36pai4nYaCQFlsPOwwH5YZ2zMz8NYTavMUc9XNA54XRJprVZ2pbi+H27mNV5WLp6+o9Q==`，与正式 EXE 一致。
- 正式五项资产：
  - `HexBridge-0.1.14-x64.exe`：199,183,989 bytes，SHA-256 `54dbabf5025f8ac1ce69824b4b30648cfb2f1a5ac3bc97f2fdeb7c0f3f9cde21`。
  - `HexBridge-0.1.14-x64.exe.blockmap`：201,233 bytes，SHA-256 `aa92b532a292e419d2233baf735b1ecb45d8818d490a14d6af5944bb545fd358`。
  - `HexBridge-0.1.14-x64.zip`：274,336,132 bytes，SHA-256 `534b9c83b974c1cb2d6d414743df44a7280096c8225e2710008e19848f12b259`。
  - `latest.yml`：346 bytes，SHA-256 `7350a9997bb3073832ffe8ddae4b6df7620ff53a070391082defd5a2b37d6233`。
  - `SHA256SUMS.txt`：182 bytes，SHA-256 `5a4f279c5745552203216438834010cbc593bb84a339e0c4f8c1c1f7c4ae7cd7`。
- v0.1.11～v0.1.13 Releases 继续保留；至少 v0.1.12 / v0.1.13 各自五项资产已回读确认仍完整，因此 remote retention 在本次发布继续生效。该事实只证明历史 Release / assets 没被删除，不证明 installed N→N+1 请求了旧 / 新 blockmap、获得 HTTP Range / 206、显著减少传输量或成功完成差分安装。
- HB-032 仍为 `FIXED / UNVERIFIED`：tag workflow 的 packaged bridge `shutdownLifecycle` 是正向窄证据，但没有通过报告用户机器的系统托盘右键菜单重走完整退出路径；HB-029～031 与其他用户实机未闭环项保持原状态。未签名 / SmartScreen 与 Node 20 deprecated annotation 边界不变。

v0.1.15 正式发布基线：

- annotated tag `v0.1.15` 的 tag object 为 `e8e165b9b1498873ca472be9641e9c316775c222`，指向产品 / 记忆提交 `c5331271fcb218f21202572acc7ac5fe06090be8`。正式 workflow run [31708642394](https://github.com/RocXOvO/HexBridge/actions/runs/31708642394) / job [94475549775](https://github.com/RocXOvO/HexBridge/actions/runs/31708642394/job/94475549775) 于 2026-08-13T14:09:13Z～14:14:58Z success，用时约 5m45s。
- 正式门禁：clean `npm ci`、version gate、audit high 0、OCR synthetic + 真实 4K、Windows 27 test files / 236 tests、lint、typecheck、remote retention、legacy root 0.1.14、pack / metadata、packaged UI / bridge、seed 旧 installer cache 的 v0.1.14 差分、checksums、v2 channel render、preflight、artifact upload、自有 draft publish、v2 channel 写入、public verify 与 public packaged check 全通过。
- 差分窄证据：previous Release 为 v0.1.14，测试人工 seed 旧 installer cache；old / new blockmap 各请求 1 次、installer Range 请求 12 次、redirect 3 次、实际传输 1,335,875 / 199,233,286 bytes，完整 installer 请求为 0，且使用隔离 cache。它只证明正式 Windows runner 在 cache 前置条件满足时按 v2 single-range 协议取得显著低于完整 EXE 的字节量；没有执行报告用户机器上 installed v0.1.14→v0.1.15 的真实链。随后用户仍看到 / 可能下载约 200 MB，且缺少网络字节证据区分 metadata 展示与 full fallback，因此 HB-033 总体继续 `IN PROGRESS`。
- Release [v0.1.15](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.15) 于 2026-08-13T14:14:49Z 公开，为 Latest、non-draft、non-prerelease。public channel verifier 核验 `version=0.1.15`、EXE size `199,233,286 bytes`；packaged public check 对当前 0.1.15 返回 channel 0.1.15 / `updateAvailable=false`。中文 Release notes 已说明未签名 / SmartScreen 与用户实机边界。
- 正式五项资产：
  - `HexBridge-0.1.15-x64.exe`：199,233,286 bytes，SHA-256 `94d7659c990253045906096586b63d3e5c4544aba3ba5bbc3722bcb21748baf6`。
  - `HexBridge-0.1.15-x64.exe.blockmap`：201,201 bytes，SHA-256 `0862b5f26a0704117b0370b9b06ef1b9b21d590f52190dc2bba9a9ab0f1b8582`。
  - `HexBridge-0.1.15-x64.zip`：274,386,086 bytes，SHA-256 `12c37376bdd6a6f4a4c02894f24e6b87130bec2d45581de4955e49332b2f37a6`。
  - `latest.yml`：346 bytes，SHA-256 `f9c6b555f02fe6762b4642c04dda8cbb6cfdec404218cd678ef32da401cfdcff`。
  - `SHA256SUMS.txt`：182 bytes，SHA-256 `7ee77e7511c798a1a9da6bc4151632183fa0d1080ee65021c02398574e2233fd`。
- Actions artifact ID `9184431486`，归档大小 473,407,850 bytes，digest `7ae834d9b35af6d3ed68bd37cd22e05e37e168c0e43759a2276e92dcaaacf495`。v0.1.14 及后续正式 Release / assets / blockmap / tags 继续保留，远端 retention 契约没有回退；HB-034～038 仍需报告用户同机的游戏多轮、图标、合成器截图、中文视觉与 toast 验收，均保持 `IN PROGRESS`。

v0.1.16 Windows 候选与正式发布基线：

- 产品 commit `e37765620db6d36c070ee602c3ddee06ce5049ca` 已 push main。workflow_dispatch run [31718519456](https://github.com/RocXOvO/HexBridge/actions/runs/31718519456) / job [94509290728](https://github.com/RocXOvO/HexBridge/actions/runs/31718519456/job/94509290728) success，用时约 5m32s。
- Windows 门禁：clean `npm ci`、Electron hydrate、audit、public legacy check、OCR synthetic + 真实 4K fixture、29 test files / 255 passed（Windows-only 测试已实际运行，无 skip）、lint、typecheck、remote retention verifier、pack、updater metadata verifier、packaged UI / bridge（含生产 `NativeImage` 裁切）、differential updater smoke、checksums 和 artifact upload 全通过。真实 4K fixture 在该 run 为 270ms，候选 EXE metadata size 为 199,235,065 bytes。
- 差分烟测：previous Release 为 0.1.15，因被测应用为 0.1.16而合成 available 0.1.17；`differentialDownload=true`、old / new blockmap 各请求1次、installer Range 请求10次，实际传输 1,213,091 / 199,235,065 bytes，`isolatedCache=true`。它仅证明 Windows runner 的受控差分链，不等于报告用户 installed v0.1.15 对下一公开版本的真实网络传输或安装。
- 候选 run 为无 tag workflow，tag-only Release / channel 步骤按预期 skip；该时尚未创建 v0.1.16 tag / Release。后续正式发布事实见下列各条。
- 正式 annotated tag object `30d87a99e913ed1bac9fb689621f7bcf5a5e4b99` 指向产品 commit `043c9decf8cdea4bdd16ebcf77a302915ec068a9`。tag run [31719527780](https://github.com/RocXOvO/HexBridge/actions/runs/31719527780) / job [94512675558](https://github.com/RocXOvO/HexBridge/actions/runs/31719527780/job/94512675558) success，约 5m37s；Windows 29 test files / 255 passed、真实 4K fixture 278ms，候选阶段已列的完整门禁以及 Release / channel / public packaged check 全通过。
- Release [v0.1.16](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.16) 于 2026-08-13T16:18:26Z 公开，为 Latest、non-draft、non-prerelease。public channel 核验 `version=0.1.16`、EXE size 199,235,064 bytes；public packaged check 为 `updateAvailable=false`。main 后续记忆提交可领先 tag，但正式产品源码始终固定为该 tag 指向的 commit。
- 正式差分烟测：previous 0.1.15 → synthetic available 0.1.17，`differentialDownload=true`，old / new blockmap 各请求1次、installer Range 请求10次、redirect 3次，传输 1,213,090 / 199,235,064 bytes，`isolatedCache=true`。它不替代报告用户 installed 客户端的真实网络传输、UAC、安装替换与重启验收。
- 正式五项资产：
  - `HexBridge-0.1.16-x64.exe`：199,235,064 bytes，SHA-256 `92c0a63ab3e36023d1ef7c1b6b846121ade3703333654086709e0f6b282a4a8c`。
  - `HexBridge-0.1.16-x64.exe.blockmap`：201,201 bytes，SHA-256 `6ef79d8646f2e47b65340e80df52a307a085bb0733ae3e792e327143e61f6a71`。
  - `HexBridge-0.1.16-x64.zip`：274,387,828 bytes，SHA-256 `6b0a8c92fe80c7904e9c94229321914630ef37682b78a0df8b5b4d1695a6bad0`。
  - `latest.yml`：346 bytes，SHA-256 `f2b3a7db2b4495fc7d57a334191cc6e3f46836a1ec242c188e54773628facf0c`。
  - `SHA256SUMS.txt`：182 bytes，SHA-256 `8148589bcf577f86b92fbda293f7a5a8136f4b8da7fdb78e37ae62b93376359c`。
- Actions artifact ID `9188851371`，大小 473,411,947 bytes，digest `0fb7500c7b1cdb99f666b764803ac42bd23da1e33fff3015a313363b819da6b2`。Windows runner 不是真实游戏 frametime / CPU / GPU 验收；HB-026 继续 `IN PROGRESS`，未签名 / SmartScreen 边界不变。

2026-08-13 `v0.1.6` 正式 Release 自动化基线：

- 产品源码 / tag commit：`e47a172f266328acd68cf4f366e8f04423a36df3`。
- 预发布 workflow_dispatch run [31614808777](https://github.com/RocXOvO/HexBridge/actions/runs/31614808777) / job [94174846929](https://github.com/RocXOvO/HexBridge/actions/runs/31614808777/job/94174846929) 成功，用时约 4m59s。
- 正式 tag run [31615319004](https://github.com/RocXOvO/HexBridge/actions/runs/31615319004) / job [94176558591](https://github.com/RocXOvO/HexBridge/actions/runs/31615319004/job/94176558591) 成功，用时约 5m14s。
- 两次 Windows job 均通过 Electron hydrate、版本门禁、audit、OCR models / smoke、12 test files / 72 tests、lint、typecheck、pack:win、updater metadata verifier、packaged UI / bridge / updater download smokes、checksums 和 artifact upload；tag run 另由 softprops 成功创建公开正式 Release。
- packaged UI / bridge 继续验证 CommonJS preload、受限 IPC、安全偏好、Key 错误反馈、校准首帧与 Esc 恢复等受控路径；不等于真实 Key、WeGame / LCU、对局 OCR、多显示器 / DPI 或动效性能实机验收。
- packaged updater smoke 基于 `v0.1.6` 自动合成 `0.1.7`，得到 `availableVersion=0.1.7`、`downloaded=true`、`metadataRequests=1`、`installerRequests=1`、`isolatedCache=true`。证据只覆盖严格 loopback generic feed 的检查、下载、SHA-512 与隔离 cache，不覆盖真实 GitHub stable 请求、`quitAndInstall`、UAC / SmartScreen 或安装替换。
- HB-023 测试缺口：上述 synthetic smoke 请求的是 metadata 与完整 installer，不断言旧 / 新 blockmap、HTTP `Range` / `206`、实际差分传输字节或 full-download fallback 状态；`v0.1.11` 及此前 workflow 的 updater smoke 均不得称为差分 smoke。真实 Windows installed N→N+1 的空 cache / 有 cache、差分成功、明确完整包回退和安装结果仍未验证。
- HB-024～HB-027 测试缺口：现有 packaged UI smoke 只验证 1024×768 校准窗口首帧、截图 payload / Renderer 解码和 Esc 恢复，不验证标题 ROI 引导、整卡误框拦截、实时 OCR 预览 / 置信度或 4K / DPI / 多屏；当前无可配置全局快捷键的注册 / 冲突 / 持久化测试，也无真实 4K 游戏的 FPS / frametime、HexBridge CPU / GPU、捕获频率与关闭前后对照。既有 LCU discovery 测试也未证明“进程为 0 + 全部 stale candidate probe 失败”时普通 UI 只显示未启动 / 未发现并在随后启动 WeGame 后 5 秒内恢复。139 tests 与既有 OCR / packaged smokes 不能支持 HB-024～HB-027 的修复结论。
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

`v0.1.7`～`v0.1.10` 历史正式发布与当前 `v0.1.11`：

- `v0.1.7` tag 为 `ea0c7e2`；其 Release 曾公开、非 draft / prerelease 且 public channel 当时对齐正式 EXE。`v0.1.8` 发布后已删除 v0.1.7 Release / assets，但 tag 和下列历史摘要保留。
- v0.1.7 历史五项资产：EXE 199,023,315 bytes / SHA-256 `c9873c8799f8d3d71890cb798df793b54f192cee21265b9605e2b702ba46ad58`；blockmap 201,427 bytes / `a888bc1a920da93e07c7b13b1323d42623f853da2c5e9a4563e59613233f31a3`；ZIP 274,209,255 bytes / `21ae2487b64dc7d9ccef3f1459755e68994d07ee860f2c2bb6c10203f4cd5989`；`latest.yml` 343 bytes / `f4e59e26461c50ac1f9191d117b6bdc90ffa981f347bd5f9a08630025c749f1e`；`SHA256SUMS.txt` 180 bytes / `b07671bdc0c7d22efed089177dd3f87b6309bf1aae820e09f4a5fdb3fd5e0e7b`。
- `v0.1.8` 已包含 HB-020 reducer / 浮窗 / 脱敏决策记录和 Release 保留策略；本地、Windows 预发布和正式 tag 门禁均通过。Release policy fixture 明确覆盖数值 semver、较低 stable、较高 draft / prerelease 和较高 stable fail-closed。它曾正式发布，v0.1.9 发布后其 Release / assets 已清理，但 tag / 源码历史保留；真实 WeGame 同机仍未复验，HB-020 保持 `IN PROGRESS`。
- 最终增量后的 macOS `pack:win + checksums` exit 0，updater metadata verifier 核对 `version=0.1.8`、EXE path / size / SHA-512 与唯一非空 blockmap；交叉候选 EXE 198,535,875 bytes / SHA-256 `46c55bc9224dc1a988a903be852898d8c6076e87ccdc8b28894941562ac8d8a2`，ZIP 274,099,763 bytes / SHA-256 `5634314c3dd9f86ca4d0340c71e9c3a2e8b6ca7bed1821b0937dbb054f26f83a`。这些仅是 macOS 交叉构建历史证据；正式资产以 Windows tagged Actions 结果为准并已另记。
- 发布前最终只读审查确认 HB-020 reducer、preflight 和 stable-only cleanup 无 P0 / P1，并要求先完成 Windows workflow_dispatch 后再打 tag；该顺序已执行成功。审查 / CI 仍不得外推为真实 WeGame 同机验证。
- `v0.1.9` 曾为公开、非 draft / prerelease 且唯一保留的正式 Release，tag / 产品提交 `8a6e6d20791f0596274b79704d229642b99a7a12`。正式 tag run [31663071062](https://github.com/RocXOvO/HexBridge/actions/runs/31663071062) / job [94331796412](https://github.com/RocXOvO/HexBridge/actions/runs/31663071062/job/94331796412) 于 2026-08-13T03:09:58Z～03:15:40Z 成功，约 5m42s；113 passed + 1 Windows skip、packaged UI / bridge、synthetic updater、public channel、Release 与旧 Release cleanup 全部成功。其 Release / assets 已在 v0.1.10 发布后删除，tag / 源码历史保留。
- `v0.1.9` 正式五项资产：EXE 199,026,359 bytes / SHA-256 `6314110381f87d079c2139a221b218e5b6b1063748499bc53bd373bfad61d7dd`；blockmap 201,461 bytes / `c97c606e7a95207928bc005e9dce381a2b42d288ecf4674a91edd65b7aceb5c3`；ZIP 274,213,311 bytes / `d8bc887972ef63f89e34d4f24e8c29b27302c98c8e8b4ad1c7bba71310ff1c5e`；`latest.yml` 343 bytes / `b2100ff9f938fe6de34bfce22d5fab395edbf53cc128464960b36dcc99f9b6de`；`SHA256SUMS.txt` 180 bytes / `f4ebf04b7041c825df42260d7cd7823909bcc167e8122997258bc0c661f473d6`。
- v0.1.9 Release notes 已明确候选仲裁 / 诊断修复、旧版本需手动下载安装 v0.1.9、未签名 / SmartScreen 边界以及真实 WeGame 仍待同机复验。发布存在与 CI 成功都不能升级 HB-022；报告用户同机选人通过前保持 `IN PROGRESS`。
- `v0.1.10` 曾为公开、非 draft / prerelease 且唯一保留的正式 Release，annotated tag / 产品 / 记忆提交 `345c0d5443760a9dcc6717a96a6068b6101b16d1`。正式 tag run [31665517026](https://github.com/RocXOvO/HexBridge/actions/runs/31665517026) / job [94339115148](https://github.com/RocXOvO/HexBridge/actions/runs/31665517026/job/94339115148) 成功，约 5m23s；其 Release / assets 已在 v0.1.11 发布后删除，tag / 源码历史保留。
- `v0.1.10` 正式五项资产：EXE 199,028,315 bytes / SHA-256 `b64fb91c0c6692262caacb84212342f2209609662459619d270fe4b728b5c794`；ZIP 274,215,616 bytes / `1336f9a02dc43c52f110a0224a1ee1502465dbc28029ba7b7eee56cdb6abb043`；blockmap 201,550 bytes / `3d40cd0f1ff911b97f4c1093878eb1f0ac3dc08f20b790658f9d1b6712ad234b`；`latest.yml` 346 bytes / `78e4f2c1dbf707fe6f5b7d7eb352729c47fa95858c6dc2b9a3b9d20329180ced`；`SHA256SUMS.txt` 182 bytes / `8efdcf07691a38d76aaeeda419855cce451e8ec179e4c34e31503441f8142353`。public channel 的 version `0.1.10`、EXE path / size `199028315` 与 SHA-512 已核验一致。
- v0.1.10 Release notes 已明确 authority / match lease 修复边界、旧版本手动覆盖安装、未签名 / SmartScreen 以及真实 WeGame 仍待报告用户同机复验。发布存在与 CI 成功不能升级 HB-022；其状态继续 `IN PROGRESS`。
- `v0.1.11` 仍为公开、非 draft / prerelease 的历史正式 Release，且五项资产继续保留。annotated tag 指向产品提交 `20debe3483d8747008de240a9c9a1adcb2304c08`，tag object `4141f3ed…`；正式 tag run [31668236682](https://github.com/RocXOvO/HexBridge/actions/runs/31668236682) / job [94347366998](https://github.com/RocXOvO/HexBridge/actions/runs/31668236682/job/94347366998) 于 04:49:30Z～04:54:48Z 成功，约 5m18s。139 passed + 1 Windows skip、packaged UI / bridge、synthetic updater、public channel `0.1.11`、public packaged check、publish 与 cleanup 全部通过。
- `v0.1.11` 正式五项资产：EXE 199,028,558 bytes / SHA-256 `6d04586348766eb1fd59cee6c691e2543057751ac3fde23d97e9cf0059ff7846`；blockmap 201,431 bytes / `dffcc4f7f0e76390a23a181a07a367927be6349cc03aaf0e1a4b895113242211`；ZIP 274,216,091 bytes / `3cf011c912f79101fd1ca68698ea91d7add3cd2b49f66fe6ac9ef655b7393e37`；`latest.yml` 346 bytes / `298a59a6512990e33ff84407fe5e251e7328a9a86d61e9bb1509223d5b014ab8`；`SHA256SUMS.txt` 182 bytes / `37253e597846e1a1b12d38ea493924313636500ce7e6d6bc888d0fa38d11ad04`。public channel version / path / size / SHA-512 已核验与正式 EXE 一致。
- v0.1.11 Release notes 已明确 3270 / actions / trailing-poll 修复、旧版本手动覆盖安装、未签名 / SmartScreen 与真实 WeGame 待报告用户同机复验。发布与 CI 不能升级 HB-020 / HB-022；两项继续 `IN PROGRESS`。

`v0.1.6` 发布前本地 / 交叉构建历史基线：

- clean `npm ci`、Electron hydrate、`npm audit` 0、OCR models checksum / OCR smoke、12 test files / 72 tests、lint、typecheck、`git diff --check`、source bridge / UI smokes 全部通过。
- 覆盖 10 分钟不续期 launching handoff 租约、12 小时 active 上限、phase 先于 auxiliary failure 提交、terminal / 异队列 / 下一 ChampSelect 清理、generation + champion active / OCR 原子守卫、`League of Legends.exe` tasklist 解析和 Renderer “LCU 已交接 / 本局信息已保留”状态。
- macOS `pack:win + checksums` exit 0，updater metadata verifier 通过。交叉构建候选：`HexBridge-0.1.6-x64.exe` 198,528,590 bytes，SHA-256 `85ec0ab6e8dc97b247e45575a02b765b0296b38f8fd761dd3ed4727aade9799f`；`HexBridge-0.1.6-x64.zip` 274,093,348 bytes，SHA-256 `c7449cd83003b7f45b86e47f547809128389f5340fee792889f9516a4d9c3c67`。
- `latest.yml` 的 `version=0.1.6`、path=`HexBridge-0.1.6-x64.exe`、size `198528590` 与交叉候选 EXE SHA-512 一致，当前版本 blockmap 已生成并通过 verifier。以上数值仅是发布前 macOS 面向 Windows 的交叉构建历史，不是正式 Release assets；正式摘要以下方 Windows tag run 资产为准，也仍不证明真实国服 WeGame 进程名、客户端交接时序或整局 OCR。

## 八、Windows / 游戏实机待验证

### v0.1.14 发布后完成度审计：仍未闭环、不可宣称完成

- **源码安全审计**：2026-08-13 主线程复核 v0.1.14 源码未发现新增 P0。HB-025 的游戏前台全局热键仍是未闭环 P1：报告用户旧版同机已证明实时助手按钮可触发 OCR，而 League 前台快捷键无响应；v0.1.14 增加了稳定 `manualOcr` 诊断、统一 Main 触发路径与 sequence 守卫，但没有真实 League 前台 OS 输入门禁或用户复测，故必须继续 `IN PROGRESS`。

- **游戏交接（HB-020 / HB-022）**：v0.1.13 报告用户同机脱敏时间线已证明 3270 最终英雄在同一 generation 内从 selecting 经 launching 连续进入 InProgress / active，交接连续性子项通过；历史 v0.1.11 的空窗丢英雄仅保留为旧版失败事实。该单次时间线没有第二局，也没有完整确认终局 UI、详情 / OCR 推荐呈现和正式匹配 queue；因此两项总体仍为 `IN PROGRESS`，不得宣称整体已修复或已验证。
- **自动视觉性能状态机（HB-028）**：v0.1.12 仍暴露四档下拉框；v0.1.13 已移除 UI / IPC 写入口、增加 revision 2 迁移和 Main 自动 policy，并通过正式 Windows packaged UI 门禁。该门禁只覆盖受控窗口状态与 1024×768 校准恢复，不包含真实用户 4K FPS / frametime / CPU / GPU 采样；不得宣称用户性能目标已完成。
- **OCR 与性能（HB-024～HB-026）**：真实用户 4K / DPI / 多屏校准、Windows 游戏前台全局快捷键、自动 OCR hidden pause / 连续 miss 退避，以及切屏 / 进游戏前后的 FPS、frametime、CPU / GPU / capture 次数对照仍未执行。真实 title-only fixture和无交互 Windows smoke不能替代这些现场数据。
- **最新 OCR 交互实机（HB-025 / HB-029）**：v0.1.13 报告用户同机确认手动按钮可以识别，但游戏前台配置快捷键无反应；识别后出现的黑屏顶部浮窗也被用户明确否定。当前 dirty 候选已让 button / hotkey / tray 共用 Main 触发路径，移除 augment BrowserWindow / route / component，并使 OCR 结果只进入实时助手且同步不 show / focus；稳定手动状态与 sequence / 脱敏日志也已进入本地门禁。上述实现尚未完成最终复审、Windows Actions 或报告用户同机复测，不能把本地通过误写成快捷键或结果呈现闭环。
- **数据与 Tier 产品决策（HB-030 / HB-031）**：dirty 候选已按 allowlist 接入 data.dtodo 单英雄详情 `stats.pickRate` 次级展示，只接受 number 0～1，rank 顺序不变，`winRate / wins / games` 继续剔除；详情缓存升为 v2，legacy 只以 stale rank / tier 回退。Tier 背景条也已显示肉眼可见原始 `Tn` 并移除“强度顶尖”。本地自动化不能替代最终复审、Windows 视觉和报告用户同机数据对应性，二者继续 `IN PROGRESS`。
- **更新与差分（HB-019 / HB-021 / HB-023 / HB-033）**：v0.1.11～v0.1.15 远端 Releases 并存，正式 v0.1.15 Windows / public 门禁在人工 seed 旧 installer cache 时证明 v2 Range 差分算法有效；但用户由 v0.1.14 更新 v0.1.15 时仍看到 / 可能下载约 200 MB。v0.1.14 旧客户端不含 v0.1.15 单 Range 逻辑，且目前不能区分 UI 展示 metadata full size 与真实网络 full fallback。仍需由 installed v0.1.15 执行下一正式版本更新，取得 cache 状态、请求 / 字节、安装与重启后的同机证据。
- **LCU / Key / 发现（HB-013 / HB-015 / HB-018 / HB-027）**：真实国服 Key 保存 / 重启、WeGame 多来源发现、端口 / token 轮换、残留日志 / lockfile 到 5 秒自动恢复，以及完整 ChampSelect→终局→第二局只读链仍需实机证据。
- **视觉验收**：v0.1.18 候选已移除独立更新页 / 标题栏版本，并加入侧栏微动效与 Vue `out-in` 页面转场；英雄榜减法 / 搜索 / Tier 色带、英雄原画、空态轨道动效、新配色和 icon 来自既有版本。仍无覆盖 Windows EXE / 任务栏 / 托盘 / 安装器四处图标、长中文、100%～150% DPI、4K、reduced-motion / eco 转场与后台重绘的用户同机人工验收。source UI smoke 不能替代视觉验收。
- **本地与远端 Release 语义**：本地 `clean:release` 只在下一次 `pack:win` 前安全清空仓库根下精确 `release/`；它不删除 GitHub 资产，也不负责清理用户下载目录 / 已安装版本。v0.1.12 后审计时，工作区 `release/` 只含该版版本化 EXE / ZIP / blockmap 和当次 metadata / `win-unpacked`，未发现旧版本号产物；这是历史观察，不代表当前 CI 资产落在本机，也不等于未来每次失败 / 中断构建后都只保留完整当前版本。远端必须继续保留 v0.1.11 起所有正式 Releases / assets / tags，历史已删除资产不能伪称恢复。
- **闭环判定**：GitHub Release、Windows runner、单元 / 回放 fixture、packaged smoke、ONNX fixture 或静态 verifier 只能作为对应窄范围证据。涉及真实 WeGame / LCU 交接、用户 4K / DPI / 多屏、游戏前台全局热键、性能、更新安装或差分传输的目标，必须取得报告用户同机或等价真实 Windows installed 环境的可复核结果才能升级。v0.1.13 新时间线足以通过 HB-020 / HB-022 的交接连续性子项，但不足以升级其总体状态；快捷键与黑屏顶部浮窗反而新增真实失败证据。当前没有证据支持把 HB-020、HB-022、HB-023～HB-031 整体标为 `FIXED` / `VERIFIED`。
- **当前实机缺口冻结**：HB-020 / HB-022 的选人→独立游戏客户端交接子项已由报告用户通过，但终局清理和第二局换代仍未验；真实 4K 三卡 OCR / 英雄专属 pickRate / 原始 Tier、游戏性能、Windows EXE / 任务栏 / 托盘 / 安装器四处 icon、真实差分传输与安装、HB-032 系统托盘右键退出均保持各自当前状态，不得由 v0.1.14 发布成功外推关闭。
- **v0.1.15 正式发布（HB-033～038）**：六项均为 `IN PROGRESS`。tag / 产品提交 `c5331271fcb218f21202572acc7ac5fe06090be8`；run `31708642394` / job `94475549775` success，Windows 27 files / 236 tests、真实 4K OCR、lint / typecheck、retention / legacy、pack / metadata、packaged UI / bridge、人工 seed 旧 installer cache 的 v0.1.14 差分、draft publish、v2 channel、public verify / packaged check 全过。HB-033 只有 Windows / public 算法窄证据，随后用户同机 v0.1.14→v0.1.15 仍观察到约 200 MB，且尚未区分 UI metadata 与网络真实传输；HB-034～038 仍只有自动化 / runner，不替代用户 installed 更新、Windows 图标 / 合成器截图或真实游戏三卡 / toast 验收，不得升级。
- **v0.1.16 正式发布**：tag / 产品 commit `043c9decf8cdea4bdd16ebcf77a302915ec068a9`；run `31719527780` / job `94512675558` success，约 5m37s。Windows 29 files / 255 passed、真实 4K fixture 278ms、packaged UI / bridge 含生产 `NativeImage` 裁切，完整发布 / channel / public packaged check 全过。差分 smoke 为 previous 0.1.15 → synthetic 0.1.17，old / new blockmap 各1、Range 10、redirect 3、传输 1,213,090 / 199,235,064 bytes、isolated cache。该证据不测量真实游戏 FPS / frametime / CPU / GPU，不替代报告用户同机 OCR / 性能复测；HB-026 保持 `IN PROGRESS`。Release 已成为 Latest，但用户实机缺口不得由发布成功外推关闭。

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
- HB-018：自动化已覆盖 tracker 序列，v0.1.13 用户同机已通过 ChampSelect→InProgress 英雄连续性；仍需真实 Reconnect→终局→第二局中的详情 / 推荐上下文、OCR、实时助手结果替换与离局清理。
- HB-019：v0.1.17 正式版的差分 / 安装分流已有 Windows 自动化窄证据；v0.1.18 本地候选改为无参 `applyUpdate` 单击后由 Main 完成 check→download→静默 NSIS，并在调用前 / 检查后 / 下载后阻止对局安装。仍需 installed v0.1.17→v0.1.18 或后续正式版验证真实 GitHub、UAC / SmartScreen、实际替换 / 重启、三处对局竞态和失败恢复；本地 source 门禁不能替代该证据。
- HB-020：当前为 `IN PROGRESS`。v0.1.13 已增加 `queueSource`、tri-state tasklist、同 generation / champion 的 `GameProcessExitGuard` 与 `launching / active` 期间每 2 秒独立游戏心跳；P1 修正要求 fresh heartbeat 优先 terminal failure，并把退出清理拆为连续 4 秒 not-running + tracker 5 秒 heartbeat 过期。最终复审、本地 clean 全链、正式 Windows 200-test 门禁及报告用户同机交接连续性子项均通过；仍缺完整终局语义与第二局换代，故总体不得升级为 `FIXED` / `VERIFIED`。
- HB-021：当前 `IN PROGRESS`。`v0.1.14` 延续 raw stable channel、GitHub fallback、官方资产 allowlist、错误分类、provider 结果绑定、单调 / 并发保护，public channel 和 packaged public smoke 已通过；仍缺 installed 旧版本真实 check / download / `quitAndInstall` / UAC / 实际替换链。旧版本用户可从当前 Release 页手动覆盖安装 v0.1.14。
- HB-022：当前 `IN PROGRESS`。v0.1.13 用户同机已确认选人阶段显示和跨独立游戏客户端交接至 InProgress 连续；`queueSource` / tri-state process / exit guard / 心跳也通过最终复审与正式 Windows 门禁。正式匹配 queue ID、完整终局 UI / OCR 呈现和第二局仍缺失，故不得把该子项通过外推成整体 `FIXED` / `VERIFIED`。
- HB-023：当前 `IN PROGRESS`。v0.1.14 正式发布后 v0.1.11～v0.1.13 Releases 保留，至少 v0.1.12 / v0.1.13 五资产回读完整，证明远端 retention 继续生效且旧 blockmap 仍可获取；本地 cleanup 受精确目录 / symlink / 越界守卫。仍需真实 installed N→N+1 的旧 / 新 blockmap 请求、`Range` / `206`、实际传输量、无 full-download fallback、SHA-512 与安装验证，不能据 retention 单独写 `FIXED` / `VERIFIED`。
- HB-024：当前 `IN PROGRESS`。title-band 首帧与焦点语义 smoke 修正均已审查 / push，Windows candidate 通过 1024×768 校准显示、sender isolation、Esc / close 与 `hidden=false / focused=false / paused=true` 恢复。整卡→标题 ROI、保存前 3/3 与真实 title-only ONNX 证据继续保留；仍缺连续实时 OCR 文本 / 置信度、报告用户同机 4K / DPI / 多屏、手动按钮 / 热键一致性验证。
- HB-025：当前 `IN PROGRESS`。v0.1.12 已覆盖受限 IPC、原子替换 / 回滚、真实 active override / `HOTKEY_ROLLBACK_FAILED`、按 active / persisted 重算，以及启动无 active 时统一显示未注册并允许重新录制；但 v0.1.13 用户同机实测为游戏前台快捷键无反应、按钮可识别。仍需定位真实 active 注册链并覆盖恢复默认、Windows 默认 / 双冲突、游戏前台、重启和单次触发。
- HB-026：当前 `IN PROGRESS`。默认 `autoOcr=false`；显式开启后，v0.1.16 仅在 `active + Main visible`时运行自动 OCR，用 960px 低分辨率标题 ROI 门控，必要时才取最大 1440px 帧并在 `NativeImage` 中先裁三块标题；手动只取一次 1440px 帧。同一组成功后不重复 full OCR，失败使用有界退避，隐藏、最小化、换局与退出会使旧任务失效。正式 Windows 门禁通过，仍缺报告用户同机的持久化重启、hidden pause / 退避、手动 OCR 以及真实 4K FPS / frametime / CPU / GPU 对照；未采样前不得确认根因或修复，自动视觉策略剩余验收另由 HB-028 跟踪。
- HB-027：当前 `IN PROGRESS`。v0.1.12 在进程 0 / 无 manual 且 probes 全失败时保持 `connected=false` 并给普通 UI“客户端未启动或未发现”，内部候选原因只进脱敏 debug；最终审查通过，仍需 Windows 残留日志 / lockfile和随后启动 5 秒恢复链。
- HB-028：当前 `IN PROGRESS`。v0.1.13 已移除普通用户视觉档位 UI / IPC 写入口，revision 2 把旧 override 迁移到 auto，并由 Main 自动 policy 选择前台 cinematic、失焦 balanced、hidden / minimized / launching / active / 低资源 eco；最终复审、本地 clean 全链及正式 Windows packaged UI 门禁通过。真实 4K 性能、reduced-motion 组合和报告用户同机窗口切换实测未完成，不能写 `FIXED` / `VERIFIED`。
- HB-029～HB-031 当前均为 `IN PROGRESS`。v0.1.14 已删除 augment BrowserWindow / `#augment` route / `AugmentOverlay.vue`，OCR 结果只进入实时助手且状态同步不 show / focus；已按数值与来源 / 区域 allowlist 清洗英雄专属 `pickRate`，rank 排序不变，详情缓存升为 v2且 legacy 只回退 stale rank / tier；Tier 背景条显示肉眼可见原始 `Tn` 并移除“强度顶尖”。正式 Windows tag run 已通过 25 files / 219 passed + 1 skip、真实 4K OCR、packaged UI / bridge 与 public update check；但游戏前台快捷键和报告用户同机 OCR / 数据 / 视觉仍未验证，三项不得写 `FIXED` / `VERIFIED`。
- HB-032 当前为 `FIXED / UNVERIFIED`。v0.1.14 tag / 产品提交 `5bd64052ec9262f38bbea0351e28c889d69009e3` 已正式发布；tag run `31697626369` / job `94438937472` 通过 25 files / 219 passed + 1 skip、真实 4K OCR、packaged UI / bridge `shutdownLifecycle`、updater / public check、metadata / checksums 与 Release 全链。但尚无报告用户同机系统托盘右键退出复测，不能标 `VERIFIED`。
- HB-033～HB-038 当前均为 `IN PROGRESS`。v0.1.15～v0.1.17 的 Windows 差分烟测均在受控 cache 前置条件下验证 Range / blockmap 与显著低于完整 EXE 的传输量；但用户 v0.1.14→v0.1.15 仍看到 / 可能下载约 200 MB，尚无网络字节证据区分 metadata 展示与 full fallback。必须由 installed 客户端对 v0.1.17 或后续正式版复验；Windows 图标、合成器隐藏截图恢复，以及报告用户同机多轮三卡 / 中文依据 / toast 也仍未验。公开 Latest 为 v0.1.17。
- HB-039 / HB-040 当前为 `FIXED / UNVERIFIED`：v0.1.17 本地候选已删除实时助手未连接空态说明 / 按钮并保留后台发现 / 诊断 retry，且用既有单英雄详情请求展示 `builds[0]` 同一路线出装、`iesdev` / 补丁与严格装备字段清洗，缓存升至 v3。仍需 Windows packaged 空态快照、无客户端→WeGame 自动恢复、真实 Key / 上游 builds、缺图缺名 / stale 以及用户同机视觉验收，不能标 `VERIFIED`。
- 界面长期契约：验证降低原画模糊 / 遮罩后英雄仍清晰可辨且文字对比合格；独立更新提示 / 页面可从全局入口回访且不再依赖设置页；普通设置中无游戏目录 UI，同时底层 fallback 的保留 / 删除有审计结论；等待英雄轨道球在 balanced / cinematic 可见并在 eco / InProgress / hidden / reduced-motion 静止；英雄榜职业全中文、无冗余角色列 / 筛选，Tier 背景条同时保留准确 Tier 文本 / 无障碍语义且不得用“强度顶尖”替代；选中行轻微悬浮与极光在 eco / InProgress / hidden / reduced-motion 停止；搜索覆盖正式中文名、称号、alias 与可审计常用别名；Windows EXE / 任务栏 / 托盘 / 安装器图标均非空且非默认；侧栏无独立 LCU 状态，普通未连接状态统一合并到实时助手；新配色为独立实现且无第三方代码 / 素材复制。以上均须视觉快照、键盘 / 搜索回归、Windows packaged 图标 / 可读性和渲染性能证据，当前不得预写完成。
- 无边框游戏下真实三卡：默认关闭自动 OCR 时，按钮 / 当前配置快捷键应完成一次有界识别；显式开启自动 OCR 后按 2 秒门控周期工作，需记录三卡稳定出现到展示的真实延迟，刷新动画期间不误识别，连续丢失正确隐藏。
- 1080p / 2K / 4K、100% / 125% / 150% DPI、多显示器、非主显示器、显示器热插拔和手动拖框校准。
- 单卡 / 双卡、长中文名、OCR 错字、缺图、相同组合、并列、无详情 / 旧详情。
- 游戏中浮窗不抢焦点、点击穿透、位置与卡位一致；主窗口隐藏 / 进入游戏后无持续背景渲染和明显 GPU 峰值。
- 未签名安装包的 SmartScreen 行为；当前不应宣称已代码签名。

## 九、发布与 GitHub 状态

- v0.1.18 候选状态：源码 commit `8b7bdac` 和 Transition 后 packaged UI 入口等待修复 commit `f24ff6f` 已 push main。首次 run `31729473777` 因旧 smoke 过早查校准入口失败；第二次 run `31730129727` / job `94548232662` success，Windows 30 files / 264 passed + 1 skip、packaged UI / calibration、bridge、differential updater 与完整候选门禁全通过。当前尚未 tag / Release，公开 Latest 仍为 v0.1.17，不得预写 tag、正式 Actions 或资产结果。
- v0.1.17 发布状态：annotated tag object `7b6b638af2a89e19f4bc7ac8623dd31ab0b40bd6` 指向产品 / 记忆 commit `d7edf9fc917d8e1645d109e88324589deb4f7140`；正式 run `31724844667` / job `94530534700` success，约 5m54s。Release [v0.1.17](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.17) 于 2026-08-14T17:21:55Z 公开，为 Latest、non-draft、non-prerelease；public v2 channel 为 `0.1.17 / 199,236,595 bytes`，public packaged check 返回 `updateAvailable=false`。
- 正式资产与差分：EXE / blockmap / ZIP / `latest.yml` / `SHA256SUMS.txt` 五项大小和 SHA-256 见第七节；previous 0.1.16→synthetic 0.1.18 差分为 Range 11、redirect 3、blockmap 各1、1,235,951 / 199,236,595 bytes、isolated cache。Actions artifact ID `9190979002`，473,416,475 bytes，digest 前缀 `6697dfc…`。
- 当前 Git / 版本：main 在本次记忆更新提交后可领先 v0.1.17 tag，不在该提交内预写自身未知 hash；Release 产品源码固定为 tag 指向的 `d7edf9fc917d8e1645d109e88324589deb4f7140`。历史正式 Releases / assets / tags 保留契约不变；不得移动、改写或删除任何已发布产品 tag / 正式 Release assets。
- GitHub CLI 已登录用户 `RocXOvO`，用户已补充授权 GitHub Actions workflow 所需 scope。不得在本文件记录任何认证 token。
- GitHub 公开仓库：[RocXOvO/HexBridge](https://github.com/RocXOvO/HexBridge)，visibility 为 `PUBLIC`；本地 `origin` 已配置为该仓库的 HTTPS 地址。远端 `main` 已包含源码、测试、文档和 `.github/workflows/release.yml`。
- `.gitignore` 排除 `release/`、`dist/`、`dist-electron/`、`node_modules/` 和 OCR `.onnx/.txt`，因此源码 push 不包含本地二进制或模型。
- 发布职责契约：`pack:win` 必须带 `--publish never`，electron-builder 只构建；tag 必须与 `package.json` 版本完全一致。`.github/workflows/release.yml` 在 Windows runner 上执行 `npm ci`、串行 Electron hydrate / executable 断言、版本门禁、audit、模型下载 / 校验、OCR smoke、完整测试套件、lint、typecheck、Windows 打包、updater metadata verifier、packaged EXE UI / bridge / updater download smokes 和 checksums，最后仅由 `softprops/action-gh-release` 创建 / 上传 NSIS EXE、EXE blockmap、ZIP、`latest.yml` 与校验清单。smoke 中的 `Get-Process` strategy / capture decode、更新器 local-feed 下载均有明确窄范围，不能证明中文安装路径、完整校准、真实 LCU 或实际更新安装。所有第三方 GitHub Actions 固定到完整 commit SHA。
- 远端保留与差分发布契约（HB-023）：workflow 中旧的远端 Release cleanup 已删除，并在 test / pack 前运行静态 verifier 拒绝已知 Release / tag 删除命令；v0.1.11 及以后全部正式 Releases、EXE / ZIP / blockmap / metadata / checksum assets 和 tags 必须永久保留。v0.1.14 正式发布后 v0.1.11～v0.1.13 Releases 仍在，至少 v0.1.12 / v0.1.13 五资产回读完整，已验证本轮没有破坏远端保留；静态 verifier 仍不是完整语义审计。所有受支持源版本的 versioned blockmap 应随 Release 保留；真实差分还必须验证客户端请求旧 / 新 blockmap、HTTP Range / 206、传输字节、fallback 和安装，SHA-512 / blockmap 存在本身不能替代该证据。
- 本地构建产物清理契约：用户所说“发布新版删除旧的”仅指开发 / CI 工作区的本地 `release/` 构建产物。`pack:win` 在构建前把目标固定为仓库根下精确 `release/`，拒绝 release 目录 symlink 与解析后目标逃逸，再清空其中全部旧条目；因此一次成功的 clean + pack 后只应留下该次构建，而不是按 semver 逐项清理。单测确认目录外文件保留和 symlink 拒绝。v0.1.13 cross pack 前，`clean-local-release` 在该精确目录删除 7 个旧本地产物，随后只生成 0.1.13 EXE / ZIP / blockmap、metadata / checksums、builder debug 与 `win-unpacked`；该动作没有触碰远端。脚本是“下一次 pack 前清理”，不承诺失败 / 中断构建后目录仍完整，也不清理用户 Downloads、已安装版本或任何远端对象；远端 GitHub Releases / assets / tags 永远不属于本地清理目标。
- 2026-08-13 安全收尾：主线程在权威仓库执行项目自带 `npm run clean:release`。安全脚本只在解析后的精确仓库 `release/` 下删除 10 个本地条目，其中包括旧 v0.1.13 交叉构建产物与 iCloud 生成的名称带“ 2”的冲突副本；完成后 `release/` 为空。该动作未触碰 GitHub Releases / assets / tags、用户 Downloads、已安装目录或任何目录外文件，不得被描述为远端 cleanup。
- 用户再次明确纠正语义：“删除旧包”只指安全删除本地构建目录中的旧版本产物，不是删除 GitHub 历史 Release。未来需求、提交信息和发布说明都必须分别使用“本地 release 产物清理”和“远端 Release retention”，不得简称为 cleanup 后误解为删除远端；远端 v0.1.11 起的 Release / assets / blockmap / tags 必须继续保留。
- 迁移协调边界：完成上述安全收尾后，本会话 / 本轮主线不再启动构建、`npm ci`、索引或任何后台任务，避免在 iCloud 路径迁移期间继续制造文件与冲突副本。后续 iCloud Desktop / Documents 本地化、冲突副本识别 / 治理及恢复工作由专门协调会话执行；未经协调不得在本项目会话中顺手处理迁移或扩大清理范围。
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
- `v0.1.0` 曾含 HB-012 preload 阻断缺陷，其 Release 已删除，不能作为功能可用基线。当前公开推荐版本为 `v0.1.17`；但 tagged packaged smoke 通过仍不代表真实 WeGame / LCU / 对局 OCR 实机验收。
- `v0.1.17` 是当前公开推荐版本；v0.1.11～v0.1.17 Releases 的远端保留契约持续生效。HB-020 与 HB-022 仍处于 `IN PROGRESS`；用户同机已覆盖连续两局的本局英雄保留、终局清理与第二局换代，但 OCR / 推荐与性能仍未闭环。HB-014 仅在首帧黑屏 / packaged Windows 受控截图与 Esc 恢复窄范围 `VERIFIED`；HB-013、HB-015～HB-018 及 HB-014 的实机剩余范围仍为 `FIXED / UNVERIFIED`。HB-019 的下载 / 差分与安装分流只有自动化窄证据，真实 installed 客户端更新 / 安装链仍未验证。
- HB-021 当前为 `IN PROGRESS`：`v0.1.16` 已正式发布，public channel 与 packaged public check 已指向 `0.1.16`；但旧 installed 客户端的真实 GitHub check / download / `quitAndInstall` / UAC / 版本替换仍未完成。不得把 workflow、synthetic updater 或服务端资产存在等同于真实客户端升级已验证；旧版本用户可手动覆盖安装 v0.1.16。
- HB-023 当前为 `IN PROGRESS`：v0.1.16 workflow 延续禁止远端 cleanup 的 retention 规则，retention verifier 与受限本地 pre-pack cleanup 继续进入正式链；既有 v0.1.11～v0.1.15 远端保留证据和当前 v0.1.16 五资产摘要已记录，历史已删资产仍不可恢复。正式 Windows / public 门禁在受控旧 installer cache 时得到 old / new blockmap 各1、Range 10、redirect 3 与 1,213,090 / 199,235,064 bytes 的窄证据；这不等于报告用户 installed 安装、fallback、UAC、进程替换与重启已发生。必须等 installed v0.1.15→v0.1.16 或后续正式版的同机请求 / 字节证据后再判断，当前不得宣称差分更新整体 `FIXED` / `VERIFIED`。
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

- GitHub Actions 仍有 Node 20 deprecated annotation。当前 workflow 中第三方 actions 固定到完整 commit SHA，runner 已临时强制它们使用 Node 24；`v0.1.16` 候选 run `31718519456` 与正式 run `31719527780` 均成功，因此该 annotation 仍为非阻断维护项。
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
- 2026-08-12 | HB-019 / 客户端内自动更新 | REPORTED / UNIMPLEMENTED | 当时规定 GitHub Releases 稳定通道、两次用户确认、非静默安装、进度 / 错误 / 重试、正式版与签名边界、Main-only 下载校验及 schema IPC；其中“所有安装均非静默”已被 2026-08-14 新决策取代 | 尚无实现或测试；需覆盖版本 / 渠道 / 资产 / 校验 / 取消 / 失败及 IPC 注入防护 | Windows packaged 从旧正式版检查、下载、确认安装和取消全链路待验 | 此条保留历史时点；当前安装分流以 2026-08-14 契约为准
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
- 2026-08-13 | HB-021 / v0.1.5 真实 GitHub 更新检查 | REPORTED / UNDIAGNOSED | 用户实机 packaged v0.1.5 在设置页检查更新后显示 error /“更新操作失败，已保留当前版本”，availableVersion 为空，未发现公开 v0.1.6；仅登记症状、错误分类与隐私契约 | 服务端 v0.1.6 正式资产存在，loopback synthetic smoke 通过，但均不是 v0.1.5→真实 GitHub 请求证据 | 待覆盖 installed packaged 直连/代理/断网/404/TLS、脱敏诊断、正式版本发现与当前受控安装分流；不得记录 Key/token/query/local path | 无根因或修复结论；无代码、commit、tag 或 Release 变更
- 2026-08-13 | HB-021 / v0.1.7 更新通道候选（历史时点） | REPORTED / UNDIAGNOSED→IN PROGRESS | 当时观察到 v0.1.5 GitHub provider 链 API 403 rate-limit、latest / Atom reset；本地实现 fixed raw stable+GitHub fallback、provider-bound checkInFlight/早到event隔离、官方NSIS allowlist、错误码/下载页、单调/并发保护、发布preflight、禁覆盖和public smoke，当时 channel 仍指v0.1.6 | clean npm ci/audit0、12 files/80 tests（79+1 Windows skip）、lint/typecheck/diff、source bridge/UI、public verify、脚本node-check和真实GitHub只读preflight should_publish=true通过；第三轮审查无P0/P1 | 较早cross pack早于最后互斥/preflight增量；Windows workflow、public packaged、真实installed check/download/install当时均未验 | 此条记录候选阶段；后续正式发布事实见 v0.1.7 Release 条目
- 2026-08-13 | HB-021 / v0.1.7 Windows 预发布（历史时点） | IN PROGRESS（状态不升级） | 候选 commit `5d2f0321afe7f79981211b2615eaab493c07e3ed` 已 push main；workflow_dispatch 只执行预发布门禁，tag-only channel / Release步骤按预期skip | run31621795206/job94198181530 success约5m；npm ci/audit0/public v0.1.6/OCR/Windows 80 tests/lint/typecheck/pack（EXE 199,023,316 bytes）/metadata/UI packaged 1024×768/bridge/local synthetic0.1.8/checksums/artifact全过；updater downloaded=true、metadata1、installer1、isolatedCache=true | 当时未改public channel、未执行真实public v0.1.7 packaged check；installed旧版check/download/install未验 | 此条记录 tag 前状态；v0.1.7 后续已正式发布
- 2026-08-13 | HB-020 / 真实 WeGame 交接回归（初报时点） | FIXED / UNVERIFIED→IN PROGRESS（当时根因未定位） | 用户再次报告选人最后等待、LeagueClientUx 向另一个游戏客户端交接前仍读取不到 / 丢失英雄；撤回此前修复闭环，不猜根因 | 72/73/80 tests、重命名Node进程与packaged smokes均只覆盖受控路径，不能支持修复结论 | 初报时尚无脱敏状态时间线；后续已定位迟到空 ChampSelect 根因，见下一条，但仍须同机复验才可升级状态 | 此条保留问题初报历史，不代表当前根因未知
- 2026-08-13 | v0.1.7 / Release 与公开更新通道（历史时点） | 当时已发布；后由 v0.1.8 替代并删除 Release / assets | tag / 产品源码 `ea0c7e2` 完成 Windows 正式发布，public stable channel 当时指向 `0.1.7`，五项资产和 packaged public check 均完成 | GitHub Release 当时为 Latest、非 draft / prerelease；正式 EXE 199,023,315 bytes，SHA-256 `c9873c8799f8d3d71890cb798df793b54f192cee21265b9605e2b702ba46ad58` | installed 旧版真实 check / download / 安装替换仍未验证；无商业签名 | v0.1.7 tag / 源码历史保留，Release / assets 已由 v0.1.8 cleanup 删除
- 2026-08-13 | HB-020 / 迟到空 ChampSelect 确定根因与 v0.1.8 候选（发布前时点） | IN PROGRESS（代码候选已修，等待用户同机复验） | 真实交接中 transport 先将 tracker 置为 `launching`，随后 phase 仍迟到报告 `ChampSelect` 而 session / current endpoints 已 404 / empty；旧 reducer 把这类 observation 当作下一局，在租约判断前清空 confirmed context，Runtime 随即清英雄详情 / OCR / 浮窗。候选引入 endpoint presence、可选 game identity、partial observation 和受控 decision，区分 outgoing 与真实新 session；保留分支不得续租，不同正英雄 / 异队列 / 新 identity 必须换代 | 回放测试覆盖 outgoing endpoint race、partial GameStart / InProgress、终局 / 异队列 / 同 queue 第二局、租约超时和新英雄换代 | 仍缺报告用户同机 WeGame 交接、一整局 OCR / 推荐 / 终局和第二局；不得写为 FIXED / VERIFIED | 后续已随 v0.1.8 发布，但状态不升级
- 2026-08-13 | GitHub Release 保留策略（v0.1.8 发布前历史错误） | 已被用户纠正并废止 | 当时误把用户“发布新版删除旧的”理解为删除远端 GitHub Release，手动删除 `v0.1.0/1/2/3/5/6` Release / assets，后续 workflow 又清理旧 stable；`v0.1.4` 本来无 Release，所有 Git tags 始终保留 | 旧资产删除不可恢复；历史摘要只作审计记录，不表示仍可下载 | 用户实际只要求清理本地 `release/` 构建产物；下一版前必须移除远端 cleanup，从仍存在的 v0.1.11 起保留全部正式 Releases / assets / tags | 此条仅保留历史事实，旧远端删除策略绝不能继续
- 2026-08-13 | v0.1.8 / Windows 预发布验证 | Windows packaged 全门禁通过；HB-020 状态不升级 | 产品提交 `4866011a2cc982e22e414472a911a1574f515260` 已 push main；workflow_dispatch 只执行候选门禁，tag-only Release / channel / cleanup 均按预期 skip | run [31627564190](https://github.com/RocXOvO/HexBridge/actions/runs/31627564190) / job `94217823684` 成功，约 5m19s；clean npm ci、audit 0、公开 `0.1.7` 通道、OCR、Windows 13 files / 100 tests、lint、typecheck、pack（EXE 199,024,335 bytes）、metadata、packaged UI / bridge、synthetic `0.1.9` updater、checksums和artifact全通过；updater `downloaded=true`、metadata / installer 请求各1、cache隔离 | 不等于真实 WeGame 交接、整局 OCR / 推荐、终局 / 第二局或实际更新安装；无商业签名 | 可进入正式 tag 门禁，尚未 tag / Release
- 2026-08-13 | v0.1.8 / Release 与保留策略执行 | 已发布；当前唯一保留的正式 Release；HB-020 保持 IN PROGRESS | annotated tag 指向产品提交 `b23b898b218b3e7a69bbc06b83bd3c88c7609db1`；正式 workflow 发布五项资产、写 public channel、回读 packaged public check，并删除旧 `v0.1.7` Release / assets，保留其 tag | run [31628139647](https://github.com/RocXOvO/HexBridge/actions/runs/31628139647) / job `94219791372` 成功，约 5m35s；Windows 100 tests及完整门禁全过。正式 EXE 199,024,334 bytes / SHA-256 `76b6320e1a0bafaca7a2fee0745aad069a436fc10c700964b57ba262e54463c2`；ZIP 274,210,661 bytes / SHA-256 `b6e411ce0cfc11ce6d9740007551e491fc6e6f844861b263da6dae0ad801bf78`；blockmap 201,291 bytes / SHA-256 `f08fe746f1874c5f88c07f157ee5bee89a6d5ddf46352a7a25c8c0955aacbbb2`；latest.yml SHA-256 `59649df2f2194619232e7e7a1ce833eb8cc8033a778d86348471aa019854b1e1`；SHA256SUMS SHA-256 `9742916869a281d1de7577caf354afbfcc736fb72cc00caf0d60d60cd7fa37a2`。public packaged check 为 channelVersion 0.1.8 / updateAvailable false | CI / Release 不能替代真实 WeGame 同机交接、一整局 OCR / 推荐、终局 / 第二局；无商业签名 | Release 非 draft / prerelease；当前 only Latest，历史 tags完整保留
- 2026-08-13 | HB-020 / Runtime 交接回放门禁 | IN PROGRESS（状态不升级） | 新增 reducer→Runtime 的实际状态回放，覆盖 detach→迟到空 ChampSelect→partial InProgress→再次断线→下一局新英雄；交接期不得清 detail / overlay 或递增 request sequence，真实新英雄必须清旧数据并换 generation | 本地全量 14 files / 100 passed + 1 Windows-only skipped，typecheck、lint、diff-check通过；commit `561f9e5` 已 push main | 仍是合成回放，不运行 WeGame、真实 LeagueClientUx / game process、截图或 OCR 模型，不得据此把 HB-020 升级 FIXED / VERIFIED | test-only，v0.1.8 Release 产品代码不变
- 2026-08-13 | HB-020 / 实机交接 runbook | IN PROGRESS（等待用户执行） | 新增 `docs/WEGAME_HANDOFF_RUNBOOK.md`，把真实同机状态链、不变量、失败判据、终局 / 第二局、脱敏字段与 FIXED / VERIFIED 升级门槛写为仓库契约；README 提供入口 | `git diff --check` 通过；内容与 Runtime 受控诊断字段及项目记忆一致 | 文档不能替代用户实际运行，目标仍未完成 | 待报告问题的同一机器手动覆盖安装当前 v0.1.14 后执行
- 2026-08-13 | HB-022 / 国服选人阶段当前英雄与浮窗不显示 | REPORTED / UNDIAGNOSED | 用户实机报告选人界面中当前英雄信息与选人浮窗直接不显示；精确应用版本尚待确认，当前无代码根因或修复结论 | `v0.1.8` Windows CI、packaged smokes 与模拟 handoff 回放均不运行真实国服 `ChampSelect`，不能证明该路径可用 | 待收集版本号、诊断页受控状态链及真实 session 字段级脱敏 fixture，并在同机 queueId 2400 选人阶段复现 / 验收；不得记录 token、路径或完整 session | 只登记实机事实与证据门禁，不与 HB-020 自动合并，不写已修复
- 2026-08-13 | HB-022 / 首轮脱敏诊断与候选仲裁草案 | REPORTED / UNDIAGNOSED→IN PROGRESS | 用户证据显示多 candidate、最终 source=log、credentials verified 后仍只有 transport-connected 且 snapshot 长期 None / null；代码审计高概率为首个可鉴权空 candidate 粘滞，另有 fresh partial / 空 catalog 遮蔽。草案采用 2400+hero 证据仲裁、None 有界重探、非致命机会性 probe、正向字段保留、lobby GET fallback、15 秒脱敏 heartbeat、本地 offset 时间和空 catalog 显式提示 | 当前尚无 review、自动化 tests 或 Windows 结果；`v0.1.8` 既有 CI / 模拟回放不能支持本问题修复结论 | 精确用户版本、真实 session 字段级脱敏 fixture、同机国服 ChampSelect 复验仍缺失；不得记录端口、token、路径或完整 session | 当前不得 FIXED / VERIFIED，等待审查与验证结果
- 2026-08-13 | HB-022 / v0.1.9 本地候选实现与终审 | IN PROGRESS（状态不升级） | target 评分强制 phase=ChampSelect；known terminal 残留不得推断 / 切换，只有 raw None / unknown 可凭 2400+hero 正向证据推断；候选池 10 秒刷新、2 秒有界重探、request hard timeout、机会性 probe 非致命、fresh partial 保留正向字段、lobby GET fallback；诊断 15 秒 heartbeat / 本地 offset / 不记录端口，空 catalog 显式提示 | 最终只读审查无 P0 / P1；本地 113 passed + 1 Windows-only skipped，source bridge / UI、lint、typecheck、diff-check 全通过 | Windows workflow、Windows packaged 和报告用户同机国服 ChampSelect 均未验证，不得 FIXED / VERIFIED | 本地版本已升 0.1.9，尚未 commit / push / tag / Release；公开最新仍为 v0.1.8
- 2026-08-13 | HB-022 / v0.1.9 Windows 预发布验证 | IN PROGRESS（状态不升级） | 候选 commit `68f3822665d7de02f3555d0e8becae04f7b65d05` 已 push main；workflow_dispatch 只运行候选门禁，正式 tag / Release 步骤按预期 skip | run 31662678891 / job 94330609527 于 03:02:29～03:08:02 success，约 5m33s；clean npm ci、audit0、public0.1.8、OCR、Windows113+1skip、lint/typecheck、pack/metadata、packaged UI+bridge、synthetic0.1.10 updater、checksums、artifact 全过 | 不连接真实 WeGame / LCU ChampSelect，不能证明用户问题已关闭，不得 FIXED / VERIFIED | 尚未 tag / Release；公开最新和 public channel 仍为 v0.1.8，不预写正式发布结果
- 2026-08-13 | v0.1.9 / 正式发布与 HB-022 边界 | Release 已发布；HB-022 保持 IN PROGRESS | tag / 产品提交 `8a6e6d20791f0596274b79704d229642b99a7a12`；正式 workflow 完成 Windows 门禁、五项资产、public channel、公开 Release 与旧 Release cleanup，v0.1.0～v0.1.9 tags 全保留 | run31663071062/job94331796412，03:09:58Z～03:15:40Z success约5m42s；113 pass+1 skip、packaged UI/bridge、synthetic updater、public channel全过；channel独立核验0.1.9/199026359 bytes，正式资产摘要已记录 | 不运行报告用户同机真实 WeGame ChampSelect，不能证明 HB-022 关闭；无商业签名，可能 SmartScreen | v0.1.9 为公开 non-draft/non-prerelease 唯一 Release；旧版本建议手动下载安装；HB-022 不得 FIXED / VERIFIED
- 2026-08-13 | HB-022 / v0.1.10 authority 与 match lease 本地候选 | IN PROGRESS（状态不升级） | 用户日志显示两个 candidate 中最终仍选 log source，transport-connected 后 raw / normalized None；候选新增内部进程世代 identity、endpoint / 强 alias registry、统一 retainedPriority、transport / match lease 分离、外部 authority 防覆盖、same-match 重绑、可信交接推进、最后换英雄、active 后同英雄无 identity 新 generation 及终局 / 新局边界；身份字段绝不输出日志 / Renderer | production LcuClient→Runtime 回放新增；本地 15 files / 131 passed + 1 Windows-only skipped，typecheck/lint/diff、source bridge/UI通过；独立审查无P0/P1并批准Windows候选 | Windows workflow、真实WeGame同机选人/交接、完整一局与第二局均未验；不得记录任何用户端口/token/path/进程或对局身份具体值 | 本地版本0.1.10，尚未commit/push/tag/release；公开最新仍v0.1.9，不得FIXED/VERIFIED
- 2026-08-13 | HB-022 / v0.1.10 Windows 候选验证 | IN PROGRESS（状态不升级） | candidate commit `cb2098c79842f61447ab933766b42ff45c1604c5` 已 push main；workflow_dispatch 仅运行候选门禁，tag-only Release / channel / cleanup 按预期 skip | run31665154616/job94338020977 success约5m2s；clean npm ci/hydrate/audit0/public0.1.9/OCR、Windows15 files/132 tests、lint/typecheck、pack EXE199028315、metadata、packaged UI 1024×768、bridge含LCU discovery策略、synthetic0.1.11 downloaded/metadata1/installer1/isolatedCache、checksums/artifact全过 | Windows runner与受控smokes不运行真实WeGame同机选人/交接，HB-022不得FIXED/VERIFIED；不记录敏感字段 | 尚未tag/release，公开Latest/channel仍v0.1.9，不预写正式结果
- 2026-08-13 | v0.1.10 / 正式发布与 HB-022 边界 | Release 已发布；HB-022 保持 IN PROGRESS | annotated tag / 产品 / 记忆提交 `345c0d5443760a9dcc6717a96a6068b6101b16d1`；正式 workflow 完成132 tests、packaged UI/bridge、synthetic updater、public update check、Release/channel/cleanup | run31665517026/job94339115148 success约5m23s；v0.1.10为公开non-draft/non-prerelease唯一Latest；五项资产和public channel version/path/size/SHA-512一致性已记录，v0.1.9 Release/assets已删、v0.1.0～v0.1.10 tags保留 | 不运行报告用户同机真实WeGame选人/交接，发布成功不能关闭HB-022；无商业签名，Node20 deprecated annotation非阻断 | Release notes含修复边界、手动覆盖安装、未签名与真实WeGame待验；HB-022不得FIXED/VERIFIED
- 2026-08-13 | HB-020 / HB-022 / 国服自定义 queue 3270 实机根因与本地草案 | IN PROGRESS（状态不升级） | 用户 v0.1.10 日志确认 Lobby/Matchmaking/ChampSelect/InProgress 全程 queue3270，ChampSelect有英雄但旧2400-only判定使matchStage none/gen0，InProgress endpoint skipped后英雄null；本地草案统一支持2400/3270，增加actions英雄fallback与event-only WAMP trailing poll | 新增3270 production LcuClient→Runtime真实时序回放；当前相关4 files/85 tests、typecheck/lint/diff通过 | 最终独审、全量、Windows、报告用户同机复测未完成；正式匹配是否也用3270未知；Processes页显示名不等于EXE image name且非本次主因 | 公开Latest仍v0.1.10；本地草案尚无新commit/push/tag/release，不得FIXED/VERIFIED
- 2026-08-13 | HB-020 / HB-022 / v0.1.11 本地候选收敛 | IN PROGRESS（状态不升级） | actions仅认最新本地pick，pick=0屏蔽旧pick/intent、ban忽略、current/myTeam优先；3270回放覆盖actions英雄→selecting gen1→detail/overlay→active同gen，transport回放覆盖ECONNREFUSED detach→双candidate same-game重绑→InProgress及第二局gen2；event-only风暴仅补一次trailing poll | 最终只读复审无运行时代码P0/P1；clean npm ci/audit0/OCR、16 files/139 pass+1 Windows skip、lint/typecheck/source bridge/UI/diff全过；macOS cross pack/metadata/checksums exit0，候选EXE198535816/SHA前缀be176766…，ZIP274102235/e807bc… | Windows Actions、正式匹配queue、报告用户同机完整一局/终局/第二局未验；交叉构建与截短摘要非正式资产 | 本地v0.1.11尚未commit/push/tag/release；公开Latest仍v0.1.10，不得FIXED/VERIFIED
- 2026-08-13 | HB-020 / HB-022 / v0.1.11 Windows 候选验证 | IN PROGRESS（状态不升级） | candidate commit `46859c9243ede21628646165d0685ddc1288c7d7` 已 push main；workflow_dispatch 只运行候选门禁，tag-only发布/channel/cleanup按预期skip | run31667866337/job94346222231 success 5m7s；clean npm ci/hydrate/audit0/public0.1.10/OCR、Windows16 files/139 pass+1 skip、lint/typecheck、pack/metadata、packaged UI/bridge、synthetic v0.1.12 updater、checksums/artifact全过 | Windows runner不运行真实WeGame同机选人/交接；正式匹配queue和用户完整一局/终局/第二局未验，不得FIXED/VERIFIED | 尚未tag/release，公开Latest/channel仍v0.1.10，不记录敏感值、不预写tag结果
- 2026-08-13 | v0.1.11 / 正式发布与 HB-020/HB-022 边界 | Release 已发布；缺陷状态不升级 | annotated tag指向产品commit `20debe3483d8747008de240a9c9a1adcb2304c08`，tag object `4141f3ed…`；正式workflow完成139+1、packaged UI/bridge、synthetic updater、public channel/check、publish/cleanup | run31668236682/job94347366998，04:49:30Z～04:54:48Z success约5m18s；v0.1.11为唯一公开Latest、non-draft/non-prerelease；五项资产及channel version/path/size/SHA512一致性已记录，v0.1.10 Release/assets已删、v0.1.0～v0.1.11 tags保留 | 不运行报告用户同机真实WeGame；正式匹配queue、完整一局/终局/第二局仍待验，不能关闭HB-020/HB-022；未签名 | Release notes含修复、手动覆盖、未签名和实机边界；HB-020/HB-022继续IN PROGRESS，不得FIXED/VERIFIED
- 2026-08-13 | HB-023 / Windows 更新通常下载完整约 199 MB | OPEN（REPORTED / UNDIAGNOSED） | 用户现象不是 Windows 故障；代码 / 发布流程审计显示 electron-updater / NSIS 与当前 `.exe.blockmap` 具备差分能力，但历史错误 cleanup 删除旧 Release / assets 后，无本地 `current.blockmap` 的旧客户端可能因取不到旧 blockmap 而安全 fallback 完整 EXE | 现有 synthetic updater 只证明 check / 完整 installer download / SHA-512 / cache，未断言旧 / 新 blockmap、Range / 206、传输量或无 fallback；尚无真实 public 更新抓包证明本次具体路径 | 从 v0.1.11 起保留全部正式远端 Release / assets / tags，versioned blockmap 随 Release 或稳定通道保留；发布回读旧 / 新 blockmap，客户端严格 allowlist，UI 显示差分 / 完整及实际字节；真实 Windows N→N+1 覆盖空 / 有 cache、差分与损坏 / 无 Range 安全回退、安装和多版本窗口 | 只登记审计推断与发布契约；无代码、commit、tag 或 Release 变更，不得写 VERIFIED 根因
- 2026-08-13 | HB-020 / HB-022 / v0.1.11 用户同机交接回归 | IN PROGRESS（状态不升级） | 用户确认选人阶段与最后等待阶段显示正常，但独立游戏客户端启动前的交接空窗再次使当前英雄消失并回到“等待选择英雄” | 3270 修复、139 passed + 1 skipped、Windows packaged 与 production 回放只证明受控路径，已被真实回归证明不足以关闭交接问题 | 待收集该空窗的脱敏状态时间线 / 可回放 fixture；当前不猜新的 reducer、transport、进程或 Renderer 根因，一整局 / 终局 / 第二局仍待验 | 无代码、commit、tag 或 Release 变更；HB-020 / HB-022 不得 FIXED / VERIFIED
- 2026-08-13 | GitHub / 本地 Release 清理语义纠正 | 远端旧版删除策略已废止；本地清理待实现 | 用户明确“发布新版删除旧的”只指清理本地 `release/` 构建产物，不是删除 GitHub 历史 Release；此前已删除的远端旧 Release / assets 是不可恢复事实，tags / 源码历史仍在 | 当前远端只剩 v0.1.11 Release / assets；从 v0.1.11 起及以后正式 Releases / assets / tags 必须全部保留，workflow 绝不能再执行远端 cleanup | 本地只按当前版本或显式窗口保留 EXE / ZIP / blockmap / latest / checksum，严格解析 semver 与目标目录，禁止宽泛 / 越界删除 | 仅更新契约；尚未修改 workflow 或清理代码
- 2026-08-13 | HB-024 / 4K 校准与 OCR 标题区域 | OPEN（REPORTED / UNDIAGNOSED） | v0.1.11 用户按现有引导框选三张整卡，而程序要求标题 ROI；保存后快捷键 / 按钮仍提示未识别，属于引导与保存验证契约失败，不能归责用户 | 现有 1024×768 packaged smoke 只验证窗口、截图解码与 Esc，不验证标题框选、OCR 预览 / 置信度或 4K / DPI / 多屏 | 待代码审查；验收自动 / 明确标题 ROI、实时裁切与 OCR 结果、无效配置拦截和真实 4K 多屏 | 无修复、commit、tag 或 Release，不得 FIXED
- 2026-08-13 | HB-025 / 可配置 OCR 全局快捷键 | OPEN（REPORTED / UNIMPLEMENTED） | 用户要求手动识别不再固定 F8；设置需覆盖冲突、注册失败、恢复默认、持久化 / 重启与游戏前台全局生效 | 当前无实现或测试 | Main 受限注册、原子替换、系统保留键拒绝；按钮 / 快捷键共用单次捕获路径且不得重复触发 | 无代码、commit、tag 或 Release 变更
- 2026-08-13 | HB-026 / 切屏与进游戏性能下降 | OPEN（REPORTED / UNDIAGNOSED） | 用户报告切屏 / 进入游戏后性能下降，关闭 HexBridge 恢复；周期 desktopCapturer / OCR 仅为高概率调查方向，尚未证实 | 当前无真实 4K FPS / frametime、CPU / GPU、捕获频率或关闭前后采样 | 默认无持续高成本全屏抓取；自动模式低频低分辨率 ROI 门控且可关闭，手动只单次，single-flight / hidden pause / InProgress预算；按真实4K对照验收 | 无修复、commit、tag 或 Release，不得 FIXED
- 2026-08-13 | 界面 / 视觉长期目标 | CONTRACT ADDED（尚未实现 / 验证） | 降低英雄原画模糊 / 遮罩以清晰可辨；更新入口移出设置形成独立提示 / 页面；删除普通游戏目录 UI、底层 fallback 待审计；等待英雄轨道球克制旋转并受 eco / InProgress / hidden / reduced-motion 守卫；英雄榜职业全中文、移除冗余角色列 / 筛选、Tier 改背景条；整体配色独立重做 | 当前无相应代码、视觉快照或 Windows packaged 证据 | 1080p～4K、100%～150% DPI、三档视觉、长中文、无障碍语义、后台重绘 / CPU / GPU；不得复制 Mineradio、Codex 或其他第三方代码 / 素材 / 原创视觉表达 | 仅更新长期契约，不预写修复、commit、tag 或 Release
- 2026-08-13 | 界面 / 视觉长期目标补充 | CONTRACT ADDED（尚未实现 / 验证） | 英雄榜点击 / 键盘选中行轻微悬浮并使用低成本极光流光，受 eco / InProgress / hidden / reduced-motion 守卫；搜索覆盖中文名、title、alias 和可审计简中常用别名；重做自有 icon 并覆盖 Windows EXE / 任务栏 / 托盘 / 安装器；移除侧栏独立 LCU 状态并合并实时助手空态 / 标题 | 当前无相应实现、搜索 fixture、图标 packaged 检查或视觉 / 性能证据 | 键盘焦点与静态降级、别名来源 / 冲突 / 不伪造上游、四处图标非空 / 非默认、普通未连接只显示“客户端未启动或未发现” | 仅更新长期契约，不预写修复、commit、tag 或 Release
- 2026-08-13 | HB-027 / 未启动客户端仍显示不可达候选 | OPEN（REPORTED / UNDIAGNOSED） | 未启动 WeGame / LOL 时普通 UI 仍显示“检测到一个候选，但候选端口未接听”；旧日志 / lockfile 不可达线索不应等同活跃客户端 | 当前仅有 UI 症状；审计方向为 discovery candidate 是否过早映射用户连接状态及 discovery / verified transport 是否混用，尚未确认根因 | 进程为 0 且 probes 全失败须 `connected=false`，普通 UI 合并显示“客户端未启动或未发现”，候选来源 / 不可达仅脱敏诊断；随后启动须 5 秒内自动恢复，覆盖重启 / 轮换 / 新旧候选并存 | 无修复、commit、tag 或 Release，不得 FIXED
- 2026-08-13 | HB-020 / HB-022 / 交接空窗 dirty 草案 | IN PROGRESS（状态不升级） | pre-active launcher-side Lobby / WaitingForStats / terminal-like / unknown / partial / outgoing empty ChampSelect 提交 launching + handoffCommitted，以有界 launch lease 保留本局；production 回放覆盖 3270 选人→短暂 Lobby→InProgress 的 generation / detail / overlay / OCR 连续 | clean npm ci / audit0；当前全量 21 files / 165 pass + 1 Windows skip、typecheck / lint / source bridge / UI 通过 | 代码审查、Windows workflow / packaged、报告用户同机真实交接空窗、一整局 / 终局 / 第二局均未完成；不猜新根因 | dirty 未提交候选，不得 FIXED / VERIFIED
- 2026-08-13 | HB-024～HB-027 / OCR、热键、性能与未启动提示 dirty 候选 | IN PROGRESS（状态不升级） | HB-024 整卡几何门禁→标题 ROI + OCR 分行择优；HB-025 新键先注册、旧键后注销、冲突保留 / 持久化回滚；HB-026 默认 autoOCR 关闭、2 秒 960px gate、命中 1920px OCR、手动单帧；HB-027 disconnected 普通文案归一、候选失败只进脱敏 debug | 当前本地 165+1 套件覆盖几何 / 匹配、热键事务、capture plan、LCU 状态纯路径；source smokes / lint / typecheck 通过 | HB-024 无实时 OCR 预览且无真实 4K；HB-025 无 Windows 游戏前台 / 恢复默认；HB-026 无 hidden pause / 性能采样；HB-027 无真实 stale candidate→启动 5 秒恢复；代码审查 / Windows均未完成 | dirty 未提交候选，不得 FIXED / VERIFIED
- 2026-08-13 | UI / icon / Release retention + local cleanup dirty 候选 | IN PROGRESS（状态不升级） | 新增独立更新页 / banner；英雄榜中文强度、别名搜索、Tier 色带与受守卫极光；移除设置游戏目录 UI但保留底层 fallback待审；实时助手未连接空态 / 低遮罩与新配色；新 SVG→PNG / 多尺寸 ICO并接入 builder/window/tray；workflow移除远端删除、retention verifier；pack前精确 release 目录清空并拒绝symlink /越界 | icon verifier与retention verifier通过；local cleanup测试保护目录外文件；source UI / bridge通过 | 尚无独立代码审查、Windows packaged 四处icon /视觉 /性能、远端真实发布保留、pack:win；静态retention非完整语义证明 | dirty 未提交候选，公开 / 发布基线仍v0.1.11
- 2026-08-13 | 首轮审查 P1 与校准 3/3 门禁 dirty 增量 | IN PROGRESS（状态不升级） | 可信显式异队列在 terminal / Lobby 宽限前清旧局；热键写盘与旧键回滚双失败时返回真实 active override / `HOTKEY_ROLLBACK_FAILED`；迁移仅关闭 auto OCR 并保留 visual mode；保存校准前用 Main 内存截图 + 当前目录逐块 OCR，3/3 才可持久化 | clean npm ci / audit0；22 test files / 174 pass + 1 Windows skip、typecheck / lint / source bridge / UI、真实 ONNX title-only fixture（由心及物 / 冰寒 / 虹吸）、icon / retention verifier、diff-check 全过 | 真实 fixture 只保留三块标题裁切；最终复审、Windows workflow / packaged、用户同机交接 / 校准 / 快捷键 / 性能仍未跑 | HB-020 / HB-022 / HB-023～HB-027 全保持 IN PROGRESS；dirty 未提交候选，不得 FIXED / VERIFIED
- 2026-08-13 | 后续审查 4 项 P1 dirty 修正 | IN PROGRESS（代码草案已改，仍 UNVERIFIED） | 完整受支持 ChampSelect 在同 poll 原子完成 2400↔3270 换代；热键 override 每次按真实 active 与 persisted 持续重算；校准完整截图 IPC 按主窗口 / 校准窗口 sender 身份隔离；恢复 visualMode 设置 IPC / UI，迁移保留旧选择 | 最新仅运行目标 6 test files / 110 tests、typecheck、lint、diff-check通过 | 尚未完成最终复审、最新 clean 全量 / source smokes / fixture / verifier、Windows packaged、用户同机完整链 | HB-020 / HB-022 / HB-024～HB-026 及相关总体状态继续 IN PROGRESS，不得 FIXED / VERIFIED
- 2026-08-13 | HB-025 / 启动快捷键无注册状态 P1 dirty 修正 | IN PROGRESS（代码草案已改，仍 UNVERIFIED） | 空 active 作为明确 override；默认 F8 冲突或自定义键 + F8 fallback 双冲突均向 UI / tray / diagnostics 显示未注册，不再谎称 F8，可继续录制新键恢复 | 新增 2 项测试；hotkey + LCU 目标 90 tests、typecheck、lint、diff-check通过。该增量前较早完整链为 22 test files / 177 pass + 1 Windows skip、audit0、真实 4K ONNX、source bridge / UI 等全绿 | 最终复审、最新完整全量、真实 Windows globalShortcut / packaged仍未跑 | HB-025 继续 IN PROGRESS；dirty 未提交候选，不得 FIXED / VERIFIED
- 2026-08-13 | v0.1.12 / 最终审查与 macOS 交叉候选 | 候选本地门禁通过；HB 状态不升级 | 版本升 0.1.12；最终只读审查无 P0 / P1并批准 Windows；包含交接、校准 / OCR、热键、性能门控、未启动提示、UI / icon 与 Release retention / local cleanup 候选 | 最新完整 22 test files / 179 pass + 1 Windows skip、typecheck / lint / source bridge / UI、真实 4K ONNX、icon / retention、diff-check全过；macOS cross pack + metadata + checksums成功，EXE 198688252 bytes / SHA前缀711a7444…，ZIP SHA前缀872ccb48…，latest / blockmap本地一致 | Windows Actions / packaged、用户同机 WeGame / 4K / 快捷键 / 性能均未跑；交叉产物与截短摘要非正式 | 未commit / push / tag / Release；公开Latest仍v0.1.11，HB-020 / 022 / 023～027保持IN PROGRESS
- 2026-08-13 | v0.1.12 / 首次 Windows 候选失败与 HB-024 guard 草案 | Windows workflow FAILED；HB-024 保持 IN PROGRESS | run31681231963/job94386905747 仅 packaged UI calibration 失败；route ready / bridge true / appChildren0。根因是 title-band `v-show` 首 render 仍求值 undefined rect，Vue mount 崩溃；草案改 optional `looksLikeWholeCard` + `v-if`，补 undefined / null 测试 | 失败前 build、真实4K ONNX、179+1、lint/typecheck、pack/metadata通过；修正后目标6 tests、typecheck/lint/diff、source UI standalone通过 | 修正尚未最终复审、最新全量、commit/push或Windows retry；真实4K现场与用户同机也未验 | 不创建tag/Release；公开Latest仍v0.1.11，相关HB不得FIXED/VERIFIED
- 2026-08-13 | v0.1.12 / 首帧修复 push 与第二次 Windows 烟测焦点失败 | Windows workflow 仍 FAILED；HB-024 保持 IN PROGRESS | first-render fix审查无P0/P1、commit f74c0ef已push；run31681888143/job94388977148通过prechecks/build/pack/metadata、校准显示/Esc/close/主窗可见，最终仅因烟测强制focused+unpaused失败。无交互runner可拒绝focus，产品按设计unfocused时paused | dirty smoke改为hidden=false即恢复，并断言focused→unpaused、unfocused→paused；lint、node-check、source UI standalone、diff-check过 | smoke修正尚未复审、commit/push或Windows retry；真实4K现场/用户同机未验 | 不tag/Release；公开Latest仍v0.1.11，相关HB不得FIXED/VERIFIED
- 2026-08-13 | v0.1.12 / Windows 候选全绿 | workflow_dispatch SUCCESS；HB 状态不升级 | smoke gate复审无P0/P1，commit0f7b8b9已push；run31682463869/job94390815147基于0f7b8b93… success约5m7s | clean npm ci/audit/public0.1.11、OCR合成+真实4K、22 files179+1、lint/typecheck/retention、pack EXE199180738、metadata、packaged UI/bridge、synthetic0.1.13 updater、checksums/artifact全过；calibration1024x768、sender isolation、Esc、恢复hiddenfalse/focusedfalse/pausedtrue | tag-only按预期skip；真实WeGame、用户4K/DPI、多屏、globalShortcut和性能未验 | 尚未tag/Release，公开Latest仍v0.1.11；HB-020/022/023～027保持IN PROGRESS
- 2026-08-13 | v0.1.12 / 正式 Release 与远端保留闭环 | Release SUCCESS；HB 状态不升级 | annotated tag指向产品commit648390c19c3667c3b66909ce2444003e30e16ce9；run31683239843/job94393297681 success约5m44s；公开non-draft/non-prerelease Latest | clean deps/audit、OCR synthetic+真实4K、22 files179+1、lint/typecheck/retention、pack/metadata、packaged UI+bridge、synthetic/public update、checksums/publish全过；五资产摘要与public channel0.1.12/199180739已记录 | v0.1.11 Release及五资产仍完整，证明remote retention；真实差分Range/206/字节/安装、WeGame、用户4K/DPI/多屏/性能仍未验 | Release https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.12；HB-020/022/023～027保持IN PROGRESS，未签名/SmartScreen，Node20 annotation非阻断
- 2026-08-13 | v0.1.12 后未闭环审计 / HB-028 | HB-020/022/023～027 状态不升级；HB-028 新增 OPEN | 只读复核确认真实 WeGame 交接仍无报告用户同机闭环；设置页 / IPC / Runtime 仍支持手动 visualMode，与“隐藏手动入口、自动性能状态机唯一决策”目标不符；本地 cleanup 是 pack 前精确目录清理，远端 retention 是独立且必须持续的契约 | 未新增产品代码或自动化；当前 `release/` 只见 v0.1.12 版本化产物与本次 metadata / win-unpacked，未见旧版本号文件；v0.1.11 / v0.1.12 远端并存只证明当前一轮保留 | 仍需报告用户同机 WeGame 完整交接、自动视觉状态迁移 / 4K 性能、OCR / 热键 / stale candidate、真实 updater / 差分链；不得把正式发布或现有 smoke 写成 FIXED / VERIFIED | 仅更新项目记忆；不修改产品代码、tag、Release 或远端资产
- 2026-08-13 | HB-020 / HB-022 / HB-028 post-v0.1.12 dirty 候选 | 三项均 IN PROGRESS（状态不升级） | 高概率交接路径为 game-process 提前 active 后瞬时 terminal 清空，以及 None + lobby fallback 异队列清空；候选增加 queueSource、launching/active 每2秒独立游戏心跳、心跳过期 terminal 清理。视觉候选移除手动 UI / IPC，revision2 将旧 override→auto，Main policy 按前台/失焦/hidden/minimized/游戏阶段/资源选择档位 | clean npm ci、audit0、23 files / 192 pass + 1 Windows skip、typecheck、lint、source bridge/UI、icon/retention verifier、diff-check全过 | 独立第二轮审查、Windows workflow / packaged、真实 WeGame 同机交接、终局 / 第二局和 4K 性能均未完成；高概率路径不是用户日志终证 | dirty 未提交候选；公开 Latest 仍 v0.1.12，不得 FIXED / VERIFIED
- 2026-08-13 | HB-020 / HB-022 第二轮审查 P1 dirty 修正 | IN PROGRESS（状态不升级） | P1一：fresh独立进程heartbeat优先FailedToLaunch/TerminatedInError；P1二：tasklist改running/not-running/error，GameProcessExitGuard要求同generation/champion先见running、active中连续not-running满4秒，error中断、launching不清，再由tracker确认5秒heartbeat过期原子清；augment-interface不刷新独立进程heartbeat | 最新仅目标7 files / 115 pass + 1 Windows skip、typecheck、lint、diff-check通过；更早23 files / 192+1全链在本轮增量之前 | 最终复审、增量后clean全量、Windows packaged、真实WeGame交接/进程退出/终局/第二局未跑；不得FIXED/VERIFIED | dirty未提交候选；公开Latest仍v0.1.12
- 2026-08-13 | v0.1.13 本地候选最终复审 / cross pack | 本地候选门禁通过；HB状态不升级 | 最终复审无P0/P1；包含queueSource、tri-state进程/exit guard/heartbeat及自动视觉policy；clean-local-release精确删除7个本地产物且不触碰远端 | clean npm ci/audit0、OCR models+synthetic+真实4K、23 files/199 pass+1 Windows skip、lint/typecheck/source bridge/UI/icon/retention/diff全过；macOS cross pack/metadata/checksums成功，资产摘要见第七节 | 交叉包不是Windows Actions；真实WeGame交接、进程退出/终局/第二局、4K性能未验，HB-020/022/028及其他实机项保持IN PROGRESS | 本地版本0.1.13；尚未commit/push/Windows/tag/Release，公开Latest仍v0.1.12
- 2026-08-13 | v0.1.13 首次 Windows 候选 / packaged UI CDP 超时 | Windows workflow FAILED；HB状态不升级 | commit8b482b1已push main；run31688606924/job94410471102仅在packaged UI首个Runtime.enable固定5s等待超时，日志显示产品/DevTools已启动且未进入UI断言；dirty smoke仅将main/calibration该步骤改10s，45s总hard stop和全断言不变 | audit、OCR真实4K、199+1、lint/typecheck、retention、pack/metadata已通过；bridge/updater/checksums/artifact因前序失败不得算通过 | smoke草案待复审/local/Windows retry；真实WeGame/4K仍未验，不能归因产品或升级HB状态 | 未tag/Release；公开Latest仍v0.1.12
- 2026-08-13 | v0.1.13 第二次 Windows 候选 / runner visibility 断言 | Windows workflow FAILED；HB状态不升级 | run31689142006/job94412154784越过CDP和校准截图，观测hidden=false/paused=true；document.hidden不代表原生BrowserWindow.hide，产品性能class实际已paused | 前置audit、OCR真实4K、199+1、lint/typecheck、retention、pack/metadata全过；dirty smoke仅要求校准期间paused=true，保留截图/toolbar/Esc/target消失/main存活/恢复hidden=false及focus↔paused一致性；独立审查无P0/P1，local node-check/lint/sourceUI/diff过 | 第三次Windows retry、真实WeGame/用户4K仍待验，不得升级任何HB状态 | 未tag/Release；公开Latest仍v0.1.12
- 2026-08-13 | v0.1.13 第三次 Windows 候选 | workflow_dispatch SUCCESS；HB状态不升级 | smoke修正commit f4156f9已push；run31689676821/job94413841034 success约3m53s | OCR真实4K、Windows 23 files/200 tests无skip、lint/typecheck/retention、pack EXE199181319、metadata、packaged UI校准1024x768并恢复hiddenfalse/focusedfalse/pausedtrue、bridge、synthetic updater、checksums/artifact全过 | Windows runner不替代真实WeGame交接、用户4K/DPI/多屏、性能或差分更新实机，相关HB继续IN PROGRESS | tag-only按预期skip；未tag/Release，公开Latest仍v0.1.12
- 2026-08-13 | v0.1.13 正式 Release | Release SUCCESS；HB状态不升级 | annotated tag object6d38e740…指向产品commit9ef1a11e…；run31690145526/job94415337106 success约5m25s | Windows200 tests、packaged UI/bridge、synthetic+public updater、Release/channel全过；正式五资产摘要与public channel0.1.13/199181321已记录 | v0.1.11/v0.1.12各五资产及全部tags仍保留；真实WeGame、用户4K/DPI/多屏、性能、真实差分与安装链未验，未签名/SmartScreen和Node20 annotation边界不变 | Release公开Latest、non-draft/non-prerelease；HB-020/022/023～028保持IN PROGRESS
- 2026-08-13 | v0.1.13 发布后完成度审计 | HB状态全部保持，不宣称用户目标闭环 | 复核正式Release/Windows200 tests只构成窄范围自动化证据；固定WeGame交接、4K/DPI/多屏OCR、全局热键、真实性能、LCU/Key发现、installed更新/差分及视觉人工验收缺口 | 未新增源码或实机证据；补充闭环判定规则，禁止以Release、runner、fixture、packaged smoke或静态verifier替代用户同机结果 | 报告用户同机完整一局+第二局、真实4K性能与installed N→N+1前不得升级HB-020/022/023～028 | 仅更新项目记忆，公开Latest仍v0.1.13
- 2026-08-13 | v0.1.13 用户同机时间线 / OCR交互与产品纠正 | HB-020/022交接子项通过但总体仍IN PROGRESS；HB-025继续IN PROGRESS；新增HB-029～031 OPEN | 脱敏时间线证明3270最终英雄同generation从selecting→launching→InProgress连续，游戏进程退出确认后才清；游戏前台快捷键无反应但按钮可识别；用户否定黑屏顶部浮窗并要求实时助手内展示；卡牌pickRate待数据/政策决策；Tier不得改写“强度顶尖”；本地旧包清理不等于远端Release删除 | 仅用户同机症状/时间线与产品契约更新，无代码、测试或发布变更；不记录token/端口/path/完整session/英雄ID | 完整终局/第二局、快捷键注册链、实时助手结果UI、pickRate决策与Tier修正均待实现/实机 | 公开Latest仍v0.1.13；所有相关总体状态不得FIXED/VERIFIED
- 2026-08-13 | OCR / hero-specific pickRate 实施前契约冻结 | HB-030 OPEN→IN PROGRESS；HB-020/022总体不变 | 批准仅使用data.dtodo单英雄详情augments.stats.pickRate作当前英雄次级展示，rank优先且pickRate不排序/推导；详情缓存加本地schema版本；禁用全屏augment窗口、结果只进实时助手且hidden不show/focus；hotkey/tray/button共用稳定OCR状态；Tier必须肉眼可见原始文字 | 契约先行；当前代码仍dirty未审查，无新增测试/Windows/实机结果，不得写实现完成 | winRate/wins/games继续丢弃；来源/dataVersion/gamePatch/stale标注与个人实验/政策边界保留；normalize/handoff子项冻结 | 仅更新记忆，等待代码审查与验证
- 2026-08-13 | v0.1.14 OCR 主窗 / 手动状态 / 英雄专属 pickRate / Tier 候选提交 | HB-025 / HB-029～031 均 IN PROGRESS；不得 FIXED / VERIFIED | package / lock / README 与 smoke / demo 版本同步到0.1.14；normalize / handoff 冻结且未改；删除 augment BrowserWindow / `#augment` route / `AugmentOverlay.vue`，OCR 只同步主窗且不 show / focus；button / hotkey / tray 共用 Main 路径与 sequence，稳定 `manualOcr` 状态和最小脱敏日志；pickRate 仅 number 0～1 + source / region allowlist，rank不变，缓存v2 / legacy stale rank-tier回退；Tier显示原始`Tn` | 本轮 clean npm ci / audit0；此前完整链24 files / 210 pass + 1 Windows skip、真实4K ONNX、typecheck/lint/build/preload/source Electron bridge/UI、retention/icon、diff-check全过；首轮3个P1已修，最终审查无P0/P1；新增`renderer-contracts.test.ts`随候选提交但不计入既有计数 | Windows真实游戏前台快捷键及报告用户同机 OCR / 数据 / 视觉未验；普通OCR错误日志不含message/path或敏感字段 | 候选commit `ba5b8d1`已push main；未tag/Release，公开Latest仍v0.1.13
- 2026-08-13 | HB-032 / Windows 候选通过 | FIXED / UNVERIFIED（packaged窄门禁通过；用户同机未复测） | WindowManager以preparedInstallToken表示可撤安装准备、quitCommitted表示不可撤退出；Updater持token回滚安装错误；Runtime接prepare/cancel；校准lifecycle epoch守卫异步与窗口存活；quitting同步fail-closed并清destroyed引用 | commit `34d14b45156eb762480c7d13af72dca2fd20ed2b`已push；run31697118111/job94437330072 success约5m8s，Windows clean audit0、OCR合成+真实4K、25 files/219 pass+1 skip、lint/typecheck/retention/pack/metadata/packaged UI/bridge含shutdownLifecycle/updater/checksums/artifact全过 | packaged bridge未通过系统托盘右键执行完整报告路径；等待用户同机复测，无异常、无残留进程后才可VERIFIED | tag-only按预期skip；v0.1.14未tag/Release，公开Latest仍v0.1.13
- 2026-08-13 | v0.1.14 / 正式 Release | Release SUCCESS；HB-032保持FIXED / UNVERIFIED，其他实机项状态不升级 | tag/产品commit `5bd64052ec9262f38bbea0351e28c889d69009e3`；移除augment窗口、Main内三卡/OCR状态、英雄专属pickRate v2缓存、可见原始Tier及两阶段退出生命周期进入正式产品 | run31697626369/job94438937472 success约5m36s；audit0、真实4K OCR、25 files/219 pass+1 skip、lint/typecheck/retention、packaged UI/bridge含shutdownLifecycle、synthetic updater、metadata/checksums/public update check/publish全过；正式五资产与public channel0.1.14/199183989/SHA512一致 | 报告用户同机托盘右键退出、游戏前台快捷键、三卡OCR/pickRate/Tier视觉、终局/第二局及真实Range/206差分仍未验；未签名/SmartScreen、Node20 annotation边界不变 | Release https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.14 为Latest/non-draft/non-prerelease；v0.1.11～v0.1.13 Releases保留，至少v0.1.12/v0.1.13五资产确认完整
- 2026-08-13 | v0.1.14 安全收尾 / 完成度与迁移冻结 | 安全收尾完成；缺陷状态不升级 | 在权威repo执行项目自带clean:release，仅删除精确release/下10个本地条目（含旧0.1.13交叉产物与iCloud“ 2”冲突副本），目录清空；源码审计无新增P0，HB-025前台热键仍为未闭环P1 | 清理脚本安全结束，release/为空；未触碰远端Release/tags、Downloads、安装目录或目录外文件。v0.1.14诊断/自动化不等于League前台OS输入门禁 | 交接子项已通过但终局/第二局未验；真实4K三卡/pickRate/Tier、性能、四处icon、真实差分和托盘右键退出保持现状 | 到此不再启动构建/npm ci/索引/后台任务；iCloud Desktop/Documents本地化与冲突治理交由协调会话
- 2026-08-13 | v0.1.15 Windows 候选成功 | HB-033～038均IN PROGRESS；不得FIXED/VERIFIED | candidate/headSha `0b86ad389a89203bc47a230d0d32ac2b4331eaa2`已push；v2 single-range、AugmentRound、统一icon、manual capture隐藏恢复、中文状态/依据、toast及draft幂等/channel后置进入候选 | run31707962223/job94473218033，14:01:30Z～14:06:47Z success约5m17s；clean/audit high0/public0.1.14/OCR/Windows27 files236 tests/lint/typecheck/retention/pack/metadata/UI/bridge/checksums/artifact全过。差分previous0.1.14→synthetic0.1.16：blockmap各1、Range12、redirect3、传输1,335,875/199,233,286、零full、isolated cache | runner不等于用户installed v0.1.14→0.1.15、UAC/替换、真实图标/截图/游戏三卡/toast验收 | 无tag步骤按预期skip；未tag/Release，公开Latest仍v0.1.14。artifact ID9184153556，zip 473,407,856 bytes，digest `3c369673ed9f4b942b68c5aa0858c114ec0ae60d9e48c83e978ecd9b21a9bc64`
- 2026-08-13 | v0.1.15 / 正式 Release | Release SUCCESS；HB-033 获得 Windows / public 差分窄证据但总体仍 IN PROGRESS，HB-034～038 状态不升级 | annotated tag object `e8e165b9b1498873ca472be9641e9c316775c222` 指向产品 / 记忆提交 `c5331271fcb218f21202572acc7ac5fe06090be8`；v2 single-range、AugmentRound、统一图标、manual capture 隐藏恢复、中文状态 / 依据和有界 toast 正式发布 | run31708642394/job94475549775，14:09:13Z～14:14:58Z success约5m45s；clean/version/audit high0/OCR synthetic+真实4K/Windows27 files236 tests/lint/typecheck/retention/legacy0.1.14/pack/metadata/UI/bridge/seed旧installer cache差分/checksums/v2 channel/preflight/artifact/draft publish/public verify+packaged check全过。差分传输1,335,875/199,233,286 bytes、Range12、redirect3、old/new blockmap各1、zero full、isolated cache | 报告用户 installed v0.1.14→v0.1.15 的确认下载、UAC、安装替换/重启，以及真实多轮三卡、图标、合成器截图、中文视觉和toast仍未验；无商业签名，可能SmartScreen | Release https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.15 于14:14:49Z公开Latest/non-draft/non-prerelease；public channel0.1.15/199233286且当前packaged check updateAvailable=false；五资产和Actions artifact ID9184431486摘要已记录，v0.1.14及后续历史Release/assets/tags继续保留
- 2026-08-13 | HB-033 / v0.1.14→v0.1.15 用户实机更新 | 保持 IN PROGRESS；不得写已修复 | 用户同机仍看到 / 可能下载约200MB；执行更新的是v0.1.14旧客户端，v0.1.15单Range逻辑不能反向生效；现有smoke人工seed旧installer cache，只证明cache存在时算法 | 无新增自动化；既有Range12/old-new blockmap/零full门禁仍是窄证据，不能解释本次用户网络 | 尚未区分UI先展示full metadata size与真实full-download fallback；下一版须由installed v0.1.15→v0.1.16或下一正式版记录脱敏状态、cache条件、Range/206/完整请求和累计字节，并完成确认安装/UAC/替换/重启版本回读 | 仅更新记忆；不得记录query/token/本地路径
- 2026-08-14 | v0.1.16 / Windows 候选 | workflow_dispatch SUCCESS；HB-026 保持 IN PROGRESS | 产品 commit `e37765620db6d36c070ee602c3ddee06ce5049ca` 已 push main；自动 OCR 限定 active + Main visible，收紧 round / gate / 退避 / epoch / manual 优先级，并使用生产 NativeImage 标题 ROI 裁切 | run31718519456/job94509290728 success约5m32s；clean npm ci/hydrate/audit/public legacy/OCR synthetic+真实4K（270ms）/Windows29 files255 passed无skip/lint/typecheck/retention/pack/metadata/packaged UI+bridge/differential updater/checksums/artifact全过；EXE metadata 199,235,065 bytes；previous0.1.15→synthetic0.1.17 差分为 blockmap各1、Range10、1,213,091/199,235,065 bytes、isolated cache | Windows runner不是真实游戏frametime/CPU/GPU或报告用户同机OCR/热键验收；HB-024～026不得VERIFIED | tag-only Release/channel步骤按预期skip；尚未tag/Release，公开Latest仍v0.1.15；Node20 annotation为非阻断维护项
- 2026-08-14 | v0.1.16 / 正式 Release | Release SUCCESS；HB-026 保持 IN PROGRESS | annotated tag object `30d87a99e913ed1bac9fb689621f7bcf5a5e4b99` 指向产品 commit `043c9decf8cdea4bdd16ebcf77a302915ec068a9`；main 后续记忆提交可领先 tag，但产品源码固定于 tag | run31719527780/job94512675558 success约5m37s；Windows29 files255 passed、真实4K fixture278ms，完整门禁、Release/channel/public packaged check全过；previous0.1.15→synthetic0.1.17 差分传输1,213,090/199,235,064 bytes、Range10、redirect3、blockmap各1、isolated cache；五资产与Actions artifact摘要已记录 | 真实Windows游戏frametime/CPU/GPU、报告用户同机OCR/热键与installed更新安装仍未验；未签名/可触发SmartScreen | Release https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.16 于2026-08-13T16:18:26Z公开Latest/non-draft/non-prerelease；public channel0.1.16/199,235,064 bytes，packaged check updateAvailable=false；Node20 annotation非阻断
- 2026-08-14 | HB-019 / HB-023 / HB-033 安装分流新决策 | IN PROGRESS（契约已更新，尚未实现 / 验证） | 下载与安装仍需两次用户确认；差分包下载完成后，用户在应用内确认“重启更新”才可静默执行 NSIS；完整包 fallback 必须明示模式并保留普通安装向导；Renderer 不能注入 silent 参数 | 未新增代码、测试、Windows workflow 或 installed 证据，不得预写完成 | 对局中必须阻止安装；启动 / 退出时不得未经本次确认自动安装；UAC / SmartScreen 不得绕过或承诺消失 | 仅更新项目记忆；无 commit / tag / Release 结果
- 2026-08-14 | HB-039 / 未连接空态收口 | IN PROGRESS（目标已确认，尚未实现 / 验证） | 实时助手移除“启动 WeGame…”说明与“立即重新检测”按钮；后台自动发现保留，诊断 / 底层 retry IPC 可受限保留；README 删除对已删按钮的点击指引 | 无新增代码、UI 快照、README 检查或 Windows 恢复证据 | 需真实 Windows 无按钮操作即在启动 WeGame 后自动恢复，同时诊断 retry 仍受限可用 | 仅更新项目记忆；无 commit / tag / Release 结果
- 2026-08-14 | HB-040 / 当前英雄出装推荐 | IN PROGRESS（数据 / UI / 缓存契约已确认，尚未实现 / 验证） | 只消费现有 data.dtodo 单英雄详情 documented builds，不新增 API 请求 / credits；默认只用 builds[0] 的出门装、第一组核心装和情境装，不跨流派、不把 fullItems / itemOrders 冒充六神装；装备名 / 图只用展开详情，标注 iesdev / 补丁，缺失明示暂无数据；详情 cache schema 升级且保留旧 rank stale fallback | 无新增代码、清洗 / 缓存 / 请求计数测试或 Renderer / Windows 证据 | 需验证多 build 不混合、第一组核心装、缺图 / 缺名 / stale、来源补丁与零新增 credits | 仅更新项目记忆；无 commit / tag / Release 结果
- 2026-08-14 | v0.1.17 / Windows 候选 | workflow_dispatch SUCCESS；HB-039 / HB-040 与安装分流保持 FIXED / UNVERIFIED | commit `d8c9b2cd8456adee9ede304566404dc235b1f47f` 已 push main；出装 schema v3、未连接空态收口和按 downloadMode 安装分流进入候选 | run31724223555/job94528479256 success约5m16s；Windows29 files260 passed、4K fixture285ms、audit high0、lint/typecheck/retention/legacy/pack/metadata/UI/bridge/differential updater/checksums/artifact全过；previous0.1.16→synthetic0.1.18 传输1,181,506/199,236,658 bytes、Range10、redirect3、blockmap各1、isolated cache；artifact ID9190725113 / digest已记录 | Windows runner不等于真实 installed 静默NSIS / 完整包安装器、用户同机空态自动恢复或真实上游出装视觉验收 | tag-only发布/channel按预期skip；尚未tag/Release，公开Latest仍v0.1.16
- 2026-08-14 | v0.1.17 / 正式 Release | Release SUCCESS；HB-039 / HB-040 与安装分流保持 FIXED / UNVERIFIED | annotated tag object `7b6b638af2a89e19f4bc7ac8623dd31ab0b40bd6` 指向产品 / 记忆 commit `d7edf9fc917d8e1645d109e88324589deb4f7140`；出装 schema v3、空态收口和安装分流正式发布 | run31724844667/job94530534700 success约5m54s；Windows29 files260 tests、4K fixture272ms、完整门禁、UI/bridge、差分、Release/channel/public packaged check全过；previous0.1.16→synthetic0.1.18 传输1,235,951/199,236,595 bytes、Range11、redirect3、blockmap各1、isolated cache；五资产与artifact ID9190979002摘要已记录 | 用户同机出装/空态、真实installed静默NSIS/完整包/UAC/替换仍未验；未签名且可能SmartScreen | Release v0.1.17于17:21:55Z公开Latest/non-draft/non-prerelease；main后续记忆提交可领先tag，不预写未知hash
- 2026-08-14 | v0.1.18 / 本地候选 | 候选完成本地门禁；相关 HB 保持 FIXED / UNVERIFIED 或 IN PROGRESS | 侧栏微动效与 out-in 页面转场含 reduced-motion/eco 守卫；移除标题版本、独立更新页和旧分段 Renderer IPC；Main 无参 applyUpdate 单击完成 check→download→silent install并三处对局守卫；跨0.1.17升级 curated 改进列表一次性持久化；固定API Key申请外链；出装缺组仍暂无数据 | 最终审查修复P1后无已知P0/P1；本地30 files264 pass+1 Windows skip、typecheck/lint/diff、source bridge/UI、build/preload全过 | Windows workflow、真实installed更新、跨版本弹窗与用户视觉尚未验证；UAC/SmartScreen边界不变 | 本地0.1.18尚未commit/push/tag/Release；公开Latest仍v0.1.17
- 2026-08-14 | v0.1.18 / Windows 候选 | workflow_dispatch SUCCESS；相关 HB 状态不升级 | 源码commit `8b7bdac` 与 smoke 竞态修复commit `f24ff6f`已push；首轮旧烟测在Vue Transition完成前过早查校准入口，改为waitUntil稳定入口，产品校准功能未回归 | 首次run31729473777/job94545977255仅因smoke时序失败；第二次run31730129727/job94548232662 success约5m33s，clean/audit/public0.1.17/OCR/Windows30 files264 pass+1 skip/lint/typecheck/retention/legacy/pack/metadata/UI+calibration/bridge/differential updater/checksums/artifact全过 | Windows runner不等于真实installed更新、跨版本弹窗、用户视觉/动效或固定外链验收 | tag-only按预期skip；尚未tag/Release，公开Latest仍v0.1.17
