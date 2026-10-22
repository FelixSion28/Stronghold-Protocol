# DEV-20261022-01 · X 出售目标来源调查

## 基本信息

| 字段 | 内容 |
|---|---|
| 开始 / 最后更新 | 2026-10-22 / 2026-10-22，Asia/Shanghai |
| 状态 | 已完成；仅调查，未修改游戏行为 |
| 类型 | 调查 |
| 分支与开始 HEAD | `release/v0.3.1` / `d94f8f28` |
| 上游基线 | 原作者 v0.3.1 / `b3deebda`，本地已有完整提交；本次联网查询失败 |
| 提交归属 | 与后续发行合并同一提交，按本记录路径查询 |
| 关联 | [上游输入变更 §32.14.22](../../history/0.3.0.md#321422-q--x-act-on-the-hovered-unit-w-buys-the-hovered-card-pr-629) |

## 需求、范围与验收

用户报告：选中一名干员后按 X，实际出售的是鼠标指向的另一名干员。要求确认属于本地定制引入，还是来源仓库已有。仅追溯来源与核对行为，不实施修复或部署。

## 调查与结论

- 已确认来自原作者仓库 `sganggs/Stronghold-Protocol` 的提交 `c278166c4606fa417656cf9c8c0840d7e48ae670`，时间为 2026-10-14 19:26:30 +08:00，标题为 `Use hover targets for Q/X and add W shop purchases (#123, #265)`。上游发行记录将此变更归于 PR #629。
- 该提交将 `public/js/screens/game.js` 中 Q/X 的目标从 `L.sel.uid` 改为 `L.view?.pieceAtClientPoint(pointer.x, pointer.y)`，并通过此 uid 调用出售或撤退。当前对应逻辑的 `git blame` 仍指向该提交。
- 原作者 v0.3.0 `c24e17ee` 和 v0.3.1 `b3deebda` 均包含该提交；v0.2.5 `cf7a9400` 不包含。
- 对比 `b3deebda..HEAD`，`game.js` 有其他定制差异，但 Q/X 获取目标与执行出售的代码没有本地差异；`test/ui/hover-hotkeys.e2e.test.js`、`public/js/ui/gameLogic/shortcuts.js` 与上游基线无差异。
- 上游浏览器测试明确覆盖“选中 A、悬停 B、按 X 后 B 被出售而 A 保留”，断言为 `hover overrides the previously selected operator`；[玩法说明](../../PLAYING.md)和[客户端规则](../../design/client.md)也明确说明不使用旧选中目标。

因此，用户观察符合上游主动引入的输入规则，不是本地定制独有的目标错位。是否改成选中优先属于后续交互规则决定，本次未实施。点击选中干员后使用其下方的出售按钮，仍通过 `sellSel` 操作选中目标。

## 验证与限制

| 命令或场景 | 实际结果 |
|---|---|
| `git show` / `git blame` / `git diff b3deebda HEAD` | 引入提交、当前调用目标及本地差异已核对 |
| `git merge-base --is-ancestor c278166c <版本提交>` | v0.3.0、v0.3.1 返回 0；v0.2.5 返回 1 |
| `node --test test/ui/feedback5-hotkeys.test.js` | tests 24 / pass 24 / fail 0 / skipped 0；验证快捷键映射和保护条件，不能替代浏览器悬停场景 |
| `git ls-remote https://github.com/sganggs/Stronghold-Protocol.git refs/heads/master refs/tags/v0.3.1` | 连接被重置；结论依据本地已有上游发行提交，不声称远端最新状态 |

`node --test test/docs-consistency.test.js test/docs-paths.test.js`：tests 32 / pass 32 / fail 0 / skipped 0；`git diff --check` 通过。

未运行浏览器 E2E；本次基于源码、历史与已有测试内容追溯来源，没有现场浏览器复现。未修改游戏代码，无需运行完整 CI / golden。

## 结果与接手

调查完成。只新增本记录并更新入口、索引；保留开始时已有的未提交文档改动。未提交、未推送、未部署，线上当前运行状态未检查。

## 后续补充

2026-10-22：用户随后授权选中优先的交互修复，并要求合入本地发行分支。本篇保留调查当时的行为与验证范围；修复 `cf34cf0e` 及后续合并、复验见 [DEV-20261022-02](2026-10-22-02-selected-hotkeys-merge.md)。调查记录随该合并归档，不表示本篇调查阶段曾修改游戏。
