# HexBridge 缺陷与验收索引

> 最后更新：2026-08-16。详细历史证据保留在 Git 历史、GitHub Actions 与 Releases；本文件只保留问题状态、当前边界和验收出口，避免 `PROJECT_MEMORY.md` 无限膨胀。

## 状态规则

- 只使用 `OPEN`、`IN PROGRESS`、`FIXED / UNVERIFIED`、`VERIFIED`、`ACCEPTED RISK`。
- Windows runner / synthetic fixture 只证明对应窄门禁；真实 WeGame、LCU、DPI、多屏、OCR、性能或 installed updater 必须有真实 Windows / 用户同机证据才可整体 `VERIFIED`。
- 不在文档、fixture 或日志记录 token、API Key、PUUID、完整 session、原始历史或截图内容。

## 总表

| ID | 问题 | 当前状态 |
|---|---|---|
| HB-001 | GameStart 丢当前英雄 | FIXED / UNVERIFIED |
| HB-002 | 英雄详情异步竞态 | FIXED / UNVERIFIED |
| HB-003 | LCU 断线后 OCR 继续 | FIXED / UNVERIFIED |
| HB-004 | 生产静默回退 Demo API | VERIFIED |
| HB-005 | OCR 模型供应链未固定 | VERIFIED |
| HB-006 | 手动刷新误报成功 | FIXED / UNVERIFIED |
| HB-007 | 全量状态广播过量 | FIXED / UNVERIFIED |
| HB-008 | 诊断截图生命周期 | FIXED / UNVERIFIED |
| HB-009 | 生产依赖高危审计项 | VERIFIED |
| HB-010 | lint 命令不可执行 | VERIFIED |
| HB-011 | tag 构建隐式发布 | VERIFIED |
| HB-012 | sandbox preload ESM 失效 | VERIFIED（bridge 窄范围） |
| HB-013 | Key 保存无反馈 | FIXED / UNVERIFIED |
| HB-014 | 三卡校准交互 / 首帧 | 首帧 VERIFIED；DPI / 多屏 UNVERIFIED |
| HB-015 | 国服 WeGame LCU 发现 | FIXED / UNVERIFIED |
| HB-016 | 中文字体过小 | FIXED / UNVERIFIED |
| HB-017 | 未连接空态层次 / 动效 | FIXED / UNVERIFIED |
| HB-018 | 选人后对局上下文丢失 | FIXED / UNVERIFIED |
| HB-019 | 客户端内更新 | packaged 下载 VERIFIED；安装 UNVERIFIED |
| HB-020 | WeGame→游戏交接丢上下文 | IN PROGRESS |
| HB-021 | 旧客户端发现不到更新 | IN PROGRESS |
| HB-022 | 国服选人英雄 / 浮窗不显示 | IN PROGRESS |
| HB-023 | 差分退化为完整包 | IN PROGRESS |
| HB-024 | 4K 校准与 OCR ROI 不一致 | IN PROGRESS |
| HB-025 | OCR 全局快捷键 | IN PROGRESS |
| HB-026 | 切屏 / 入局性能下降 | IN PROGRESS |
| HB-027 | 未启动客户端仍显示候选 | IN PROGRESS |
| HB-028 | 视觉性能自动状态机 | IN PROGRESS |
| HB-029 | OCR 黑屏顶部浮窗 | IN PROGRESS |
| HB-030 | 英雄专属 pickRate | IN PROGRESS |
| HB-031 | Tier 主观文案 | IN PROGRESS |
| HB-032 | 托盘退出 destroyed window | FIXED / UNVERIFIED |
| HB-033 | installed 更新完整包量级 | IN PROGRESS |
| HB-034 | 三卡结果被丢帧清除 | IN PROGRESS |
| HB-035 | Windows 图标不一致 | IN PROGRESS |
| HB-036 | OCR 截到自身窗口 | IN PROGRESS |
| HB-037 | 更新 / 推荐文案未中文化 | IN PROGRESS |
| HB-038 | toast 无有界生命周期 | IN PROGRESS |
| HB-039 | 未连接空态冗余 | FIXED / UNVERIFIED |
| HB-040 | 当前英雄出装推荐 | FIXED / UNVERIFIED |
| HB-041 | 最新版仍显示更新按钮 | IN PROGRESS |
| HB-042 | Key ready 视觉不足 | IN PROGRESS |
| HB-043 | 实时助手动效 / 性能守卫 | IN PROGRESS |
| HB-044 | 页面切换布局抖动 | FIXED / UNVERIFIED |
| HB-045 | 选人伴随窗跟随 | FIXED / UNVERIFIED |
| HB-046 | 游戏内 96px 推荐窗 | FIXED / UNVERIFIED |
| HB-047 | 本地队友 / 对手近期状态 | IN PROGRESS / UNVERIFIED；政策 ACCEPTED RISK |
| HB-048 | 3270 退出后残留 | IN PROGRESS / UNVERIFIED |
| HB-049 | 真实 LeagueClientUx 贴合 | IN PROGRESS / UNVERIFIED |
| HB-050 | 刷新后 OCR / 推荐慢 | IN PROGRESS / UNVERIFIED |
| HB-051 | 三卡真实英雄专属 pickRate | IN PROGRESS / UNVERIFIED |
| HB-052 | 选卡后 96px 条不消失 | IN PROGRESS / UNVERIFIED |
| HB-053 | 对局中途启动恢复英雄 | IN PROGRESS / UNVERIFIED |
| HB-054 | 队友 + 对手总览 / 头像详情 | IN PROGRESS / UNVERIFIED；政策 ACCEPTED RISK |
| HB-055 | 真实对局 96px 提示缺失 | IN PROGRESS / UNVERIFIED |
| HB-056 | 主背景清晰度 | IN PROGRESS / UNVERIFIED（v0.1.27 已发布） |
| HB-057 | Wallpaper Engine 接入 | FIXED / UNVERIFIED（v0.1.30 已发布） |
| HB-058 | 腾讯 101 推荐 provider | FIXED / UNVERIFIED（v0.1.29 已发布；适用书面授权已在仓库外确认） |
| HB-059 | Lobby 画面作为 HexBridge 背景 | IN PROGRESS / UNVERIFIED（v0.1.28 已发布） |
| HB-060 | 每次启动只读检查更新 | FIXED / UNVERIFIED（v0.1.25 已发布） |
| HB-061 | 发布 channel 传播检查假阴性 | VERIFIED（v0.1.27 fresh PUT） |
| HB-062 | GitHub Release 滚动保留与双通道 | VERIFIED（v0.1.26 实际执行） |
| HB-063 | 跨版本升级 / Release 说明 | VERIFIED（v0.1.26 正式说明） |
| HB-064 | Electron public packaged CDN 假阴性 | FIXED / UNVERIFIED（main 已 push） |
| HB-065 | 有副作用 IPC 缺少 Main sender 授权 | FIXED / UNVERIFIED（v0.1.32 正式版） |
| HB-066 | legacy 游戏目录进入 Renderer 状态 | VERIFIED（v0.1.33 正式版） |
| HB-067 | log-only LCU 缺少权威 LeagueClientUx PID | FIXED / UNVERIFIED（v0.1.34 已发布） |
| HB-068 | 伴随窗 / 96px 条缺少脱敏呈现诊断 | FIXED / UNVERIFIED（v0.1.35 已发布） |
| HB-069 | 腾讯推荐误拒科学计数法 / 数组目录 | FIXED / UNVERIFIED（v0.1.36 已发布） |
| HB-070 | 实时助手来源徽标混入统计日期 / 缓存后缀 | FIXED / UNVERIFIED（v0.1.37 已发布） |
| HB-071 | data.dtodo 单详情失败导致全局离线 / 无恢复 | FIXED / UNVERIFIED（v0.1.38 已发布） |
| HB-072 | 同局换英雄 / 备战席换位后队伍头像冻结 | FIXED / UNVERIFIED（v0.1.39 已发布） |
| HB-073 | 腾讯 101 改为默认推荐来源 | FIXED / UNVERIFIED（v0.1.40 已发布） |
| HB-074 | 卡面刷新响应、未变卡片重绘与更新交互 | FIXED / UNVERIFIED（v0.1.43 已发布） |
| HB-075 | 单卡刷新导致三张卡片 / 标签一起跳动 | FIXED / UNVERIFIED（v0.1.43 已发布） |
| HB-076 | 选人伴随窗恢复后脱离客户端图层 | FIXED / UNVERIFIED（v0.1.42 已发布） |
| HB-077 | 选人助手备战席出现不必要的横向滚动 | FIXED / UNVERIFIED（v0.1.44 已发布） |
| HB-078 | 高置信度冗余包装器与未引用导出 | FIXED / UNVERIFIED（v0.1.45 已发布） |
| HB-079 | 当前英雄等级与海克斯可选卡状态缺少受限探测 | IN PROGRESS / UNVERIFIED（v0.1.61 已发布 Windows 个人全量采样） |
| HB-080 | 单卡刷新时三张标签仍一起跳动 | FIXED / UNVERIFIED（v0.1.46 已发布） |
| HB-081 | 96px 推荐条某槽位变化后持续重复播放动画 | FIXED / UNVERIFIED（v0.1.47 已发布） |
| HB-082 | 手动刷新首轮识别不完整导致整组三卡退场重进 | FIXED / UNVERIFIED（v0.1.48 已发布） |
| HB-083 | 已隐藏的旧三卡在不完整手动识别后被重新显示 | FIXED / UNVERIFIED（v0.1.49 已发布） |
| HB-084 | 自动 probe 在隐藏旧 surface 后复活三卡 | FIXED / UNVERIFIED（v0.1.50 已发布） |
| HB-085 | Tencent 英雄总体 pickRate 未进入英雄目录 | FIXED / UNVERIFIED（v0.1.51 已发布） |
| HB-086 | 自动刷新短暂 probe miss 导致三张标签一起跳动 | FIXED / UNVERIFIED（v0.1.52 已发布） |
| HB-087 | 队友 / 对手强度缺少队伍层量化摘要 | FIXED / UNVERIFIED（v0.1.53 已发布） |
| HB-088 | OCR 刷新卡顿缺少脱敏调度证据 | IN PROGRESS / UNVERIFIED（v0.1.56 已发布） |
| HB-089 | 打包 UI smoke 未随 OCR 调度诊断卡扩展 | FIXED / UNVERIFIED（v0.1.55 已公开 Release） |
| HB-090 | Release notes 将无公开 Release 的中间 tag 当作稳定基线 | FIXED / UNVERIFIED（v0.1.56 已发布） |
| HB-091 | 刷新动画空窗导致整组三卡撤下和高频探测 | FIXED / UNVERIFIED（v0.1.57 已发布） |
| HB-092 | 单卡刷新仍重复三槽 OCR / 混合帧风险 | FIXED / UNVERIFIED（v0.1.58 已发布；v0.1.59 修正整组三卡外层过渡） |
| HB-093 | Tencent 强化榜未按 `bestHeroes` 反向生成英雄候选 | IN PROGRESS / UNVERIFIED（v0.1.62 候选） |
| HB-094 | 英雄榜缺少 OP/T1–T5 分组与点击详情出装 | IN PROGRESS / UNVERIFIED（v0.1.62 候选） |

