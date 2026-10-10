# DEV-20261010-07 · 断线保留标注、服主 AI 上限与房主转让

## 基本信息

| 字段 | 内容 |
|---|---|
| 开始 / 最后更新 | 2026-10-10 / 2026-10-10，Asia/Shanghai |
| 状态 | 进行中 |
| 类型 | 调查 / 功能 |
| 分支与开始 HEAD | `feat/IncreasePlayerCapacity`，`e838e875fe7f4f323592ce84a605a9b51df7cf9e`；开始时工作区干净 |
| 上游基线 | v0.2.3，`1db8e51023ae6abaec9370beb81a513d5c4d0b01`；本次只核对本地缓存，未拉取 |
| 提交归属 | 目录后端 `b1fb1df` 与本文首次提交；房间管理后端与本文后续更新同一提交；界面提交待完成 |
| 关联 | D010、D017、D019、D020；[大厅目录](2026-10-10-03-lobby-discovery.md)，[顶部单行](2026-10-10-06-lobby-toolbar-row.md) |

## 需求、范围与验收

用户实机截图出现多间房主离线、仍显示进行中的独立模拟，怀疑房间释放异常；要求调查原因、增加服主可用命令动态设置的房间 AI 数量上限，以及房主转让。

用户确认：

- 所有真人都离线的房间继续展示，标注「断线保留」并置底；保持原续玩期限、统计和最快匹配规则。
- AI 上限默认不额外限制，由服主本机命令配置；下调时等候房从末席开始自动移除多余 AI，正在进行的对局不改成员，结束后返回等候房再应用。
- 仅等候房可转让给在线真人，交换实际座位让新房主成为 P1；自动迁移在等候房同样归 P1，局内保留固定座位、结束后归位。
- 保留其他 UI，按模块定向验证和短 Edge 交互检查，不运行完整 14 回合。本地提交已有授权，未授权本次推送或部署。

## 调查与决定

| 问题 | 证据或来源 | 结论及确定程度 |
|---|---|---|
| 目录是否历史记录 | `server/lobbyDiscovery.js` 读取 `Lobby.rooms`，`inMatch = !!room.match` | 已确认：是实时房间投影，不是历史记录 |
| 多间独立模拟离线仍进行中 | `lobby.js` 的 `onDisconnect`、`resumeWindowMs`；独立模拟 24 小时断线续玩，单人轮选/休整不限时 | 原有保留规则已确认；截图各房实际是否已结算未知，不能断言生产结束回调失效 |
| 真正结束后的释放 | `onMatchEnd` 清空 `match`，离线席位使用 60 秒 grace；最后真人离开会删房 | 源码及 5 个短回归确认，未复现结束后长期标为进行中 |
| 新房主可能不在第一席 | 自动 `migrateHost` 只改 `hostId`，客户端按座位渲染 | 已确认；等待室交换座位可实现 P1，局内交换会破坏固定分组边界，故延期归位 |
| AI 限制是否固定在分发包 | 用户明确要求可配置、默认不限 | 使用私有运行数据，CLI 写入后由服务器监控，不写入分发包 |

