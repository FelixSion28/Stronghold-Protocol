# DEV-20261022-03 · 本地与远端 master 对齐源仓库

## 基本信息

| 字段 | 内容 |
|---|---|
| 开始 / 最后更新 | 2026-10-22 / 2026-10-22，Asia/Shanghai |
| 状态 | 已完成；远端更新与实时复核通过 |
| 类型 | Git 分支维护 |
| 开始分支 / HEAD | `feat/felix-customizations` / `09f68b0517fbf23f46c382e20c429a331a24b9ad` |
| 本地 / 源 master | `c9d804f470b8d7422ae04eb66faf671cef21ad52` |
| 旧 origin/master | `40d0691c673ce268e39a1cb03465ea29acbd5b78` |
| 记录归属 | 与本文同一提交，按记录路径查询；仅本地 feat 分支记录提交 |
| 关联 | [D025](../DECISIONS.md#d025--本地主线与定制分支分离) |

## 需求与授权

用户在查询三条 master 的差异后要求“改一下，feat 下的才是定制版本，master 保持与源一致”。
因此将 fork 的 origin/master 对齐源仓库；定制代码继续位于 feat 分支，发行整合分支单独保留。
不升级当前 feat 或发行代码，也不部署。

## 操作与验证

- `git ls-remote --heads origin master 'feat/*'`：更新前 origin/master 为 `40d0691c`，远端 feat/felix-customizations 为 `09f68b05`。
- `git ls-remote --heads upstream master` 与 `git rev-parse master`：均为完整哈希 `c9d804f470b8d7422ae04eb66faf671cef21ad52`。
- `git merge-base --is-ancestor 40d0691c 09f68b05` 返回 0；`git rev-list --count 09f68b05..40d0691c` 返回 0。旧远端 master 的全部提交都已由远端 feat 分支保留，不丢失定制历史。
- 执行 `git push --force-with-lease=refs/heads/master:40d0691c673ce268e39a1cb03465ea29acbd5b78 origin c9d804f470b8d7422ae04eb66faf671cef21ad52:refs/heads/master`，返回 0，远端报告 forced update 成功。精确 lease 防止覆盖核对之后出现的新远端提交。
- 更新后再次实时查询两端：origin/master、upstream/master 与本地 master 三者完整提交哈希一致。origin/feat/felix-customizations 仍为 `09f68b05`。
- 本地 master 仍跟踪 upstream/master。当前工作分支仍为 feat/felix-customizations，发行 release/v0.3.1 仍为 `72b347bb47451579e25667d637c0c8a709eec01f`。
- 维护文档检查：`node --test test/docs-consistency.test.js test/docs-paths.test.js` 为 tests 32 / pass 32 / fail 0 / skipped 0；`git diff --check` 通过。

## 结果与边界

本次远端仅更新 origin/master，不改作者仓库、feat 定制代码或发行分支；没有打包或部署。
维护记录只提交到本地 feat 分支，不向 master 添加文档提交，也不推送该记录提交。
开始时已有两篇 2026-10-19 MOD 兼容性调查保持未跟踪状态。
此任务只改变 Git 引用和维护文档，无运行时改动，不运行游戏测试或 golden。