## 当前重点验收

### HB-074：OCR 刷新与更新交互

- v0.1.41 已正式发布卡面指纹 100ms 确认、稳定低成本探测与更新交互；用户实测仍发现单卡刷新时三卡标签一起跳动，因此本问题保持未闭环。
- v0.1.42 已发布固定三槽位和单卡 DOM key：未变化卡片原位 patch，只有变化卡片播放入场动画；省电与 reduced-motion 门禁保持有效。
- v0.1.43 已发布并补上手动刷新分支：检测到单卡变化后不再先撤下整组三卡；已有可靠三卡保持挂载，继续做有界低成本监测，手动新结果回来时只替换变化槽位。
- 真实 WeGame 卡面刷新、动画帧耗时、托盘点击和 installed 更新仍未验证，因此状态保持 `FIXED / UNVERIFIED`。

### HB-075：单卡刷新三卡联动动画

- 根因收敛为三卡组级过渡与单槽位内容更新耦合：一张卡的识别结果变化时，其他两张卡也被重新挂载或参与移动动画。
- v0.1.42 已按 `slot + augmentId` 只替换变化槽位；v0.1.43 已发布并进一步覆盖 `autoOcr=false` 的手动监测路径，避免先 `visible=false` 导致三卡整体退场/重进。
- 定向 Runtime / Renderer 合约、typecheck、lint、diff-check 已通过；仍需 Windows installed 实测单卡刷新、换局、失焦与帧耗时。

### HB-076：选人伴随窗图层跟随

