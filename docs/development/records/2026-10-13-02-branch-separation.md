# DEV-20261013-02 · 本地主线与定制分支分离

## 基本信息

| 字段 | 内容 |
|---|---|
| 开始 / 最后更新 | 2026-10-13 / 2026-10-13，Asia/Shanghai |
| 状态 | 已完成：本地主线与定制分支分离，原有改动保存于定制分支 |
| 类型 | Git 整理 / 文档 |
| 分支与开始 HEAD | master / `40d0691c673ce268e39a1cb03465ea29acbd5b78` |
| 作者来源 | `sganggs/Stronghold-Protocol`，已通过 SSH 实际 fetch 作者 master |
| 作者最新 master | `cf7a9400270d5aa79b2e601e405dab782e25f120`，package.json 为 0.2.5 |
| 定制分支 | `feat/felix-customizations`，游戏源码维持当前 0.2.4 整合版 |
| 提交归属 | 与本文同一提交，按记录路径查询 |
| 关联 | [D025](../DECISIONS.md#d025--本地主线与定制分支分离)、[维护入口](../README.md) |

## 需求、范围与验收

用户要求把所有和 fork 源不同的改动迁到新分支，保证 master 与 fork 源一致。来源按原作者仓库解释；本次在本地保留全部定制历史与工作区文档，再对齐本地 master，不推送或重写 GitHub 分支，不部署服务器。

开始时有两份已修改索引，以及未跟踪的 HTTPS 入口记录和罗德岛整合方案。全部纳入新分支；罗德岛仍只是方案，没有移植功能。

## 操作与结果

- 从原 master 创建 `feat/felix-customizations`，保留原 master 的全部提交与合并历史，不压缩或改写。
- 在定制分支停留期间把本地 master 指向最新 `upstream/master`，并将其跟踪关系改为 `upstream/master`；没有对工作区执行 hard reset。
- 原三个 `backup/*` 分支保留，原 `origin/master` 引用与 GitHub 分支不修改。
- 当前工作区继续使用定制版。素材、依赖、忽略缓存和运行文件原位保留，不进入 Git；没有启动或重启服务器。
- 本次文档只补分支维护规则、基线与记录索引，不改变游戏代码、生成数据、测试或 golden。

## 验证

| 检查 | 实际结果 |
|---|---|
| `git rev-parse master upstream/master` | 两者同为 `cf7a9400270d5aa79b2e601e405dab782e25f120` |
| `git diff --exit-code master upstream/master` | 通过，无文件差异，提交历史也一致 |
| 原 `40d0691c` 是否为新分支祖先 | `git merge-base --is-ancestor` 通过，原有整合提交完整保留 |
| 游戏源码相对原整合头 | 除 `docs/development/` 外，`git diff --exit-code 40d0691c` 通过，无源码、数据、测试或 golden 改动 |
| 文档检查 | `node --test test/docs-consistency.test.js test/docs-paths.test.js`：31 项通过，0 失败、0 跳过；`git diff --check` 通过 |
| 原有未提交内容 | 两份原文档及两个索引保存在定制分支，与本文同一提交；用 `git log -- docs/development/records/2026-10-13-02-branch-separation.md` 查询 |

只整理分支引用与维护文档，不重新测试游戏运行、golden 或素材，也不将原部署记录视作本次服务器检查。

## 后续维护

- 在 `feat/felix-customizations` 上继续定制开发及有意的上游合并。
- 本地 master 只跟随原作者；不要把定制分支合并回 master。
- GitHub 的 fork master 此次仍是旧整合提交。若之后要求远端也对齐原作者，需要先保存远端定制分支，再单独处理远端 master 的非快进更新。
- 作者 master 已为 0.2.5，定制分支尚未合入该版本；不能将此次分支整理表述为定制版升级或线上更新。
