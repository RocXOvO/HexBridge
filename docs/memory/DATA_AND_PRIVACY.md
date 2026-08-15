# HexBridge 数据、推荐与隐私契约

> 最后更新：2026-08-15。数据源和隐私边界的唯一现行记忆模块。缺陷状态见 [DEFECTS.md](../DEFECTS.md)。

## data.dtodo

- `https://data.dtodo.cn/api/v1/zh-CN/*` 是公开版默认的英雄 / 海克斯推荐统计与出装来源。用户自己申请 Key，Main 通过 safeStorage 保存，Renderer 永不见明文。
- 目录与详情使用 dataVersion；detail cache schema v3，v1 / v2 仅 stale fallback。
- 三卡比较键：英雄专属 rank → hero tier → global tier。英雄专属 pickRate 只展示，不参与排序，不得由 rank / total 推导。
- 出装只使用同一 `builds[0]` 的出门、核心和情境组；名称 / 图标必须来自已展开详情，缺失显示“暂无数据”，不按 ID 猜 URL / 名称。

## 腾讯 101（HB-058）

来源页面是 [腾讯 101 海克斯榜](https://101.qq.com/?ADTAG=cooperation.glzx.web#/rankings/hextech)。2026-08-14 用户已对腾讯页面当前使用的以下 Web 接口做过无登录 / 无 Key HTTP 200 验证：

- `fuwen_aram_rune_rank_v2?augmentid_level=255`：提供 `dtstatdate` 和 augment 的全局 pick / win / rank。
- `fuwen_aram_hero_rank_v2?dtstatdate=YYYYMMDD`：日期必须来自上一接口；`lowest_rank_runes` 只是英雄对应的有序 augmentId。
- `fuwen_aram_hero_parttner?role1=255&role2=255&championid=255`：仅记录为已发现数据，当前 provider 不消费。
- `https://game.gtimg.cn/images/lol/act/img/js/kiwi/kiwi_augments.json`：官方静态海克斯目录。

现行本地实现：

- `recommendationDataSource` 严格为 `dtodo | tencent101`，无 auto；revision 7 对既有用户默认 dtodo。两个 provider 不静默回退、不混合字段 / 名次。
- 选 Tencent 时，英雄榜 / 浏览、选人、当前英雄、OCR 三卡、96px compact 和理由只消费同一 Tencent snapshot；出装仍是独立 dtodo 模块。
- 命中 `lowest_rank_runes` 的卡先按英雄推荐顺序，未命中再按腾讯全局 pick rank；有效指标相同时并列。pick / win 必须标注“全局选取率 / 全局胜率”，不得冒充英雄专属数据。
- 浏览使用中文名、称号、alias 与显式别名，支持键盘选择、品质筛选和局部排序；不改变实时助手的当前英雄。
- Main-only 固定 host / path / query，`credentials: omit`、`redirect: error`、单响应 2 MiB、10s timeout / Abort / single-flight、24h refresh / 15min failure backoff。
- 先取强化榜日期，再取同日英雄榜和静态目录。提交前统一验证条数、ID 关系、真实日历日期、source/date/hash；缓存文件 / 数组有上限，pointer 原子换代，Abort 不得推进 pointer / state。
- Runtime、浏览和 Renderer 统一以 `source + snapshotId + dataVersion + statisticsDate + champion + generation + sequence` 守卫迟到请求；compact 同时显示来源和日期。

证据与发布阻断：

- v0.1.29 最新本地全量 44 files / 469 passed + 1 skipped，typecheck / lint / diff-check 通过；此前 OCR synthetic 和真实 4K fixture 135ms 通过，最终代码审查 `P0=0 / P1=0`。
- 当前产品版本已提升为 v0.1.29 本地候选，版本 / provider / Release notes 定向 7 files / 50 tests 通过；公开正式版仍为 v0.1.28，Windows workflow / tag / Release 尚未发生。
- npm audit 因 sandbox DNS `ENOTFOUND registry.npmjs.org` 未取得本轮证据；macOS Electron 在 AppKit `_RegisterApplication` 进入 HexBridge 前 SIGABRT，不记为 source UI / bridge 或 Windows 证据。
- 该接口是腾讯页面当前使用的未文档化 Web 接口，没有公开 SLA。用户已确认适用书面授权已在仓库外取得；仓库不得保存或转述书信正文、授权方身份、条款与附件。授权不改变 fail-closed、限频、来源标注、撤回能力和真实接口验收要求。

## 队友 / 对手近期状态（HB-047 / HB-054）

- v0.1.24 已发布，默认关闭、仅本机，政策 / 自定义分发为 `ACCEPTED RISK`。
- selecting / launching 只信 champ-select，active 只信 gameflow。唯一 self、跨组 PUUID 唯一、任一 raw team >5 全局拒绝。
- 队友 4 与对手 5 各自 all-or-nothing，组间允许 partial；每人最多 20 场，少于 12 场不评分。
- Main 固定 current-summoner 与 per-PUUID history GET；跨批次总并发 2、单响应 2 MiB、timeout / Abort、瞬态最多一次重试。
- Renderer 只见 generation-bound 随机 opaqueKey 和脱敏 summary / detail；PUUID、玩家名、participant、gameId、原始历史、逐局时间戳和路径不出 Main / 日志 / 磁盘。
- Windows / Release 不能替代真实国服 endpoint、身份可见性、隐私与用户价值验收；状态仍 `IN PROGRESS / UNVERIFIED`。

## 通用数据与日志边界

- 数据缓存位于 `userData/data-cache`，写入使用 `.tmp` + atomic rename；不完整目录不能切 current pointer。
- dtodo 和 Tencent 使用独立 schema / namespace / provider / 日期；只读取来源匹配的缓存，旧缓存显式 stale。
- 日志是内存环形缓冲，过滤 token、Key、PUUID 风格标识和凭据 URL；禁止记录原始 payload、截图、窗口标题 / 路径或用户身份。
- 所有上游 / LCU 请求固定 GET、allowlist、timeout、响应大小上限；Renderer 不提供 URL、path、query、PUUID 或 provider 内部参数。
