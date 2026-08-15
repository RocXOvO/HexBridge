# HexBridge

HexBridge 是面向 Windows 10/11 x64、国服 / WeGame、简体中文的海克斯大乱斗个人实验助手。它以只读方式连接本机 League Client Update（LCU），在选人阶段整理当前英雄和备战席的 Tier / 胜率，并在对局中通过屏幕裁切与本地 OCR 比较实际出现的三张海克斯。

> 当前公开正式版：`v0.1.40`，以 GitHub Releases 的 Latest 标记为准。这是个人实验工具，不受 Riot Games、腾讯游戏或 ARAMGG 认可、赞助或支持。强化胜率展示和代替玩家决策的产品可能不符合 Riot 当前产品政策；扩大分发前必须重新评估合规性与数据授权。

## 能力

- 只读 LCU：发现进程参数、相邻 lockfile、常见安装位置与客户端日志；WebSocket 监听加 1 秒轮询兜底。
- 仅在已验证的海克斯大乱斗队列中激活：公开 / 国际配置 `queueId=2400`，以及国服 WeGame 实机观测到的 `queueId=3270`（包含自定义房间样本）；不换英雄、不交易、不改符文或装备集，也不发送任何 LCU 写请求。
- 当前英雄固定置顶，备战席按 Tier、胜率、英雄 ID 排序并标记总体首选。
- “英雄与海克斯推荐来源”默认使用“腾讯英雄联盟数据站”，也可明确切换到 `data.dtodo`；不提供含糊的自动模式，也不会在来源失败时静默混用另一边的数据。已经保存过的合法来源选择不会因升级被强制改写。
- `data.dtodo` 使用用户自己的 API Key；Key 通过 Electron `safeStorage` 加密，Renderer 永远拿不到明文。腾讯来源无需该 Key，但使用的是腾讯 101 官网当前采用、未文档化且可能变化的 Web 统计接口。
- 两套来源使用独立的版本 / 日期、状态和原子缓存；401、429、断网或格式漂移时只允许同来源旧缓存并明确标记 stale。
- 单英雄详情按需获取。data.dtodo 保留官方 `rank/tier` 和英雄专属 `pickRate`；腾讯模式按英雄的推荐 ID 顺序展示，并把强化榜数值明确标为“全局选取率 / 全局胜率”，不会冒充该英雄专属统计或借用 dtodo 名次。
- 实时助手同时显示该英雄首套 iesdev 大乱斗出装参考；出门装、核心装和情境装备始终来自同一条 `builds` 流派，不混用旧 `build` 或伪造六件完整出装，也不增加额外 API 请求。
- 自动 OCR 默认关闭；显式开启后每 2 秒只抓 960px 小图门控，命中后才抓最高 1440px 图像并串行运行 PP-OCRv6 small。三张均达到 90% 匹配后在实时助手中显示，全局快捷键可自定义。
- LeagueClientUx 向游戏进程交接时保留本局英雄与详情；游戏进程或可靠三卡识别会确认已入局，LCU 短暂断开不会停止 OCR。
- 可选“队友与对手近期状态”个人实验默认关闭：仅当 LCU 能唯一确认本方与对方阵营，并按阶段满足身份可见性门禁时，才在 Main 内存中分别读取 4 位队友与 5 位对手最多 20 场可用 LoL 对局；单组身份不完整只禁用该组，全局身份歧义则全部拒绝。少于 12 个有效样本不生成评分或三档标签。点击英雄头像仅显示本局内存中已清洗的英雄、胜负、K/D/A 与时长；近期样本不限定队列，不上传、不落盘，也不向 Renderer 暴露 PUUID、对局 ID 或原始载荷。
- 主窗口、会跟随 LeagueClientUx 移动的选人浮窗，以及 1080p / 2K / 4K / DPI 自适应拖框校准。识别结果同时写入实时助手和三卡上方 96px 高的点击穿透小窗；不创建覆盖游戏的全屏窗口。
- 可选的等待页客户端背景默认关闭；仅在 Lobby、匹配与接受对局阶段精确绑定权威 LeagueClientUx 窗口，每 5 秒低频截取一帧，并在 Main 内降采样、强模糊和暗化。画面只存在于内存，失焦、切页、最小化、低动态、选人或进入游戏会立即停止并清除。
- 可选 Wallpaper Engine 英雄桌面联动默认关闭；用户配置英雄 ID 命名模板和离局恢复 Profile / Playlist 后，HexBridge 只通过 Wallpaper Engine 的固定 CLI 命令切换桌面，不自动启动或关闭第三方程序。
- 内部按场景自动调度电影、均衡、省电三条渲染路径，支持 `prefers-reduced-motion`。

## 本地开发

需要 Node.js 22+。macOS / Linux 可以开发和预览界面，但 LCU 发现、`safeStorage` 的 Windows 行为和 Windows 安装包必须在 Windows 10/11 x64 上验收。

```bash
npm install
npm run ocr:models
npm test
npm run lint
npm run typecheck
npm run test:bridge
npm run test:ui
npm run dev
```

