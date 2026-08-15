# HexBridge 项目记忆索引

> 最后更新：2026-08-15
> 本文件只保存当前基线、模块入口和待办优先级。缺陷细节、稳定架构契约与发布规则分别维护，避免重复和历史流水膨胀。

## 当前基线

- 当前公开正式版：[v0.1.37](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.37)，Release ID `371062308`；annotated tag object `ef98bf363d142afb6e2f192e909bcce993bd2105` 解引用 tagged commit `a6b443a4fb36eb02c2233a01b2b4fc873ba01c9d`。
- 正式 run `31888393706` attempt 1 创建 Release / 五资产后因 GitHub Raw 100s 未传播而 fail closed，且未 prune；attempt 2 run `31888761186` / job `95021761447` 于 5m29s 幂等成功且未重发资产 / channel：Windows 48 files / 534 tests、真实 4K OCR 260ms、packaged UI / bridge、v2 / root、public packaged 与滚动保留全过。正式复跑 artifact `9248024858` 为 `473,521,864` bytes。自动化不等于真实 WeGame、DPI、性能或 installed updater 验证。
- GitHub 当前只保留 v0.1.33～v0.1.37 五个正式 Releases；v0.1.0～v0.1.37 共 38 个 tags 全部保留。本地 `release/` 为空。
- HB-058 腾讯 101 provider 已完成技术实现与审查（`P0=0 / P1=0`）。用户确认适用的书面授权已在仓库外取得；授权正文、身份、条款和附件均属保密信息，不写入源码、文档、日志或发布资产。
- v0.1.34 已正式发布，仅修复 HB-067：日志 / lockfile 凭据与 transport PID 分离后，以同安装根唯一 Ux、明确 lockfile 名称或观测进程名 + PID 精确一致补齐 Main-only 窗口 authority；缺 authority 的可信对局每 10s 低频补元数据，PID 单独变化也触发窗口同步。多进程、跨根或不明确情况 fail-closed，PID / 启动时间 / 路径不进日志、RuntimeState 或 Renderer。Release 说明准确列出相较 v0.1.33 的两项变化；public v2 / root 为 `0.1.34 / 199282299` bytes，五资产完整。HB-067 保持 `FIXED / UNVERIFIED`，等待真实 log-only / lockfile 国服客户端复测。
- v0.1.35 已正式发布，仅实现 HB-068：诊断页新增选人伴随窗、96px 推荐条与窗口观察器的有限枚举状态，状态转换去重记录且不含 PID、HWND、路径、坐标或标题。Release 说明准确列出相较 v0.1.34 的两项变化；public v2 / root 为 `0.1.35 / 199283491` bytes，五资产完整。HB-068 保持 `FIXED / UNVERIFIED`，等待真实 WeGame 复现时验证诊断有效性。
- v0.1.36 已正式发布，仅修复 HB-069：腾讯当前强化榜的极小选取率使用科学计数法，静态海克斯目录根节点为数组；旧解析器依次误拒两者。真实四端点受限验证已达 `ready / 20260814 / 172 英雄 / 246 强化`；正式 EXE `199283652` bytes，v2 / root 精确为 `0.1.36`，五资产完整。HB-069 保持 `FIXED / UNVERIFIED`，等待用户 Windows 客户端切源复测。
- v0.1.37 已正式发布，仅实现 HB-070：实时助手右上角只显示当前推荐来源名称，不再附带统计日期、dataVersion、“未就绪”或缓存后缀；详情、英雄榜、设置和诊断中的日期 / stale / error 保持不变。正式 EXE `199283718` bytes，v2 / root 精确为 `0.1.37`，五资产完整。HB-070 保持 `FIXED / UNVERIFIED`，等待用户 Windows 客户端视觉确认。
- v0.1.38 Windows 候选仅修复 HB-071：单英雄详情失败不再污染全局 data.dtodo 状态；目录 429 保留同源旧缓存但不自动重试；离线按 15s / 60s / 5min 有界恢复；正文统一 10s / 2MiB；同 dataVersion 目录不可变且新版本仅在文件、pointer 全提交后切 active。终审 `P0=0 / P1=0`；product commit `749635b9521cf1b074de62d281c92fddb9ca37df` 已 push，Windows run `31890026596` / job `95024824003` 于 5m41s 成功：48 files / 548 tests、4K 306ms、EXE `199284621` bytes、packaged UI / bridge、synthetic 0.1.39 差分 `1135282 / 199284621` 与 artifact `9248356706` 全过。tag-only 发布步骤按预期跳过；尚无 v0.1.38 tag / Release，公开 Latest 仍为 v0.1.37。

