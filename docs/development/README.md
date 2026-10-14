# 本分支开发记录

当前分支 `feat/yanyou-boss-own-targets` 从本地 master / 官方 v0.2.5 `cf7a9400` 建立，仅包含炎佑首领战出生归属优先索敌改动。多人、Yuri、计时与公告等整合保留在独立的 `feat/felix-customizations`，没有引入本分支。

实现任务：[DEV-20261013-05](records/2026-10-13-05-yanyou-boss-own-targets.md)。本方优先、同方原仇恨顺序、范围内队友补足、三条索敌路径一致、有效喷火锁定保持；2026-10-13 完成仅本地开发，随后测试部署见下文。

规则决定见 [DECISIONS.md](DECISIONS.md)，任务索引见 [records/README.md](records/README.md)。核心参考仍为 [ARCHITECTURE.md](../ARCHITECTURE.md)、[SIM.md](../SIM.md) 和 [design/engine.md](../design/engine.md)。

2026-10-14 已按用户授权部署服务器 3001：源码 253f2131 / app=0.2.5 / build=288afd7a41d5，健康、四人开局、15 个索敌用例及公网四种 BossSpec 对比通过。入口 http://111.229.197.221:3001/，旧配置与镜像保留供回滚；3000 定制版容器保持不变。证据见 [DEV-20261014-01](records/2026-10-14-01-yanyou-3001-test.md)，源码未推送。
