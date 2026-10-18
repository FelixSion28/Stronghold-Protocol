# DEV-20261019-01 · 当前定制改动插件化可行性

## 基本信息与范围

2026-10-19，Asia/Shanghai。状态：已完成静态可行性调查，尚未实施。分支 `release/v0.3.1`，开始 HEAD `7fb294c4`，工作区干净；对比本地 master（正式 v0.3.1 `b3deebda`）与当前发行分支。用户要求分析各种改动能否解耦为插件，并寻找已合并来源的现成插件。只读游戏源码、公开仓库与包内容，新增本调查文档及入口；未修改游戏、插件、部署配置或线上服务，未运行外部安装器和包代码。本文同一文档提交按路径查询。

沿用 [当前发行基线](2026-10-18-01-upstream-v031.md)、[部署记录](2026-10-18-02-deploy-v031-3000.md)、[多人合并](2026-10-10-12-felix-capacity-merge.md)、[Yuri 合并](2026-10-12-02-yuri-merge.md) 与已确认的 D009–D033。下列方案是建议，不新增或取代用户已确认的玩法决定。

## 总体结论

可以部分插件化，现有 0.3.1 官方插件 API 无法原样承载全部功能。应区分三类交付：官方格式插件、必须保留的核心扩展、独立运维工具。把整份源码放进覆盖目录或在运行时替换内部方法，只是改变补丁的装载方式，仍需逐版解决源码兼容，不能算消除了上游合并成本。

现有接口参照 [PLUGINS](../../PLUGINS.md)、[PLUGIN-API](../../PLUGIN-API.md)、[SKINS](../../SKINS.md) 与实际代码：

- `content` 可覆盖经过验证的数据、经济和模式配置；`rules` 目前仅四项（商店盟约偏向、休整改调配、变形同构体、卸装备），没有人数、固定组、联防轮次、倍率或索敌策略字段。
- `ui` 是只读 iframe，只有 `hud.right`、`result.tab`、`stats.tab`、`room.panel` 四个插槽；不能发送 `room.*` / `g.*` 意图，也不能改宿主 DOM、顶层网络或 SW。
- `script` 可注册干员、敌人、战斗内容和准备阶段效果；SDK 为实验性。`meta.register` 是效果处理器注册，不是任意 Match 状态机扩展。
- `trusted.server` 在独立子进程，通过受限的 `/x/<id>/…` JSON 路由、只读大厅事件及 health 扩展与宿主通信，不提供真实 Lobby/Match/WebSocketServer 对象。`trusted.page` 可执行任意原生页面代码，但需要配置、固定锁与同意；依赖内部模块和 DOM 的改写仍会绑定具体版本。
- 玩法插件使用自己的内容哈希 `cs` 和内容集 match host，标为非官方；默认统计会区分原版与玩法插件。脚本默认关闭，后续若迁脚本需单独配置 sandbox，不能假定现有生产配置已经启用。

## 逐项拆分判断