- v0.1.42 已在原生 follower 移动时使用 `HWND_TOPMOST` 且不激活窗口；WindowManager 每次可见同步也重申 Electron `floating` 层级。
- 定向窗口生命周期、观察器、typecheck、lint、diff-check 已通过；真实 WeGame 多窗口、DPI、多屏、最小化恢复和不抢焦点仍需 installed Windows 实测。

### HB-020 / 022：游戏交接

- 用户同机已证明 3270 选人到 active 的英雄上下文可连续保留；终局、紧接第二局、完整 OCR / 推荐仍未闭环。
- 真实回放必须记录脱敏 stage / generation / champion / transport 决策，禁止 token、路径和原始 session。

### HB-023 / 033：差分更新

- GitHub 新策略只保留最新 5 个严格 semver 正式 Release / assets，tags / 源码永久保留；窗口内 blockmap 支持差分，超出窗口安全回退 full。仍需 installed N→N+1 实测 HTTP Range / 206、网络字节、fallback、安装与重启。

### HB-060：每次启动只读检查更新

- v0.1.25 已正式发布：每次受支持打包版进程启动、updater adapter ready 后由 Main 以 0ms 调度一次 `check(false)`，并保留 6h 周期；无新版不显示入口，有新版才显示。检查不自动下载 / 安装，下载 / 安装仍由用户点击且沿用对局门禁。
- 异步 `adapterLoader` 在 `stop()` 后 resolve 的竞态由 `stopped` 门禁阻止复活。正式 Windows attempt 2 通过 36 files / 373 tests 及 packaged UI / bridge 等全链，但 runner 不能替代真实 installed 每进程启动行为，状态保持 `FIXED / UNVERIFIED`。

### HB-061：发布 channel 传播检查假阴性

- v0.1.25 tag run attempt 1 已成功创建 Release / assets 并 PUT channel，但仅约 16s raw 传播检查造成假阴性；attempt 2 preflight 显示 Release / channel 均已存在并幂等跳过，随后 public v2 `0.1.25 / 199258069` 和 packaged `updateAvailable=false` 通过。不得移动 tag、重建 / 覆盖 Release 或回滚 v0.1.25；这是基础设施 P1，不是产品 P0。
- v0.1.26 后的有界 authenticated Contents / ref poll 已在 v0.1.27 fresh PUT 权威回读中真实通过；v2 / root 精确同步并校验 blob / ref，HB-061 升为 `VERIFIED`。随后 public packaged 的 CDN 假阴性由 HB-064 单独跟踪；Node 20 annotation 非阻断。
- v0.1.28 attempt 1 的 raw exact poll 在 100000ms 超时后 fail closed；稍后 Contents API / raw 双通道均精确为 0.1.28，attempt 2 按 canonical 现状成功。HB-061 状态不变。

### HB-062：GitHub Release 滚动保留与双通道

- v0.1.40 全验证后删除 v0.1.35 Release / assets、保留 tag；当前仅 v0.1.36～v0.1.40 五个 public stable Releases，41 个 tags（v0.1.0～v0.1.40）与源码全部保留。既有删除不可恢复，除非依 tag 重建；root 精确镜像 v2，超窗升级可 full fallback。状态 `VERIFIED`。
- 本地 release 为空；本地旧构建可重打包 / 下载恢复，与已删除远端 Release / assets 的边界不同。

### HB-063：跨版本升级与 Release 说明

- 客户端与 GitHub publisher 共用逐版本清单并按 `previous < entry <= current` 累计；v0.1.40 Release 已准确列出相较 v0.1.39 的变化，跨版累计链延伸至 0.1.40，状态 `VERIFIED`。

### HB-024～026：OCR、快捷键、性能

- 校准使用整卡框，识别只消费标题 ROI；自动 OCR 默认关闭，手动单帧，自动路径采用低分辨率 gate、single-flight 和退避。
- 必须在真实 4K / 100%～150% DPI / 多屏与 League 前台验证快捷键、三卡刷新、CPU / GPU / FPS / frametime；fixture 不能外推游戏性能。

### HB-032：托盘退出

- 两阶段 quit、WindowManager epoch 和 updater 安装生命周期已通过 source / packaged 窄门禁。
- 仍需报告用户在正式 installed 版本从系统托盘右键退出，确认无主进程错误和残留进程。

### HB-045 / 049：伴随窗跟随

- 当前实现以权威 LeagueClientUx PID、Win32 / DWM bounds、80ms 选人跟随和 1Hz 重发现工作；无资格游戏守卫为 350ms。
- Windows fake 窗口只证明脚本链；真实 WeGame、多窗口、100%～150% / 混合 DPI、多屏、最小化与不抢焦点仍待验。

### HB-047 / 054：队友与对手近期状态

- v0.1.24 已正式发布：默认关闭、仅本机；selecting / launching 只信 champ-select，active 只信 gameflow；唯一 self、跨组唯一、raw team >5 全局拒绝。
- 队友 4 与对手 5 分组各自 all-or-nothing，组间可 partial；最多 20 场、少于 12 场不评分；跨批次总并发 2、2 MiB、Abort / timeout。
- Renderer 只见 generation-bound opaqueKey 和脱敏 summary / detail；PUUID、玩家名、participant、gameId、原始历史与逐局时间戳不得出 Main、日志或磁盘。
- Windows 370 tests / Release 全门禁不等于真实国服 history endpoint；真实 WeGame、隐私、清理、性能与用户价值仍须验证，政策 / 自定义分发保持 ACCEPTED RISK。

### HB-048～055：对局提示生命周期

- v0.1.21～0.1.23 已加入弱 / committed / active 租约、独立游戏心跳、刷新确认、96px compact、两次 absence、45 秒 expiry、切屏 pause / hide 与回前台 cheap probe。
- v0.1.26 正式版把 96px 条定位到卡面上方，保存 matched frame 指纹；变化后经 500ms + 280ms 稳定确认先撤旧条，两次 probe error 调用 `beginNextRound` 恢复。审查无 P0 / P1 且正式 Windows 全链通过；真实 WeGame 未跑，HB-050 / 052 / 055 不得升级状态。
- v0.1.31 正式版修正 HB-048 的取消边界：`GAME_STARTING` 只获得固定 60s 不续租短租约，稳定终止 15s 清理 hero / detail / overlay / 伴随窗 / Wallpaper 目标；真实 InProgress / game client / process / augment 强证据优先升级且不换 generation。五入口边界与 Runtime 全链回放已进入本地 507+1 和 Windows 508 全量；终审 `P0=0 / P1=0`，candidate run `31870907932` 与正式 run `31871200159` attempt 2 全绿。真实 WeGame 未验，HB-048 保持 `IN PROGRESS / UNVERIFIED`。
- 真实 3270 退出、刷新、选择卡牌、小窗出现 / 消失、点击穿透、中途启动、英雄专属统计与性能仍需用户同机逐项闭环。

