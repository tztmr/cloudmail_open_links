# CloudMail Open Links

基于本地/服务器实际接收邮件 + 网页开放链接查看的邮箱批量管理工具。

灵感与 API 设计参考自 `/dx888_cloudmail`（batch-reg、share-links、oneclick 部署、dynmsl 轮询模式），但核心改为**真实接收并持久化存储邮件**，不再依赖上游 API 轮询。

## 核心流程（和你描述的一致）

1. **管理员批量导入邮箱**（支持从 cloudmail/dynmsl 批量创建后导入，或任意需要查询的地址）
2. **生成网站地址**（每个邮箱或批量得到唯一的 `/open/<token>` 链接，可带次数/有效期限制）
3. **后台自动同步收件**：
   - 对 dynmsl / cloudmail 这类兼容 `POST /api/public/emailList` 的接口，服务端默认每 5 秒自动拉取最新邮件并写入本地库
   - 打开 `/open/<token>` 时也会再补一次同步，避免刚到的新邮件漏掉
   - 后台提供同步开关，默认开启
4. **打开接口**：把链接发出去，收件人直接浏览器打开就能看到收到的完整邮件列表和内容（支持 HTML / 文本）

## 快速开始（本地开发）

```bash
cp .env.example .env.local
# 编辑 .env.local，至少设置 MONGODB_URI
# 可选设置 ADMIN_PASSWORD

npm run dev
# 打开 http://localhost:3000/admin
```

- 后台登录（如果设置了密码）
- 粘贴邮箱列表（一行一个或逗号分隔）→ 批量导入
- 点击「生成访问链接」→ 复制 `/open/xxxx` 地址
- 导入 provider 后，后台会默认每 5 秒轮询一次；打开 `/open/xxxx` 时还会补同步一次

打开对应 `/open/<token>` 就能看到邮件。

## 生产部署（参考原 cloudmail-oneclick.sh）

1. 服务器上 clone/上传本目录
2. `cp .env.example .env.production.local` 并填写：
   - `MONGODB_URI=...`
   - `ADMIN_PASSWORD=...` （推荐）
   - `PUBLIC_BASE_URL=https://你的域名`
3. 运行项目自带的简化一键脚本（或手动）：

```bash
chmod +x cloudmail-open-receiver.sh
bash cloudmail-open-receiver.sh
```

脚本会安装 Node/PM2、构建并用 PM2 启动 Next。

4. （推荐）配置 Nginx 反代 + HTTPS（完全照抄原 `dx888_cloudmail/SERVER_DEPLOY.md` 里的 `setup_nginx_ssl` 流程即可，端口换成 3000）。

5. 登录 `/admin` 导入 provider 并确认「后台自动同步」保持开启。

## 和 cloudmail / dynmsl 结合的推荐用法

1. 用原 `dx888_cloudmail` 的 batch-reg 或你自己的脚本，在 dynmsl 批量创建一批 `@dynmsl.com` 邮箱（拿到 email + password）。
2. 把这些地址导入本系统的「批量导入」。
3. 在本系统里导入 provider（domain + token + emailDomain），并确保邮箱记录能绑定到对应 provider，或者至少能通过 `emailDomain` 推断。
4. 生成链接后，把 `/open/xxxx` 发给需要「临时收件」的人；后台会默认每 5 秒自动同步，页面打开时也会补同步一次。

这样就实现了你说的「管理员批量导入邮箱 → 给我网站地址 → 我打开接口」。

## 接口说明

- `GET /api/open/<token>?format=json`：纯 JSON 接口（适合脚本/「打开接口」）；如果 provider 可用，会先自动同步再返回
- `GET /open/<token>`：人类友好的网页查看器（列表 + 点击查看 HTML 正文）
- 管理员 API（需登录 cookie 或直接调用如果没设密码）：
  - `GET/POST /api/admin/mailboxes`
  - `GET/POST/DELETE /api/admin/share-links`
  - `GET/POST /api/admin/sync-settings`

## 数据库

使用 `better-sqlite3` + 本地文件 `data/cloudmail.db`（WAL 模式），零外部依赖，备份直接拷贝 db 文件即可。

表结构参考了原项目 `db/schema.sql` 的 share_links 思想 + 实际 received_emails 存储。

## 注意事项 & 安全

- 生产一定要 HTTPS + 域名。
- 建议使用 provider API 自动同步，并在后台确认邮箱与 provider 的匹配关系正确。
- 目前不存附件（只存 text/html），如需可扩展。
- 简单做了 script 剥离，HTML 展示时仍建议在受信环境打开。

## 进一步扩展想法

- 增加「批量生成链接导出 CSV」
- 支持按 batch 分组的 share 链接（类似原项目的 batch share）
- 接入原项目的 DYNMSL addUser API，直接在后台「云端创建 + 本地导入」
- 实时推送（SSE / websocket）新邮件到达
- 多租户（参考原 api/ 里的 tenant + share_links 设计）

## 感谢

- 学习了 `dx888_cloudmail` 的 `cloudmail-oneclick.sh`、`api/admin/share-links.ts`、`batch-reg`、share 页面、externalApi 调用等实现。
- 保留了「受限查询 + token 链接 + 过期/次数控制」的核心体验，同时补上了「后台 API 自动同步」这一块。

有问题直接改代码或提 issue。

## Docker + MongoDB 部署（推荐）

1. 准备环境变量
   ```bash
   cp .env.example .env
   # 编辑 .env ，至少设置：
   # MONGODB_URI, ADMIN_PASSWORD（可选）
   ```

2. 使用 docker-compose 启动（包含 MongoDB）：
   ```bash
   docker-compose up -d --build
   ```

3. 访问 http://localhost:3000/admin

生产建议：
- 在 `.env` 或 compose 里设置 `PUBLIC_BASE_URL=https://你的域名`
- 用 Nginx/Traefik 做反代 + HTTPS
- 定期备份 Mongo volume (`mongo_data`)

如果你有多个 mail API 接口，直接在后台用 JSON 导入即可。

---

**已实现的功能总结**（根据你的反馈）：
- 多接口 JSON 导入（支持 `emailDomain`）
- 云端创建时自动处理域名后缀（使用 provider 的 `emailDomain`）
- 创建时可单独设置该批次的链接有效期和最大次数
- 完整切换到 MongoDB
- 提供 Dockerfile + docker-compose.yml 一键部署（带 Mongo）

现在可以愉快地用 Docker 跑了！
