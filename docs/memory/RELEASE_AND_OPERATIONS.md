# HexBridge 发布与运维契约

> 最后更新：2026-08-15。只保留当前正式基线和可继续执行的发布规则；旧流水从 Git / Actions / Releases 追溯。

## 当前正式基线

- public Latest：[v0.1.30](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.30)，non-draft / non-prerelease；Release ID `370978432`，publishedAt `2026-08-15T06:33:48Z`。
- annotated tag object `d87ad14ba67525adcd573d6cf1eabb5baba4b1d4` 解引用 commit `1f172de0225cc6abde86fc04997442c9219acb51`。
- 正式 run `31869511329` / job `94975841740` 首次即于 6m7s 成功；Windows 46 files / 499 tests、audit、真实 4K 185ms、lint、typecheck、retention、packaged UI / bridge 全过。synthetic v0.1.31 差分为 `1,200,432 / 199,280,687` bytes、9 个 Range 与 3 个 redirect；artifact `9243077215` 为 `473,516,251` bytes，digest `sha256:1c61882deedcf68be8cf16cd2e934301ae475b7c9a8833fbfb57dec644f687a4`。fake / synthetic 不等于真实 WeGame、Wallpaper Engine、DPI、性能或 installed updater。
- public v2 / root：version `0.1.30`、size `199280687`、SHA-512 `Tm1BfPD+0k0H1IYr1ediM0l9Ce/OgGdqeeL6g69YMJ26HshQwwn78Th8p14Pi4wx3TAt69cE5/1/v7yVi7a3BA==`；权威 / raw 均首次通过，packaged public 为 `updateAvailable=false`。
- 正式资产 SHA-256：EXE `adecf21eadfe9481c8e965afd87552699c54728fde0da180d6beea1af8401ecf`（`199280687` bytes）；blockmap `725854b8dffd79a4e8a6ac6ff7419a150e2db4fcf87404f19b3403165a79b77f`（`201338`）；ZIP `d4764e28afa31c67aaafbb9872ecae5d7cb2ed60313d3aeff9c74e8734d56614`（`274446034`）；latest.yml `2dea6f741dba0cc31728458531d092b548a4325788e2e49606ff1e47e74a4da8`（`346`）；SHA256SUMS `39deefc1d9bdcbb30c8a2796ddb108b4171036836664a08f41343380fdec6dc6`（`182`）。
- 当前只保留 v0.1.26～v0.1.30 五个 public stable Releases；v0.1.0～v0.1.30 共 31 个 tags 都保留。本地 `release/` 为空。v0.1.25 Release / assets 已删除但 tag / source 保留。
- v0.1.31 candidate `a4dc5bc3c1f443c505a588f51139aa5ce7418008` 已 push；workflow_dispatch `31870907932` / job `94979261092` 于 5m23s 成功，Windows 46 files / 508 tests、audit / OCR 280ms / lint / typecheck / retention / EXE `199281056` / packaged UI / bridge / synthetic 差分 `1266455` bytes / checksums / artifact `9243436896` 全过。tag-only 发布、channel、public 与 prune 步骤按预期 skip；尚未创建 v0.1.31 tag / Release，不改变上述 public 基线。

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