### HB-056：背景清晰度

- v0.1.27 本地候选：cinematic blur `3→1.5`、opacity `.58→.66` 并减轻 scrim；balanced 使用 blur `1`、opacity `.56` 和独立 scrim；eco 明确无 filter / transform 且恢复旧 scrim。launching / active / hidden 等仍由 Main policy 强制 eco；没有新增持续任务或捕获。
- v0.1.27 正式 run attempt 2 通过 39 files / 399 passed + 1 skipped、真实 4K 260ms 与完整门禁；Release ID `370730395` 为唯一 Latest，五资产、v2 / root、public packaged 和五版滚动均通过。正式发布仍不能替代真实原画 / DPI / 性能验收；Node 20 annotation 非阻断。
- 状态保持 `IN PROGRESS / UNVERIFIED`：仍须真实亮 / 暗原画、长中文、100% / 125% / 150% DPI、Windows cinematic / balanced / eco 截图与 CPU / GPU / 帧时间；不得用自动化外推视觉或性能完成。

### HB-064：Electron public packaged CDN 假阴性

- v0.1.27 attempt 1 在 Release / channel 成功后，Electron public packaged one-shot 于约 15s 仍读到 CDN 缓存的 0.1.26 而失败；未 prune，attempt 2 后读取 0.1.27 / `updateAvailable=false` 并成功。这与 HB-061 的权威 Contents / ref poll 不同。
- main commit `5aac5e3d8463c401d1ce5a5ee4573f89dab31148` 的实现仅在子进程以非 0 整数退出且稳定码为 `HB_PUBLIC_UPDATE_SMOKE_VERSION_MISMATCH` 时重试；每次 fresh temp / userData，100s absolute deadline、20s attempt、8s cleanup reserve、PID 门禁与 `finally` 清理。exit 0 异常 JSON、signal / null、timeout、spawn 或预算耗尽均 fail closed；失败在 prune 前终止且不移动 tag、不改写 Release / assets。
- commit 已 push main；最终审查无 P0 / P1，node-check、target 5、40 files / 404 passed + 1 skipped、typecheck / lint / diff-check 通过。v0.1.29 attempt 1 的 public packaged 在完整 100s 预算内持续读到 v0.1.28，按设计 fail closed 且未 prune；稍后 attempt 2 首次即读到 v0.1.29 / `updateAvailable=false` 并完成滚动。超长 CDN 传播仍需幂等重跑，状态保持 `FIXED / UNVERIFIED`。

### HB-057：Wallpaper Engine

- v0.1.30 默认关闭；旧用户 revision 8 强制保持关闭。用户配置英雄 `{id}` 命名模板与固定恢复 Profile / Playlist，仅在受支持对局中切换；离局、退出和更新安装前恢复。
- Main 只发现 Steam app 431960 的 canonical 32 / 64 位 exe，要求 manifest appid、目录链、CIM `ExecutablePath` 和运行进程精确一致；固定 `openProfile / openPlaylist`、`shell:false`、2s timeout，不自动启动 / 关闭 Wallpaper Engine。
- Profile / Playlist 名与模板只持久化在 Main 配置，可执行路径只在 Main 内存中使用；均不进 RuntimeState、非 Main IPC 或日志。持久 lease 在崩溃后下次启动先恢复，再应用当前英雄；迟到命令、英雄换代、更新取消与托盘 / 标题退出均有序列化门禁。
- 终审 `P0=0 / P1=0`；v0.1.30 正式 run `31869511329` / job `94975841740` 首次通过 46 files / 499 tests、真实 4K 185ms、packaged UI / bridge、差分、五资产、双通道、public packaged 与五版滚动。Release 成功不等于真实 Wallpaper Engine / Steam 多库、CIM 权限、多屏 Profile 和官方 CLI 验收，因此保持 `FIXED / UNVERIFIED`。

### HB-058：腾讯 101 推荐 provider

- 来源是腾讯官方 101 页面当前使用的未文档化 Web 接口，不是 Riot Developer API，也不是有 SLA 承诺的公开官方 API。用户已确认适用书面授权在仓库外取得；授权正文、身份、条款与附件属保密信息，本仓库不保存、不转述。技术实现可提交，真实 Windows / 腾讯接口验收前仍不得标记 `VERIFIED`。
- v0.1.29 首次引入设置时，既有用户迁移采用 dtodo；该历史默认值在 v0.1.40 的 HB-073 中被后续产品决策取代。严格枚举、禁止 auto / 静默回退 / 跨源拼接及出装独立边界不变。
- Tencent101Adapter 必须 Main-only、固定 host / path / query、2 MiB、timeout / Abort、单 in-flight、按 `dtstatdate` 独立原子缓存与 stale；Renderer 不得提供 URL / query 或读取原始 `_fieldValues`。
- 英雄 `lowest_rank_runes` 只给有序推荐 ID；augment 接口的 pick / win 是全局口径。UI 必须写“全局选取率 / 全局胜率”，缺失为“暂无数据”而不是 0。
- 腾讯模式下选人、当前英雄、英雄详情、OCR 三卡、96px compact 与理由必须同源：命中英雄推荐的卡按列表顺序，未命中再按腾讯全局 rank；并列保留，缺数据无名次，绝不借 data.dtodo 排名。
- `source + championId + sequence + dataVersion/dtstatdate + generation` 任一变化即撤旧，迟到请求不能污染切源、换英雄或第二局。无 data.dtodo Key 时腾讯推荐仍可用，只有出装区域单独提示 Key。
- 实现最终审查 `P0=0 / P1=0`；v0.1.29 已正式发布。run `31866876217` attempt 1 完整创建 Release / 五资产与双通道后因 CDN 仍返回 v0.1.28 而 fail closed；attempt 2 / job `94970078474` 通过 44 files / 470 tests、真实 4K 276ms、packaged UI / bridge、public packaged 和五版滚动。Release 成功不等于真实腾讯接口与 WeGame 验证，状态保持 `FIXED / UNVERIFIED`。

### HB-059：Lobby 客户端画面背景

