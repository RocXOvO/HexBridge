# HexBridge 发布与运维契约

> 最后更新：2026-08-15。只保留当前正式基线和可继续执行的发布规则；旧流水从 Git / Actions / Releases 追溯。

## 当前正式基线

- public Latest：[v0.1.34](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.34)，non-draft / non-prerelease；Release ID `371008386`，publishedAt `2026-08-15T09:17:46Z`。
- annotated tag object `216281aeba59c34006447a9984a50674ae46c0c9` 解引用 commit `d878195284b222d114d71cd8d0ab10a0097c6725`。
- 正式 run `31876394640` attempt 1 已完成测试并创建 Release / 五资产，但 GitHub Raw 在 100s 内未传播而 fail closed，且未 prune。attempt 2 / job `94993524877` 于 5m36s 幂等成功，preflight 识别已有 canonical Release / channel 而不重发；47 files / 523 tests、audit、真实 4K 298ms、lint、typecheck、retention、packaged UI / bridge 全过。synthetic v0.1.35 差分为 `1,312,720 / 199,282,373` bytes、10 个 Range 与 3 个 redirect；artifact `9244995277` 为 `473,518,775` bytes，digest `sha256:36c786ad6a4edb5fa5ffeee5f7710806d7a782dd63c732ad8808719950dd6f33`。fake / synthetic 不等于真实 WeGame、DPI、性能或 installed updater。
- public v2 / root：version `0.1.34`、size `199282299`、SHA-512 `Ao7xZdhD/OoCtqCbcdfkBMbSpa0Bs2P5i9jrGtAbRJ02KPo/It6l9f6xddpzZvJzm/g5J2GLy97ZLWmG0/VPiw==`；权威 / raw 精确一致，packaged public 为 `updateAvailable=false`。
- 正式资产 SHA-256：EXE `a8617552ba99deaf46330719be0f0e20331db83d35bf209d9872fb392da2751d`（`199282299` bytes）；blockmap `c2ad309ff4156aad7c095c3f111ec256814c129df778b0b0dea80f49e086a0d2`（`201262`）；ZIP `4c936e0c144d2087c1fd303d047385bf943e919a0cdc7238a308d39eb6fa9ed4`（`274447601`）；latest.yml `3d26a45558a3a6e93e1a226154dd2680fe248864e655e8056f9f9bb1447ed4dd`（`346`）；SHA256SUMS `d3c326f1347ee665fea58e4098cc19ae1118128f4faf3d5f21f68d153f04abb7`（`182`）。
- 当前只保留 v0.1.30～v0.1.34 五个 public stable Releases；v0.1.0～v0.1.34 共 35 个 tags 都保留。本地 `release/` 为空。v0.1.29 Release / assets 已删除但 tag / source 保留。

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
