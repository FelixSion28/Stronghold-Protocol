# DEV-20261013-05 · 炎佑首领战出生归属优先索敌

## 基本信息

| 字段 | 内容 |
|---|---|
| 开始 / 最后更新 | 2026-10-13 / 2026-10-13，Asia/Shanghai |
| 状态 | 本地实现与验证完成，CI 的既有 Windows 测试限制已记录；不推送或部署 |
| 类型 | 玩法功能 |
| 分支与开始 HEAD | `feat/yanyou-boss-own-targets`，从 master `cf7a9400270d5aa79b2e601e405dab782e25f120` 建立 |
| 上游基线 | 官方 v0.2.5，同本地 master，本轮未 fetch |
| 提交归属 | 与本文同一功能提交，按记录路径查询 |
| 关联 | [D027](../DECISIONS.md#d027--炎佑首领战优先出生归属)；此前分析保存在定制分支的 `b10db775`，未带入本分支 |

## 需求与范围

用户明确要求基于 master 的新 feat 分支，按出生归属实施：本方优先、同方保留原仇恨顺序；没有本方可选目标时支援队友，普攻保留范围且不足三个可补足；移动追踪、普攻、喷火起始锁定一致。本次仅本地改动，不推送或部署。已有效的喷火锁定保留；范围采用分析建议的配对 boss / hidden，普通 / 联防 / 单人不变。

开始时定制分支有上一轮分析文档未提交，先以 `b10db775` 保存在原 `feat/felix-customizations` 后，从干净 master 创建本分支；没有携带其他整合改动，没有移动 master。

## 实现与依据

| 文件 / 路径 | 改动与理由 |
|---|---|
| server/sim/targeting.js | 添加 spawnOwnerRank：两人 boss / hidden 按 ownerId 比较；缺失攻击者归属不建立偏好。sortEnemyTargets 只对 ownSpawn 优先标记应用该层，其他优先模式保持原行为 |
| server/sim/content/tokens.js | 炎佑 profile 添加 ownSpawn；全场追踪复用归属排名，同排名保留原路程 1e-9 容差；喷火开始与普攻采用同一优先标记；锁定、元素损伤 / 脆弱及伤害公式不改 |
| test/content/yanyou-boss-targeting.test.js | 使用真实炎佑 kit 的 15 个场景：左右 / boss-hidden、跨线出生归属、普攻超过三候选及补足、同方仇恨顺序、隐匿 / 死亡支援、距离边界、锁定与再次释放、分裂继承、缺失归属及其他攻击者、普通 / 联防 / 单人不变 |
| docs/design/engine.md、docs/SIM.md、docs/history/0.2.5.md | 更新定制规则、API 与当前版本历史，明确原版来源与维护者偏离 |

来源：已有 spawnEnemy 的 ownerPlayerId / 出生位置赋值、spawnChildren 的父级归属继承、PRTS 炎佑全场仇恨说明，以及用户对定制的明确授权。此次没有新增无法考证的数值或官方规则，无新增 `[ASSUMED]` 点。不会修改 ownerId，否则会影响赏金、漏怪和统计。

## 验证

| 检查 | 实际结果 |
|---|---|
| 定向 content / targeting / detmath | 129 项全部通过，0 失败 / 跳过 |
| 初次新增用例 | 两项测试夹具不当：普通场起点在右边界，无法再向右移动；技能结束后未等待原施法间隔。修正夹具和等待后通过，未改变生产冷却或锁定规则 |
| Golden | npm run golden：全部 287 场景匹配；已执行 golden:update，六份文件与 master 逐字节相同，变化场景为 0；新增定向用例覆盖归属竞争，未人为改写基准 |
| Node / Edge 一致性 | 新增 test/sim/yanyou-owner.browser.test.js，实际启用 SIM_E2E、使用 Edge；1 项检查包含 boss / hidden × 左右双方四个 BattleSpec，各运行 900 ticks；攻击、喷火锁定、移动位置、快照及结果摘要完全一致，页面异常 0 |
| 完整 CI | MATCH_SEEDS=1 的 npm run ci -- --keep-going：6258 项，6233 通过、23 跳过、2 失败；setup / smoke / lint / imports / typecheck 通过；该次 test 全流程未全绿，新增浏览器套件在随后单独运行 |
| CI 失败 1 | 未修改的 master test/scene-assets.test.js 在 Windows 把 file URL 拼成 D:/D:/Projects/...，ENOENT；单独复验仍为 3 通过 / 1 失败，git diff master -- 该文件为空，本分支不混入独立平台修复 |
| CI 失败 2 / 复验 | 并行重负载时双人首领性能 best 0.649ms/tick，超过 0.5ms 阈值；node --test --test-name-pattern="performance: heavy" test/sim/robustness.test.js 单独复验通过，三次 0.2342 / 0.1567 / 0.1483ms/tick，未放宽阈值 |
| 最终静态与文档 | 修改的代码 / 测试 ESLint 0 错误、2 个 tokens.js 既有警告；文档一致性 / 路径 32 项全部通过，git diff --check 通过 |

## 结果与接手

实现和定向测试已完成。共享纯 ESM 模拟同时用于浏览器和服务端；未引入 Node API、随机数或时间依赖，未新增协议 / 数据 / 素材 / UI 文案。

功能、测试与记录保存为同一主题的本地提交。master 继续指向 cf7a9400，与 upstream/master 一致；没有推送、部署或合并到 master / 定制分支。此前上线状态以原部署记录为准，本轮没有服务器操作。

此次是用户明确授权的玩法变化；现有黄金场景没有变化，不代表实战结果必定不变。三条索敌路径对新目标统一使用本方优先；保留有效喷火锁定意味着对方锁定尚未结束时不会立即返回。
