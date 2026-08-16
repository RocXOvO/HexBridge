# HexBridge 数据、推荐与隐私契约

> 最后更新：2026-08-15。数据源和隐私边界的唯一现行记忆模块。缺陷状态见 [DEFECTS.md](../DEFECTS.md)。

## data.dtodo

- `https://data.dtodo.cn/api/v1/zh-CN/*` 是可选的英雄 / 海克斯推荐统计与独立出装来源。用户自己申请 Key，Main 通过 safeStorage 保存，Renderer 永不见明文。
- 目录与详情使用 dataVersion；detail cache schema v3，v1 / v2 仅 stale fallback。
- 单英雄 detail 的 timeout / 429 / 5xx / 解析或本地缓存写入失败不得污染全局目录状态；只有 401 使 Key 失效并立即广播。目录 429 可继续使用同源旧缓存，但不自动重试。
- JSON 的 fetch、流读取、UTF-8 与 parse 共用 10s deadline 和 2MiB 上限；离线只按 15s / 60s / 5min 单飞恢复，退出 abort 且不复活。
- dataVersion 是不可变快照；同版本强制刷新只检查公开 config。新版本必须先原子提交英雄目录、强化目录和 current pointer，再切换 Main 内存与公开状态。
- 三卡比较键：英雄专属 rank → hero tier → global tier。英雄专属 pickRate 只展示，不参与排序，不得由 rank / total 推导。
- 出装只使用同一 `builds[0]` 的出门、核心和情境组；名称 / 图标必须来自已展开详情，缺失显示“暂无数据”，不按 ID 猜 URL / 名称。

## OCR 调度诊断（HB-088）

- 诊断只暴露有限阶段、下一次延迟、探测 / 完整识别次数与最近 / 16 次滚动耗时峰值；这些值在 Main 聚合后进入结构化状态。
- 不保存或传输截图、OCR 文本、坐标、窗口 / 进程标识、路径、token、PUUID 或其他玩家身份；换 generation、停止和旧 epoch 迟到结果都会清理或丢弃指标。
- v0.1.58 候选的增量 OCR 只在 Main 内保留短期指纹与物理槽位签名；这些值不进入公开诊断或持久缓存，混合帧与迟到结果 fail closed。

## Live Client 受限诊断（HB-079）

- `activeplayer` 等级读取和三时间点诊断均固定为 Main-only `https://127.0.0.1:2999`；v0.1.60 已在用户点击诊断按钮时额外读取一次 `allgamedata`，不进入后台轮询或推荐状态机。
- 每个响应统一限制 2 MiB / 超时，摘要只保留有限字段路径、JSON 类型、布尔 / 枚举 / 数值；`activePlayer`、`allPlayers` 及姓名、RiotID、PUUID、装备、符文、原始响应均不进入 RuntimeState、日志、磁盘或 Renderer。
- allgamedata 是否包含稳定的卡面状态仍待真实 Windows 三时间点实验；在得到跨回合一致证据前，等级 / 事件只能唤醒短期 cheap probe，OCR 仍是卡面最终确认。
- v0.1.61 已发布显式 Windows 个人研究模式：用户主动点击后，完整 `allgamedata`（仍受现有 2 MiB / 超时限制）只写入 `userData/private-live-client-experiment`；Renderer / IPC 只收到成功状态、文件名和字节数，原文不进日志、RuntimeState、网络或 Release。诊断页提供清除按钮；这是用户明确 opt-in 的本机敏感数据存储，不默认触发。真实 WeGame 字段仍待用户采样。

## 腾讯 101（HB-058）