## 记忆模块

- [运行时、LCU、OCR 与窗口](./memory/RUNTIME.md)：比赛上下文、英雄状态、OCR、96px 提示条、伴随窗、Lobby 背景和视觉性能。
- [数据源、推荐与隐私](./memory/DATA_AND_PRIVACY.md)：data.dtodo、腾讯 101、本地战绩、缓存、联网与敏感信息边界。
- [发布、更新与运维](./memory/RELEASE_AND_OPERATIONS.md)：当前 Release、差分更新、五版滚动、发布恢复、证据边界与迁移约束。
- [缺陷与验收状态](./DEFECTS.md)：HB 编号、状态、真实用户报告和仍需完成的验证。
- [WeGame 交接实机手册](./WEGAME_HANDOFF_RUNBOOK.md)：同机复现、脱敏证据和验收步骤。

## 记忆维护规则

- 新故障只写入 `DEFECTS.md`；主索引不复制根因、测试流水或历史发布日志。
- 稳定契约按主题写入 `docs/memory/`；旧过程从 Git 历史和 GitHub Actions 追溯。
- 只保留现行口径和最新可信证据；候选、Windows CI、fake bridge 与 synthetic updater 不得冒充用户同机 `VERIFIED`。
- 不记录 token、API Key、PUUID、用户名、完整路径、原始 session / history、完整屏幕截图或腾讯压缩原始 payload。
- 每个已经实现、审查并通过对应门禁的独立用户功能或缺陷修复，都单独递增 patch 版本并发布 GitHub Release；不得把多个已完成目标长期堆在 `main`，也不得在门禁未完成时预写版本或发布结果。

## 当前优先级

1. HB-058：完成真实 Windows 下的腾讯接口、切源、当前英雄 / OCR / 紧凑条同源与 stale / error 显示验收；不以书面授权或 Release 成功替代技术验证。
2. 真实 WeGame 验收：`GAME_STARTING` 后取消 / 启动、终局 / 第二局、快捷键、OCR 刷新、96px 生命周期、LeagueClientUx 跟随、Lobby PrintWindow、DPI 与性能。
3. HB-057 Wallpaper Engine：v0.1.30 已按用户确认的 Profile / Playlist 英雄切换与离局恢复语义正式发布；待真实 Wallpaper Engine / Steam 多库实机验收。
4. HB-056、HB-059、HB-060、HB-064 继续保持各自 `IN PROGRESS / UNVERIFIED` 或 `FIXED / UNVERIFIED`，直到对应真实环境门禁完成。
5. HB-067：完成 Windows packaged 与真实 log-only / lockfile 国服客户端验收；不得用路径不明的任意 LeagueClientUx 回退。
6. HB-068：发布后用真实 WeGame 复现伴随窗 / 96px 条缺失或错位，并以脱敏枚举定位资格、authority、观察、前台和 3/3 结果边界。
7. HB-069：在 v0.1.36 正式版完成用户 Windows 客户端切源复测；发布成功不代替真实接口与 UI 验证。
8. HB-070：在 v0.1.37 正式版完成用户 Windows 客户端视觉确认。
9. HB-071：完成 v0.1.38 Windows 候选与正式发布后，用 installed 客户端验证暂时断网、429、详情失败和恢复状态；Key / 响应正文不得进入日志或文档。

## 当前任务边界

- 仓库：`/Users/duchongyang/Documents/ChatGPT/LOL大乱斗`；远端 `RocXOvO/HexBridge`；branch `main`。
- 外部授权材料只在仓库外保管；任何提交、日志、缓存、Actions artifact 与 Release 都不得包含书信正文或可识别授权方的信息。
- iCloud Desktop / Documents 本地化、冲突副本和依赖污染由迁移协调任务统一执行；本任务不移动 / 删除目录，也不停止 Clash Verge。
- 本轮结束后不自行启动 build、`npm ci`、索引重建、迁移或后台开发任务。