| 当前功能 / 来源 | 可行性与成本 | 建议归属和原因 |
|---|---|---|
| 二十人、4/8/10/16/20 档位、默认八席（LongQianChen） | 现有普通插件不能完整承载；高 | 核心扩展。人数在 `shared/constants.js`、协议校验、Lobby、Match、视图及布局中使用，不是 config 数据项；仅注入容量面板不能扩容 |
| 固定卡池组、并行策略/机变、真人优先、多轮联防与投票、领袖退出缩血（LongQianChen 及后续定制） | 高，和二十人应视为同一玩法能力 | 可先拆成独立核心模块；若要求官方可装卸插件，需要新增容量/分组/轮选/联防的完整模式扩展契约，而非一两个数值 hook。私有库存和跨组赠送不能丢失 |
| 阶段时长 1–5 倍、0.1 步长、固定过渡不变（本地） | 部分可用 content；完整保留为中等成本 | `GameData` 支持模式 `timers`、轮次 `prepTime`，但当前策略每轮来自代码常量 `BAND_TURN_SECONDS`，房间倍率来自 `room.create.timerScale`；现有 JSON 补丁无乘法表达式。需预生成各倍率值或保留窄计时策略接口，避免乘两次和放大固定过渡 |
| 炎佑出生归属优先（本地） | 原样迁移有接口缺口；补接口后中等成本 | `setupUnitKit` 对 token 先走 `tokens.kits`；`sp.kits.register` 的干员覆盖接管不到炎佑。移动选目标、普攻 priority 和喷火初始锁定分布在 `tokens.js` / `targeting.js`。建议通用召唤物 kit/选目标扩展，或统一策略接口后再做脚本；不能靠改 taunt 影响全场 |
| Yuri 时装目录、皮肤选择 | 基础图像/模型可迁 cosmetic；完整语义为中到高 | 优先复用上游 `room.skins`、选择器和 `chars[].skins`，迁移 `sp.pref.outfits` 与旧 id；不能直接删旧逻辑。当前 `data/assets.json.outfits` 与官方 skins 不同容器，overlay 的 ref 不能任意跨容器；还需处理安装素材索引 |
| 时装专属语音、召唤物外观（Yuri） | 不能由现有皮肤条目完整表达 | `SKIN_RECORD` 没有 per-skin voice 和 token 映射；全局 audio/token override 不等于按玩家穿着生效。应补数据与解析接口或保留小适配层，不能把完整换装降级成只换头像 |
| 单干员伤害、逐轮与结算图（Yuri） | 展示适合 ui；当前全功能中等成本 | 官方 ui 模板已有伤害累计，Forge 有结算看板。但本地按 `damageUnits(ownerId)` 累计、合并精锐/召唤物并保留逐轮历史；现有 iframe 的事件批次和 snapshot 有截断，不能靠事件相加冒充完整数据。建议提供只读累计伤害/归属摘要，再迁展示 |
| 难度说明（Yuri） | 适合只读 ui，低到中 | 可放 `room.panel` / `stats.tab`；接受显示位置改变即可。需要准确提供模式参数，避免插件复制一份逐版过时的难度表 |
| 盟约意向与冲突提示（Yuri） | ui 仅可展示；交互需要核心协议，中 | `g.bondCall`、服务器保存与组内广播需保留。未来可增加专用受校验桥接，而非开放任意 `g.*` 发送 |
| 大厅目录、在线人数、快速匹配、搜寻队友、公共队列（多人 / Yuri） | 核心或服务扩展，高 | 官方 ui 没有完整大厅目录 feed 或大厅写接口；trusted 事件也是副本。匹配还依赖容量、倍率、cs、vs、模式和准备状态，不能用客户端插件绕过 |
| 普通纯文字公告 | 可迁 `notices`，低 | 0.3.1 自带声明和展示，notice-only cosmetic 可承载；不应重复造普通文字公告系统 |
| Markdown/图片、置顶、发布版本免提示、紧急全员推送（本地 / 多人） | 现有 notices 不完整，完整保留中到高 | notices 是纯文本、有条数/长度限制、已读按 notice id；没有原 Markdown 图片与紧急广播语义。可拆普通文本插件与服务器公告模块；若仍需要全部能力，需通知/资产的专用宿主接口 |
| ZIP 导入导出、哈希增量、旧包复用、限流、统一 SW（多人 / Yuri / xinhai） | 核心平台能力，高 | UI iframe 禁止网络，无法接管宿主 CacheStorage/SW/HTTP素材分发。保留唯一缓存实现、server catalog/limiter 与打包工具；不能每插件注册一套根 SW |
| compact v1、WS 压缩及回退（多人 / 本地整合） | 传输核心，高 | 需要双方编码、协议协商和 WebSocketServer 启动选项；官方插件 SDK 不提供传输替换接口。普通压缩先沿用上游，本地紧凑协议差异独立维护 |
| 中文默认、语音方块选择器、原生配音回退、提示音（Yuri / 本地取舍） | 部分可用 lang/cosmetic；精确交互仍需 UI 支持 | 翻译词条可用 lang，替换音频可用 cosmetic，主题只覆盖 token 白名单；调配页控件布局和偏好清理语义不是普通 iframe 插槽能替换的。先复用上游已有语音存储 |
| 模型裁切、炮弹表现、WebGL/渲染兼容等修复 | 优先去重或保留修复，中 | 已被上游接纳的差异直接删除重复实现；未接纳的渲染问题依赖 Pixi/Spine/渲染器内部，cosmetic 不能替换算法。基础兼容修复不宜变成玩家必须选开的玩法插件 |
| generations 路由、部署脚本（Yuri，当前线上未启用） | 可独立运维包，低到中 | 保留在独立部署工具仓库/目录即可；不必塞入游戏内容插件，也不能把工具存在写成当前生产已使用零停机 |

