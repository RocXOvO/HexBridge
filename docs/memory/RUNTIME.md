# HexBridge 运行时与界面契约

> 最后更新：2026-08-16。只记录现行运行时边界；缺陷状态见 [DEFECTS.md](../DEFECTS.md)，真机操作见 [WEGAME_HANDOFF_RUNBOOK.md](../WEGAME_HANDOFF_RUNBOOK.md)。

## 产品与安全边界

- Windows 10/11 x64、国服 / WeGame、简体中文；已识别模式 `queueId ∈ {2400, 3270}`。
- LCU 只读；不换英雄、不交易、不写符文 / 装备集，不注入、不自动点击。
- 不做账号、云后端、遥测或战绩上传；不记录 / 落盘 token、API Key、PUUID、原始历史、完整 session 或完整屏幕截图。
- 默认不保存截图；诊断仅保留用户手动触发的三块标题裁切，最多 60 张。
- Electron 窗口必须 `contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`、`webSecurity=true`；拒绝任意导航和新窗口。

## 运行时切面

- `src/main/runtime.ts`：LCU、数据、OCR、推荐、窗口和 provider 状态聚合。
- `src/main/lcu/`：多来源凭据发现、只读 HTTPS / WebSocket、authority / gameId / generation 隔离。
- `src/main/ocr/`：标题 ROI、PaddleOCR / ONNX、显示器捕获；自动 OCR 默认关闭。
- `src/main/window-manager.ts`：主窗、选人伴随窗、96px compact、校准窗和 Lobby 背景呈现。
- `src/main/ipc.ts` / preload：按 sender 限制的结构化 IPC；设置、诊断截图清理、LCU 重发现及其他有副作用操作只能由当前 Main sender 发起，校准操作仅接受当前 calibration sender。Renderer 不得获取 Node、网络客户端、文件系统、凭据、任意 URL / path / query。

## 对局上下文

- 阶段为 `selecting / launching / active / none`；authority、gameId、generation、独立 `League of Legends.exe` 和正向 game-starting 证据用于区分交接、终局和同英雄第二局。
- 租约：active 最长 12h，游戏阶段 / 客户端 / 进程 / augment 强证据确认的 handoff 10min，弱 transport / 空 phase 15s。`GAME_STARTING` 只获得自首次信号起 60s 不续租短交接；同 authority 终止证据稳定 15s 后清理，当前强证据可在短租约到期边界优先升级。空 ChampSelect / None / partial 不续租。
- 非 Mayhem 在 normalize 边界清空 current / bench；同英雄跨队列也必须换代并清详情 / OCR / overlay。
- 当前英雄、详情、OCR、进程检查和 provider 请求都必须用 generation + champion + sequence 守卫迟到结果。

## OCR 与窗口

