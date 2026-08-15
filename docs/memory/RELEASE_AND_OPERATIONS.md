# HexBridge 发布与运维契约

> 最后更新：2026-08-15。只保留当前正式基线和可继续执行的发布规则；旧流水从 Git / Actions / Releases 追溯。

## 当前正式基线

- public Latest：[v0.1.35](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.35)，non-draft / non-prerelease；Release ID `371016430`，publishedAt `2026-08-15T10:00:10Z`。
- annotated tag object `64c6cc76afe2114951986d896e3f3febd19dfdca` 解引用 commit `76bc957908c0c6f9d40ed141fa2f0b4bdd5fab6d`。
- 正式 run `31878189793` attempt 1 创建 Release / 五资产后因 Raw 100s 未传播而 fail closed，未 prune；attempt 2 / job `94997641650` 于 6m9s 幂等成功且不重发 Release / channel。48 files / 529 tests、audit、真实 4K 257ms、lint、typecheck、packaged UI / bridge、public packaged 全过；synthetic v0.1.36 差分为 `1,269,668 / 199,283,419` bytes、9 个 Range 与 3 个 redirect。正式 artifact `9245453613` 为 `473,521,140` bytes，digest `sha256:5ddd347b01e99354ec6100ff8ca73268c68b99975547008f7ebd288f2c8e74df`。
- public v2 / root：version `0.1.35`、size `199283491`、SHA-512 `qt3yB5Ez8GlYRKj5bLK0aVp7lNMJasbPEI6WvVieDhDEY/IfL/IDetAny+MyNantHNKhSrLxs9rhRasuRpAgYQ==`；两通道精确一致，packaged public 为 `updateAvailable=false`。
- 正式资产 SHA-256：EXE `6731c326b5853a4ddf46d45408410416c54133896bb9f77b2a98b4366462f1b6`（`199283491` bytes）；blockmap `00c12b114402602be1c90d6daa5bfbef2f4205024886d7f68b7b24dc4526fb2b`（`201300`）；ZIP `23646c3832145c7bf92a9c465df97de62969829d19227afcfe488ea5e5bde3c2`（`274449421`）；latest.yml `f25c13731724af6c6a4bdf623d712d2659178571c4b8a4588706b034023494b1`（`346`）；SHA256SUMS `e12d6e35fa04dc6cdf8ced92a48738d6154104aea40387bcfa9982245eb57ae0`（`182`）。
- 当前只保留 v0.1.31～v0.1.35 五个 public stable Releases；v0.1.0～v0.1.35 共 36 个 tags 都保留。本地 `release/` 为空。v0.1.30 Release / assets 已删除但 tag / source 保留。

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
