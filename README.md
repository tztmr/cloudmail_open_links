# CloudMail Open Links

一个用于“邮箱批量管理 + 开放链接查看邮件”的后台系统。

核心思路是把上游邮件接口接入到本地系统中，由后台统一同步邮件、生成访问链接，并提供网页或 JSON 方式给外部查看。

## 功能概览

- 批量导入邮箱，支持分组、备注、密码保存
- 配置多个上游邮件接口，按 `emailDomain` 自动匹配 provider
- 后台定时同步邮件，打开公开链接时也会补一次同步
- 为单个或批量邮箱生成 `/open/<token>` 访问链接
- 支持网页查看和 `GET /api/open/<token>?format=json` 接口查看
- 支持在后台直接调用上游 `addUser` 风格接口创建邮箱并自动生成链接

## 技术栈

- Next.js 16
- React 19
- MongoDB + Mongoose

## 环境变量

复制环境变量模板：

```bash
cp .env.example .env.local
```

常用配置如下：

```bash
ADMIN_PASSWORD=your-password
PUBLIC_BASE_URL=http://localhost:3118
MONGODB_URI=mongodb://localhost:27017/cloudmail_open_links

# 可选：默认上游接口
MAIL_PROVIDER_API_TOKEN=
MAIL_PROVIDER_API_BASE_URL=https://mail.example.com/api/public
MAIL_PROVIDER_WAF_BYPASS_TOKEN=
MAIL_PROVIDER_WAF_BYPASS_HEADER=X-WAF-BYPASS
```

说明：

- `MONGODB_URI`：数据库连接，生产环境必须配置
- `ADMIN_PASSWORD`：设置后访问 `/admin` 需要登录
- `PUBLIC_BASE_URL`：生成公开链接时使用的站点地址
- `MAIL_PROVIDER_*`：未选择具体 provider 时使用的默认上游接口配置

## 本地开发

```bash
npm install
npm run dev
```

启动后访问：

- 管理后台：`http://localhost:3000/admin`
- 公开查看页：`http://localhost:3000/open/<token>`

推荐使用流程：

1. 登录后台
2. 导入 provider JSON
3. 批量导入邮箱，或直接云端创建邮箱
4. 生成公开链接并发给使用方
5. 使用方通过网页或 JSON 接口查看邮件

## Provider JSON 格式

后台支持导入多个上游接口，示例：

```json
[
  {
    "name": "Primary Provider",
    "domain": "https://mail.provider-a.example/api/public",
    "token": "provider-token",
    "emailDomain": "provider-a.example"
  },
  {
    "name": "Backup Provider",
    "domain": "https://mail.provider-b.example/api/public",
    "token": "another-token",
    "emailDomain": "provider-b.example"
  }
]
```

字段说明：

- `name`：后台显示名称
- `domain`：上游接口基础地址
- `token`：上游认证 token
- `emailDomain`：该 provider 对应的邮箱域名，用于自动匹配邮箱

## 云端创建邮箱

后台支持直接调用上游 `addUser` 风格接口批量创建邮箱账号。

创建时支持：

- 数量
- 前缀
- 字符类型
- 字符长度
- 分组
- 链接最大访问次数
- 链接有效期

如果 provider 配置了 `emailDomain`，会优先使用该域名；否则系统会尝试从 provider 地址推断邮箱域名。

## 接口说明

- `GET /open/<token>`：网页查看邮箱邮件
- `GET /api/open/<token>?format=json`：JSON 返回邮件列表
- `GET/POST /api/admin/mailboxes`：邮箱管理
- `GET/POST/DELETE /api/admin/share-links`：公开链接管理
- `GET/POST /api/admin/sync-settings`：后台同步配置
- `POST /api/admin/providers`：导入 provider
- `POST /api/admin/provider-accounts/create`：调用上游接口创建邮箱并自动生成链接

## Docker 部署

```bash
cp .env.example .env
docker-compose up -d --build
```

默认包含：

- Web 应用
- MongoDB

启动后访问：

- `http://localhost:4138/admin`

生产环境建议：

- 设置 `PUBLIC_BASE_URL=https://你的域名`
- 使用 Nginx 或 Traefik 反代并启用 HTTPS
- 定期备份 MongoDB volume

## 安全说明

- 生产环境务必开启 HTTPS
- provider token 仅保存在服务端，不应暴露到前端
- HTML 邮件已做基础处理，但仍建议在受信环境中查看
- 当前不保存附件，如需附件能力可继续扩展

## 当前能力

- 多 provider 配置与导入
- 批量导入邮箱
- 云端创建邮箱并自动生成公开链接
- 后台自动同步邮件
- 网页 / JSON 双模式查看
- Docker + MongoDB 一键部署