### 必须先解决的兼容细节

1. **二十人 UI 数据缺口**：当前 `shared/plugins/ui.js` 的 `subsetPublic` 使用 `MAX_SEATS`，但 `subsetRoom` 与 `subsetResult` 仍 `slice(0, 8)`。正式迁容量/结算面板前需统一人数上限，否则第 9–20 席缺失；这是静态确认，尚未修复。
2. **不等价的图表**：Forge `dmg-board` 是每位玩家的结算统计表，不能直接替代 Yuri 的本人逐干员、分回合图。
3. **内容和匹配**：当前 `roomContentKey` 同时比较 cs/vs/模式/插件集合，房间合并再比较容量/倍率；`soloQueue` 排除非原版或带插件的房。计时/炎佑迁玩法插件后，公共匹配资格和跨房兼容需明确核对，不可保证行为自动保持。
4. **素材路径与旧偏好**：旧 outfits / 新 skins 的 id、优先级、专属语音、召唤物、补位/自选、其他玩家显示开关都需迁移。官方素材继续安装层管理，不为打包方便把游戏素材提交到插件源码仓库。
5. **默认/卸载行为**：插件卸载后应回到上游原版策略；禁用定制不能删除既有存档或让同场不同客户端运行不同逻辑。脚本运行方式、锁文件与内容哈希都必须跟随发行。

## 已合并来源与公开现成包调查

2026-10-19 通过 GitHub API 读取默认分支/相关分支、递归树和近期 releases；未 fetch/merge 远端分支。这里只能证明下列公开范围内未找到，不声称互联网上绝无其他实现。

