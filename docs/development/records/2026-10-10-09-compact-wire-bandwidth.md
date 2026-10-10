# DEV-20261010-09 · 紧凑网络协议与多人带宽优化

## 基本信息

| 字段 | 内容 |
|---|---|
| 开始 / 最后更新 | 2026-10-10 / 2026-10-10，Asia/Shanghai |
| 状态 | 进行中：位置协议与 WebSocket 接入完成并通过定向回归；HTTP 优化及后续验证进行中 |
| 类型 | 性能优化、协议架构、调查与验证 |
| 分支与开始 HEAD | 从核心 `feat/IncreasePlayerCapacity` 的 `cf30fb2980fe27363dcafdfb677317f80c503b49` 创建 `perf/compact-wire-bandwidth`；开始工作区干净 |
| 上游基线 | 本地已合并 v0.2.3，`1db8e51023ae6abaec9370beb81a513d5c4d0b01`；本任务未联网刷新远程 |
| 提交归属 | 按功能分批本地提交；实现和记录同属时按记录路径查询 |
| 关联 | 多人压力待办 I002；素材缓存决定 D016；协议决定 D021 与 [WIRE_PROTOCOL](../../WIRE_PROTOCOL.md) |

## 需求、范围与验收

用户完整授权在新测试分支开发位置数组、消息类型与阶段枚举协议，降低公共状态最高发送频率至约 5 Hz，实施压缩以及稳定的页面代码 / 数据优化；允许进一步研究和深入测试。保留原 JSON 的业务语义，维护完整协议说明和恢复工具，不改变玩法、卡池、联防或战斗结果。沿用已授权的分批本地提交；不推送、不合并回核心分支、不部署。

验收包括：编码后能无损恢复标准 JSON；新旧客户端和重连安全；公共视图各阶段、私有消息、房间 / 大厅、战斗报告正常；常规公共广播不超过 5 Hz，必要的阶段切换和重同步立即送达；用可复现测量比较原 JSON、紧凑协议和实际压缩流量；检查 HTTP 缓存、压缩、并发和削峰边界；执行有针对性的回归及 Edge 短流程，记录测试限制并释放本次资源。

## 调查与决定

| 问题 | 证据或来源 | 结论及确定程度 |
|---|---|---|
| 公共状态是主要带宽来源 | 用户提供的明文 `game-local.pcap`，分析输出位于项目外的 `../网络报文研究/分析结果/` | 抓包全体 `m.public` 约 198.67 MB，占 TCP 下行 56.95%；主房间约 180.16 MB 原 JSON。该抓包在线版本为 0.2.2，不等于本次本地 0.2.3；已确认 |
| 微小变动重发重型字段 | 主房间战斗阶段 219 次相邻视图比较，218 次羁绊未变、178 次玩家数组未变；当前 `messaging.js` 去重只比较完整对象 | 需要同时减少字段名、利用跨消息重复及合并发送；已确认 |
| 压缩被显式禁用 | `server/http/websocket.js` 的 `perMessageDeflate: false` | 浏览器与服务器没有协商 WebSocket 压缩；已确认 |
| 常规公共广播上限 | `server/match/match/common.js` 的 `DELAYS.PUBLIC_THROTTLE` 与 `messaging.js` | 原设计最短 100 ms；已改为 200 ms，保留关键强制路径与完整快照去重；虚拟时钟定向验证通过 |
| 页面代码 / 数据峰值 | 抓包代码 / 数据约 27.78 MB，峰值秒约 15.74 Mbps；当前已有 gzip 和条件请求 | 优化必须检查完整依赖版本一致性，不能仅给入口加长期缓存；已确认，方案待源码核对 |

## 实现或操作

