# 期末批量自动学生评语工具

当前版本已经支持真实后端：

- 配置 Supabase 后，邀请码、用户、积分、积分流水、生成记录保存到 Supabase
- 未配置 Supabase 时，才 fallback 到服务端 `data/db.json`
- AI 生成由服务端调用 DeepSeek，前端不保存 API Key
- 没有配置 `DEEPSEEK_API_KEY` 时不会返回假评语，会直接提示配置缺失

## 配置 `.env`

复制 `.env.example` 为 `.env`：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的 service_role key
SESSION_SECRET=一串足够长的随机字符串
PORT=4173
```

`SUPABASE_SERVICE_ROLE_KEY` 只能放在服务端 `.env`，不能放到前端。

## Supabase 初始化

1. 新建 Supabase 项目
2. 打开 Supabase SQL Editor
3. 执行 `docs/supabase-schema.sql`
4. 在 `.env` 填入 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`
5. 重启服务

配置成功后，启动日志会显示：

```text
Storage: Supabase
```

## 启动

```bash
npm.cmd run dev
```

然后打开：

```text
http://localhost:4173
```

演示邀请码：

- `TEACHER100`
- `CLASS300`
- 管理员：`ADMIN999`

## 后端接口

- `GET /api/session`：读取当前登录用户
- `POST /api/login`：邀请码登录、创建用户、充值积分
- `POST /api/admin/invite-codes`：管理员生成邀请码
- `POST /api/generate-comments`：校验积分、调用 DeepSeek、扣积分、保存生成记录

## 数据说明

正式售卖请使用 Supabase。`data/db.json` 只作为本地开发 fallback。

## Cloudflare Pages 部署

项目已包含 Cloudflare Pages Functions：

```text
functions/api/[[path]].js
```

Cloudflare 上的接口仍然是原路径：

- `POST /api/login`
- `GET /api/session`
- `POST /api/generate-comments`
- `GET /api/comment-history`
- `POST /api/admin/invite-codes`

Cloudflare Pages 设置建议：

```text
Build command: 留空
Build output directory: /
Root directory: /
```

然后在 Cloudflare Pages 项目后台添加环境变量：

```text
DEEPSEEK_API_KEY=你的生成服务 Key
DEEPSEEK_MODEL=deepseek-chat
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的 service_role key
SESSION_SECRET=一串足够长的随机字符串
```

注意：

- 不要把 `.env` 上传到 GitHub。
- 不要把 `SUPABASE_SERVICE_ROLE_KEY` 放进前端代码。
- Cloudflare 线上版本只使用 Supabase，不使用 `data/db.json`。
- 修改环境变量后需要重新部署一次。
