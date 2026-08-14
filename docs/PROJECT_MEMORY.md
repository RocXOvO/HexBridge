# HexBridge 项目记忆（精简版）

> 最后更新：2026-08-15
> 当前正式版：[v0.1.27](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.27)，唯一 public Latest / non-draft / non-prerelease；Release ID `370730395`，publishedAt `2026-08-14T17:42:24Z`。annotated tag object `af7ad65267425c3c5b38bc560ee36ca5bd19de41` 解引用产品 commit `e845709735a644f39815a5ec505acf19e33d0e43`。
> 正式边界：attempt 2 已通过 39 files / 399 passed + 1 skipped、双通道、public packaged 与五版滚动清理。HB-061 fresh PUT 权威 poll 已真实通过并升为 `VERIFIED`；HB-056 仍为 `IN PROGRESS / UNVERIFIED`，真实亮暗原画、长中文、DPI 与性能待用户同机。
> 当前未发布工作树：HB-064 的有界 public packaged 重试已实现并通过最终审查 / 本地门禁，但尚未 commit / push / Windows / 下一次真实 first-attempt publish，状态为 `FIXED / UNVERIFIED`。公开 Latest 仍为 v0.1.27，不预写未来版本或发布结果。
> 缺陷状态与验收矩阵见 [DEFECTS.md](./DEFECTS.md)；旧版逐行根因、测试流水和发布日志保留在 Git 历史与 GitHub Actions，不再重复堆入本文件。

## 1. 产品定位与硬边界

HexBridge 是 Windows 10/11 x64、国服 / WeGame、简体中文的海克斯大乱斗个人实验助手。已识别模式 `queueId ∈ {2400, 3270}`；用户实机确认自定义海克斯大乱斗为 3270，正式匹配 ID 仍须实测。

- LCU 只读：不得换英雄、交易、改符文 / 装备集或调用写接口。
- 不注入游戏 / LeagueClientUx，不自动点击，不代替玩家选择英雄或海克斯。
- 不做账号、云后端、遥测或战绩上传；不得记录 / 持久化 token、API Key、PUUID、原始历史、完整 session 或完整屏幕截图。
- 默认不保存截图；诊断只允许用户手动触发后的三块标题裁切，最多 60 张。
- 受支持打包版每次进程启动、updater adapter ready 后，由 Main 以 0ms 调度一次只读 `check(false)`，并保留 6h 周期；只在确认新版后显示入口。检查不得自动下载 / 安装；下载与安装仍须用户明确点击，对局门禁不变，普通退出不得安装。差分静默 NSIS 仍可能触发 UAC / SmartScreen，不得绕过。
- Windows 安装包尚无商业代码签名，必须持续说明 SmartScreen / 未知发布者风险。
- 许可为 PolyForm Noncommercial 1.0.0。第三方项目只可作理念 / 行为参考，不复制不兼容代码、素材、品牌或原创视觉表达。
- Riot / 腾讯网站可访问不等于产品政策、稳定 API 或数据复用授权；扩大分发前必须重新审计。
- 每个独立目标单独进入小版本；不得预分配未来版本、捆绑未完成目标或预写发布结果。

## 2. 当前架构

- Electron 43 + Vue 3 + TypeScript + electron-vite / electron-builder。
- `src/main/runtime.ts`：LCU、数据、OCR、推荐、窗口与 provider 状态聚合。
- `src/main/lcu/`：多来源凭据发现、只读 HTTPS / WebSocket、比赛上下文与 authority / generation。
- `src/main/data-service.ts`：当前 data.dtodo 请求、Key、目录 / 英雄详情 cache v3。
- `src/shared/recommendations.ts`：当前 data.dtodo 英雄候选与三卡 rank / tier 排序。
- `src/main/ocr/`：显示器捕获、标题 ROI、PaddleOCR / ONNX；自动 OCR 默认关闭。
- `src/main/window-manager.ts`：主窗、选人伴随窗、96px compact 和校准窗。
- `src/main/config-store.ts`：safeStorage Key、设置迁移、窗口状态和版本改进提示。
- `src/main/ipc.ts` / preload：sender 受限结构化业务 IPC；Renderer 不得获得 Node、网络客户端、文件系统、凭据、任意 URL / query。

## 3. LCU、比赛上下文与本地战绩

### 3.1 比赛上下文