- v0.1.28 正式版默认关闭；仅 win32 + LCU connected + `matchStage=none` + Lobby / Matchmaking / ReadyCheck + Main live 页可见 / 聚焦 / 非最小化 + 非 reduced-motion + 非 eco + authority PID / HWND 唯一时，每 5s PrintWindow 精确截权威 LeagueClientUx。不得整屏捕获、SetWindowPos 或注入。
- Main 限 `16,777,216` 像素、缩至 `<=960x540`、强模糊 / 暗化、JPEG `<=500KB`；Main-only IPC 只传 sanitized bytes，raw / frames 不进 RuntimeState / 日志 / 磁盘 / 伴随窗。切页 / 失焦 / 最小化 / eco / 选人 / launching / active / capture 事务 / 失败 / 退出立即停清。
- controller 为 child + epoch、3s sanitize timeout、9s watchdog、single-flight；Sharp 未 settle 不开第二任务，迟到 drop，15 / 30 / 60s 退避，重启可恢复同一 raw。最终审查 P0 / P1 = 0；audit 0、OCR synthetic、真实 4K 160ms、41 files / 436 passed + 1 skipped、typecheck / lint / icon / rolling retention / source bridge / UI / diff-check 全过；版本 / release / lobby 定向 5 files / 55 tests 通过。
- Windows candidate 首跑因缺 `lobbyBackground` 返回 `undefined` 而在 npm test 失败；fail-closed 修复后的第二次 candidate 全链成功。v0.1.28 正式 attempt 2 又通过 Windows 41 files / 438 tests、真实 4K 266ms、packaged UI / bridge 与完整发布门禁；Release ID `370764802` 为 Latest，v2 / root / public packaged 和五版滚动均通过。
- fake WinForms 不等于真实 WeGame Chromium；仍须真实画面 / DPI / 性能验证，HB-059 保持 `IN PROGRESS / UNVERIFIED`。

### HB-065：有副作用 IPC sender 授权

- v0.1.32 正式版将诊断截图清理与 LCU 重新发现限制为当前 Main sender；champion、calibration、未知或已被替换的旧 Main sender 均在调用 Runtime 前拒绝。
- 行为级测试通过真实 `registerIpc` 捕获并执行 handler，证明 Main 成功且拒绝路径无副作用；calibration 专属 IPC、champion 状态读取与本窗关闭不变。终审无 P0 / P1；正式 run `31872643509` attempt 2 通过 47 files / 515 tests、packaged UI / bridge、public channel / packaged 与五版滚动门禁，Release ID `370991273` 为 Latest。状态保持 `FIXED / UNVERIFIED`。

### HB-066：legacy 游戏目录隐私隔离

- 旧配置中的目录值仅保留在 Main `InternalAppSettings` 并继续供 LCU 发现使用；普通 UI、preload 与业务 IPC 均不提供读取、选择或清除目录的入口。
- `AppSettings`、RuntimeState、get-state、设置响应和所有窗口广播以公开字段白名单重建；IPC 伪造 `gameDirectory` 会在 Runtime 前丢弃，路径不进日志或公开错误。
- 终审 `P0=0 / P1=0`；本地 47 files / 517 passed + 1 skipped、Windows candidate 47 files / 518 tests，以及正式 run `31874316733` attempt 2 的 packaged UI / bridge、public v2 / root / packaged 与滚动保留全过。该问题的公开类型、序列化与 IPC 边界可由自动化完整验证，v0.1.33 正式版后状态升为 `VERIFIED`。

### HB-067：log-only LCU 窗口 authority

- 根因：日志凭据没有 PID，可信对局确认后又停止候选刷新；选人伴随窗与 Lobby 背景要求权威 LeagueClientUx PID，因此 LCU 主功能可用但两个窗口功能永远无资格。即使后续找到等价 PID，旧 Runtime 也会因 snapshot / state 未变化而跳过窗口同步。
- v0.1.34 分离 transport PID 与 Main-only Ux authority；只接受同安装根唯一 Ux、明确 `LeagueClientUx` lockfile，或观测进程名 + PID 精确一致。可信对局仅在缺 authority 时每 10s 单飞刷新当前等价凭据元数据，不切 transport / authority / generation；PID 单独变化会同步 WindowManager。多 Ux、跨根、普通 `LeagueClient` 和不明确情况均拒绝。
- 终审 `P0=0 / P1=0`；本地 audit 0、47 files / 522 passed + 1 skipped及完整门禁通过。Windows candidate run `31876118223` 通过 523 tests；正式 run `31876394640` attempt 1 创建 Release / 五资产后因 Raw 传播超时 fail closed，attempt 2 幂等通过 523 tests、packaged UI / bridge、双通道、public packaged 与五版滚动。真实 log-only / lockfile WeGame 尚未复测，状态保持 `FIXED / UNVERIFIED`。

### HB-068：伴随窗 / 96px 呈现诊断

- v0.1.35 正式版在诊断页显示选人伴随窗、96px 推荐条和 League 窗口观察器的有限枚举状态；分类与实际 show / hide 条件共用输入，异常槽位数量 fail-closed，重启后的新观察器即使首帧与旧值相同也会重新发布状态。
- DTO 与去重日志只含有限枚举，不含 PID、HWND、路径、窗口标题、坐标或截图。终审 `P0=0 / P1=0`；candidate run `31877923520` 与正式 run `31878189793` attempt 2 均通过 Windows 48 files / 529 tests、真实 4K OCR、packaged UI / bridge 和更新门禁。Release 成功不能替代真实 WeGame，状态保持 `FIXED / UNVERIFIED`。

### HB-069：腾讯推荐来源报“无效或重复字段”

- 2026-08-15 真实响应证明：207 条强化统计中有 2 条极小 `pick_rate` 使用合法科学计数法，静态目录为 246 项数组；旧代码只接受普通小数与对象根节点，因而整条 provider 无法就绪。
- 修复仅接受严格十进制 / 科学计数法且为有限 `0..1`；静态目录允许当前 array 与旧 object，原始数量限 `100..500`，无效项拒绝，重复 ID 仅完全同义时去重，任一展示字段冲突继续 fail closed。
- 真实四端点本地验证已返回 `ready`、172 个英雄、246 个强化；终审 `P0=0 / P1=0`。Windows candidate run `31886807521` 与正式幂等复跑 `31887511905` 均通过 48 files / 533 tests、4K OCR、packaged UI / bridge、差分 / public 更新和产物门禁；v0.1.36 已发布，但用户 Windows 同机尚未验证，状态保持 `FIXED / UNVERIFIED`。

### HB-070：实时助手来源徽标信息过多

