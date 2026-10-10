# DEV-20261010-07 · 断线保留标注、服主 AI 上限与房主转让

## 基本信息

| 字段 | 内容 |
|---|---|
| 开始 / 最后更新 | 2026-10-10 / 2026-10-10，Asia/Shanghai |
| 状态 | 进行中 |
| 类型 | 调查 / 功能 |
| 分支与开始 HEAD | `feat/IncreasePlayerCapacity`，`e838e875fe7f4f323592ce84a605a9b51df7cf9e`；开始时工作区干净 |
| 上游基线 | v0.2.3，`1db8e51023ae6abaec9370beb81a513d5c4d0b01`；本次只核对本地缓存，未拉取 |
| 提交归属 | 本任务分批本地提交，首次代码与本文同一提交；后续提交待填写 |
| 关联 | D010、D017；[大厅目录](2026-10-10-03-lobby-discovery.md)，[顶部单行](2026-10-10-06-lobby-toolbar-row.md) |

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

长期决定将在验证后补入 [DECISIONS.md](../DECISIONS.md)。

## 实现或操作

| 文件 / 函数 / 操作 | 变化或结果 | 为什么这样做 |
|---|---|---|
| `server/lobbyDiscovery.js` / projection | 摘要增加 `disconnectedRetained`；未离开的真人全部离线时标注，在分页前排到列表末尾 | 不销毁可续玩的房间，区别于正在被玩家使用的房间；组内保留原排序 |

AI 配置、转让及前端尚在实施，最终文件与边界在验证后补充。

## 验证

| 命令或场景 | 环境 / 数据 / 版本 | 实际结果 |
|---|---|---|
| `node --test --test-name-pattern='solo resume window\|match ending while a human is disconnected\|reconnect window expiry during a match\|a dropped solo run keeps' test/lobby.test.js` | 改动前生命周期调查，StubMatch / 真实 WebSocket | 5/5 通过，约 9.74 秒；测试连接和服务器已关闭 |
| `node --test test/lobby-discovery.test.js` | 目录模块，65 房分页及真实 WebSocket | 20/20 通过，约 5.17 秒；覆盖断线保留、恢复重新排序、AI/观战/退出边界、统计不变及离线房最快匹配；资源已收尾 |
| `npx eslint server/lobbyDiscovery.js test/lobby-discovery.test.js` | 定向静态检查 | 通过 |

新增功能及 Edge 验证待执行；不会将计划写成通过。

## 结果、遗留与接手

- 实现结果：调查完成，三个功能进行中。
- 未确定或未完成：生产截图中各对局是否真实完成未核实；需服务器日志或可复现步骤才能确认额外生命周期问题。
- 提交 / 远程 / 素材 / 线上：提交待完成；本次未操作远程、未改素材、未部署。
- 接手入口：`server/lobby.js`、`server/lobbyDiscovery.js`、`server/serverSettings.js`、`tools/server-settings.mjs`、等待室与目录 UI。

## 后续补充

无。
