# HexBridge 缺陷与验收索引

> 最后更新：2026-08-14。详细历史证据保留在 Git 历史、GitHub Actions 与 Releases；本文件只保留问题状态、当前边界和验收出口，避免 `PROJECT_MEMORY.md` 无限膨胀。

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
| HB-056 | 主背景清晰度 | IN PROGRESS（未实现） |
| HB-057 | Wallpaper Engine 接入 | IN PROGRESS（语义待定） |
| HB-058 | 腾讯 101 推荐 provider | IN PROGRESS（已审计、未实现） |
| HB-059 | Lobby 画面作为 HexBridge 背景 | IN PROGRESS（已登记、未实现） |
| HB-060 | 每次启动只读检查更新 | FIXED / UNVERIFIED（本地 v0.1.25 候选） |

## 当前重点验收

### HB-020 / 022：游戏交接

- 用户同机已证明 3270 选人到 active 的英雄上下文可连续保留；终局、紧接第二局、完整 OCR / 推荐仍未闭环。
- 真实回放必须记录脱敏 stage / generation / champion / transport 决策，禁止 token、路径和原始 session。

### HB-023 / 033：差分更新

- Releases 与 blockmap 自 v0.1.11 起保留；Windows synthetic Range 差分已通过。
- 仍需 installed N→N+1 实测旧 / 新 blockmap、HTTP Range / 206、网络字节、fallback、安装与重启。UI 的完整 EXE metadata 大小不等于实际传输量。

### HB-060：每次启动只读检查更新

- 本地 v0.1.25 候选在每次受支持打包版进程启动、updater adapter ready 后由 Main 以 0ms 调度一次 `check(false)`，并保留 6h 周期；无新版不显示入口，有新版才显示。检查不自动下载 / 安装，下载 / 安装仍由用户点击且沿用对局门禁。
- 根因边界：异步 `adapterLoader` 可能在 `stop()` 后才 resolve；`stopped` 门禁必须阻止迟到 adapter 复活启动检查或周期计时器。target 24 tests、完整 36 files / 372 passed + 1 skipped、typecheck / lint / source bridge / UI、真实 4K fixture 145ms、icon / retention / diff-check 与最终审查 P0 / P1 = 0 已通过。
- 状态仍为 `FIXED / UNVERIFIED`：当前仅本地候选，尚未 commit / push / Windows / tag / Release；公开 Latest 仍为 v0.1.24，不得预写未来结果。仍需 Windows packaged 覆盖每进程仅一次启动检查、6h 周期、stop-before-loader-resolve、最新版 / 离线 / 新版入口和对局下载 / 安装 fail-closed。

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
- 真实 3270 退出、刷新、选择卡牌、小窗出现 / 消失、点击穿透、中途启动、英雄专属统计与性能仍需用户同机逐项闭环。

### HB-056：背景清晰度

- 目标是减轻 HexBridge 英雄原画 blur / scrim，同时保证长中文、Tier、出装与推荐可读。
- cinematic / balanced / eco、hidden、InProgress、reduced-motion 和真实对局性能都必须验收，不能用持续重型滤镜换清晰度。

### HB-057：Wallpaper Engine

- 只允许用户显式启用、Main-only、固定参数 allowlist，不向 Renderer 暴露路径 / 命令 / 进程详情，不注入或分发第三方资产。
- 产品语义（检测、切换、英雄映射或独立窗口）尚未确定；未安装 / 未运行 / 崩溃 / 多屏 / 恢复所有权必须 fail-safe。

### HB-058：腾讯 101 推荐 provider

- 来源是腾讯官方 101 页面当前使用的未文档化 Web 接口，不是 Riot Developer API，也不是有 SLA / 许可承诺的公开官方 API；上线前必须审计站点条款。
- 设置新增严格枚举 `recommendationDataSource=dtodo|tencent101`，现有用户迁移默认 dtodo，禁止 auto / 静默回退 / 跨源拼接。出装仍是独立 data.dtodo 模块。
- Tencent101Adapter 必须 Main-only、固定 host / path / query、2 MiB、timeout / Abort、单 in-flight、按 `dtstatdate` 独立原子缓存与 stale；Renderer 不得提供 URL / query 或读取原始 `_fieldValues`。
- 英雄 `lowest_rank_runes` 只给有序推荐 ID；augment 接口的 pick / win 是全局口径。UI 必须写“全局选取率 / 全局胜率”，缺失为“暂无数据”而不是 0。
- 腾讯模式下选人、当前英雄、英雄详情、OCR 三卡、96px compact 与理由必须同源：命中英雄推荐的卡按列表顺序，未命中再按腾讯全局 rank；并列保留，缺数据无名次，绝不借 data.dtodo 排名。
- `source + championId + sequence + dataVersion/dtstatdate + generation` 任一变化即撤旧，迟到请求不能污染切源、换英雄或第二局。无 data.dtodo Key 时腾讯推荐仍可用，只有出装区域单独提示 Key。

### HB-059：Lobby 客户端画面背景

- 安全解释：仅把权威 LeagueClientUx 的 Lobby / Matchmaking / ReadyCheck 可见画面低频截帧，作为 HexBridge 自己等待页的内存背景；不嵌入、注入、覆盖或改写 League 客户端。
- 绑定权威 PID / 窗口且只截该窗口；单任务、硬超时、低频或事件触发、尺寸上限、只在内存使用，不保存诊断图、不记录画面 / 路径 / 标题 / 身份。
- HexBridge hidden / minimized / unfocused、LeagueClientUx 最小化 / 不可见、reduced-motion、进入 ChampSelect / launching / active、退出或捕获失败时立即停止并清除；不得让 Lobby 背景捕获延续到游戏或制造 GPU / DWM 峰值。
- UI 需保留足够 scrim 与文字对比，静态 fallback 明确；验收覆盖 1080p～4K、100%～150% DPI、多屏、窗口移动、隐私遮罩、CPU / GPU / 帧时间和无客户端状态。

## 追溯

- 旧版逐条根因、行号、测试计数和发布流水仍保存在 `docs/PROJECT_MEMORY.md` 的 Git 历史以及对应 GitHub Actions / Release；压缩后不在当前文档重复粘贴。
- 新缺陷只在本文件增加一条和必要验收，不再把完整调试流水写回主记忆。