| 文件 / 函数 / 操作 | 变化或结果 | 为什么这样做 |
|---|---|---|
| `git switch -c perf/compact-wire-bandwidth` | 在当前核心 HEAD 创建测试分支，未触及远程 | 满足隔离测试要求，保留核心分支作为回退点 |
| `shared/wireSchema.js`、`shared/wireCodec.js` | 建立独立 v1 位置表：全部 21 种 S2C、50 种 C2S、9 组枚举及嵌套记录；存在位图与扩展位保持字段语义 | 可无损恢复原 JSON，未知字段不静默丢弃，编号不会跟着业务验证器遍历顺序漂移 |
| `tools/wire.mjs`、`docs/WIRE_PROTOCOL.md` | UTF-8 JSONL 编解码与完整目录导出；说明所有版本、位图、枚举和维护规则 | 后续维护者可还原抓包文本，位置目录以代码为唯一来源 |
| `server/net.js`、`server/lobby.js`、`public/js/net.js` | 每条物理连接独立协商；一次广播只生成一次原 JSON / 紧凑文本；旧格式存储的结果仍通过协商边界重放；异常解码重连并退回 JSON | 新旧客户端、观战和持久身份共存；界面只接收还原后的业务对象 |
| `server/http/websocket.js` | permessage-deflate，服务端保留 32 KiB 字典、客户端不保留，level 6 / memLevel 7、并发 4；SP_WS_DEFLATE 应急关闭 | 浏览器原生解压，利用跨消息重复；压缩工作与解压后输入有边界 |
| `server/match/match/common.js` | 公共状态常规节流 200 ms，原有强制同步与去重保留 | 降至最高 5 Hz，不降低模拟步长或个人操作响应频率 |

## 验证

| 命令或场景 | 环境 / 数据 / 版本 | 实际结果 |
|---|---|---|
| 基线检查 | Windows，Git 分支 / HEAD / status / remotes，项目级 AGENTS 与开发规范 | 核实核心 HEAD 和干净工作区，读取现有规范 |
| `node --test test/wire-codec.test.js` | 当前 v0.2.3，Windows Node；覆盖 2840 种结构组合、1–20 席位真实视图、UTF-8 CLI、异常和原型边界 | 8 项通过；网络接入仍待后续阶段 |
| `node --test test/docs-paths.test.js test/docs-consistency.test.js` | 协议模块第一阶段 | 31 项通过 |
| `tsc --noEmit --checkJs -p jsconfig.json`、新模块 ESLint 与 `git diff --check` | 协议模块第一阶段 | 初次类型检查暴露推断问题，补充元组与输出数组类型后复验；全部通过 |
| `node --test test/wire-network.test.js` | 20 独立实际 WebSocket 玩家连接＋1 观战，新数组 / 旧 JSON 各 10 玩家；40 次代表性完整视图，非真实 20 人游玩 | 8 项通过；原 JSON 总计 27,610,800 B，实际压缩网络数据 536,011 B（含 WebSocket 帧），此场景减少约 98.06%；5 Hz、异常降级、RATE rid、解压后 64 KiB 限制通过 |
| `node --test test/match/realtime.test.js` | 真实双客户端（数组 / JSON 混用）＋2 AI，运行到第 4 回合休整；Windows Node | 1 项通过，约 25 s；未跑完整 14 回合 |
| 网络、房间与身份定向批次 | lobby / lobby-discovery / room-management / client-static / client-identity-handshake / client-identity-session / lobby-capacity / setup-reroll-ws；日志保留 `.cache/compact-wire/network-regression.log` | 475 项通过，0 失败；包含掉线保留、重连及旧 JSON 结算重放 |
| 协议 / 网络 / 文档合并复验，类型检查及相关文件 ESLint | 网络阶段提交前，补齐真实战斗输入/结果的嵌套目录；`.cache/compact-wire/wire-stage.log` | 47 项通过，类型检查通过；ESLint 0 错误，2 条原有 no-useless-assignment 警告（net.js token / lobby.js seed） |

不自动进行从开局到第 14 回合结束的完整长流程；各阶段采用定向状态机测试和短浏览器流程。生产链路与真实多机真人压测需要部署环境，不能将本机检查写成线上验证。

## 结果、遗留与接手

- 实现结果：独立分支、可逆编码、协商与压缩及 5 Hz 公共状态接入已完成；HTTP 优化待完成。
- 未确定或未完成：真实抓包重放测量、更多并发压力、HTTP、Edge 检查及最终文档。
- 提交 / 远程 / 素材 / 线上：协议目录第一阶段 `721081b`；网络接入与本文的更新同属下一功能提交（按路径查询）；本任务未操作远程或素材，未部署。
- 接手入口：`shared/protocol.js`、`server/net.js`、`public/js/net.js`、`server/lobby.js`、`server/match/match/messaging.js`、`server/http/`。

## 后续补充

后续按功能补充设计、实际测试、测量结果和提交归属。
