# Cloudflare 免费档部署与后台管理

Worker 版后端与本地 Node 版共存：`worker/` 是 Cloudflare 实现（Durable Object + D1 + Static Assets），`server/` 仍是本地 Node/SQLite 版，两者共享同一份 `src/utils/courtRuntime.ts` 规则引擎和同一套前端 `dist/`。

## 生产部署

`wrangler.toml` 指向 **BullshitCourt** 账户。Worker `bullshit-court` 在 `bullshitcourt.lol` 同站点提供前端、HTTP 和 MCP。D1 绑定 `DB` 指向 `bullshit-court-index`，已初始化 `games` 表和两个查询索引。SQLite Durable Object `CourtRoom` 的 `v1` 迁移随首次部署执行。部署 Worker 时 Cloudflare 会为自定义域名配置 DNS 和证书。

Cloudflare Workers Builds 从 `Ares-X/Bullshit-Court` 的 `main` 分支拉取代码。提交到 `main` 后，Cloudflare 安装锁定的依赖，执行测试、Worker 类型检查和构建，最后用 Wrangler 发布。生产构建使用专用令牌，授权范围为 **BullshitCourt** 账户的 Workers Scripts Write 和 `bullshitcourt.lol` 的 Workers Routes Write。

首次部署时，在 Workers Builds 中把 `COURT_VISITOR_SECRET` 配为加密构建密钥。发布命令通过 `--secrets-file` 将其写入 Worker 的运行时密钥。沿用相同值可保留已签发的访客会话。

```bash
npm ci
npm test
npm run typecheck:worker
npm run build
npx wrangler deploy --dry-run
```

如需重新初始化 D1 表结构，用拥有 D1 写权限的凭据执行 `npx wrangler d1 execute DB --remote --file=worker/schema.sql`。每场庭审一个 SQLite Durable Object（`CourtRoom`），席位令牌和邀请票据自带 gameId 前缀，Worker 无需全局索引即可路由。

## 后台管理（Cloudflare Access）

BullshitCourt 尚未启用 Access。启用后，通过一个 **Self-hosted** 应用保护 `bullshitcourt.lol` 上的 `/admin`、`/admin/*` 和 `/api/admin/*`。为管理员邮箱配置 Allow 策略，从该应用取得 **AUD tag**，并从 `<team>.cloudflareaccess.com` 取得团队名。首次部署时可将 `COURT_ACCESS_TEAM` 和 `COURT_ACCESS_AUD` 一并传入。为已部署的 Worker 设置时使用以下命令。

```bash
npx wrangler secret put COURT_ACCESS_TEAM
npx wrangler secret put COURT_ACCESS_AUD
```

管理员通过 Cloudflare Access 登录 `https://bullshitcourt.lol/admin` 后可以使用以下功能。

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
