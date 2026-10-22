# DEV-20261022-04 · 快捷键修复整合至定制与发行分支

## 基本信息

| 字段 | 内容 |
|---|---|
| 开始 / 最后更新 | 2026-10-22 / 2026-10-22，Asia/Shanghai |
| 状态 | 已完成：feat 补丁已适配并通过验证，发行已有等效修复 |
| 类型 | 修复整合 |
| 分支与开始 HEAD | feat/felix-customizations `75897b22`；release/v0.3.1 `72b347bb` |
| 上游基线 | feat 保留正式 0.3.0 `c24e17ee`；发行保留 0.3.1；master 为 `c9d804f4` |
| 提交归属 | 与本文同一提交，按记录路径查询 |
| 关联 | [D025](../DECISIONS.md#d025--本地主线与定制分支分离)、[master 对齐记录](2026-10-22-03-master-origin-alignment.md) |

## 需求、范围与验收

用户要求将当前 master 上的快捷键修复合入 feat 和发行。Q 撤退 / X 出售优先使用选中干员；未选中时使用鼠标指向的干员。master 继续与源仓库一致，定制功能保留在 feat。此次只整合本地代码与记录。

## 调查与决定

| 问题 | 证据 | 结论 |
|---|---|---|
| 修复的来源 | fix/selected-operator-hotkeys `153e9e6c`，父提交为当前 master `c9d804f4` | 只移植该提交的修复内容；不将 master 的后续版本整体合入 feat |
| 发行是否缺少修复 | release/v0.3.1 `72b347bb` 已合入原修复 `cf34cf0e` | 已包含等效实现；需复核现有实现与回归测试 |
| 文档版本冲突 | feat 使用 0.3.0，源修复引用 0.3.1 §34.35 | 在本分支 0.3.0 历史追加本地修订并引用本记录，不引入整份 0.3.1 历史 |
| 测试设置按钮 | 定制版同时存在多个 `.gm__gear` 按钮 | 设置点击定位到 `[aria-label="设置"]`，与发行分支的既有适配一致 |

## 实现或操作

- 将 `153e9e6c` 的游戏输入、设置文案、四语言翻译、操作指南与浏览器回归测试移入 feat。
- 选中道具 / 召唤物时不转向鼠标下的干员；拖拽、方向轮盘、弹窗、托管等既有保护继续生效；W 购买保持原行为。
- 解决旧版语言包冲突，保留已有购买翻译，移除不再使用的旧 Q/X 文案。
- 任务开始前已有的两份 2026-10-19 MOD 调查文件不纳入本次提交。

## 验证

| 命令 / 场景 | 实际结果 |
|---|---|
| `node --test test/ui/feedback5-hotkeys.test.js test/ui/gameLogic.test.js test/ui/uiRepair3.test.js test/docs-consistency.test.js test/docs-paths.test.js test/i18n.test.js` | tests 128 / pass 128 / fail 0 / skipped 0 |
| Edge 无头：`SP_E2E=1`，`test/ui/hover-hotkeys.e2e.test.js test/ui/hotkeys.e2e.test.js` | tests 7 / pass 7 / fail 0；覆盖简化、2D、3D、选中优先、无选中悬停回退、阻断条件、改绑与 W 购买 |
| Edge：`--test-name-pattern='prep: Q/X use selection before hover' test/ui/mock.e2e.test.js` | tests 1 / pass 1 / fail 0 |
| `node tools/i18n.mjs check --all --strict` | 四语言各 2070/2070，0 missing / 0 errors |
| 5 个相关 JS 文件 ESLint；`tsc --noEmit --checkJs -p jsconfig.json` | lint 0 errors / 3 既有 warnings；类型检查通过 |
| `git diff --check`、索引冲突检查 | 通过；未改 server、shared 或 golden 文件 |
| 与发行 `72b347bb` 对照 | Q/X 运行时目标选择一致；两份快捷键浏览器套件与发行相同 |

浏览器使用 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，Node v22.23.1。发行分支未产生新代码，原合并已完成的 128 项定向测试、7+1 项 Edge 回归和类型检查见发行分支的 `2026-10-22-02-selected-hotkeys-merge.md`；本次只复核等效实现与测试文件。此次为客户端输入修复，不修改模拟或 golden，按影响范围未重复完整 CI / golden。

## 结果、遗留与接手

- feat 实现与本分支文档适配完成，验证通过，与本文同一提交。
- 发行 `release/v0.3.1` 保持 `72b347bb`，已核实包含同等修复，无需重复补丁或引入 master 后续版本。
- master 保持 `c9d804f4`，独立修复分支保持 `153e9e6c`；feat 的包版本仍为 0.3.0。
- 本次未推送、未部署；素材不随提交变更。