- 支持 `selecting / launching / active / none`，用 authority、gameId、generation、独立游戏进程和正向 game-starting 证据隔离同队列第二局。
- 租约：active 最长 12h、已确认 handoff 10min、弱 transport / 空 phase 15s；空 ChampSelect / None / partial 不续租。
- 非 Mayhem 在 normalize 边界清空 current / bench；同英雄跨队列也必须换代并清详情 / OCR / overlay。
- 当前英雄、详情、OCR 和进程检查都必须以 generation + champion 守卫迟到结果。

### 3.2 队友 / 对手近期状态（HB-047 / HB-054）

- v0.1.24 已正式发布，默认关闭、仅本机，政策 / 自定义分发为 `ACCEPTED RISK`。
- selecting / launching 只信 champ-select；active 只信 gameflow。唯一 self、跨组 PUUID 唯一、任一 raw team >5 全局拒绝。
- 队友 4 与对手 5 各自 all-or-nothing，组间允许 partial；最多 20 场，少于 12 场不评分。
- Main 固定 current-summoner 与 per-PUUID history GET；跨旧 / 新批次总并发 2、单响应 2 MiB、timeout / Abort、瞬态最多一次重试。
- Renderer 只见 generation-bound 随机 opaqueKey 和脱敏 summary / detail；PUUID、姓名、participant、gameId、原始响应、逐局时间戳和路径不出 Main / 日志 / 磁盘。
- Windows 370 tests / 正式 Release 不能替代真实国服 endpoint、身份可见性、隐私与用户价值验收，状态保持 `IN PROGRESS / UNVERIFIED`。

## 4. 数据源与推荐契约

### 4.1 data.dtodo（当前默认 provider）

- `https://data.dtodo.cn/api/v1/zh-CN/*` 仍是默认英雄 / 海克斯推荐统计与出装来源；每位用户自行申请 Key，Main 用 safeStorage，Renderer 永不见明文。
- 目录与详情使用上游 dataVersion；详情 cache schema 为 v3，并保留 v1 / v2 仅 stale fallback。
- data.dtodo 三卡比较键：英雄专属 rank → 英雄专属 tier → global tier。英雄专属 pickRate 仅展示，不能排序或由 total / rank 推导。
- 出装只消费同一 `builds[0]` 的出门、第一组核心与情境装备；名称 / 图标必须来自已展开详情，缺失显示“暂无数据”，不得按 ID 猜 URL / 名称。

### 4.2 腾讯 101（HB-058，已审计、未实现）

