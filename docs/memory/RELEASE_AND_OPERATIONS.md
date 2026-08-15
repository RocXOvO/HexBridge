# HexBridge 发布与运维契约

> 最后更新：2026-08-16。只保留当前正式基线和可继续执行的发布规则；旧流水从 Git / Actions / Releases 追溯。

## 当前正式基线

- public Latest：[v0.1.40](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.40)，non-draft / non-prerelease；Release ID `371093525`，publishedAt `2026-08-15T16:04:13Z`。
- annotated tag object `de848471fe4139c16c99f5a8bb20774512d9c1f7` 解引用 commit `d2b6b91d6536229e84e16bf04984341c5c7823a9`。
- 正式 run `31894224065` attempt 1 / job `95034905041` 创建 Release / 五资产与双通道后因 Raw 100s 未传播而 fail closed，未 prune；attempt 2 / job `95035875831` 于 5m35s 幂等成功且不重发 Release / channel。48 files / 560 tests、audit、真实 4K 265ms、lint、typecheck、packaged UI / bridge、public packaged 全过；synthetic v0.1.41 差分为 `1284628 / 199286308` bytes、9 个 Range 与 3 个 redirect。复跑 artifact `9249511215` 为 `473529084` bytes，digest `sha256:1ae7d6b26488fe046aea4d1c48070797816523395f1e7a244bfe76e3fd83152d`。
- public v2 / root：version `0.1.40`、size `199286307`、SHA-512 `vg4kz09XPOhRLgteJBOXCx2HlME8R2GYiAaN/6SS2vxmY1zd3/1ocLczUV4SBNQ/ddx7JHT0UB2ZO9nveBGyqw==`；两通道精确一致，packaged public 为 `updateAvailable=false`。
- 正式资产 SHA-256：EXE `7e8ac9274bee6ad36c793f984580c87d08cfd35850b268b72dfcae3954e8cd9a`（`199286307` bytes）；blockmap `ea9e58ecd3544064b9c47351e63dd9eec263199e362caf2b5010497c5b4e5dcb`（`201241`）；ZIP `520dac682103ffa49e623ee42ab3826994b711dc52ad253f958dfbfff893560c`（`274453455`）；latest.yml `d693d2c8bd9a757d9da594d83c9c0ad5b1bcdda29863725360884b54480672cd`（`346`）；SHA256SUMS `542beddbb5476c9adac75a0a303f96bc16f6362649f35c586dfe20fdf2bfb3eb`（`182`）。
- 当前只保留 v0.1.36～v0.1.40 五个 public stable Releases；v0.1.0～v0.1.40 共 41 个 tags 都保留。本地 `release/` 为空。v0.1.35 Release / assets 已删除但 tag / source 保留。

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