- v0.1.37 候选将实时助手右上角限制为只显示当前推荐来源名称；不再显示日期、dataVersion、“未就绪”、缓存后缀或 stale 样式。
- 日期、新鲜度和错误仍保留在推荐详情、英雄榜、设置与诊断页。终审 `P0=0 / P1=0`；Windows candidate `31888079459` 与正式幂等复跑 `31888761186` 均通过 48 files / 534 tests、4K OCR、packaged UI / bridge、差分 / public 更新和产物门禁；v0.1.37 已发布，但用户同机视觉仍未验。

### HB-071：data.dtodo 容易误入离线

- 根因是单英雄详情 timeout / 429 / 5xx / 解析或缓存写入失败会污染全局 API 状态；目录又在新 snapshot 原子提交前公开新 dataVersion，正文读取没有统一 deadline / 大小上限，离线后也没有有界恢复。
- v0.1.38 只允许 detail 401 使 Key 失效；目录 429 有完整旧缓存时公开为 stale 且要求手动刷新。离线按 15s / 60s / 5min 单飞恢复，正文统一 10s / 2MiB，退出立即 abort；同版本目录不可变，新版本仅在两目录和 pointer 全提交后切 active。
- 终审 `P0=0 / P1=0`；Windows candidate `31890026596` 与正式幂等复跑 `31890763548` 均通过 48 files / 548 tests、真实 4K OCR、packaged UI / bridge、差分 / public 更新与五版滚动门禁。v0.1.38 已发布，但 installed 网络波动尚未复测，状态保持 `FIXED / UNVERIFIED`。

### HB-072：同局队伍头像冻结

- 根因是首次历史查询把 champion / relation / slot 与战绩一起固化，Runtime 对同 generation 的 ready 状态又停止刷新；换英雄或交换备战席后一直显示首次头像。
- v0.1.39 改为 Main-only 身份绑定：实时 roster 更新不重新查询已有历史且保持既有 opaque key，champ-select 与 active gameflow 仅更新完整脱敏 presentation；hidden、partial 或歧义分组从公开状态撤下，成员恢复后沿用原明细。用户主动重新读取或阶段补全仍可发起新查询。PUUID、self 和原始 roster 不出 Main / IPC / 日志 / 磁盘。
- 终审 `P0=0 / P1=0`；Windows candidate `31892397418` 与正式幂等复跑 `31893186863` 均通过 48 files / 557 tests、真实 4K OCR、packaged UI / bridge、差分 / public 更新与五版滚动门禁。v0.1.39 已发布，但真实 WeGame 换英雄与备战席换位仍待验，状态保持 `FIXED / UNVERIFIED`。

### HB-073：腾讯 101 改为默认推荐来源

- 新安装和尚未持久化 revision 7 来源选择的配置默认 `tencent101`；revision 7 / 8 中已保存的合法 `dtodo` 或 `tencent101` 选择不被升级重写，未知值 fail-closed 到腾讯默认。无 auto、无跨源回退；出装继续独立使用 data.dtodo。
- 设置 UI、Renderer 安全 fallback、Main bridge smoke、README 与隐私记忆统一默认口径。Release 说明只描述该独立 patch，跨版本累计规则不变。
- 本地完整门禁与 candidate `31893923167` 均通过。正式 run `31894224065` attempt 1 创建 Release / 五资产和双通道后因 Raw 100s 未传播而 fail closed、未 prune；attempt 2 / job `95035875831` 于 5m35s 幂等通过 48 files / 560 tests、真实 4K 265ms、packaged UI / bridge、public packaged 与五版滚动门禁。v0.1.40 已发布；真实 installed 迁移与腾讯接口仍待验，状态 `FIXED / UNVERIFIED`。

### HB-077：选人助手备战席横向滚动

- v0.1.44 将 `panel-window`、`panel-bench` 和 `panel-list` 的宽度收缩与横向溢出设为 fail-closed；列表只保留内部纵向滚动，长中文标题在网格列内省略，不再把选人伴随窗撑出横向滚动条。
- 滚动边界使用 `overscroll-behavior: contain`、稳定 gutter 和克制的细滚动条样式；不改变伴随窗的 authority、跟随层级或 LCU 状态。
- 定向 renderer 合约 / release-notes 测试、typecheck、lint、diff-check 已通过；正式 workflow `31900414946` 的 Windows packaged / UI / bridge 门禁通过。真实 WeGame 横向视觉、DPI 与性能仍未验，状态保持 `FIXED / UNVERIFIED`。

### HB-078：高置信度冗余清理

- v0.1.45 已发布，删除五项已由全仓生产引用审计确认的残留：旧 `rankAugmentSlots`、`detailRanksForCurrentChampion`、布尔进程 wrapper、未引用正式 Release URL 常量和未使用的 alias 对外导出。
- 对应旧测试改为调用当前 `dtodoRecommendationDetail` / `rankRecommendationSlots` 或 tri-state `inspectLeagueGameProcess`；bridge/update/lobby/observer smoke、旧缓存 / LCU discovery 兼容分支均未触碰。
- 定向测试、typecheck、lint、diff-check、Windows packaged 与 Release 门禁均已通过；真实用户行为仍未验，状态保持 `FIXED / UNVERIFIED`。

### HB-079：Live Client 等级与可选卡诊断

- v0.1.46 已发布，加入 Main-only、固定 `127.0.0.1:2999` 的 `activeplayer` 等级读取，仅接受 1–18 整数；active、可信游戏进程、generation/champion/sequence、Abort 和 stop 门禁均在代码与定向测试中覆盖。
- v0.1.60 已在显式三时间点采样中增加固定 `allgamedata` 读取；仍限制 2 MiB / 超时，只输出字段路径、JSON 类型、有限枚举/布尔/数值和 OCR surface，不输出原始响应、身份、路径或凭据。
- 用户提供的三份真实摘要中，`activeplayer` 等级均为 3，`eventdata` 只有默认事件结构，`gamestats` 只变化游戏时间 / 金币等普通运行数据，尚未出现稳定的选卡字段；等级与事件仍只能作为唤醒信号，OCR 才是最终卡面确认。
- v0.1.60 Windows workflow、全量测试、打包 UI / bridge、差分与公开通道门禁已通过；allgamedata 仍待用户 Windows 三时间点采样。fake requester / Runtime guard 与自动化门禁不等于真实国服字段验证，状态保持 UNVERIFIED。
- v0.1.61 已发布显式的 Windows 个人研究按钮：完整响应只写本机用户数据目录，IPC 只返回文件名 / 大小，且可在诊断页清除；它不上传、不进入日志或 RuntimeState。真实三时间点字段仍未验证，不能把全量采样写成“可选卡状态已支持”。