浏览器视觉预览必须显式设置 `VITE_HEXBRIDGE_DEMO=true` 后启动开发服务。演示数据只在开发构建中启用，不会写入用户配置；正式构建缺少 preload 安全桥接时会停止业务功能并明确报错，不会回退到演示数据。

## API Key

1. 打开 [data.dtodo.cn/developer.html](https://data.dtodo.cn/developer.html)，使用 GitHub 登录并创建 `hx_live_...` Key。
2. 在 HexBridge 的“设置 → 数据服务”中粘贴 Key。
3. 客户端通过无 credits 消耗的 `HEAD` 请求验证，再加密保存。

正式第三方接口为：

- `GET /api/v1/zh-CN/config.json`：公开、0 credit。
- `HEAD /api/v1/zh-CN/champions.json`：验证 Key、0 credit。
- `GET /api/v1/zh-CN/champions.json` 和 `augments.json`：每次各 1 credit，只在数据版本变化时更新。
- `GET /api/v1/zh-CN/champions/{id}.json`：2 credits，仅当英雄成为当前选择且本地无同版本缓存时调用。

完整字段与额度以 [上游 API 文档](https://data.dtodo.cn/api/v1/zh-CN/docs/cf-data-api.md) 为准。ARAMGG 官方 Electron 客户端使用的 `/api/client/v1/*` 是其客户端通道；HexBridge 不依赖该通道。

## 游戏与 OCR 设置

- 游戏必须使用“无边框”模式。V1 不保证独占全屏可捕获。
- 默认按主显示器与归一化坐标识别。若卡片位置偏移，在“设置 → 目标显示器”中选择显示器并启动拖框校准。
- 校准时依次框住左、中、右三张完整卡片；HexBridge 会自动提取每张卡片中部的中文标题带，并在保存前实际验证 3/3 标题均能匹配。Esc 可随时退出。
- 默认快捷键 F8，可在设置页录制为 F1–F12 或 Ctrl/Alt/Shift 组合键。快捷键只会截图和识别，不会向游戏发送键鼠或选择操作。
- “等待页客户端背景”是显式选择的本地实验：不抓整屏、不保存到诊断目录、不上传，也不把客户端画面发送给伴随窗；无法唯一确认权威客户端 PID/HWND 时保持静态背景。
- Wallpaper Engine 联动仅支持 Steam app 431960 安装下的 `openProfile` / `openPlaylist`，且 Wallpaper Engine 必须已运行。多屏恢复建议配置 Profile；Playlist 不保证恢复到原条目或播放位置。对局中手动更改的壁纸不会被当作新恢复点；离局、安装更新或退出时仍会尝试恢复用户指定的固定目标。详见 [Wallpaper Engine 官方命令行文档](https://help.wallpaperengine.io/en/functionality/cli.html)。
- 开启“三卡上方推荐”后，小窗只在游戏前台且本局上下文有效时显示；手动识别成功当刻保存三卡指纹，选卡、切屏、终局或换局会撤下。卡牌刷新时需连续两帧标题指纹稳定变化才会再做一次完整 OCR。
- 默认不保存截图。启用诊断截图后也只在手动识别时保存三个标题裁切区，最多保留 60 张，目录位于本地用户数据目录；可在诊断页一键清除。

OCR 模型不提交到 Git。`npm run ocr:models` 从固定的 Hugging Face commit 下载 PP-OCRv6 small ONNX 检测 / 识别模型和匹配字典，并在复用或下载时强制校验 SHA-256；打包工作流会把校验通过的文件作为外部只读资源带入应用。

HexBridge 会在后台通过 CIM、Get-Process、lockfile、常见安装位置和客户端日志持续发现国服客户端；候选细节只进入脱敏诊断，不在普通界面显示历史端口或路径。

## 架构与安全

```text
LCU GET / WebSocket ─┐
recommendation providers ┼─ Electron Main ── validated IPC ── Vue Renderer
desktopCapturer/OCR ─┘       │
                             ├─ safeStorage（API Key）
                             └─ versioned JSON cache
```

- Renderer：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、CSP、`webSecurity: true`。
- Preload：只暴露类型化业务命令，不暴露文件系统、网络客户端或密钥。
- LCU：代码内显式 GET allowlist；日志过滤 token、Key、PUUID 风格标识及含凭据 URL。
- 无账号系统、云后端、遥测、战绩上传或客户端注入。点击标题栏的小型更新按钮后，Main 会完成检查、下载和重启更新；对局中不会执行。Windows 仍可能显示系统级 UAC 或 SmartScreen。

主要目录：

- `src/main/lcu`：LCU 凭据发现、只读客户端和 session 归一化。
- `src/main/ocr`：显示器裁切、界面门控和 PaddleOCR 推理。
- `src/main/data-service.ts`：data.dtodo Key 鉴权、上游清洗、出装和版本缓存。
- `src/main/tencent101-adapter.ts`：腾讯 101 固定端点、压缩字段清洗与独立日期缓存。
- `src/main/wallpaper-engine.ts`：Wallpaper Engine 固定 Steam 安装发现、受限 CLI、对局切换与崩溃恢复租约。
- `src/main/recommendation-coordinator.ts` / `src/shared/recommendations.ts`：来源隔离、英雄详情与可独立测试的三卡排序规则。
- `src/renderer`：主窗口、选人面板、三卡窄条与校准窗口共用的 Vue 界面。

## 构建与发布

在 Windows x64：

```powershell
npm ci
npm run ocr:models
npm run lint
npm run pack:win
```

真实国服 WeGame 的选人→游戏客户端交接不能由 CI 代替。发布后请按 [WeGame 交接验收清单](docs/WEGAME_HANDOFF_RUNBOOK.md) 复测最后等待、游戏启动、三卡 OCR、终局和第二局；清单同时规定了脱敏状态链与问题关闭标准。

产物位于本机 `release/`，包括 NSIS 安装包和 ZIP 便携版。每次本地打包前会清空该仓库的本地产物目录，因此本机只保留本次最新构建。GitHub 在新正式版完整发布、公开通道与安装包检查全部成功后，只保留最新 5 个正式 Release 及其资产；更旧的 Release / 资产会删除，但所有 Git tag 与源码历史永久保留。`.github/workflows/release.yml` 在 `v*` 标签上构建、测试并生成 `SHA256SUMS.txt`；构建流程不执行安装。

当前仓库未配置商业 Windows 代码签名证书，`v0.1.40` 正式安装包仍会显示“未知发布者”，也可能触发 SmartScreen；发布给其他人前应在 GitHub Actions 中配置签名证书。客户端内更新会使用 `latest.yml` 的 SHA-512 校验下载文件，但这不等同于发布者身份签名。不要通过关闭系统安全机制来绕过提示。

## 客户端内更新

- 打包版每次启动都会通过固定的 GitHub Raw 稳定通道检查一次最新正式版；这一步只读取更新信息，不会自动下载或安装。发现新版后可从标题栏的小型更新按钮一键完成。
- `v0.1.5` 和 `v0.1.6` 仍使用旧 GitHub Release 发现路径；该路径在部分网络下会被重置或限流。这两个版本需从发布页手动安装当前最新正式版一次，之后才使用新稳定通道。
- 点击一次更新按钮即授权本次检查、下载与重启更新；差分或校验通过的完整包均以 NSIS 静默模式执行，应用不会再弹出二次确认。
- 海克斯大乱斗选人、启动、对局和重连流程中均禁止安装，关闭 HexBridge 也不会自动安装已下载更新。
- 静默安装不会绕过 Windows 的 UAC、SmartScreen 或签名校验；当前未签名版本仍可能出现系统安全提示。
- 公开更新通道不会在客户端中打包 GitHub token；通道只允许 `RocXOvO/HexBridge` 正式、非预发布 Release 的 HTTPS 资产，并继续验证 SHA-512。
- 最近 5 个正式版保留差分所需资产；更旧版本跨越保留窗口时可能安全回退为完整安装包。安装完成后的“改进内容”会按版本顺序累计列出所有中间版本变化，不会只显示最后一版。

## 数据、政策与许可

- 可选的 `data.dtodo` 来源提供英雄 Tier / 胜率、英雄专属海克斯排序与独立出装；接口文档说明相应快照主要来自腾讯国服公开数据。
- 默认的“腾讯英雄联盟数据站”来源使用 [腾讯 101 海克斯榜](https://101.qq.com/?ADTAG=cooperation.glzx.web#/rankings/hextech) 页面当前采用的未文档化 Web 接口。它不是 Riot Developer API，也没有公开版本或 SLA；HexBridge 仅以低频 Main 请求读取、严格清洗并标注统计日期，不把它与 data.dtodo 无标签混合。适用授权材料在仓库外保密保存，不随源码或发布资产分发。
- 英雄原画 / 图标由 Riot Data Dragon 提供；具体版本与使用条件受 Riot 相关政策约束。
- 参考 [Riot Developer Portal 的 League of Legends 政策](https://developer.riotgames.com/docs/lol)；使用者自行承担账号与政策风险。
- “队友与对手近期状态”是默认关闭的本机个人实验，不是 Riot 官方段位、MMR 或胜负预测。它使用不受官方支持、可能随客户端补丁变化的 LCU 历史接口；选人/启动阶段只接受选人会话允许的可见身份，进入游戏后只接受游戏会话允许的公开或缺省可见性，隐藏、未知、重复、自我归队或队伍人数歧义均失败关闭。全局历史请求并发不超过 2，切局、断线、禁用或退出会取消请求并清除本局随机详情键；自定义局也不会被描述为 Riot 已批准的分发场景。该能力可能触及 Riot 关于竞争优势、身份可见性和替代技能评级的政策边界，扩大分发前必须移除或重新完成政策审核。
- 项目采用 [PolyForm Noncommercial 1.0.0](LICENSE.md)，属于 source-available，不是 OSI 定义的开源软件。
