# HexBridge 发布与运维契约

> 最后更新：2026-08-15。只保留当前正式基线和可继续执行的发布规则；旧流水从 Git / Actions / Releases 追溯。

## 当前正式基线

- public Latest：[v0.1.33](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.33)，non-draft / non-prerelease；Release ID `370998749`，publishedAt `2026-08-15T08:28:16Z`。
- annotated tag object `ed1cc0b5e461aa27a44ff23135d589c00142522b` 解引用 commit `073f1f610c6671001ca6a9ad01947120e4bdbbf9`。
- 正式 run `31874316733` attempt 1 已完成测试并创建 Release / 五资产，但 GitHub Raw 在 100s 内未传播而 fail closed，且未 prune。attempt 2 / job `94988452941` 于 5m31s 幂等成功，preflight 识别已有 canonical Release / channel 而不重发；47 files / 518 tests、audit、真实 4K 252ms、lint、typecheck、retention、packaged UI / bridge 全过。synthetic v0.1.34 差分为 `1,296,785 / 199,281,334` bytes、8 个 Range 与 3 个 redirect；artifact `9244453292` 为 `473,517,662` bytes，digest `sha256:93fe8fbcee049e0eef28461a000930c8911f7faa4b686f1238368fb66fff77be`。fake / synthetic 不等于真实 WeGame、Wallpaper Engine、DPI、性能或 installed updater。
- public v2 / root：version `0.1.33`、size `199281338`、SHA-512 `mPJ3a3e3qOa8KEWGhSvKznALpdhg6CnV8mZZzCFhFSC2aFSuTe7EThqE6dD5ttCGqXBgAdQHTU/wBoh7ucBXqQ==`；权威 / raw 精确一致，packaged public 为 `updateAvailable=false`。
- 正式资产 SHA-256：EXE `235a9b713586cbbfded210c9213c8af78c744cc964db4e90c50426301f0fdc72`（`199281338` bytes）；blockmap `3e0a3d8b6d5aa65941ab145b5640e746aeafea735d0251af2886303979f9d742`（`201408`）；ZIP `4ff5251c1697e24cf50a1be93c92e2f704cba2a65a3e1594f5d1e383cdb82632`（`274446675`）；latest.yml `d9313955613533f990f4eeb768a29070812eaee5cad5d757690a17d4777d09e0`（`346`）；SHA256SUMS `4aa1f196dba8a25f27bc7332a81d4b483d0211e7f662d4a9d5816a474d38a1fc`（`182`）。
- 当前只保留 v0.1.29～v0.1.33 五个 public stable Releases；v0.1.0～v0.1.33 共 34 个 tags 都保留。本地 `release/` 为空。v0.1.28 Release / assets 已删除但 tag / source 保留。

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
