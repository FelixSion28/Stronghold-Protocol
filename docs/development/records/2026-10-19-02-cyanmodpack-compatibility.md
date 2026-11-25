# DEV-20261019-02 · CyanModPack 安装兼容性

## 基本信息与范围

2026-10-19，Asia/Shanghai。状态：已完成静态兼容性调查，未安装。分支 `release/v0.3.1`，开始 HEAD `d94f8f28`，工作区干净。用户询问能否安装 [CyanF1sh/Stronghold-Protocol-CyanModPack](https://github.com/CyanF1sh/Stronghold-Protocol-CyanModPack)；本次先核对安装条件和覆盖范围，不降级当前发行或强制覆盖核心代码。

当前发行规则见 [D032 / D033](../DECISIONS.md#d032--v031-发行兼容)，既有插件 API 分析见 [DEV-20261019-01](2026-10-19-01-plugin-decoupling-feasibility.md)。本次没有沿用聊天中早期 0.2.4 基线：本地 package.json 实际为 0.3.1，已包含官方插件系统及二十人定制。

## 来源与证据

- 联网读取来源 main，固定提交 `6c7079c4f34e54efb0a9516f0b1e0e3d6be7c65a`，提交时间 2026-10-13 22:10 UTC（北京时间 10 月 14 日）。其根 `VERSION` 实际仍为 `0.2.6`，不是只依据可能过时的 README。
- 读取 `docs/INSTALL.md`、`docs/MODS-LIST.md`、`tools/apply-overlay.mjs`、`overlay/ORIGIN.sha256`、`overlay/MANIFEST.sha256`、自定义 loader，以及聊天 / 人数等 mod.json。仓库发布清单为 14 个 MOD，默认全部启用；说明中少数旧计数或旧启停描述不作为实际清单依据。
- 该包需要先安装 105 文件的平台覆盖层，再加载 `mods/<id>/mod.json`；来源 loader 对 `gameVersion` 严格相等校验。当前官方宿主为 `plugins/<id>/plugin.json` / manifest 2，另有旧包 / Forge 转换，不是该自定义宿主。
- 按其 105 项覆盖清单对本地工作区计算 SHA-256：42 项等于原版基线（含预期不存在的新增文件），0 项已经是覆盖层，63 项与安装器期望基线不同；将 CRLF 归一到 LF 后仍为 63 项。注意这是静态哈希比较，不是 63 个三方文本合并冲突，也不是已执行安装器的结果。
- 不一致的目标包括 `server/index.js`、`server/lobby.js`、`server/match/pool.js`、`server/match/match/spDraft.js`、`server/match/player/diy.js`、`server/match/player/economy.js`、`server/sim/content/index.js`、`shared/constants.js`、`shared/protocol.js`、游戏 / 房间 / 调配 / 设置和渲染页面。整文件覆盖会替换当前版本实现，不能视作只放入一个独立内容插件。
- `cyanfish.max-seats` 的默认容量是 6、范围 1–12，通过全房份数与机变卡数适配人数；与本地上限 20、固定三/四/五人组、分组库存及并行轮选不是同一套玩法。`cyanfish.diy-34` 也会改变自选位规则；皮肤、公告、在线人数等与当前既有功能交叉。
- 聊天 `cyanfish.chat` 还依赖其 `game.banners` / `settings.sections` 插槽、平台聊天通道与 `g.danmaku`；并非把 manifest 版本改成 0.3.1 就能运行。

## 结论和后续路径

**当前 0.3.1 定制发行无法原样直接安装该整包。** 将版本号改成 0.3.1 或运行 `--force` 只会跳过保护，不解决插件宿主与业务接口变化；不能据此保证可运行或保留当前功能。

推荐保留当前发行，按实际所需功能单独移植到官方插件 API；需要房间消息 / 管理接口的部分作为窄核心扩展维护。优先评估聊天 / 弹幕、音效替换和新增管理展示，避免重复引入另一套人数、皮肤与公告系统。涉及战斗行为的修复需先对比 0.3.1 已有修复与炎佑定制，不默认整包启用。此处只是推荐，不表示已决定具体移植范围。

若只是想体验作者完整 14 项，可在独立目录准备原版 0.2.6 和独立端口，隔离运行其平台覆盖层；这属于旧版本独立实例，不是装进当前 0.3.1。当前任务未创建或启动该实例。

## 实际操作与验证边界

- 读取 Git 状态、当前版本、维护决定、官方插件 manifest / 安装入口，联网读取上述来源源码与清单。
- 尝试将来源浅克隆至忽略目录 `.cache/cyanmodpack-20261019/source`，GitHub 连接被重置；后续通过 GitHub connector 完成固定版本读取，没有因克隆失败推断仓库不可用。
- 兼容性哈希报告留在忽略目录 `.cache/cyanmodpack-20261019/compatibility.json`；仅静态比较，没有执行来源安装器、其 MOD 脚本或后端。
- 未修改游戏 / 插件 / 部署配置、未下载游戏素材、未启用任何 MOD、未连接或重启服务器、未推送。只新增本记录和维护入口链接。
- 本次不包含游戏、浏览器、完整 CI 或 MOD 运行兼容测试；125 条本地文档相对链接全部存在，`git diff --check` 通过，差异仅本记录及两处维护入口，未提交。
