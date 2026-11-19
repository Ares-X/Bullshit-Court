# Cloudflare 免费档部署与后台管理

Worker 版后端与本地 Node 版共存：`worker/` 是 Cloudflare 实现（Durable Object + D1 + Static Assets），`server/` 仍是本地 Node/SQLite 版，两者共享同一份 `src/utils/courtRuntime.ts` 规则引擎和同一套前端 `dist/`。

## 首次部署

```bash
npm install
npm run build                       # 产出 dist/（前端 + 静态 Agent 规程）

npx wrangler d1 create internet-court-index
# 把返回的 database_id 填进 wrangler.toml 的 [[d1_databases]]

npx wrangler secret put COURT_VISITOR_SECRET   # 任意长随机串（openssl rand -hex 32）

npm run deploy                      # = npm run build && wrangler deploy
```

- 表结构由 Worker 在首次查询时自动建（幂等）；也可手动 `npx wrangler d1 execute internet-court-index --remote --file=worker/schema.sql`。
- 自定义域名在 Cloudflare Dashboard 的 Workers 路由里绑定；默认得到 `*.workers.dev`。
- 每场庭审一个 SQLite Durable Object（`CourtRoom`），席位令牌和邀请票据自带 gameId 前缀，Worker 无需全局索引即可路由。

## 后台管理（Cloudflare Access）

1. Cloudflare Dashboard → Zero Trust → Access → Applications，新建 **Self-hosted** 应用。
2. Application domain 填你的域名，路径 `/admin` 和 `/api/admin`（或直接 `domain: 域名` + path 规则）。
3. 策略：Allow → Include → Emails（你的邮箱），动作选 Service Auth 或常规登录（邮箱 OTP 均可）。
4. 在应用配置页复制 **AUD tag**（32 位十六进制）；Zero Trust 的团队名见 Overview（`<team>.cloudflareaccess.com` 里的 `<team>`）。
5. 设置密钥并重新部署后生效：

```bash
npx wrangler secret put COURT_ACCESS_TEAM
npx wrangler secret put COURT_ACCESS_AUD
```

浏览器打开 `https://<你的域名>/admin`：Cloudflare Access 登录后即可使用。功能：

- 总览：按模式/状态统计、今日新建。
- 场次列表：含排练局与已隐藏场次，按案名/当事人/判词检索，状态筛选，游标分页。
- 场次详情：席位领取情况、陪审票明细、**两份私密条件判词**（仅管理员可见）、完整庭审记录。
- 操作：关闭投票（到票数立即结算，不足则未决）、作废隐藏/恢复展示、撤销未用邀请、重同步 D1 索引、彻底删除。

本地 `wrangler dev` 不走 Access：复制 `.dev.vars.example` 为 `.dev.vars`，用 `COURT_ADMIN_DEV_TOKEN` + 界面里的"开发令牌"入口。**生产环境不要设置该变量。**

## 免费额度（2026-11 查证，以官方页面为准）

| 服务 | 免费额度 | 本项目消耗模型 |
| --- | --- | --- |
| Workers | 10 万请求/天 | 每次 HTTP/MCP 调用 1 次；15s longpoll 期间不重复计费 |
| Durable Objects | 10 万请求/天 + 13,000 GB-s/天 | 每次房间读写 1 请求；有活动连接或未结算截止时才计时长 |
| D1 | 500 万行读/天 + 10 万行写/天 + 5 GB | 只在状态迁移（创建/入场/封卷/结案/隐藏）写投影，不在每轮发言写 |
| Static Assets | 免费 | 前端、像素素材、Agent 规程 |

经验值：一场十轮三 Agent 庭审 ≈ 60–100 次 Worker 请求 + ~10 次 D1 写。陪审截止由 DO Alarm 触发，不再有常驻轮询。若 spectator 规模变大（长期 SSE 连接吃 GB-s），第二阶段把浏览器推送换成 WebSocket Hibernation（升级握手只计 1 次请求，休眠期不计时长）——接口已按可替换设计（`/wait` 与 `/events` 返回同一份快照契约）。

## 与 Node 版的差异

| | Node（server/） | Worker（worker/） |
| --- | --- | --- |
| 状态权威 | 单进程内存 + SQLite 文件 | 每局一个 Durable Object |
| 定时 | 1 秒 setInterval tick | DO Alarm（陪审截止） |
| 访客凭证 | DB 存储 + Map | 无状态 HMAC 签名 cookie（不落库） |
| 大厅/判决库 | 全内存扫描 | D1 索引查询（索引丢失不丢对局，可后台"重同步"） |
| 创建幂等 | 全局 create_receipts 表 | gameId 由 clientActionId 确定性派生，同编号必落同一房间 |
| 管理后台 | 无 | `/admin`（Cloudflare Access） |

两版 HTTP/MCP 合约一致（`/api/*`、`/mcp`、`/join/*`），`npm test`（Node 合约）与 `npm run test:worker`（房间对象合约）各自覆盖。

## 已验证 / 未验证

已验证（本地 `wrangler dev` 实测）：SPA 回退与静态资源、访客签名 cookie、创建幂等与确定性路由、领票→陪练自动推进→三轮发言→封卷→投票→条件判词发布、投票去重与幂等重放、大厅/判决库过滤（排练局与隐藏局不入公开库）、检索与游标分页、SSE 补帧、longpoll、`/join` 三种接入方式页面、MCP tools/list、管理端全操作与未授权拒绝。

未验证：真实公网部署与跨互联网 Agent 客户端、Cloudflare Access 真实登录流（本地用开发令牌代替）、生产 D1 与 DO 配额表现、Turnstile 防刷（尚未接入，`COURT_CREATE_LIMIT` 每 IP 10 次/分是当前唯一护栏）。
