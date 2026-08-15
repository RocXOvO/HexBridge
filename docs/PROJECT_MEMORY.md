# HexBridge 项目记忆索引

> 最后更新：2026-08-15
> 本文件只保存当前基线、模块入口和待办优先级。缺陷细节、稳定架构契约与发布规则分别维护，避免重复和历史流水膨胀。

## 当前基线

- 当前公开正式版：[v0.1.30](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.30)，Release ID `370978432`；annotated tag object `d87ad14ba67525adcd573d6cf1eabb5baba4b1d4` 解引用 tagged commit `1f172de0225cc6abde86fc04997442c9219acb51`。
- 正式 Windows run `31869511329` / job `94975841740` 首次即于 6m7s 成功：46 files / 499 tests、真实 4K OCR 185ms、packaged UI / bridge、差分 `1,200,432 / 199,280,687` bytes、五资产、v2 / root、public packaged 与滚动保留全过。这些不等于真实 WeGame、Wallpaper Engine / Steam 多库、DPI、性能或 installed updater 验证。
- GitHub 当前只保留 v0.1.26～v0.1.30 五个正式 Releases；v0.1.0～v0.1.30 共 31 个 tags 全部保留。本地 `release/` 为空。
- HB-058 腾讯 101 provider 已完成技术实现与审查（`P0=0 / P1=0`）。用户确认适用的书面授权已在仓库外取得；授权正文、身份、条款和附件均属保密信息，不写入源码、文档、日志或发布资产。
- v0.1.30 已正式发布；Release 说明准确列出相较 v0.1.29 的三项 Wallpaper Engine 变化，public v2 / root 为 `0.1.30 / 199280687` bytes，正式五资产完整。HB-057 / 058 均保持 `FIXED / UNVERIFIED`，不得用发布结果替代真实外部程序 / 接口与 WeGame 同机验收。
- v0.1.31 本地候选已将 `GAME_STARTING` 降为首次信号起固定 60s 的不续租短交接；同 authority 终止证据稳定 15s 后清理，真实 InProgress / game client / process / augment 证据则升级强交接。终审 `P0=0 / P1=0`，本地 46 files / 507 passed + 1 skipped、audit 0、真实 4K fixture 134ms、typecheck / lint / icon / retention / source bridge / UI / diff-check 全过；尚未 commit / push / Windows / tag / Release，HB-048 仍 `IN PROGRESS / UNVERIFIED`。

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

## 当前任务边界

- 仓库：`/Users/duchongyang/Documents/ChatGPT/LOL大乱斗`；远端 `RocXOvO/HexBridge`；branch `main`。
- 外部授权材料只在仓库外保管；任何提交、日志、缓存、Actions artifact 与 Release 都不得包含书信正文或可识别授权方的信息。
- iCloud Desktop / Documents 本地化、冲突副本和依赖污染由迁移协调任务统一执行；本任务不移动 / 删除目录，也不停止 Clash Verge。
- 本轮结束后不自行启动 build、`npm ci`、索引重建、迁移或后台开发任务。
