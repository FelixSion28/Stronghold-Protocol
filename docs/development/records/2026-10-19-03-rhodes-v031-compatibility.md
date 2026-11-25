# DEV-20261019-03 · 当前发行与罗德岛 MOD 兼容性

2026-10-19，Asia/Shanghai。状态：静态调查完成，未安装。用户询问此前的第一个罗德岛 MOD 能否装到当前版本。

## 当前基线与范围

- 本地实际分支 `release/v0.3.1`，HEAD `d94f8f28`，package.json 为 0.3.1；不是先前方案所用的 0.2.4。
- 已有未提交的开发入口 / 索引和 CyanModPack 调查记录均保留；本次只新增兼容性记录和入口，不执行安装器、修改游戏源码或部署。
- 当前发行、线上历史状态见 [维护入口](../README.md)；本次没有连接服务器重新验收。

## 来源与检查

- 联网核对 [Rhodes-Mod 最新发布 v1.8.0](https://github.com/Stronghold-Protocol-Mod/Rhodes-Mod/releases/tag/v1.8.0)，北京时间 2026-10-15 发布；main 当前提交 `9050c0497723cf9ade5acaab747dad37722e30df`。
- README 与 `tools/manifest.json` 均明确适配官方 **0.2.6**。此前 v1.7.1 对应 0.2.3 的信息已是历史版本；最新仍未声明支持 0.3.1。
- 按 manifest 的 31 个补丁目标，对本地工作区文本统一 UTF-8 / LF 计算 SHA-256：4 个符合来源基线，27 个不同。不同不等于已证明有 27 个文本冲突；本次未应用补丁。
- 相同的四个文件为 `server/sim/content/bonds.js`、`server/sim/content/garrisons/battle.js`、`server/sim/content/items/battle.js`、`server/sim/content/kits/index.js`。
- 来源是 payload + 核心文件 diff + ON/OFF 数据快照的安装包，不是当前 [官方插件系统](../../PLUGINS.md)的 `plugins/<id>/plugin.json` 包。不能因 0.3.1 已有插件系统，就认为复制该包即可安装。
- 来源 OFF 数据为原版 0.2.6；不能用于恢复当前 0.3.1 数据。现有 20 人分组卡池、协议、Yuri 外观也需要逐项适配。

## 结论与下一步

**当前版本无法原样直接安装该包；可以另做功能移植。** 原本的 [0.2.4 移植方案](2026-10-13-01-rhodes-integration-plan.md)需要按当前 content set / 插件 SDK 与 Match host 更新，不能照原方案执行。先评估阵营数据、战斗脚本能否使用现有插件接口，再单独适配阿米娅任务、分组副本记账及界面；不能预先承诺完整功能只靠官方插件 API 即可实现。

本次仅做版本、清单哈希和宿主格式静态检查，未运行安装器或游戏兼容测试，未安装、未推送、未部署。