来源页面：[腾讯 101 海克斯榜](https://101.qq.com/?ADTAG=cooperation.glzx.web#/rankings/hextech)，服务根 `https://mlol.qt.qq.com`。2026-08-14 只读实测以下接口无需登录 / API Key 且返回 HTTP 200：

- 强化榜：`/go/battle_info/odp_proxy/fuwen_aram_rune_rank_v2?augmentid_level=255`
- 英雄榜：`/go/battle_info/odp_proxy/fuwen_aram_hero_rank_v2?dtstatdate=YYYYMMDD`；日期必须来自强化榜。
- 最佳拍档：`/go/battle_info/odp_proxy/fuwen_aram_hero_parttner?role1=255&role2=255&championid=255`（拼写保持上游原样）。
- 静态目录：`https://game.gtimg.cn/images/lol/act/img/js/kiwi/kiwi_augments.json`

定位与限制：

- 这是腾讯官方网页当前使用的**未文档化 Web 接口**，不是 Riot Developer API，也不是有公开版本 / SLA / 许可承诺的“公开官方 API”。上线前必须审计网站条款；公开可访问不等于获得稳定复用授权。
- 外层为 JSON，核心在 `data._fieldValues` 的 JSON 字符串内，并使用 `#`、`_`、`,`、`&`、`;`、`|` 分隔。必须版本化 fail-closed parser：唯一字段、严格字段数、正整数 ID、有限 0～1 比例、YYYYMMDD、最大条数；歧义 / 漂移 / 日期不一致立即拒绝。
- 只支持已确认的 `augmentid_level=255`；1 / 2 / 3 未返回正常榜单，不猜枚举。品质筛选只在本地静态目录做。
- payload 没有明确 queueId、样本量、统计分段或是否含自定义局；不得宣称只代表 2400 / 3270、英雄专属样本或已知覆盖范围。
- CORS 不是信任边界：实测服务会反射 localhost Origin。联网仍只能在 Main；Renderer 不得直连、构造 URL / query 或读取 `_fieldValues` 原文。

最终 provider 契约：

- 新设置 `recommendationDataSource` 只能是 `dtodo | tencent101`，不得有 `auto`。现有用户 revisioned migration 默认 `dtodo`，避免静默改口径。
- 选 dtodo 时推荐全链只用 dtodo；选 tencent101 时英雄榜 / 查询、选人、当前英雄、OCR 三卡、96px compact 和理由只用同一腾讯 snapshot。禁止静默回退、跨源拼字段或拿另一来源补名次。
- 出装是独立 data.dtodo 模块，不受推荐来源控制。腾讯模式无 dtodo Key 时英雄 / 海克斯推荐仍须可用，只有出装区域提示需要 Key，不能判整个实时助手不可用。
- 腾讯英雄榜 `lowest_rank_runes` 只给英雄对应的有序 augmentId；强化榜 pick_rate / win_rate / rank 是**全局**统计。UI 必须写“全局选取率 / 全局胜率”，不得写成该英雄专属数值。
- 三卡命中 `lowest_rank_runes` 的先按英雄推荐顺序；未命中再按腾讯全局 rank；相同有效指标并列，缺失无名次。理由只允许“腾讯英雄推荐第 N”或“腾讯全局排名第 N”，绝不借用 dtodo 排名。
- 浏览页复用 `matchesChampionSearch`（中文名、称号、alias、显式常用别名）与键盘可选列表；点击英雄打开独立详情，不改变实时助手当前英雄。浏览默认按推荐序，可显式切换全局 pick / win 排序。
- 缺推荐列表显示“腾讯数据站暂无该英雄的推荐海克斯”；缺静态 / 全局字段时保留可确认内容，数值为 `null / 暂无数据`，绝不补 0。
- Main 必须提交统一 provider snapshot；`source + championId + sequence + dataVersion/dtstatdate + matchGeneration` 任一变化先撤销旧推荐，迟到响应不能污染切源、换英雄或第二局。

最小实现切面：

- 不能直接扩充当前单体 DataService / `ChampionAugmentData` v3 / 单个 Runtime detail / dataVersion-only guard / 写死 dtodo 的 `rankAugmentSlots`。
- 先抽象 recommendation provider snapshot + ranking strategy；Tencent101Adapter 使用独立 contract、状态和缓存 namespace。
- Main-only 固定 host / path / query，响应在 JSON.parse 前限制 2 MiB；timeout / Abort、单 in-flight、每日 / 日期限频。
- 先取强化榜日期，再取同日英雄榜；同日期完整校验后 `.tmp` + rename 原子切换。旧缓存只可显式 stale；不得与 dtodo current.json / champion-detail-v3 混存。
- 状态 / 诊断显示当前 provider、日期、fresh / stale / error；设置可手动切源，失败不自动换源。
- 必测：两 provider fixtures、错误分隔 / oversize / 日期错配、切源迟到、全 / 部分 / 零命中、缺全局统计、并列、offline stale、无 dtodo Key 腾讯模式、严禁混源、换英雄 / 第二局清理、键盘 / 长中文 / reduced-motion 和非 Main IPC 拒绝。

## 5. OCR、窗口与视觉性能

- 自动 OCR 默认关闭；手动单帧。自动路径仅 active + eligible 时运行，低分辨率 gate 后才做完整 OCR，single-flight、退避、同一卡面锁存。
- 捕获必须先裁标题 ROI，模型限制线程；窗口隐藏 / 最小化 / 退出 / generation 变化使旧任务失效。
- 96px compact 透明、点击穿透、不聚焦；只在可靠 3/3、游戏前台和卡面存在时显示。v0.1.26 正式版改为卡面上方定位并记录 matched frame 指纹；检测到变化后经 500ms + 280ms 稳定确认先撤旧条，两次 probe error 通过 `beginNextRound` 恢复。前台丢失仍只 pause / hide，回前台 cheap probe；两次 absence、刷新、禁用、终局或 45 秒 expiry 清除。
- 选人伴随窗绑定权威 LeagueClientUx PID，Win32 / DWM bounds 跟随；synthetic fake 不是实际 WeGame / DPI / 多屏证据。
- 主窗背景、页面动效与轨道球必须服从 Main 自动 visual policy、eco、hidden / minimized / unfocused、InProgress 和 reduced-motion；不得持续粒子或全屏高频重绘。
- v0.1.27 本地候选只调整静态英雄背景：cinematic blur `3→1.5`、opacity `.58→.66` 并减轻 scrim；balanced 使用 blur `1`、opacity `.56` 和独立 scrim；eco 明确无 filter / transform 并恢复原有 scrim。launching / active / hidden 等状态仍由 Main policy 强制 eco；候选不新增持续任务、截图或捕获。

### 5.1 Lobby 画面作为 HexBridge 背景（HB-059，未实现）

- 安全含义：只把权威 LeagueClientUx 的 Lobby / Matchmaking / ReadyCheck 可见窗口低频截帧，作为 HexBridge 自己等待页的本地背景；不嵌入、注入、覆盖或改写 League 客户端。
- 只截绑定窗口，单任务、硬超时、尺寸上限、低频 / 事件触发、内存态；不得保存、日志化或上传画面，也不得捕获其他窗口 / 显示器。
- HexBridge hidden / minimized / unfocused、客户端最小化 / 不可见、进入 ChampSelect / launching / active、退出、reduced-motion 或捕获失败时立即停止并清除；绝不能把 Lobby 背景捕获带入游戏。
- 保留文字 scrim 与静态 fallback；验收 1080p～4K、100%～150% DPI、多屏、窗口移动、隐私遮罩、CPU / GPU / frametime。性能证据不足时默认关闭。

## 6. 安全、缓存与日志

- API Key 仅 safeStorage 加密；不可用时拒绝明文降级。Key 验证失败保留旧 Key。
- 数据缓存位于 `userData/data-cache`，写入必须 `.tmp` + 原子 rename；不完整目录不能切 current pointer。
- data.dtodo 与腾讯 101 使用独立 schema / namespace / provider / 日期；读取时必须校验来源，旧缓存必须显示 stale。
- 日志为内存环形缓冲，过滤 token、Key、PUUID 风格标识和含凭据 URL；不得记录腾讯原始 payload、截图、窗口标题 / 路径或用户身份。
- 所有上游 / LCU 请求固定 GET、allowlist、timeout、响应大小上限；Renderer 不提供 URL、path、query、PUUID 或 provider 内部参数。
- `contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`、`webSecurity=true`、CSP；窗口拒绝任意导航 / 新窗口。

## 7. 更新与发布

- HB-060 的启动检查只适用于受支持打包版：adapter ready 后 Main 调度一次 `check(false)`，不等待 6h 首轮；既有 6h 周期继续。异步 `adapterLoader` 可能在 `stop()` 后才 resolve，`stopped` 门禁阻止迟到 adapter 安装、启动检查与周期计时器。此链只读且不改变用户点击下载 / 安装及对局 fail-closed 契约。
- authenticated Contents / ref poll 在 v0.1.27 fresh PUT 后权威回读成功，v2 / root 均精确指向 0.1.27，HB-061 为 `VERIFIED`。attempt 1 随后的 Electron public packaged one-shot 仍在约 15s 读到 CDN 缓存的 0.1.26 而失败；未 prune、未移动 tag、未重建 / 覆盖 Release / assets。
- HB-064 dirty 实现只在子进程以非 0 整数退出且稳定错误码严格为 `HB_PUBLIC_UPDATE_SMOKE_VERSION_MISMATCH` 时重试；每次使用 fresh temp / userData。全链 100s absolute deadline、单次 20s、预留 8s cleanup，带 PID 门禁和 `finally` 清理。exit 0 异常 JSON、signal / null、timeout、spawn 失败或预算耗尽均 fail closed；失败发生在 prune 前，不能移动 tag 或改写 Release / assets。
- `pack:win --publish never` 只构建；tag 与 package 版本必须一致。正式 workflow 在全部检查后才发布 EXE、blockmap、ZIP、latest.yml、SHA256SUMS。
- GitHub 滚动只保留最新 5 个严格 semver 正式 Release / assets；v0.1.27 全验证后删除 v0.1.22 Release 并保留 tag，当前仅 v0.1.23～v0.1.27 五个 Releases，28 个 tags（v0.1.0～v0.1.27）全部保留。被删 Release / assets 不可恢复，除非依 tag 重建；超窗升级安全回退 full installer。
- 本地 `clean:release` 每次打包前清空仓库根下精确 `release/`，只保留当前构建；仍拒绝 symlink / 越界且不触碰 Downloads / installed / GitHub。已清掉 7 个旧 v0.1.24 本地条目，可由重打包或 Release 下载恢复；当前本地 release 为空。
- 客户端与 GitHub Release publisher 共用逐版本清单并按 `previous < entry <= current` 累计；v0.1.26 正式 Release 说明已正确生成“相较 v0.1.25”的五项变化。非相邻版本累计与长清单滚动由自动化覆盖。
- Windows hosted Actions / synthetic updater 不等于真实 installed N→N+1；真实差分仍需 Range / 206、网络字节、fallback、安装、重启和 UAC / SmartScreen 证据。

## 8. v0.1.27 正式基线

- run `31824779397` attempt 1 / job `94846203797` 已发布 Release / channel，但 Electron public packaged 在约 15s 仍读取 0.1.26 而失败，未 prune。attempt 2 / job `94848032259` 于 `2026-08-14T17:43:58Z`～`17:49:26Z` success（约 5m28s），preflight `shouldPublishRelease=false / shouldPublishChannel=false` 幂等复用既有资产。
- attempt 2：39 files / 399 passed + 1 skipped、真实 4K 260ms及完整门禁通过；public packaged `channel=0.1.27 / updateAvailable=false`，v2 / root 均为 0.1.27、size `199259433`、SHA-512 一致。synthetic 0.1.28 差分 Range 9、传输 `1187244 / 199259432`。artifact `9228717900` / `473466978` bytes / digest 摘要 `ea4734f…3cbd`。
- 正式资产：EXE `199259433` / `c5dad62ad56d767a13a4820057b23ea9602110662618755e9f0fd2c2c3609b5b`；blockmap `201154` / `eb2c43fa0daaba5a59b8067e266ad1b92d7b35c0c14f78db087a4d07dd11fe59`；ZIP `274419034` / `07f55df4863bdc484b965cd9d215f941058db88a4553bf13d7829c177126e8a3`；latest.yml `346` / `e189b63c935dac62751316672c39593cffee9fa4b0953dee225eca2b3cb7d8ef`；SHA256SUMS `182` / `4d7252778184ce69c02150fba39390c0264b5ecfbc0c719a22782990f6ae8585`。
- v0.1.23～v0.1.27 五个 Releases 与 28 个 tags 保留；本地 release 为空。Node 20 annotation 非阻断。正式发布不能替代真实 installed / WeGame、视觉、DPI或性能证据。

## 9. 当前优先级

1. HB-064：本地实现 / 审查已过，仍须 commit / push、Windows 和下一次真实 first-attempt publish 验证；保持 `FIXED / UNVERIFIED`。
2. HB-056：v0.1.27 已发布，仍须真实亮暗原画、长中文、100% / 125% / 150% DPI、CPU / GPU / 帧时间验收。
3. HB-060：正式版已发布，仍须真实 installed Windows 覆盖每进程启动自动检查。
4. 真实 WeGame 验收：交接 / 终局 / 第二局、快捷键、OCR 刷新、96px 生命周期、LeagueClientUx 跟随、性能。
5. HB-058：先完成网站条款审计，再做 recommendation provider 抽象、独立 Tencent101Adapter、设置迁移和双 provider 门禁；未实现前不进入版本。
6. HB-059：先做只读 capture 可行性 / 性能 / 隐私评估；默认关闭，绝不注入 League 客户端。
7. HB-057：Wallpaper Engine 独立评估，不与背景清晰度、数据源或 Lobby 捕获捆绑发布。

## 10. 协作与迁移边界

- 当前仓库：`/Users/duchongyang/Documents/ChatGPT/LOL大乱斗`，远端 `RocXOvO/HexBridge`，branch `main`。
- 完成本轮文档提交 / push / clean status 后，本任务明确结束；不得自行启动新的 build、`npm ci`、索引、文件迁移或后台开发任务。
- iCloud Desktop / Documents 本地化、冲突副本与依赖污染由迁移协调任务统一处理；本任务不移动 / 删除目录，也不停止 Clash Verge。
- 主记忆只保留当前契约和最新基线；缺陷写入 `DEFECTS.md`。发布流水与旧根因从 Git / Actions 追溯，不再重复复制。
