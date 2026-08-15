# HexBridge 发布与运维契约

> 最后更新：2026-08-15。只保留当前正式基线和可继续执行的发布规则；旧流水从 Git / Actions / Releases 追溯。

## 当前正式基线

- public Latest：[v0.1.29](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.29)，non-draft / non-prerelease；Release ID `370967612`，publishedAt `2026-08-15T05:30:10Z`。
- annotated tag object `57ec7515a657502ceac379e8a915ffabdf0534e3` 解引用 commit `f506de56bedf29493a9f36e7d04e66990f5cbd8b`。
- 正式 run `31866876217` attempt 1 已创建 Release / 五资产并发布 v2 / root，但 public packaged 在 100s 内仍读到 v0.1.28，fail closed 且未 prune；attempt 2 / job `94970078474` 按 canonical 现状幂等 skip publish，于 `2026-08-15T05:38:00Z` 成功完成 public / prune。
- attempt 2 证据：Windows 44 files / 470 tests、audit、真实 4K 276ms、lint、typecheck、retention、packaged UI / bridge 全过；synthetic v0.1.30 差分为 `1,233,098 / 199,274,612` bytes、11 个 Range 与 3 个 redirect。artifact `9242422794` 为 `473501818` bytes，digest `sha256:a7b6852fc240885a1dabed43d60e6797a506689b65d9784d6084994c59817c33`。fake / synthetic 不等于真实 WeGame、腾讯接口、DPI、性能或 installed updater。
- public v2 / root：version `0.1.29`、size `199274613`、SHA-512 `X2w8gQYl/0J+KAnkKHL82/eMFQDYjJyEY4aLVjM7YLV4jITx+ud5J5M6Q6Uwmu605IMyTdGDz1v4D96YfMKFCQ==`；packaged public 为 `updateAvailable=false`。
- 正式资产 SHA-256：EXE `49bb95d52aa1239da20898fada89f41cc2fd1ea9fbdd3a8f9c3b3b04050b57f5`（`199274613` bytes）；blockmap `a2b8a35b61dc3b32be7fb48bc2a431eacaa63c661c347cd327610d9ff438965b`（`201330`）；ZIP `54d06a9f5f7069b6813c55cd695c79594570746bd8ff0c7e8062a0b9e18969cd`（`274437928`）；latest.yml `0214e5e6987c2055a23eee70ccc7da0d01e47b58c03565d58a85a29b649b1e41`（`346`）；SHA256SUMS `d0b3c28aeb656d9de5bf43ad722047416b8a6e872d09edd75ac1a5c0f2b659b2`（`182`）。
- 当前只保留 v0.1.25～v0.1.29 五个 public stable Releases；v0.1.0～v0.1.29 共 30 个 tags 都保留。本地 `release/` 为空。v0.1.24 Release / assets 已删除但 tag / source 保留。

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
