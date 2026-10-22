# DEV-20261022-02 · Q / X 选中优先修复与发行合并

## 基本信息

| 字段 | 内容 |
|---|---|
| 开始 / 最后更新 | 2026-10-22 / 2026-10-22，Asia/Shanghai |
| 状态 | 已完成；独立修复已合入本地发行分支并通过复验 |
| 类型 | 修复 / 本地分支合并 |
| 分支与开始 HEAD | `release/v0.3.1` / `d94f8f28`；修复基于原版 master `b3deebda` |
| 修复提交 | `fix/selected-operator-hotkeys` / `cf34cf0ef17840f7c7af21a75d94792562392d05` |
| 合并提交归属 | 与本文同一提交，按记录路径查询 |
| 关联 | [D034](../DECISIONS.md#d034--q--x-的选中优先目标)、[来源调查](2026-10-22-01-sell-hotkey-origin.md) |

## 需求与范围

用户要求从与原作者发行版本一致的本地 master 新建 fix 分支，修正出售快捷键目标；最终明确：
Q / X 有选中干员时优先操作选中目标，没有选中时沿用鼠标目标。随后要求合并进当前本地发行分支。
该授权不包含推送、打包或部署。来源调查为上一步独立任务，其历史结论保持。

## 实现与合并

- `public/js/screens/game.js` 的快捷键分支先取 `L.sel.uid`，没有选中时才实时命中鼠标位置；保留 own piece、类型和 underframe 可执行动作检查。
- 选中道具 / 召唤物不会回退到另一名干员；没有选中或有效悬停目标时不执行。原有请求防重、拖拽、面向、编辑、输入、弹窗等保护保留，W 购买逻辑不变。
- 设置、四个翻译包、README、玩法指南、当前设计及历史文档同步；浏览器回归覆盖简化 / 2D / 3D 棋盘。
- 修复分支提交 `cf34cf0e` 从本地 master `b3deebda` 开始，不含标签后上游文档提交；非快进合并到本地 `release/v0.3.1`。
- 游戏代码自动合并。四个翻译包的旧“选中干员”文案与新键冲突，逐块采用“选中优先”及 W 购买文案，保留其余发行翻译与定制内容。
- 发行版另有共用 `.gm__gear` 的统计按钮。浏览器测试的通用点击会误开统计界面，改用带“设置”可访问名称的按钮定位；只调整相关快捷键测试，不改变按钮或运行时逻辑。
- 开始时已有的 2026-10-19 两篇兼容性调查及入口 / 索引的对应未提交行保留，不并入本次提交。

## 验证

修复分支已完成：

| 命令 / 场景 | 实际结果 |
|---|---|
| `node --test test/ui/feedback5-hotkeys.test.js test/ui/gameLogic.test.js test/ui/uiRepair3.test.js test/docs-consistency.test.js test/docs-paths.test.js test/i18n.test.js` | tests 128 / pass 128 / fail 0 / skipped 0 |
| Edge 无头，1920×1080，`SP_E2E=1`：`test/ui/hover-hotkeys.e2e.test.js test/ui/hotkeys.e2e.test.js` | tests 7 / pass 7 / fail 0；覆盖简化、2D、3D 目标优先及改绑、W 购买 |
| Edge：`--test-name-pattern='prep: Q/X use selection before hover' test/ui/mock.e2e.test.js` | tests 1 / pass 1 / fail 0 |
| `node tools/i18n.mjs check --all --strict` | 四语言各 2142/2142，0 missing / 0 errors |
| `node tools/ci.mjs --only lint,imports,typecheck` | 三步通过；lint 0 errors / 149 既有 warnings |
| `node tools/golden.mjs` | 全部 288 场景一致：49 roster、46 bonds、22 fields、21 matches、10 standins、140 diy；无重生成 |

发行分支合并后实际复验：

| 命令 / 场景 | 实际结果 |
|---|---|
| 上述 6 个相关单元 / 文档 / 翻译测试文件 | tests 128 / pass 128 / fail 0 / skipped 0 |
| Edge 上述快捷键与改绑套件 | tests 7 / pass 7 / fail 0 / skipped 0；简化、2D、3D 均通过 |
| Edge 上述 mock 定向场景 | tests 1 / pass 1 / fail 0 |
| `node tools/i18n.mjs check --all --strict` | 四语言各 2446/2446，0 missing / 0 errors |
| 5 个相关 JS 文件 ESLint；`tsc --noEmit --checkJs -p jsconfig.json` | lint 0 errors / 3 既有 warnings；类型检查通过 |
| `git diff --check`、无未解决冲突检查 | 通过；未改 server、shared 或 golden 文件 |

首次发行浏览器回归因通用选择器误开统计界面而超时；设置按钮定位修正后重跑全部通过。此次仅客户端输入变更，未重复完整 CI 或战斗 golden；上表的 288 场景为修复分支实际验证结果。

## 结果与接手

本地非快进合并完成，提交与本文同属，按记录路径查询；未推送或部署。master 和修复分支保留。服务器当前运行状态未检查，本地合并不代表线上已使用此规则。