### HB-080：单卡刷新动画隔离

- v0.1.46 已发布，将渲染动画周期改为“本次变化槽位集合”，不再用永久 revision 标记；卡片 key 继续按槽位 + augmentId，未变化的两个标签保持原位。
- renderer contract、Runtime 性能、Live Client 定向测试、typecheck/lint/diff-check 已通过；真实游戏刷新视觉仍待用户复测，状态保持 `FIXED / UNVERIFIED`。

### HB-081：点击穿透推荐条动画周期

- v0.1.47 已发布，让主窗口与 96px 点击穿透小窗共用按本轮槽位变化计算的动画状态；旧的永久 slot revision 不再让已变化卡片在后续更新中反复播放。
- 定向 renderer / Runtime 测试、typecheck、lint、diff-check 已通过；真实 Windows 游戏内刷新视觉仍待用户复测，未宣称已验证。

### HB-082：手动刷新首轮识别不完整导致整组三卡退场重进

- 根因是手动 OCR 首次只可靠识别部分卡面时，旧的可靠三卡被设为 `visible=false`；下一次成功结果会触发整个卡面容器重新进场，即使最终只改变一个槽位。
- v0.1.48 保留已有三卡挂载，显示有界“正在确认变化”状态；重试成功后沿用槽位 + augmentId 与按本轮变化集合的动画判定，只替换真正变化的卡片。
- 正式 workflow `31905462353` 通过 Windows `50` files / `585` tests、packaged UI / bridge、差分和 public packaged 门禁；真实 Windows / WeGame 卡面刷新仍未验证，不能标记 `VERIFIED`。

### HB-083：已隐藏的旧三卡在不完整手动识别后被重新显示

- 根因是保留旧 slots 与 surface 可见性没有同时作为门禁；选卡完成、两次 absence 或有界到期后，旧 slots 仍可留作回看，但不完整手动识别会误把它们当成当前可见三卡而重新显示。
- v0.1.49 候选把保留条件收紧为“当前 surface 仍可见且 slots 恰好为 3”；隐藏状态只保留旧数据，不会被不完整结果复活，完整匹配后仍按单槽位更新。
- 正式 workflow `31906109063`（稳定通道首次传播超时后幂等重跑）通过 Windows `50` files / `587` tests、packaged UI / bridge、差分和滚动门禁；真实 Windows / WeGame 刷新视觉尚未验证，不能标记 `VERIFIED`。

### HB-084：自动 probe 在隐藏旧 surface 后复活三卡

- 审计发现自动低成本 probe 的指纹变化分支仍只检查保留 slots 数量；surface 已因选卡、absence 或到期隐藏时，后续新指纹会重新挂载旧三卡。
- v0.1.50 候选把该分支与手动不完整识别统一为 `overlay.visible && slots.length===3` 门禁，并补自动调度回归；隐藏 surface 不会因 probe 新指纹复活。
- 正式 workflow `31907004019` 首次稳定通道传播超时后幂等重跑成功；Windows `50` files / `589` tests、真实 4K OCR `262ms`、packaged UI / bridge、差分、public packaged 与五版滚动门禁通过。真实 Windows / WeGame 刷新视觉尚未验证，不能标记 `VERIFIED`。

### HB-085：Tencent 英雄总体 pickRate 未进入英雄目录

- Tencent 101 英雄榜接口已经解析并缓存英雄总体 `pickRate`，但旧公开 `ChampionSummary` 丢弃该字段，导致当前英雄、备战席和英雄榜无法展示；海克斯卡片的全局选取率不是替代值。
- v0.1.51 新增来源明确的可空 `championPickRate`：Tencent 只映射自身英雄榜字段；dtodo 与旧缓存缺失时返回 `null`；缓存校验拒绝越界值；UI 仅在 Tencent 来源标注“英雄选取率”，不参与原有排序。
- 本地 `50` files / `593` passed + `1` skipped、typecheck、变更文件 lint、diff-check 已通过；v0.1.51 Windows workflow `31908866405` 重跑成功，`50` files / `594` passed、打包 UI / bridge、差分、public packaged 与五版滚动门禁通过。真实 Tencent endpoint、切源和用户同机可读性仍未验，状态保持 `FIXED / UNVERIFIED`。

### HB-086：自动刷新短暂 probe miss 导致三张标签一起跳动

- 根因是卡面指纹变化进入 `recognizing` 后，下一次低成本 probe 的短暂 `not-detected` 被当作整张卡面消失；旧三卡先撤下，识别恢复时三张标签一起重新进场。
- v0.1.52 在 recognizing 状态保留可靠 surface，继续以 100ms 确认；只有连续两次 absence 才清除 visible / fingerprint。主窗口和 compact 仍沿用槽位 + augmentId key，只有实际变化槽位触发动画。
- 本地定向 Runtime / Renderer / Release notes、typecheck、lint、diff-check 已通过；正式 workflow `31910230347` / job `95074070896` 通过 Windows `50` files / `597` tests、打包 UI / bridge、差分、public packaged 与五版滚动门禁。真实 WeGame 单卡刷新和帧时间仍未验，状态保持 `FIXED / UNVERIFIED`。

### HB-087：队友 / 对手强度缺少队伍层量化摘要

- v0.1.53 在既有 Main-only、4 队友 / 5 对手、最多 20 场和至少 12 场评分契约上，新增队伍级脱敏摘要：按可用样本量加权汇总胜率与 KDA，按已有个人评分加权得到队伍强度；不新增 LCU 请求，不把缺失玩家当作平均值。
- UI 同时显示队伍强度、总体胜率、KDA、样本量和“部分评分 / 全员评分 / 暂无足够样本”，不改变个人头像详情、opaque key 或隐私边界。
- 本地 `50` files / `599` passed + `1` skipped、typecheck、lint、diff-check 已通过；正式 Windows workflow `31911568238` / job `95077306492` 幂等重跑成功，Windows `50` files / `600` passed、真实 4K OCR `256ms`、打包 UI / bridge、差分、公网双通道、public packaged 与五版滚动通过。真实国服 history schema、身份可见性、用户价值和游戏性能仍未验，状态保持 `FIXED / UNVERIFIED`。

### HB-088：OCR 刷新卡顿缺少脱敏调度证据

