# HexBridge 发布与运维契约

> 最后更新：2026-08-16。只保留当前正式基线和可继续执行的发布规则；旧流水从 Git / Actions / Releases 追溯。

## 当前正式基线

- 当前候选版本为 `v0.1.63`，公开正式版仍为 `v0.1.62`；本候选只包含英雄榜 / 英雄详情 / data.dtodo 配置页的界面重构，尚未 commit / push / tag / Release。通过完整门禁和 Windows workflow 后才更新正式基线。

- 当前公开正式版为 `v0.1.62`：Tencent `bestHeroes` 英雄适配扩展、OP/T1–T5 英雄榜分组和独立英雄详情出装已随本版发布；真实 Tencent 接口和用户同机验收仍未完成。

- v0.1.62 workflow `31933785471`（重跑成功）/ job `95133301137`、Release ID `RE_kwDOT1eQs84WIP5E`、tag commit `bae79a96ae6a1ad32a5dd84e1e61c4156d3341ed`；Windows `51` files / `640` passed、真实 4K OCR `209ms`、packaged UI / bridge、差分、双通道、public packaged 与滚动保留全过。artifact `9260203991` / `473560262` bytes。首次 run 仅因稳定通道 100s 传播超时失败，幂等重跑成功。
- v0.1.62 五资产：EXE `199299489` / `ac5779c6e55b0f13311bf41b53e09fcc05407edebd9cfb1b5d7311b48ed9888c`；blockmap `201323` / `e2f849fd298bfba91b9e1ed51df8e4e1a7951be3b2b0a27a1b8854cb72cab2e1`；ZIP `274471161` / `e00a7b07aa9f33b2b44eb7aa14b4bf41a8255f58aa86bfe34b56a8faf9e7e003`；latest.yml `346` / `30996302e2c5ddf2f3885ecda17eceb57398532bbd74e3ca91ae8d7234dcd567`；SHA256SUMS `182` / `06460294520797118218e8f720e36b149803edbb8989e2bebecc7810592dbd2a`。v2/root 均为 `0.1.62`，滚动窗口为 v0.1.58–v0.1.62，v0.1.57 Release 已删除但 tag 保留。

- v0.1.61 已正式发布：新增 Windows 个人研究用的本机完整 `allgamedata` 采样；用户主动点击后写入本机私有目录，原文不进入 Renderer、IPC、日志、网络或 Release。真实 WeGame 字段仍待用户采样，不能写成 `VERIFIED`。

- 当前公开正式版为 `v0.1.61`。workflow `31924005321` / 成功重跑 job `95109448523`、Release ID `RE_kwDOT1eQs84WIGEP` 和 v2/root channel 均已成功；完整 Windows 门禁、public packaged 与五版滚动保留通过。探测固定 `127.0.0.1:2999`，2 MiB / 超时 / Main-only，不做后台轮询，也不把等级或事件当作选卡状态。
- v0.1.61 五资产：EXE `199297171` / `6fec3340dd7dce6ffd6ac060bd855dc9864c05e270b9a5c2074c7770b6b034bd`；blockmap `201302` / `365df8020e1f41870fc030c0e26b9cc67991765bab91140c63d5e74b70161f74`；ZIP `274468001` / `99c14912e20a31d7b915b2c6162d46e89611ebb5c43b2abb79cdabbe4daa3149`；latest.yml `346` / `9944304af1c9674f4a845eb4e0537ad13a3e82627fdf49307a4fb0d1db931f0f`；SHA256SUMS `182` / `b84142d2f7e193654698f5ffe1dba1e60c03e6f0788b380ca3b1d4e16f56ef2a`。artifact `9257432760` / `473553962` bytes。五版滚动保留为 v0.1.57～v0.1.61，本地 `release/` 为空。

- 上一版 `v0.1.56` 的五资产、稳定通道、packaged public 与五版滚动保留均通过；它保留 v0.1.54 的脱敏 OCR 调度诊断、v0.1.55 的 packaged UI smoke 7 卡门禁，并修正 Release notes 只以公开 Release 作为稳定基线、累计无 Release 中间 tag 变更。v0.1.54 仅有 tag、未创建公开 Release；不得把自动化门禁写成真实 WeGame 性能已验证。

- 历史 v0.1.60：[Release](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.60)，Release ID `RE_kwDOT1eQs84WIEMo`，publishedAt `2026-08-16T02:40:35Z`；tag 解引用 commit `86edf4fabb9fa031f096805623f4eef33119e296`。
- workflow `31922234089` / job `95104645401` 重跑成功；Windows 构建、全量测试、打包 UI / bridge、差分、public packaged 与滚动保留全过。artifact `9256857484` / `473550840` bytes（重跑产生的同名 artifact `9256765537` 也已存在）。
- 历史 v0.1.60 public v2 / root：两通道精确一致，packaged public 为 `updateAvailable=false`；随后已由 v0.1.61 接替公开基线。

- 历史记录：v0.1.50 的真实 WeGame / installed updater 仍不是自动化证据。