| 来源与固定快照 | 已确认结果 |
|---|---|
| [LongQianChen](https://github.com/LongQianChen/Stronghold-Protocol)，`feat/IncreasePlayerCapacity` / `d7d541e73b307500c024c06feef8fcd1f0cd6248` | 相关树未找到 plugin.json/pack.json 或插件发行；近期发布是 0.2.4/0.2.3 多人完整程序与资源 ZIP。没有找到能直接装在 0.3.1 的同等二十人插件 |
| [YuriRestia](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation)，`dev-0.2` / `c19e1989219223e2d969ef721d813557e56e275f` | plugins 目录只有官方模板，近期发行 `Stronghold-Protocol-v0.3.0-preload.zip` 是预载包；时装、图表、语音、匹配仍在 fork 源码与 changelog 内。没有找到完整独立官方格式插件；远端新功能不等于本地已合入 |
| [xinhai-ai](https://github.com/xinhai-ai/Stronghold-Protocol)，master / `e01036ae62acf1be17a118e6a6ef116cbb747b13` | 官方插件模板、预载与构建源码；resources release 为资源 ZIP，未发现承载缓存实现的独立官方插件 |
| [secret-c/sp-mp](https://github.com/secret-c/stronghold-protocol-plugins)，`a1136a2da630ad22f241d727d97b4562d6c14636` | 1.6.1，面向 0.2.6，4/8/12 人；README 与 manifest 明示 52 覆盖文件、专用启动器/叠加目录，不是当前 manifest 2 API。可参考独立打包方式，不能直接替换现有二十人固定组 |
| [Forge-Mods](https://github.com/XiaMo233M/Stronghold-Protocol-Forge-Mods)，`0dc1a4fc9db9ead85bf41258046e92065bbf6e5f` | 找到 dmg-board 1.0.0、skin-picker/skin-catalogue 1.0.0、notice-board/srv-notice 1.0.0、capacity-panel 1.0.1、ws-compression-reference 1.0.0。读取了其中六份无素材 ZIP 的 manifest 和文件列表，只读未执行/安装 |
| [Rhodes-Mod](https://github.com/Stronghold-Protocol-Mod/Rhodes-Mod)，`9050c0497723cf9ade5acaab747dad37722e30df` | 最新公开 release v1.8.0，README 基线仍是原版 0.2.6，采用补丁/差量安装；本地此前仅调查，未合入，不计入此次必须拆分功能 |

Forge 现成包的适用边界（已查看包内 manifest，不把目录标题当成功能证明）：

- `capacity-panel` 明确仅只读显示与选择预览，不能改变房间容量。
- `dmg-board` 使用 `screen.result.footer`，0.3.1 已有映射到 `result.tab`；是最值得先做 import dry-run 的参考候选，但本轮没有导入验证，不保证开箱可用。
- `skin-picker` 使用 `screen.loadout.detail` 和 `room.appearance`，当前导入器没有该插槽映射，shim 的 net.send/session.send 返回不可用，无法自动保留换装交互。应复用上游 skins，不照搬旧包接口。
- `notice-board` 可参考文本内容，旧 `notices` 是 announcement/credits 文件结构，当前 importer 的 Forge 转换不自动导入 notices；需改写 manifest 2 的列表。
- `srv-notice` 另带 Stardust 专用 pack；不是上游 0.3.1 原生公告插件。
- `ws-compression-reference` 明确只展示压缩说明，不启用压缩；不能替换协议实现。
- 官方自带 `plugins/_template/ui/` 已有伤害累计模板，比另引不兼容宿主更直接。`docs/plugin-catalog.example.json` 明确是 example.invalid 示例，不是实际插件市场。

## 推荐实施顺序（仅建议，尚未授权实施）

1. 固定当前发行与偏好迁移口径，建立“功能—来源—替代接口”的差异清单；先删除已有上游等价能力的重复实现，保留特有语义。
2. 首批做伤害/难度说明等只读展示插件与纯文字 notices；先修 UI feed 二十人截断，图表用累计只读摘要保证准确。插件源码独立版本化，发行时 pack/lock，游戏只保留必要桥接。
3. 将时装统一到官方 skins，设计旧偏好/素材索引迁移；完整保留专属语音和召唤物外观需要补接口。不要先删旧链路再补功能。
4. 为炎佑增加可选的通用召唤物行为/索敌策略接口，三个索敌入口共享；按出生 ownerId、范围及持续喷火锁定约定做独立脚本/策略包。计时按配置覆盖和窄策略接口拆出，保留固定过渡。
5. 多人玩法作为独立核心扩展维护；只有确实需要纯官方插件部署时才推动更大的模式 API。缓存/协议保留平台层；generations/部署工具单独发行。

预期收益是降低时装/展示/小规则内容与上游代码的交叉修改，不能承诺从此无冲突。若目标是“每次直接覆盖上游完整包、仅复制 plugins 就恢复当前所有功能”，现有 API 下无法满足。若目标是“少量稳定核心扩展 + 可独立发布内容插件 + 运维工具”，可逐步实施且能保持既有功能。

## 实际操作与验证边界

- 执行 Git 状态/相对 master 差异和源码检索；核对插件 manifest、SDK、token kit、mode timers、iframe 桥、素材 overlay 与匹配代码。
- 联网读取上述公开元数据、源码与六份 ZIP，下载留在忽略的 `.cache/plugin-feasibility-20261019/`，只以 ZipArchive 读取声明/文件名；没有执行作者代码、打包、import、安装、启用脚本或发起任何线上操作。
- 本轮为静态可行性分析，未跑游戏、浏览器、兼容性或性能测试；现成包未作安装成功保证。`git diff --check` 通过，未新增游戏或插件代码。
