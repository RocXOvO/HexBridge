# HexBridge 发布与运维契约

> 最后更新：2026-08-16。只保留当前正式基线和可继续执行的发布规则；旧流水从 Git / Actions / Releases 追溯。

## 当前正式基线

- 当前候选为 `v0.1.59`；公开正式版为 `v0.1.58`。v0.1.58 的 workflow `31918661001` / job `95095618306`、Release ID `371198640` 和 v2/root channel 均已成功；本候选移除整组三卡外层过渡并保留短暂隐藏期间的槽位签名。Windows / WeGame 视觉与帧时间仍待验，不能把本地门禁或审查写成真实用户验证。
- 当前正式版本为 `v0.1.58`，已完成 commit / push / tag / Release / 双通道 / packaged public check / 五版滚动保留；本版完成单卡增量 OCR、1.8s absence lease 和幂等 compact sync。真实 WeGame 刷新动画仍未验，不能写成 `VERIFIED`。

- 上一版 `v0.1.56` 的五资产、稳定通道、packaged public 与五版滚动保留均通过；它保留 v0.1.54 的脱敏 OCR 调度诊断、v0.1.55 的 packaged UI smoke 7 卡门禁，并修正 Release notes 只以公开 Release 作为稳定基线、累计无 Release 中间 tag 变更。v0.1.54 仅有 tag、未创建公开 Release；不得把自动化门禁写成真实 WeGame 性能已验证。

- public Latest：[v0.1.57](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.57)，Release ID `371188111`，publishedAt `2026-08-16T00:00:45Z`；annotated tag object `71256a18b08943ccde3ead90d819ed94c0fec4e1` 解引用 commit `8b624765128779b43adb58681383b3ef125d6d3c`。
- workflow `31915913496` / job `95088396802` 重跑成功；五资产、packaged UI / bridge、差分、public packaged 与滚动保留全过。artifact `9255026857` / `473547229` bytes / `sha256:5b6cd1928ae4b43b12702146d21fb75e8e62b931d4e2cbb25f9443451596e93e`。
- public v2 / root：version `0.1.57`；两通道精确一致，packaged public 为 `updateAvailable=false`。五版滚动保留现为 v0.1.52、v0.1.53、v0.1.55、v0.1.56、v0.1.57（v0.1.54 仅 tag），本地 `release/` 为空。

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