- public Latest：[v0.1.51](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.51)，non-draft / non-prerelease；Release ID `RE_kwDOT1eQs84WH3OK`，publishedAt `2026-08-15T21:20:22Z`。
- tagged commit `8c200033c3fa200fbf3d1c81e76738d8037d21a1`；正式 run `31908866405` 首次稳定通道传播超时后幂等重跑成功（成功 job `95071775049`）。Windows `50` files / `594` tests、真实 4K OCR `262ms`、packaged UI / bridge、差分、public packaged 与滚动保留全过；自动化不等于真实 WeGame、腾讯接口或 installed updater 验证。
- public v2 / root：version `0.1.51`；两通道精确一致，packaged public 为 `updateAvailable=false`。
- 正式资产：EXE `199291843` bytes / `759b5e972614d43feeef7a14039d8b604e1de5607d559faaa1e0ac8654a25083`；blockmap `201403` / `74d4644111fc484d14f2311a503fe495aea787d9c8ed0a361245fc2718e7c8e8`；ZIP `274460815` / `2f795677159476033cdf5ba2daab2a886711f1af5465e290613f40511a38a220`；latest.yml `346` / `d42d8675b6b4f996ded5125886b768f5fc40d7bc38491449a4d2eee715de64c4`；SHA256SUMS `182` / `12e1204eb794d627fc248cb98aae8c130ce8069d70bc10af86dd5be17b52886a`。
- 差分 smoke：available `0.1.52` synthetic candidate，基于 v0.1.50，传输 `1322307` bytes / full `199291920`，10 个 Range、3 个 redirect；五版滚动保留 v0.1.47～v0.1.51，tags 保留。本地 `release/` 为空。
- tagged commit `2ae206e75e341d74bb3ffafc33c57ba61e05c243`；正式 run `31907004019` 首次稳定通道传播超时后幂等重跑成功（成功 job `95067797353`）。Windows `50` files / `589` tests、真实 4K OCR `262ms`、packaged UI / bridge、差分、public packaged 与滚动保留全过；自动化不等于真实 WeGame、腾讯接口或 installed updater 验证。
- public v2 / root：version `0.1.50`；两通道精确一致，packaged public 为 `updateAvailable=false`。
- 正式资产：EXE `199291254` bytes / `a32e54338197d4c820dc9ff4a48a4a6a9c81334225d8004f7cd395f6b97c80b0`；blockmap `201346` / `7ae10fbf1af5aaefe49d0fe0659c14000004286a3b4cbd9d848c4f176f2d543a`；ZIP `274460169` / `aa082be360f80c47b76782e9512d613e6a3b253c850225aa378b65ce7d951ac1`；latest.yml `346` / `089b1ccd313a367d8c1910f08622a2949f566ce7a2551a394ff299079d3e7409`；SHA256SUMS `182` / `1d557f9731bfc8a6386155ec80ebc156594318ab710652e2e21c59793158836b`。
- v0.1.50 历史差分 smoke：available `0.1.51`，基于 v0.1.49，传输 `1299245` bytes / full `199291339`，10 个 Range、3 个 redirect；当时五版滚动删除 v0.1.45 Release，tags 保留。本地 `release/` 为空。

## 更新契约

- 受支持打包版每次进程启动、updater adapter ready 后，Main 以 0ms 调度一次只读 `check(false)`，并保留 6h 周期。
- 无新版不显示入口；检查不下载 / 安装。下载和安装仍须用户点击，对局中 fail closed，普通退出不安装。
- 差分静默 NSIS 可以不弹出交互安装器，但仍可触发 UAC / SmartScreen；不得绕过。Windows 资产尚无商业代码签名，必须持续说明。
- 安装版差分需本地旧 installer.exe 与新 / 旧 blockmap；缺失时安全回退 full installer。不能用 updateInfo 的完整包 size 冒充实际网络传输量。

## 发布契约

- 每个独立用户功能或缺陷修复在实现、审查与对应门禁完成后，必须递增一个 patch 版本并发布独立 GitHub Release；不把多个已完成目标长期滞留在 `main`，不合并无关目标，也不预写尚未发生的 tag、Release 或验证结果。
- `pack:win --publish never` 只构建；tag 与 package version 必须一致。只有完整本地门禁、最终审查和 Windows workflow_dispatch 都成功后才能考虑 tag。
- 正式 workflow 依次验证 Release / 五资产、v2 / root channel、packaged public，全部通过后才 prune。任一失败必须 fail closed。
- Contents / ref 权威回读与 raw exact poll 共用有界传播检查。public packaged 只在子进程非 0 整数退出且稳定码为 `HB_PUBLIC_UPDATE_SMOKE_VERSION_MISMATCH` 时重试；其他错误不误当传播延迟。
- GitHub 只保留最新 5 个严格 semver、non-draft / non-prerelease Release 及 assets；tags / source 永久保留。prune 不得传 `--cleanup-tag`，必须在首个 DELETE 前验证全部 remove IDs。
- 本地 `clean:release` 只能清空仓库根下精确 `release/`，拒绝符号链接 / 越界；每次只保留当次构建。
- Release notes 和客户端 highlights 共用逐版清单，按 `previous < entry <= current` 累计。跨多版升级必须列出全部中间版变更。
- Riot / 腾讯网站可访问不等于数据复用授权。外部 provider 必须在仓库外确认适用授权；授权材料及可识别信息不得进入源码、日志、Actions artifact 或 Release。腾讯 101 的适用书面授权已由用户在仓库外确认。

## 版本证据边界

- Windows hosted Actions、fake LeagueClientUx、synthetic updater、OCR fixture 只证明对应窄门禁，不是真实 WeGame、DPI、性能或 installed N→N+1 证据。
- 正式发布不能将任何用户实机问题自动升级为 `VERIFIED`。完成状态以 [DEFECTS.md](../DEFECTS.md) 为准。
- 当前 Node 20 Actions annotation 是非阻断维护项；不得冒充产品失败，也不得永久忽略。

## 任务与迁移边界

- 当前仓库：`/Users/duchongyang/Documents/ChatGPT/LOL大乱斗`，remote `RocXOvO/HexBridge`，branch `main`。
- iCloud Desktop / Documents 本地化、冲突副本和依赖污染由迁移协调任务统一处理；本任务不移动 / 删除目录，不停止 Clash Verge。
- 本轮结束后不自行启动新的 build、`npm ci`、索引、迁移或后台开发任务。