长期决定见 [D017](../DECISIONS.md#d017)、[D019](../DECISIONS.md#d019)、[D020](../DECISIONS.md#d020)。

## 实现或操作

| 文件 / 函数 / 操作 | 变化或结果 | 为什么这样做 |
|---|---|---|
| `server/lobbyDiscovery.js` / projection | 摘要增加 `disconnectedRetained`；未离开的真人全部离线时标注，在分页前排到列表末尾 | 不销毁可续玩的房间，区别于正在被玩家使用的房间；组内保留原排序 |
| `server/serverSettings.js` / `tools/server-settings.mjs` | 原子写入私有配置，UTF-8 命令输出；启动读取及每秒监控，合法值变化才调用 `setAiLimit` | 默认不限，重启仍保留；无网页管理接口；启动坏文件拒绝、运行中坏文件保留最近合法值 |
| `server/index.js` | 初始化与实时配置接入 Lobby；绑定失败及正常关闭停止监控 | 与原服务生命周期一致，不留计时器 |
| `server/lobby.js` / AI 管理 | 等候房自末席裁剪超额 AI，真人不改；进行中只同步限额，结束再裁剪；添加和开局再次校验 | 遵从自动移除选择，保留局内阵容 |
| `server/lobby.js` / 房主 | 等候房转让给在线真人并交换实际 P1；自动迁移和局终统一归位，局内不改座位 | 避免固定卡池组、战场与回放身份错位 |
| `shared/protocol.js` / `constants.js` | `room.transferHost {playerId}`、`AI_LIMIT`；AI 移除可选身份保护 | 权限及确认后身份由服务端核对；兼容旧客户端无身份 AI 移除 |
| `tools/package.mjs` / [服主说明](../../SERVER_SETTINGS.md) | 发布新 CLI 与说明，排除 runtime 配置 | 将功能分发给其他服主，限制由各实例自行决定 |

前端交互及 Edge 验证仍在实施。

## 验证

| 命令或场景 | 环境 / 数据 / 版本 | 实际结果 |
|---|---|---|
| `node --test --test-name-pattern='solo resume window\|match ending while a human is disconnected\|reconnect window expiry during a match\|a dropped solo run keeps' test/lobby.test.js` | 改动前生命周期调查，StubMatch / 真实 WebSocket | 5/5 通过，约 9.74 秒；测试连接和服务器已关闭 |
| `node --test test/lobby-discovery.test.js` | 目录模块，65 房分页及真实 WebSocket | 20/20 通过，约 5.17 秒；覆盖断线保留、恢复重新排序、AI/观战/退出边界、统计不变及离线房最快匹配；资源已收尾 |
| `npx eslint server/lobbyDiscovery.js test/lobby-discovery.test.js` | 定向静态检查 | 通过 |
| `node --test test/server-settings.test.js` | 11 项配置/CLI 测试，含真实 WebSocket 和约一秒动态读取 | 11/11 通过；坏文件启动报错、运行中保留、目录/参数/UTF-8/原子写/退出监控通过；资源已收尾 |
| `node --test test/room-management.test.js` | 8 项房间管理定向测试，20 席边界及 HeldMatch | 8/8 通过；转让权限、P1/AI/空席交换、配置保留、陈旧请求、局内固定席位、结束裁剪、AI 限额通过 |
| `node --test test/lobby.test.js test/lobby-kick.test.js test/lobby-capacity.test.js test/lobby-discovery.test.js test/lobby-ownership.test.js` | 平台 StubMatch 与真实 WebSocket 回归 | 97/97 通过，约 21.5 秒；测试资源已释放 |
| 后端及配置定向 ESLint | 新增模块、CLI、index、lobby、protocol、constants 与新测试 | 0 错误；lobby 两个原有 unused 警告保留 |
| `node --test --test-name-pattern='selection:\|refusal list:\|server owner CLI' test/package.test.js`；`node --test --test-name-pattern='the real tracked tree:' test/package.test.js` | 仅选择规则与源码引用闭包；新增文件加入本地索引后核对 | 3+1 项通过；新 CLI/说明发布，私有配置不发布；未执行完整打包 |

新增功能及 Edge 验证待执行；不会将计划写成通过。

## 结果、遗留与接手

- 实现结果：调查、目录和房间管理后端完成，前端与 Edge 验证进行中。
- 未确定或未完成：生产截图中各对局是否真实完成未核实；需服务器日志或可复现步骤才能确认额外生命周期问题。
- 提交 / 远程 / 素材 / 线上：提交待完成；本次未操作远程、未改素材、未部署。
- 接手入口：`server/lobby.js`、`server/lobbyDiscovery.js`、`server/serverSettings.js`、`tools/server-settings.mjs`、等待室与目录 UI。

## 后续补充

无。