- 手动 OCR 为单帧；自动路径仅 active + eligible，先低分辨率 gate，再进行完整 OCR，single-flight、退避、同一卡面锁存。三卡渲染固定按槽位复用 DOM，只有 augmentId 变化的槽位播放入场动画；手动监测发现变化时也保持已有可靠三卡挂载，继续有界低成本探测，避免整组三卡退场重进。
- 截图后先恢复 HexBridge 窗口，重 OCR 不得持续隐藏主窗；模型线程限制不得与游戏抢占无界 CPU。
- 96px compact 位于三卡上方，透明、点击穿透、不聚焦；仅在可靠 3/3、游戏前台和卡面存在时显示。
- 卡面变化后用 100ms 窗口确认新指纹；recognizing 期间的单次短暂 `not-detected` 不撤下可靠三卡，只有连续两次 absence、刷新、禁用、终局或 45s expiry 清除。失焦只 pause / hide，回前台 cheap probe，不重做 full OCR。
- v0.1.57 已发布，把可靠 surface 的 absence 确认改为有界 700ms：前两次快速确认，第二次后等待剩余宽限再做第三次；error / pause 清除连续性计时，避免跨边界误撤和宽限期内高频截图。真实 WeGame 刷新动画仍未验。
- v0.1.56 已发布并延续 `ocrSchedule` 脱敏诊断：只暴露 `stopped / paused / waiting / recognizing / latched`、下一次延迟、cheap probe / full OCR 次数与最近 / 16 次滚动耗时峰值；换代、停止或旧 epoch 迟到时清零，不含截图、文本、坐标、进程标识或路径。同步保留 v0.1.55 packaged UI smoke 的 7 卡门禁，并修正跨无 Release 中间 tag 的累积发布说明。
- 选人伴随窗绑定权威 LeagueClientUx PID / HWND，使用 Win32 / DWM bounds 跟随，并在移动后保持非激活的 topmost/floating 层级。LCU transport PID 与 Ux 窗口 authority 必须分离；日志 / lockfile 连接只在同安装根唯一 Ux、明确 Ux lockfile 名称或观测 Ux 名称 + PID 精确一致时补齐，不能回退任意同名窗口。PID / HWND / 路径不进日志、RuntimeState 或 Renderer；synthetic fake 不是真实 WeGame / DPI / 多屏证据。
- 呈现诊断只允许有限枚举：窗口观察器 `stopped / starting / retrying / observing`，选人伴随窗与 96px 条只暴露资格、结果完整性、前台和显示决策。状态必须与实际 show / hide 共用输入并按转换去重；禁止 PID、HWND、路径、bounds、标题或截图进入 DTO / 日志。
- 主窗背景和动效必须服从 Main 自动 visual policy、eco、hidden / minimized / unfocused、InProgress 和 reduced-motion。

## Lobby 实时背景（HB-059）

- v0.1.28 已发布但默认关闭。仅 win32 + LCU connected + `matchStage=none` + Lobby / Matchmaking / ReadyCheck + Main live 页聚焦 / 可见 / 非最小化 + 非 reduced-motion / eco + authority PID / HWND 唯一时有资格。
- 每 5s 用 PrintWindow 精确截权威 LeagueClientUx；禁止整屏捕获、SetWindowPos 或注入。输入最多 `16,777,216` 像素，降到 `<=960x540`、强模糊 / 暗化、JPEG `<=500KB`。
- raw / frame 不进 RuntimeState、日志、磁盘或伴随窗。child + epoch、3s sanitize timeout、9s watchdog、single-flight、15/30/60s 退避；切页、失焦、最小化、eco、选人 / active、capture 事务、失败或退出立即停清。
- Windows fake HWND smoke 只证明窄链路；真实 WeGame Chromium、1080p～4K、100%～150% DPI、多屏、黑帧和性能仍 `UNVERIFIED`。

## Wallpaper Engine（HB-057）

- v0.1.30 已发布且默认关闭，仅 Main 保存 `{id}` 英雄 Profile / Playlist 模板和固定恢复目标；目标名、exe 路径和命令不进普通状态、非 Main IPC 或日志。
- 仅允许 Steam app 431960 的 canonical `wallpaper32/64.exe` 与已运行 CIM `ExecutablePath` 精确匹配，并以 `shell:false` 发送固定 `openProfile / openPlaylist`；不自动启动、关闭、嵌入或扫描第三方壁纸。
- 英雄切换 350ms 防抖并串行；离局、退出和更新安装前恢复用户指定目标。持久 lease 保证崩溃后下次启动先恢复；恢复失败 / 超时必须保留 lease，普通关窗只隐藏到托盘不恢复。
- 对局中用户手动更改壁纸不作为新恢复点；多屏建议 Profile，Playlist 不保证原条目 / 进度。真实 Windows / Steam 多库 / Wallpaper Engine CLI 仍 `UNVERIFIED`。

## 视觉现状

- v0.1.27 已减少非 eco 背景模糊；cinematic blur `1.5` / opacity `.66`，balanced blur `1` / opacity `.56`。
- eco 明确无 filter / transform，保留旧 scrim；launching / active / hidden 等仍由 Main policy 强制 eco。
- 真实亮 / 暗原画、长中文、100% / 125% / 150% DPI、CPU / GPU / frametime 仍待用户同机验收。