来源页面是 [腾讯 101 海克斯榜](https://101.qq.com/?ADTAG=cooperation.glzx.web#/rankings/hextech)。2026-08-14 用户已对腾讯页面当前使用的以下 Web 接口做过无登录 / 无 Key HTTP 200 验证：

- `fuwen_aram_rune_rank_v2?augmentid_level=255`：提供 `dtstatdate` 和 augment 的全局 pick / win / rank。
- `fuwen_aram_hero_rank_v2?dtstatdate=YYYYMMDD`：日期必须来自上一接口；`lowest_rank_runes` 只是英雄对应的有序 augmentId。
- `fuwen_aram_hero_parttner?role1=255&role2=255&championid=255`：仅记录为已发现数据，当前 provider 不消费。
- `https://game.gtimg.cn/images/lol/act/img/js/kiwi/kiwi_augments.json`：官方静态海克斯目录。

现行本地实现：

- `recommendationDataSource` 严格为 `dtodo | tencent101`，无 auto；新安装及尚未写入 revision 7 来源选择的配置默认腾讯，已经保存的合法选择不被升级改写。两个 provider 不静默回退、不混合字段 / 名次。
- 选 Tencent 时，英雄榜 / 浏览、选人、当前英雄、OCR 三卡、96px compact 和理由只消费同一 Tencent snapshot；出装仍是独立 dtodo 模块。
- 命中 `lowest_rank_runes` 的卡先按英雄推荐顺序，未命中再按腾讯全局 pick rank；有效指标相同时并列。pick / win 必须标注“全局选取率 / 全局胜率”，不得冒充英雄专属数据。
- 浏览使用中文名、称号、alias 与显式别名，支持键盘选择、品质筛选和局部排序；不改变实时助手的当前英雄。
- Main-only 固定 host / path / query，`credentials: omit`、`redirect: error`、单响应 2 MiB、10s timeout / Abort / single-flight、24h refresh / 15min failure backoff。
- 先取强化榜日期，再取同日英雄榜和静态目录。提交前统一验证条数、ID 关系、真实日历日期、source/date/hash；缓存文件 / 数组有上限，pointer 原子换代，Abort 不得推进 pointer / state。
- v0.1.51 已将英雄榜 `pick_rate` 映射为 `ChampionSummary.championPickRate`，只在 Tencent 来源的当前英雄、备战席和英雄榜展示为“英雄选取率”；dtodo 与缺失字段为 `null`，不参与英雄排序，也不与海克斯全局 `pick_rate` 混合。越界缓存值 fail closed。Windows workflow 已通过，但真实 Tencent endpoint 与用户同机切源仍未验证。
- 强化 pick / win 可使用严格十进制或科学计数法，归一后仍必须是有限 `0..1`；不接受百分数、负数或其他单位。静态目录支持当前 array 与旧 object，遍历前限 `100..500`，无效项与冲突重复 ID 必须拒绝。
- Runtime、浏览和 Renderer 统一以 `source + snapshotId + dataVersion + statisticsDate + champion + generation + sequence` 守卫迟到请求；compact 同时显示来源和日期。

证据与发布阻断：

- v0.1.29 本地全量 44 files / 469 passed + 1 skipped，typecheck / lint / diff-check 通过；此前 OCR synthetic 和真实 4K fixture 135ms 通过，最终代码审查 `P0=0 / P1=0`。
- v0.1.29 已正式发布。Windows run `31866876217` attempt 2 通过 44 files / 470 tests、真实 4K 276ms、packaged UI / bridge、public packaged 与五版滚动；Release / CI 仍不能替代真实 Windows 腾讯接口、切源、stale / error 和 WeGame 同机验证，HB-058 保持 `FIXED / UNVERIFIED`。
- v0.1.36 修复当前强化榜科学计数法与数组静态目录兼容；Windows / 正式门禁通过 48 files / 533 tests，真实四端点本地验证为 `ready / 20260814 / 172 英雄 / 246 强化`。Release 成功仍不能替代用户 Windows 客户端切源复测，HB-069 保持 `FIXED / UNVERIFIED`。
- 本地 npm audit 因 sandbox DNS `ENOTFOUND registry.npmjs.org` 未取得证据；正式 Windows clean install 的 audit 已通过。macOS Electron 在 AppKit `_RegisterApplication` 进入 HexBridge 前 SIGABRT，不记为 source UI / bridge 或 Windows 证据。
- 该接口是腾讯页面当前使用的未文档化 Web 接口，没有公开 SLA。用户已确认适用书面授权已在仓库外取得；仓库不得保存或转述书信正文、授权方身份、条款与附件。授权不改变 fail-closed、限频、来源标注、撤回能力和真实接口验收要求。

## 队友 / 对手近期状态（HB-047 / HB-054）

- v0.1.24 已发布，默认关闭、仅本机，政策 / 自定义分发为 `ACCEPTED RISK`。
- selecting / launching 只信 champ-select，active 只信 gameflow。唯一 self、跨组 PUUID 唯一、任一 raw team >5 全局拒绝。
- 队友 4 与对手 5 各自 all-or-nothing，组间允许 partial；每人最多 20 场，少于 12 场不评分。
- Main 固定 current-summoner 与 per-PUUID history GET；跨批次总并发 2、单响应 2 MiB、timeout / Abort、瞬态最多一次重试。
- Renderer 只见 generation-bound 随机 opaqueKey 和脱敏 summary / detail；PUUID、玩家名、participant、gameId、原始历史、逐局时间戳和路径不出 Main / 日志 / 磁盘。
- 同 generation 的 roster 变化只在 Main 内按既有 PUUID 绑定更新脱敏 champion / relation / slot；该更新不重查已有历史、既有 opaqueKey 不换。任一分组 hidden、成员不完整或歧义时，该组从公开 presentation 撤下，恢复 exact membership 后再用原缓存显示；用户主动重新读取仍是独立新查询。
- v0.1.53 候选新增 `allySummary` / `opponentSummary`：只由已经脱敏的公开个人 summary 在 Main 内按样本量加权计算 `rating / winRate / kda / confidence`，不包含 PUUID、玩家名、对局 ID、逐局明细或查询参数；缺失分组保持 `none / partial`，不以平均值填充。
- Windows / Release 不能替代真实国服 endpoint、身份可见性、隐私与用户价值验收；状态仍 `IN PROGRESS / UNVERIFIED`。

## 通用数据与日志边界

- 数据缓存位于 `userData/data-cache`，写入使用 `.tmp` + atomic rename；不完整目录不能切 current pointer。
- dtodo 和 Tencent 使用独立 schema / namespace / provider / 日期；只读取来源匹配的缓存，旧缓存显式 stale。
- 日志是内存环形缓冲，过滤 token、Key、PUUID 风格标识和凭据 URL；禁止记录原始 payload、截图、窗口标题 / 路径或用户身份。
- 历史持久化的游戏目录只属于 Main 内部 LCU 发现配置；公开 `AppSettings`、RuntimeState、设置响应、preload 和窗口广播均以显式白名单重建，Renderer 不得读取或提交该路径。
- 所有上游 / LCU 请求固定 GET、allowlist、timeout、响应大小上限；Renderer 不提供 URL、path、query、PUUID 或 provider 内部参数。
