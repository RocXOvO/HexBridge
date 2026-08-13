# WeGame 选人到游戏客户端交接验收

本清单用于验证 HB-020。它是发布后的真实环境门禁，不能由单元测试、Windows Actions、重命名进程或 packaged smoke 替代。

## 前置条件

- 使用 GitHub Releases 当前唯一正式版本；先在窗口左上角确认版本号。
- Windows 10/11 x64、国服 WeGame、海克斯大乱斗。记录 LCU 实际 queueId：公开配置通常为 `2400`，国服自定义房间已实机观测到 `3270`。
- 游戏使用无边框模式；设置中启用“选人浮窗”和“自动 OCR”。
- 测试前打开 HexBridge“诊断”页。诊断页只展示受控状态字段；不要另行发送 LCU `lockfile`、token、完整 champ-select session、PUUID、API Key、用户名或本地路径。

## 必须观察的状态链

诊断页的 `LCU match context transitioned` 行应按同一英雄、同一 `matchGeneration` 连续推进。具体 phase 可能因国服客户端时序略有不同，但必须满足以下不变量。

### 1. 选人确认

- `matchStage=selecting`
- `queueId=2400` 或已验证的国服 `3270`
- `championId` 是当前英雄
- `contextDecision=confirmed`

记录英雄名称 / ID 与 `matchGeneration`。

### 2. 最后等待与 LeagueClientUx 交接

允许出现下列一种或多种状态：

- `reason=transport-unavailable` 且 `contextDecision=retained-transport-handoff`
- `reason=auxiliary-request-failed` 且 `contextDecision=retained-partial-observation`
- phase 仍为 `ChampSelect`、session/current 已 `empty` 或 `error`，且 `contextDecision=retained-outgoing-champ-select`
- `phase=None` 或地区特有未知 phase，但 `matchStage=launching`

这一阶段必须继续满足：

- `queueId` 与选人确认时相同
- `championId` 与选人确认时相同
- `matchGeneration` 不变
- 主窗口仍显示当前英雄
- 选人浮窗显示“进入游戏中 / 本局英雄已保留”
- 英雄详情与推荐不得变成另一位英雄的数据

### 3. 游戏客户端启动

进入实际游戏后，应由可靠证据升级为 `matchStage=active`：

- LCU 报告 `InProgress` / `Reconnect`；或
- `reason=game-process` 检测到对应游戏进程；或
- `reason=augment-interface` 首次可靠识别三张海克斯。

必须继续使用同一英雄和同一 `matchGeneration`。选人浮窗此时按设计隐藏，OCR / 海克斯推荐继续运行。

### 4. 终局清理

`WaitingForStats / PreEndOfGame / EndOfGame / Lobby` 等可靠终局状态应产生 `contextDecision=cleared-terminal-phase`，随后：

- `matchStage=none`
- 当前英雄、详情与海克斯 overlay 被清理
- OCR 停止

### 5. 第二局换代

同一海克斯大乱斗 queueId 的下一次选人也必须开启新 generation：

- 新英雄未确定前不得短暂回显上一局英雄
- 新英雄确认后 `matchGeneration` 必须递增
- 新英雄详情替换旧英雄详情
- 上一局迟到的详情或 OCR 结果不得覆盖第二局

## 失败判据

出现任一情况即视为 HB-020 仍未关闭：

- 在可靠终局、明确异队列或真实下一局之前，`championId` 变为 `null`。
- 最后等待期间 `matchStage` 变为 `none`。
- 同一局交接期间 `matchGeneration` 提前改变。
- 当前英雄卡、详情、选人浮窗或 OCR 上下文消失。
- 第二局短暂显示上一局英雄，或旧详情 / OCR 覆盖新英雄。
- 进入对局后始终没有 `active`，F8 也提示“当前没有可识别的英雄 / 对局”。

## 脱敏报告模板

如果失败，请提供诊断页截图及以下信息，不要发送原始凭据文件：

```text
HexBridge 版本：
Windows 版本：
游戏窗口模式：无边框 / 其他
选中英雄：
失败发生在：选人最后等待 / 游戏进程启动 / 首次三卡 / 终局 / 第二局
主窗口当时显示：
选人浮窗当时显示：
诊断页最后 10 条 LCU match context transitioned 行：
F8 返回提示（如有）：
```

## 状态升级规则

- 报告问题的同一台机器完成“选人确认 → 游戏客户端启动”且上下文连续，HB-020 才可从 `IN PROGRESS` 升为 `FIXED / UNVERIFIED`。
- 再完成一整局三卡 OCR / 推荐、终局正确清理和第二局正确换代，才可标为 `VERIFIED`。
- 任何自动化测试或其他机器的成功都不能替代上述两项实机证据。