- v0.1.54 候选在现有 single-flight、代际和来源守卫上新增有限 `ocrSchedule` 诊断：记录低成本 probe 与完整 OCR 的次数、最近耗时、16 次滚动峰值、下一次延迟和 `stopped / paused / waiting / recognizing / latched` 阶段。
- 指标只在 Main 侧从屏幕捕获 / OCR 调度结果聚合，换代或停止时清零；旧 epoch 晚到的探测不会写入新一局。RuntimeState 只发送数值和有限枚举，不含截图、OCR 文本、坐标、进程标识、路径或玩家身份。
- 本地定向 OCR / Runtime / Renderer 测试、typecheck、变更文件 lint 和 diff-check 已通过；尚未 commit / push / Windows workflow / Release。真实 WeGame 的单卡刷新、CPU/GPU、FPS / frametime 仍待用户复测，不能把诊断实现写成性能已修复。

### HB-089：打包 UI smoke 未随 OCR 调度诊断卡扩展

- v0.1.54 新增 OCR 调度诊断卡后，Windows packaged UI smoke 仍要求诊断页恰好 6 张卡，导致门禁在 UI smoke 阶段 fail closed；前置测试、lint、typecheck 与打包本身已通过。
- v0.1.55 已公开 Release，把断言同步为当前 7 张诊断卡并新增对应 Release 说明；稳定通道已通过幂等重跑。v0.1.56 已公开 Release，进一步修正 Release notes：上一正式版只从公开 Release 列表取值；没有公开 Release 的中间 tag 仍累计其变更，并使用上一公开 Release 作为 compare 基线。这些自动化门禁修正不代表真实 Windows / WeGame 视觉或性能已验证。

### HB-091：刷新动画空窗导致整组三卡撤下和高频探测

- 用户仍观察到单卡刷新时三个 Tag 一起跳动。源码审计确认：可靠三卡在两次约 100ms 的 `not-detected` 后会整体隐藏，刷新动画的标题空窗因此触发整窗离场、再入场；若把宽限简单拆成连续 100ms 探测，又会在 700ms 内制造新的高频截图。
- v0.1.57 已发布并通过 Windows workflow：可靠三卡使用有界 700ms absence grace；第二次缺失后只等待剩余宽限再做第三次确认；检测恢复期间保持 surface 和未变化槽位，error / pause / stop 会清除连续性计时。Renderer 继续按 `slot + augmentId` 只替换变化卡片。
- 本地 Runtime、Renderer/OCR、Windows 全链、Release、双通道、公网 packaged check 与五版滚动保留均通过；真实 Windows WeGame 刷新动画、三卡不位移和 FPS / frametime 仍待用户同机验收，不能标记 `VERIFIED`。

### HB-092：单卡刷新增量 OCR与跨帧一致性

- v0.1.58 已发布：可靠三卡保持可见、同一对局 / 英雄 / 来源 / 日期且稳定指纹只变化一个物理槽时，仅对该槽执行 OCR；左右未变化卡继续按 `slot + augmentId` 复用。
- v0.1.59 已发布：移除推荐区整组三卡 `out-in` 过渡，并在短暂隐藏/恢复期间保留可靠槽位签名；恢复时仍只对变化卡片重播动画，三卡真正清空才重置签名。Windows / WeGame 单卡刷新仍待同机验证。
- 增量请求绑定旧指纹、确认指纹、旧三槽签名和 context；1440px 结果必须同时满足跨尺度指纹、仍恰好单槽变化和当前 overlay 基线一致，否则不提交混合结果，下一次自动扫描回退完整三槽 OCR。
- 标题短暂空白不再以约 700ms 直接撤下可靠 surface，而是使用有界 `1.8s` 连续缺失租约；确认仍无卡面后才隐藏。手动 OCR 在 96px 窗口与卡面几何不相交时保留小窗，同一可见 compact DTO 不重复 IPC/重显。
- v0.1.59 已完成本地与 Windows workflow 门禁；本地 `50` files / `628` passed + `1` skipped，typecheck、lint、diff-check 与渲染/增量 OCR 回归通过。真实 WeGame 单卡刷新、视觉动画和 FPS / frametime 仍未验证。

### HB-093：Tencent 强化榜未按 `bestHeroes` 反向生成英雄候选

- 腾讯强化榜每条记录当前包含 `bestHeroes`，表示该强化关联的少量英雄 ID；2026-08-16 受限响应为 207 条强化，206 条含 6 个英雄、1 条含 3 个英雄，合计 119 个不同英雄 ID。该字段没有公开的稳定上限承诺，解析器因此只接受 1–6 个唯一正整数并 fail closed。
- 当前未发布实现把 `bestHeroes` 写入 Tencent snapshot：英雄的 `lowest_rank_runes` 仍作为前三项明确顺序；随后追加命中该英雄的强化，并按全局 `pick_rank` 排序。理由明确区分“腾讯英雄推荐”和“腾讯英雄适配榜·全局选取排名”，不把全局指标改写为英雄专属统计。
- 迁移到缓存 schema 2；旧 schema 不读取，需重新获取同日快照。本地 `51` files / `638` passed + `1` skipped、typecheck、lint、build、diff-check 已通过；v0.1.62 尚未完成 Windows / 真实接口更新、切源和用户同机显示，状态保持 `IN PROGRESS / UNVERIFIED`。

### HB-094：英雄榜缺少 OP/T1–T5 分组与点击详情出装

- 英雄榜现在按 OP、T1、T2、T3、T4、T5 分组。dtodo 使用现有 T1–T5 数据，并将当前 T1 中胜率最高的 3 名显示为 OP；Tencent 的 `tier` 是总体名次，因此按稳定名次分段，不把这些 UI 分组冒充腾讯官方 Tier 字段。
- 点击英雄后保留原有来源 / snapshot / 日期守卫，海克斯详情和独立 `data.dtodo` 出装通过两个 Main-only IPC 并行读取；无 dtodo Key 时只显示出装不可用，不阻断 Tencent 英雄 / 海克斯推荐。
- 本地 `51` files / `638` passed + `1` skipped、typecheck、lint、build、diff-check 已通过；v0.1.62 尚未完成 Windows / 真实 Tencent 同机显示、长中文和多分辨率验收，状态保持 `IN PROGRESS / UNVERIFIED`。

## 追溯

- 旧版逐条根因、行号、测试计数和发布流水仍保存在 `docs/PROJECT_MEMORY.md` 的 Git 历史以及对应 GitHub Actions / Release；压缩后不在当前文档重复粘贴。
- 新缺陷只在本文件增加一条和必要验收，不再把完整调试流水写回主记忆。
