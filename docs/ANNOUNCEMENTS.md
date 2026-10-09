# 服务器公告

公告不需要账号、数据库或网页管理后台。服主在运行游戏的服务器终端发布 UTF-8 Markdown 文件，游戏运行中读取更新，无需重启。

## 玩家看到什么

- 输入代号的标题页和大厅提供「公告」按钮；历史标题和正文独立滚动，小屏可在列表与正文间切换。
- 默认打开唯一的置顶公告；没有置顶时打开最新发布的公告，顺序按发布先后而非日期。
- 有公告时进入网站自动打开；「下次不再显示」保存在当前浏览器，直到发布新公告后恢复提醒。手动按钮不受影响。
- 调整置顶不重置免提示；不同浏览器、设备和不同站点地址分别保存偏好。清理站点数据会清理偏好。
- 对局中及恢复对局时，普通发布不会自动弹窗。空安装没有公告时仅保留按钮，不自动打开空弹窗。

## 发布、置顶和查看

在项目目录中准备正文，例如 `runtime/welcome.md`：

```markdown
# 欢迎博士

本服务器已更新，请留意以下安排。

- 20:30 计划重启服务器。
- 请提前结束对局。
```

```bash
# 发布；--pin 同时置顶。省略 --id 会自动生成公告编号
node tools/announcements.mjs publish --id welcome --title "开服公告" --file runtime/welcome.md --pin

# 查看编号和发布时间
node tools/announcements.mjs list

# 更改置顶或取消置顶
node tools/announcements.mjs pin welcome
node tools/announcements.mjs unpin
```

每个编号只发布一次；修正公告时用新编号发布，保留历史并产生新的提醒版本。请使用工具发布，不手工修改已发布的正文或索引；完整性检查会拒绝未登记的修改。

支持标题、段落、粗体、斜体、列表、引用、分隔线、行内代码、围栏代码和安全链接等常用 Markdown。原始 HTML 和图片语法显示为文字；不是完整 Markdown 扩展实现，不支持任意网页或脚本。标题最多 120 个 Unicode 字符，正文最多 50,000 个 UTF-16 字符且不超过 128 KiB，最多保存 2,000 条公告。

## 存储与部署

默认存储路径为项目下的 `runtime/announcements`，包含 `index.json` 和各篇 `.md`。该目录不会提交到 Git，也不会通过静态文件服务公开；备份公告时完整备份目录。

服务器与发布工具必须使用同一个目录。可在启动服务器及执行工具时设置 `SP_ANNOUNCEMENTS_DIR`，或为工具指定 `--dir`：

```bash
export SP_ANNOUNCEMENTS_DIR=/srv/stronghold-data/announcements
npm start

# 另一个终端，环境变量须一致
node tools/announcements.mjs publish --title "更新通知" --file /srv/notices/update.md --dir /srv/stronghold-data/announcements
```

相对目录按项目根目录解析；正文 `--file` 按执行命令的当前目录解析。公告目录需要服主读写权限，不要放在 `public` 中。多台服务器默认各自维护公告；统一发布时同步完整公告目录，账号、数据库和跨机器自动同步不在本功能范围。

公开接口只有 `GET/HEAD /api/announcements` 和 `GET/HEAD /api/announcements/<id>`。接口不提供发布能力，响应不缓存；前者只返回标题等元数据，正文按查看需求读取。非对局页面约每分钟检查一次新发布，普通检查不在对局中运行。

## 局内紧急通知

此部分将独立实现并提交。普通 `publish` 命令只发布历史公告，不触发局内弹窗。
