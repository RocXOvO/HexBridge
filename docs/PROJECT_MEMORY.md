# HexBridge 项目记忆索引

> 最后更新：2026-08-16
> 本文件只保存当前基线、模块入口和待办优先级。缺陷细节、稳定架构契约与发布规则分别维护，避免重复和历史流水膨胀。

## 当前基线

- 当前候选版为 `v0.1.65`，公开正式版仍为 [v0.1.64](https://github.com/RocXOvO/HexBridge/releases/tag/v0.1.64)，tag 解引用 commit `1c3f831d9a251b9c8e14bcb8d5c5443a544e3793`；v0.1.63 仅保留 tag、未创建公开 Release。v0.1.65 修复英雄详情推荐与独立出装互相阻塞，并将 data.dtodo Key 配置收回来源卡片；HB-093/HB-094/HB-095 的真实 Tencent 与用户同机验收不由 CI 外推，候选尚未 commit / push / Windows / tag / Release。
- v0.1.64 workflow `31944699823` / 重跑 job `95159756249` 于 `2026-08-16T11:43:17Z–11:49:12Z` 成功；Release ID `371309425`，Windows `51` files / `641` passed + `1` skipped，packaged UI / bridge、差分、双通道、公网 packaged 更新检查和最近五个 Release 保留均通过。首次尝试只在 root 通道传播窗口超时，幂等重跑成功；Node 20 弃用提示和既有 AugmentOverlay 缩进警告不阻断。
- v0.1.64 五资产：EXE `199299824` / `4efc477357f12c6027fae33e05d8a986cf49eef4c131fe8ee24956c33b7ee477`；blockmap `201466` / `0078478d0fc3ba89deb6642684bb5b145f219d3dda1f03448705b020e7acf634`；ZIP `274471588` / `1347b2fd229883f13c36f624bb9a17cea163fb11c3b82b68d14f51e35338facd`；latest.yml `346` / `623670a2c16f918bb2e566e14044b62609e77ec8770fe70af0aa02bf428c17ef`；SHA256SUMS `182` / `6eb3086f48dd67ec68a65aec47c9e1cf28da086fa8c3b3803c6e16f3ca6b6e82`。artifact `9263119526` / `473561441` bytes；公开滚动窗口为 v0.1.59、v0.1.60、v0.1.61、v0.1.62、v0.1.64（v0.1.63 无 Release），tag 保留。
- v0.1.61 正式 workflow `31924005321` / 成功重跑 job `95109448523`，Release ID `RE_kwDOT1eQs84WIGEP`，tag 解引用 commit `9108348a501fc5d460ff75f9e56bd632e59d6bf0`；Windows 全量门禁、v2/root、public packaged 与五版滚动保留均通过。artifact `9257432760` / `473553962` bytes；真实 WeGame 字段仍未验证。
- v0.1.62 正式 workflow `31933785471`（重跑成功）/ job `95133301137` 于 `2026-08-16T07:32:08Z–07:37:52Z` 通过；Release ID `RE_kwDOT1eQs84WIP5E`，tag 解引用 commit `bae79a96ae6a1ad32a5dd84e1e61c4156d3341ed`。Windows `51` files / `640` passed、真实 4K OCR `209ms`、packaged UI / bridge、差分、public packaged 与五版滚动保留均通过；真实 Tencent 接口、用户同机和 Windows 性能外推仍未验证。
- v0.1.62 五资产：EXE `199299489` / `ac5779c6e55b0f13311bf41b53e09fcc05407edebd9cfb1b5d7311b48ed9888c`；blockmap `201323` / `e2f849fd298bfba91b9e1ed51df8e4e1a7951be3b2b0a27a1b8854cb72cab2e1`；ZIP `274471161` / `e00a7b07aa9f33b2b44eb7aa14b4bf41a8255f58aa86bfe34b56a8faf9e7e003`；latest.yml `346` / `30996302e2c5ddf2f3885ecda17eceb57398532bbd74e3ca91ae8d7234dcd567`；SHA256SUMS `182` / `06460294520797118218e8f720e36b149803edbb8989e2bebecc7810592dbd2a`。artifact `9260203991` / `473560262` bytes，v2/root channel `0.1.62` 精确一致，packaged public `updateAvailable=false`；五版滚动保留 v0.1.58–v0.1.62，v0.1.57 Release 已删除、tag 保留，本地 `release/` 为空。
- v0.1.60 正式 workflow `31922234089` / job `95104645401` 重跑成功；Windows 构建、`50` files 全量门禁、打包 UI / bridge、差分、public packaged、双通道和五版滚动保留均通过。Release ID `RE_kwDOT1eQs84WIEMo`，publishedAt `2026-08-16T02:40:35Z`，annotated tag 解引用到 commit `86edf4fabb9fa031f096805623f4eef33119e296`。自动化门禁不等于真实 WeGame 字段或性能验证。
- v0.1.60 五资产：EXE `199296093` / `1ce386e01337255c737845ecb287609d3fe47d4c807d454de446bbde05e9865f`；blockmap `201438` / `9215f1c56d198e5ea0a97f5700c995bfeda859979c34ba8a0f2d94c3c0ba248e`；ZIP `274466380` / `dc0cf6b67a5eaf1930c0a583443314bcf73fd16df029d8ddff05570d74cda4f4`；latest.yml `346` / `221ed634f3113e11a12acd257cdaf1bbba67767bef40176b3cd9b44b2049fc48`；SHA256SUMS `182` / `f51c7e14e8838ceaaddfa25ae7092c967de84dafd8efc925675388190c4fdf2d`。历史滚动窗口为 v0.1.56～v0.1.60；当前窗口已由 v0.1.61 接替，tags / source 仍保留，本地 `release/` 为空。
- v0.1.59 Release ID（API node）`RE_kwDOT1eQs84WIBmU`，publishedAt `2026-08-16T01:31:58Z`；annotated tag object `360466c92332e961f5358e6be5dfa877cacdd146` 解引用到 commit `cabcd68d03877b8e6f4d37635118a7a3a7e16386`。正式 workflow `31919544169` / job `95097946275` 首次传播窗口超时后幂等重跑成功；Windows 全链、五资产、v2/root 双通道、public packaged 与五版滚动保留通过。真实 WeGame 单卡刷新、帧时间仍待用户复测，HB-092 保持 `FIXED / UNVERIFIED`。
- v0.1.59 五资产：EXE `199296178` / `47f49982b4353ec685dbcd182bb87eed3687db626d4d02d464d51a68ea79bab6`；blockmap `201455` / `df1655742e2a6ce34e2953d1e791dd45b8616492d48afa8f3c9895cb6f62556c`；ZIP `274466171` / `68375a4bbf075b1c85b00eed948c0d6a31c410778ffb8ce3825afd8acb101328`；latest.yml `346` / `e8891f8cebca15c59636c8daa3e3f144ea7b60dd418b520b3c63a854f30a8594`；SHA256SUMS `182` / `5850dbdad231a0fcba9439654a3a5de9e1f80a9dace81a0fd41b9a90b230c520`。artifact `9256096670` / `473550965` bytes；v2/root 均为 `0.1.59`。
- v0.1.58 五资产：EXE `199295963` / `e2507f7fad4187adf799ad55f48efeeb30a23a223d2158846af43441e44e4396`；blockmap `201266` / `2b6acf896c54ca005a119a022ee7036aeb924206b837833e99750a4a6660600c`；ZIP `274466099` / `15545d7666b155c3cbfd54ef83855a7211b35fc32a9290d993aa4bbbede1a49d`；latest.yml `346` / `7c436345290a032490efb5b0e7ecfc36f1fcfaa89de788c604ea5da7dc61d2fc`；SHA256SUMS `182` / `8ccffdfc25ec460a76a61bcfd1a753ba9fad756bf335210c7da34bd6424632bc`。artifact `9255824186` / `473550358` bytes；v2/root 均为 `0.1.58`。
- v0.1.53 workflow `31911568238` / job `95077306492`（幂等重跑）成功；Windows `50` files / `600` passed、真实 4K OCR `256ms`、打包 UI / bridge、差分、公网双通道、public packaged 与五版滚动门禁通过。artifact `9253855166` / `473544557` bytes / `be9cc0d0b0fc1e5d7e609646d595a5ccca21b7c9faa89b086c8beb3c19cf9662`。真实国服 history / WeGame 用户价值仍未验证，不能写成 `VERIFIED`。
- v0.1.53 五资产：EXE `199292751` / `1dd17e77a1a7e7479fa8c75ca41b97e5805f60e225361c9837316e7b654f6cfc`；blockmap `201188` / `3d3aa4072b8d5032f2fb02dde3d8f1b9f839f4f99c7c01f362186a8a5f46a7d8`；ZIP `274461905` / `8d8d5abbb0ba4aaae779a1655106f44db24c40c2bbeb30ddfd772c335e0d8769`；latest.yml `346` / `10f3aabc199c1ed9fa1d66dd150a26abd4c0ad999908be8834dd0d25649dc105`；SHA256SUMS `182` / `24346a1408c56fa7eead94bb65484494f0723fc09ff372257ea6e803e795d1e3`。差分 smoke 传输 `1303859` bytes / full `199292751`，9 个 Range、3 个 redirect，基于 v0.1.52；public packaged `channelVersion=0.1.53` 且 `updateAvailable=false`。
- v0.1.56 已正式发布；它保留 v0.1.54 的脱敏 OCR 调度诊断并包含 v0.1.55 的打包 UI smoke 门禁修正，还修正 Release notes 对“只有 tag、没有公开 Release”的中间版本累计与 compare 基线。v0.1.54 tag 已推送但 Windows UI smoke 因旧的 6 卡断言 fail closed，未创建 Release。真实机器性能仍待用户复测。
- v0.1.55 五资产：EXE `199293895` / `ee99bec9a24625ebb3d573da011545507b2a44609ccf9bf05abeee49a42af590`；blockmap `201379` / `b5ca8b1304e96d6172004666a937e6c1e8c168e1c64c4fdf0cdf189f5d205deb`；ZIP `274463548` / `31d5ccbb20f9504421052116ba85ba83cabb58ca140a76f621598501f93d5b4e`；latest.yml `346` / `921e6e4ef74a5ae5a4a01912242224a1ad96462ed1f8224298f1755adaed0f75`；SHA256SUMS `182` / `01376137f306ecf8ab35a7e16afeaca5bc24e9d922dd1057b899c209a3f3c8ed`。run `31913678607` / job `95083170527` 成功，public channel version `0.1.55`，artifact `9254486496` / `473546506` bytes。
- v0.1.56 五资产：EXE `199293985` / `818be0523a4af31126db6e2f3a5530941cdf047becea467a50e78a517f33ce03`；blockmap `201426` / `b26eb2cab5bc622bb4f808b84ffbae15e22334d53dce2d9794f664bd8223f3e4`；ZIP `274463627` / `3c745a853edf4ba3fc27210c310f04bd8e7ffcf8256f5ef8ea384c5a928beaa9`；latest.yml `346` / `dac2d31b121c869f9862bb6a836a7e1025a71b3ecc1c66bb6e016be09b4a2ef7`；SHA256SUMS `182` / `2c015cd6f5dd5feb87e5f31c4d0299820f1f2d709f394fda9ddb921de8b85acc`。run `31914401071` / job `95084888707` 重跑成功，public channel version `0.1.56`，artifact `9254662188` / `473546830` bytes。
- v0.1.57 已发布：可靠三卡 absence grace 约 700ms；第二次缺失后只等待一次剩余宽限，不在宽限内连续截图；error / pause / stop 清连续性计时。Windows workflow 全链通过；真实 WeGame 仍 `UNVERIFIED`。
- v0.1.57 五资产：EXE `199294245` / `4569a9893ed3dfefd10cf5e09e688e28a7af0ea8a33136b43b0faad13175b929`；blockmap `201392`；ZIP `274464038` / `372f77438723b5220dca0d588d5c7c43bb805ac98e5b1408a8281795da1a2694`；latest.yml `346` / `kYVAMPs7uels9ubeyOR/qbfearGl27tKzGC7AWqUV4BDBRqVq1G+ZvsSg42bFF+EXDGUD6SRlTWuRsYfz2SCXw==`（SHA-512）；SHA256SUMS `182`。artifact `9255026857` / `473547229` bytes / `sha256:5b6cd1928ae4b43b12702146d21fb75e8e62b931d4e2cbb25f9443451596e93e`。v2/root 均为 `0.1.57`，packaged public `updateAvailable=false`。
- v0.1.58 已发布：稳定双帧指纹确认后仅识别唯一变化槽；旧/确认指纹、三槽 `slot+augmentId`、source/date/context 全部复核，混合或迟到结果拒绝并下一轮回退完整三槽 OCR。未变化卡片继续复用节点且不重播动画。
- v0.1.59 已发布：移除三卡推荐区整组三卡外层过渡；短暂隐藏/恢复保留可靠槽位签名，只有变化卡片重播动画，三卡真正清空才重置签名。真实 Windows / WeGame 视觉仍未验。
- v0.1.52 workflow `31910230347` / job `95074070896` 成功；Windows `50` files / `597` passed、真实 4K OCR `259ms`、打包 UI / bridge、差分、public packaged 与五版滚动门禁通过。artifact `9253507912` / `473543056` bytes。真实 Windows WeGame 单卡刷新、帧时间与失焦恢复仍未验，不能写成 `VERIFIED`。
- v0.1.52 五资产：EXE `199291984` / `3cf9ea5eff32b4d5c6171638809f845c3bf9ee2a9aa6aea000a5020927e340a8`；blockmap `201403` / `08e3abbb10fe843df193881595aa32b8209804f99cd31f9f7bbbe21203e59b6e`；ZIP `274460918` / `5479f7a7f9cc381d30cd20f6eaced242f0b270cbe6e8a88a0c9a73b64ef6e2c6`；latest.yml `346` / `9cea25949528d8843bdc9f1036498c04a415327f0b49bd573262c431dda2ebe7`；SHA256SUMS `182` / `c9fa00a1896e37736b34ada3ce5cbae53f8e9ded7d0dd7fd6434d0e7687452af`。差分 smoke 传输 `1291823` bytes / full `199291984`，10 个 Range、3 个 redirect，基于 v0.1.51。
- v0.1.51 workflow `31908866405` 首次因稳定通道传播超时 fail closed，幂等重跑成功（job `95071775049`）；Windows `50` files / `594` passed、真实 4K OCR `262ms`、打包 UI / bridge、差分、public packaged 与五版滚动门禁通过。artifact `9253256349` / `473543003` bytes / `bf1b7dc476182bbd9e7296a03253a8688e36de4ce4e013d14569d5ec75687324`。真实 Windows Tencent 接口、切源和用户同机视觉仍未验，不能写成 `VERIFIED`。
- v0.1.51 五资产：EXE `199291843` / `759b5e972614d43feeef7a14039d8b604e1de5607d559faaa1e0ac8654a25083`；blockmap `201403` / `74d4644111fc484d14f2311a503fe495aea787d9c8ed0a361245fc2718e7c8e8`；ZIP `274460815` / `2f795677159476033cdf5ba2daab2a886711f1af5465e290613f40511a38a220`；latest.yml `346` / `d42d8675b6b4f996ded5125886b768f5fc40d7bc38491449a4d2eee715de64c4`；SHA256SUMS `182` / `12e1204eb794d627fc248cb98aae8c130ce8069d70bc10af86dd5be17b52886a`。差分 smoke 传输 `1322307` bytes / full `199291920`，10 个 Range、3 个 redirect，基于 v0.1.50。
- v0.1.50 正式 workflow `31907004019`（首次稳定通道传播超时，幂等重跑成功；成功 job `95067797353`）；Windows `50` files / `589` tests、真实 4K OCR `262ms`、打包 UI / bridge、差分、public packaged 与五版滚动门禁通过。artifact `9252836643` / `473541534` bytes / `fc2af97007a69eb1f9cbbf12acfd4c9b4537e8d152cf0a69ff6eaa335b48de49`。真实游戏视觉仍未验证，不得写成已完成用户同机验收。
- v0.1.50 五资产：EXE `199291254` / `a32e54338197d4c820dc9ff4a48a4a6a9c81334225d8004f7cd395f6b97c80b0`；blockmap `201346` / `7ae10fbf1af5aaefe49d0fe0659c14000004286a3b4cbd9d848c4f176f2d543a`；ZIP `274460169` / `aa082be360f80c47b76782e9512d613e6a3b253c850225aa378b65ce7d951ac1`；latest.yml `346` / `089b1ccd313a367d8c1910f08622a2949f566ce7a2551a394ff299079d3e7409`；SHA256SUMS `182` / `1d557f9731bfc8a6386155ec80ebc156594318ab710652e2e21c59793158836b`。差分 smoke 为 `1299245` bytes / full `199291339`，10 个 Range、3 个 redirect，基于 v0.1.49。
- v0.1.49 正式 workflow `31906109063`（首次稳定通道传播超时，幂等重跑成功）；Windows `50` files / `587` tests、打包 UI / bridge、差分、public packaged 与五版滚动门禁通过，artifact `9252537013` / `473541312` bytes。真实游戏刷新视觉仍未验证，不得写成已完成用户同机验收。
- v0.1.49 五资产：EXE `199291239` / `6d37aba0f256bc439da65f0d742c752bdb6d7d11111fa98b279f62f6fe978ffe`；blockmap `201486` / `ea32e217c0df2eca05eec22de193b4b7dda97b194b86e65fd68f9840bf43b546`；ZIP `274459853` / `a98af89b09eea6f1a0b6d7d2f5211c26e7e7c433368fc1c767ad75a148fa9491`；latest.yml `346` / `9bee56a128b1a3e9402a83e835120d538c89682a2eee11b97470338133577f25`；SHA256SUMS `182` / `e787f606d1f18e5b216bfa1828fa4707f022b4c03daf9ec023dc952c922b0998`。差分 smoke 为 `1266377` bytes / full `199291239`，9 个 Range、3 个 redirect，基于 v0.1.48。
- v0.1.48 正式 workflow `31905462353` 成功；Windows `50` files / `585` tests、打包 UI / bridge、差分、public packaged 与五版滚动门禁通过，artifact `9252266044` / `473541441` bytes。真实游戏刷新视觉仍未验证，不得写成已完成用户同机验收。
- v0.1.47 正式 workflow `31904367148` attempt 2 成功；Windows `50` files / `583` tests、打包 UI / bridge、差分、public packaged 与五版滚动门禁通过，artifact `9252096894` / `473540906` bytes。真实游戏刷新视觉仍未验证，不得写成已完成用户同机验收。
- v0.1.44 正式 workflow `31900414946` 首次仅因稳定 channel 传播窗口超时，幂等重跑成功；Windows 48 files / 566 passed + 1 skipped，Release 五资产、双通道、packaged public check 与五版滚动保留均成功。正式补丁将选人助手备战席滚动锁在面板内部，自动化不等于真实 WeGame / Windows 视觉性能验证。
- v0.1.43 正式 workflow 首次仅因稳定 channel 传播窗口超时，失败后按幂等流程重跑成功；Windows 48 files / 564 passed + 1 skipped，Release 五资产、双通道、packaged public check 与五版滚动保留均成功。正式补丁让手动刷新期间已有可靠三卡保持挂载，只替换真正变化的槽位；自动化不等于真实 WeGame、Windows 性能或 installed updater 验证。
- v0.1.41 正式 workflow 首次遇到 Raw 传播超时后按幂等流程重跑成功，Release / 五资产、双通道、packaged UI / bridge、差分和滚动保留均通过；自动化不等于真实 WeGame、腾讯接口或 installed 迁移验证。
- GitHub 当前只保留 v0.1.56、v0.1.57、v0.1.58、v0.1.59、v0.1.60 五个正式 Releases；v0.1.0～v0.1.60 tags 全部保留。本地 `release/` 为空；旧 Release / assets 按滚动策略删除但 tag / source 保留。
- HB-058 腾讯 101 provider 已完成技术实现与审查（`P0=0 / P1=0`）。用户确认适用的书面授权已在仓库外取得；授权正文、身份、条款和附件均属保密信息，不写入源码、文档、日志或发布资产。
- HB-085 已随 v0.1.51 发布：解析与缓存严格沿用 `0..1`，通过 provider snapshot 进入当前英雄 / 备战席 / 英雄榜；不与海克斯全局选取率混用，也不改变 Tier / 胜率排序。真实 Windows 切源、腾讯接口稳定性与 UI 可读性仍待验，状态保持 `FIXED / UNVERIFIED`。
- v0.1.34 已正式发布，仅修复 HB-067：日志 / lockfile 凭据与 transport PID 分离后，以同安装根唯一 Ux、明确 lockfile 名称或观测进程名 + PID 精确一致补齐 Main-only 窗口 authority；缺 authority 的可信对局每 10s 低频补元数据，PID 单独变化也触发窗口同步。多进程、跨根或不明确情况 fail-closed，PID / 启动时间 / 路径不进日志、RuntimeState 或 Renderer。Release 说明准确列出相较 v0.1.33 的两项变化；public v2 / root 为 `0.1.34 / 199282299` bytes，五资产完整。HB-067 保持 `FIXED / UNVERIFIED`，等待真实 log-only / lockfile 国服客户端复测。
- v0.1.35 已正式发布，仅实现 HB-068：诊断页新增选人伴随窗、96px 推荐条与窗口观察器的有限枚举状态，状态转换去重记录且不含 PID、HWND、路径、坐标或标题。Release 说明准确列出相较 v0.1.34 的两项变化；public v2 / root 为 `0.1.35 / 199283491` bytes，五资产完整。HB-068 保持 `FIXED / UNVERIFIED`，等待真实 WeGame 复现时验证诊断有效性。
- v0.1.36 已正式发布，仅修复 HB-069：腾讯当前强化榜的极小选取率使用科学计数法，静态海克斯目录根节点为数组；旧解析器依次误拒两者。真实四端点受限验证已达 `ready / 20260814 / 172 英雄 / 246 强化`；正式 EXE `199283652` bytes，v2 / root 精确为 `0.1.36`，五资产完整。HB-069 保持 `FIXED / UNVERIFIED`，等待用户 Windows 客户端切源复测。
- v0.1.37 已正式发布，仅实现 HB-070：实时助手右上角只显示当前推荐来源名称，不再附带统计日期、dataVersion、“未就绪”或缓存后缀；详情、英雄榜、设置和诊断中的日期 / stale / error 保持不变。正式 EXE `199283718` bytes，v2 / root 精确为 `0.1.37`，五资产完整。HB-070 保持 `FIXED / UNVERIFIED`，等待用户 Windows 客户端视觉确认。
- v0.1.38 已正式发布，仅修复 HB-071：单英雄详情失败不再污染全局 data.dtodo 状态；目录 429 保留同源旧缓存但不自动重试；离线按 15s / 60s / 5min 有界恢复；正文统一 10s / 2MiB；同 dataVersion 目录不可变且新版本仅在文件、pointer 全提交后切 active。正式 EXE `199284622` bytes，public v2 / root 精确为 `0.1.38`，五资产完整。HB-071 保持 `FIXED / UNVERIFIED`，等待 installed 客户端网络波动复测。
- v0.1.39 已正式发布，仅修复 HB-072：同 generation 的队友 / 对手换英雄或交换备战席时，已有历史指标和 opaque key 按 Main-only 身份保持，公开头像、relation / slot 与详情跟随最新权威 roster；拒绝分组暂时从 Renderer 撤下，恢复时不因 roster 更新重查历史。正式 EXE `199286227` bytes，public v2 / root 精确为 `0.1.39`，五资产完整；CI 不等于真实 WeGame，HB-072 保持 `FIXED / UNVERIFIED`。
- v0.1.40 已正式发布，仅实现 HB-073：新安装和尚未保存来源选择的配置默认腾讯 101；revision 7 / 8 中已保存的合法 `dtodo` 或 `tencent101` 选择保持不变，非法值回到腾讯默认。两套推荐继续严格隔离，出装仍是独立 data.dtodo 模块。公开 EXE `199286307` bytes，v2 / root 精确为 `0.1.40`，五资产完整；Release 说明准确列出相较 v0.1.39 的两项变化。真实 installed 迁移与腾讯接口未验，HB-073 保持 `FIXED / UNVERIFIED`。

## 记忆模块

- [运行时、LCU、OCR 与窗口](./memory/RUNTIME.md)：比赛上下文、英雄状态、OCR、96px 提示条、伴随窗、Lobby 背景和视觉性能。
- [数据源、推荐与隐私](./memory/DATA_AND_PRIVACY.md)：data.dtodo、腾讯 101、本地战绩、缓存、联网与敏感信息边界。
- [发布、更新与运维](./memory/RELEASE_AND_OPERATIONS.md)：当前 Release、差分更新、五版滚动、发布恢复、证据边界与迁移约束。
- [缺陷与验收状态](./DEFECTS.md)：HB 编号、状态、真实用户报告和仍需完成的验证。
- [WeGame 交接实机手册](./WEGAME_HANDOFF_RUNBOOK.md)：同机复现、脱敏证据和验收步骤。

## 记忆维护规则

- 新故障只写入 `DEFECTS.md`；主索引不复制根因、测试流水或历史发布日志。
- 稳定契约按主题写入 `docs/memory/`；旧过程从 Git 历史和 GitHub Actions 追溯。
- 只保留现行口径和最新可信证据；候选、Windows CI、fake bridge 与 synthetic updater 不得冒充用户同机 `VERIFIED`。
- 不记录 token、API Key、PUUID、用户名、完整路径、原始 session / history、完整屏幕截图或腾讯压缩原始 payload。
- 每个已经实现、审查并通过对应门禁的独立用户功能或缺陷修复，都单独递增 patch 版本并发布 GitHub Release；不得把多个已完成目标长期堆在 `main`，也不得在门禁未完成时预写版本或发布结果。

## 当前优先级

1. HB-074～HB-076：用 v0.1.43 Windows installed 客户端验证手动/自动卡面刷新均不撤下未变卡片、单槽位动画、选人伴随窗图层跟随与托盘立即更新；必须同时复核真实游戏帧耗时。
2. HB-073：用 v0.1.40 installed 客户端验证新安装默认腾讯、既有显式 dtodo 选择不被升级改写，并复核真实腾讯接口可用性。
3. HB-072：在 v0.1.39 正式版的真实选人局验证换英雄、备战席换位、hidden / partial 恢复和零新增历史请求。
3. HB-058：完成真实 Windows 下的腾讯接口、切源、当前英雄 / OCR / 紧凑条同源与 stale / error 显示验收；不以书面授权或 Release 成功替代技术验证。
4. 真实 WeGame 验收：`GAME_STARTING` 后取消 / 启动、终局 / 第二局、快捷键、OCR 刷新、96px 生命周期、LeagueClientUx 跟随、Lobby PrintWindow、DPI 与性能。
5. HB-057 Wallpaper Engine：v0.1.30 已按用户确认的 Profile / Playlist 英雄切换与离局恢复语义正式发布；待真实 Wallpaper Engine / Steam 多库实机验收。
6. HB-056、HB-059、HB-060、HB-064 继续保持各自 `IN PROGRESS / UNVERIFIED` 或 `FIXED / UNVERIFIED`，直到对应真实环境门禁完成。
7. HB-067：完成 Windows packaged 与真实 log-only / lockfile 国服客户端验收；不得用路径不明的任意 LeagueClientUx 回退。
8. HB-068：发布后用真实 WeGame 复现伴随窗 / 96px 条缺失或错位，并以脱敏枚举定位资格、authority、观察、前台和 3/3 结果边界。
9. HB-069：在 v0.1.36 正式版完成用户 Windows 客户端切源复测；发布成功不代替真实接口与 UI 验证。
10. HB-070 / 071：分别完成 v0.1.37 来源徽标视觉确认，以及 v0.1.38 installed 网络波动 / 429 / 恢复验证；Key / 响应正文不得进入日志或文档。
11. HB-085：在 v0.1.51 Windows 客户端切换 Tencent 101，确认英雄总体选取率在当前英雄、备战席和英雄榜显示且明确口径；缺失数据显示暂无数据，不得与海克斯全局指标混淆。
12. HB-086：用 v0.1.52 Windows 客户端实测单卡刷新期间短暂空窗、连续两次 absence、失焦恢复和帧时间；确认未变化标签不退场、不重播。
13. HB-087：用 v0.1.53 客户端确认队伍级摘要与个人卡片口径可读；真实国服 history / 身份门禁和用户价值仍未验。
14. HB-088：用候选客户端在真实单卡刷新期间记录脱敏 OCR 调度摘要、CPU/GPU、FPS / frametime；确认诊断数据不含截图、OCR 文本、坐标、进程标识、路径或身份，再决定是否需要自适应探测退避。
15. HB-093：在 Windows / 真实 Tencent 响应中确认 `bestHeroes` 关联、同英雄扩展推荐数量、切源 / stale 和 OCR 三卡排序口径；全局 `pick_rank` 不能冒充英雄专属 pickRate。
16. HB-094：确认 OP/T1–T5 分组在两种来源下的可读性；点击英雄时海克斯与独立出装请求不互相阻塞，换源 / 换代后不残留旧详情。
17. HB-095：用 v0.1.65 Windows 客户端确认英雄详情推荐在 data.dtodo Key 缺失 / 失败时仍可显示，且从来源卡进入 Key 页面；真实 Tencent 与同机视觉仍不由自动化外推。

## 当前任务边界

- 仓库：`/Users/duchongyang/Documents/ChatGPT/LOL大乱斗`；远端 `RocXOvO/HexBridge`；branch `main`。
- 外部授权材料只在仓库外保管；任何提交、日志、缓存、Actions artifact 与 Release 都不得包含书信正文或可识别授权方的信息。
- iCloud Desktop / Documents 本地化、冲突副本和依赖污染由迁移协调任务统一执行；本任务不移动 / 删除目录，也不停止 Clash Verge。
- 本轮结束后不自行启动 build、`npm ci`、索引重建、迁移或后台开发任务。
