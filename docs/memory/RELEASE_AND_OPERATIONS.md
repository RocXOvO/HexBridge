# HexBridge 发布与运维契约

> 最后更新：2026-08-16。只保留当前正式基线和可继续执行的发布规则；旧流水从 Git / Actions / Releases 追溯。

## 当前正式基线

- 当前公开正式版 `v0.1.42` 已完成 tag / Release / 双通道 / 滚动保留；当前 `v0.1.43` 仅为本地候选，尚未 push / tag / Release。真实 WeGame / installed updater 仍不是自动化证据。

- public Latest：[v0.1.42](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.42)，non-draft / non-prerelease；Release ID `RE_kwDOT1eQs84WHrX8`，publishedAt `2026-08-15T17:20:04Z`。
- tagged commit `2c366e14f3030bab3863fd5f4993569d6c3006df`；正式 run `31897731595` attempt 2 成功（首次仅稳定 channel 传播超时）。Windows 41 files / 563 passed + 1 skipped，audit、OCR、lint、typecheck、packaged UI / bridge、差分、public packaged 与滚动保留全过；artifact 与 Release 五资产均通过。自动化不等于真实 WeGame、腾讯接口或 installed updater 验证。
- public v2 / root：version `0.1.42`；两通道精确一致，packaged public 为 `updateAvailable=false`。
- 正式资产：EXE `199287677` bytes / `d3abafba1237e1d1a98648308f32b17c4bbe5fa4e4785006e3dabe3b02e22e45c`；blockmap `201198` / `ced1a7304c64ffbf9176efd6673e30baa7b12690d2317561324649e03510619a`；ZIP `274455085` / `265dbc31259b4b774c2a723ff7e4edd4d84d19dc9f69bc0dc0767eab4a298657`；latest.yml `346` / `5ca725af2a4df61ae9b3bad385ef0f21637adf4006a5d0fe5fd3a8d92ca1db93`；SHA256SUMS `182` / `775fcb5ad924979824c43a468fc0db913a6e2b220f289454fe9bc14d314bf85a`。
- 当前只保留 v0.1.38～v0.1.42 五个 public stable Releases；v0.1.0～v0.1.42 tags 都保留。本地 `release/` 为空；旧 Release / assets 已按滚动策略删除但 tag / source 保留。

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
