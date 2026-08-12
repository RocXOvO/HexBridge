# HexBridge

HexBridge 是面向 Windows 10/11 x64、国服 / WeGame、简体中文的海克斯大乱斗个人实验助手。它以只读方式连接本机 League Client Update（LCU），在选人阶段整理当前英雄和备战席的 Tier / 胜率，并在对局中通过屏幕裁切与本地 OCR 比较实际出现的三张海克斯。

> 当前版本：`v0.1.7`。这是个人实验工具，不受 Riot Games、腾讯游戏或 ARAMGG 认可、赞助或支持。强化胜率展示和代替玩家决策的产品可能不符合 Riot 当前产品政策；扩大分发前必须重新评估合规性与数据授权。

## 能力

- 只读 LCU：发现进程参数、相邻 lockfile、手动目录与客户端日志；WebSocket 监听加 1 秒轮询兜底。
- 仅在 `queueId=2400` 激活；不换英雄、不交易、不改符文或装备集，也不发送任何 LCU 写请求。
- 当前英雄固定置顶，备战席按 Tier、胜率、英雄 ID 排序并标记总体首选。
- 使用用户自己的 `data.dtodo.cn` API Key；Key 通过 Electron `safeStorage` 加密，Renderer 永远拿不到明文。
- 目录按 `dataVersion` 原子缓存；401、429、断网时保留旧缓存并标记状态。
- 单英雄详情按需获取。海克斯只保留名称、图标、稀有度、描述和官方 `rank/tier`，不会保存或显示海克斯胜率、胜局或场次。
- 对局中 750ms 低成本界面检测，命中后串行运行 PP-OCRv6 small；三张均达到 90% 匹配才自动弹窗，F8 可强制重试。
- LeagueClientUx 向游戏进程交接时保留本局英雄与详情；游戏进程或可靠三卡识别会确认已入局，LCU 短暂断开不会停止 OCR。
- 主窗口、选人浮窗、点击穿透的顶部三卡浮窗，以及 1080p / 2K / 4K / DPI 自适应拖框校准。
- 电影、均衡、省电三档；对局浮窗固定走省电渲染路径，支持 `prefers-reduced-motion`。

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
- 默认按主显示器与归一化坐标识别。若标题区域偏移，在“设置 → 目标显示器”中选择显示器并启动拖框校准。
- “三张标题”是游戏内同时出现的左、中、右三张海克斯卡片顶部名称。启动校准后 HexBridge 会隐藏主窗口，并在目标显示器截图上依次框选；不要框描述正文或图标，Esc 可随时退出。
- F8 只会重新截图和识别，不会向游戏发送键鼠或选择操作。
- 默认不保存截图。启用诊断截图后也只在 F8 手动识别时保存三个标题裁切区，最多保留 60 张，目录位于本地用户数据目录；可在诊断页一键清除。

OCR 模型不提交到 Git。`npm run ocr:models` 从固定的 Hugging Face commit 下载 PP-OCRv6 small ONNX 检测 / 识别模型和匹配字典，并在复用或下载时强制校验 SHA-256；打包工作流会把校验通过的文件作为外部只读资源带入应用。

若已启动国服客户端但仍显示“等待客户端”，先在实时助手点击“立即重新检测”。仍未连接时，可在“设置 → 游戏目录”填写包含 `LeagueClient.exe` 或 `lockfile` 的英雄联盟根目录，再点“保存并检测”；诊断页会显示 CIM、Get-Process、手动目录、常见安装位置和候选只读探测的脱敏结果。

## 架构与安全

```text
LCU GET / WebSocket ─┐
data.dtodo.cn API ───┼─ Electron Main ── validated IPC ── Vue Renderer
desktopCapturer/OCR ─┘       │
                             ├─ safeStorage（API Key）
                             └─ versioned JSON cache
```

- Renderer：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、CSP、`webSecurity: true`。
- Preload：只暴露类型化业务命令，不暴露文件系统、网络客户端或密钥。
- LCU：代码内显式 GET allowlist；日志过滤 token、Key、PUUID 风格标识及含凭据 URL。
- 无账号系统、云后端、遥测、战绩上传、客户端注入或静默更新。客户端内更新仅在用户分别确认下载和重启安装后执行。

主要目录：

- `src/main/lcu`：LCU 凭据发现、只读客户端和 session 归一化。
- `src/main/ocr`：显示器裁切、界面门控和 PaddleOCR 推理。
- `src/main/data-service.ts`：Key 鉴权、上游清洗和版本缓存。
- `src/shared/recommendations.ts`：可独立测试的英雄 / 海克斯排序规则。
- `src/renderer`：四个隔离窗口共用的 Vue 界面。

## 构建与发布

在 Windows x64：

```powershell
npm ci
npm run ocr:models
npm run lint
npm run pack:win
```

产物位于 `release/`，包括 NSIS 安装包和 ZIP 便携版。`.github/workflows/release.yml` 在 `v*` 标签上构建、测试并为 GitHub Release 生成 `SHA256SUMS.txt`；不执行静默安装。

当前仓库未配置商业 Windows 代码签名证书，`v0.1.7` 会显示“未知发布者”，也可能触发 SmartScreen；发布给其他人前应在 GitHub Actions 中配置签名证书。客户端内更新会使用 `latest.yml` 的 SHA-512 校验下载文件，但这不等同于发布者身份签名。不要通过关闭系统安全机制来绕过提示。

## 客户端内更新

- 打包版在启动约 60 秒后通过固定的 GitHub Raw 稳定通道检查最新正式版，再下载对应 GitHub Release 中的版本化安装包；也可在“设置 → 客户端更新”手动检查。
- `v0.1.5` 和 `v0.1.6` 仍使用旧 GitHub Release 发现路径；该路径在部分网络下会被重置或限流。这两个版本需手动安装 `v0.1.7` 一次，之后才使用新稳定通道。
- 只有点击“确认下载”才会下载；下载完成后还需要再次确认重启安装。
- 海克斯大乱斗选人、启动、对局和重连流程中均禁止安装，关闭 HexBridge 也不会自动安装已下载更新。
- 公开更新通道不会在客户端中打包 GitHub token；通道只允许 `RocXOvO/HexBridge` 正式、非预发布 Release 的 HTTPS 资产，并继续验证 SHA-512。

## 数据、政策与许可

- 英雄 Tier / 胜率与英雄专属海克斯官方排序来自 `data.dtodo.cn` 公布的数据接口；接口文档说明相应快照主要来自腾讯国服公开数据。HexBridge 只展示本文明确列出的字段。
- 英雄原画 / 图标由 Riot Data Dragon 提供；具体版本与使用条件受 Riot 相关政策约束。
- 参考 [Riot Developer Portal 的 League of Legends 政策](https://developer.riotgames.com/docs/lol)；使用者自行承担账号与政策风险。
- 项目采用 [PolyForm Noncommercial 1.0.0](LICENSE.md)，属于 source-available，不是 OSI 定义的开源软件。
- Mineradio 仅是暗色层次、克制动效与性能思路的设计灵感。没有复制其 GPL-3.0 代码、品牌、素材或具体原创视觉表达，见 [NOTICE.md](NOTICE.md)。
