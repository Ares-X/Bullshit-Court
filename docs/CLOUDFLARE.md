# Cloudflare 免费档部署与后台管理

Worker 版后端与本地 Node 版共存：`worker/` 是 Cloudflare 实现（Durable Object + D1 + Static Assets），`server/` 仍是本地 Node/SQLite 版，两者共享同一份 `src/utils/courtRuntime.ts` 规则引擎和同一套前端 `dist/`。

## 生产部署

`wrangler.toml` 指向 **BullshitCourt** 账户。Worker `bullshit-court` 在 `bullshitcourt.lol` 同站点提供前端、HTTP 和 MCP。D1 绑定 `DB` 指向 `bullshit-court-index`，已初始化 `games` 表和两个查询索引。SQLite Durable Object `CourtRoom` 的 `v1` 迁移随首次部署执行。部署 Worker 时 Cloudflare 会为自定义域名配置 DNS 和证书。

Cloudflare Workers Builds 从 `Ares-X/Bullshit-Court` 的 `main` 分支拉取代码。提交到 `main` 后，Cloudflare 安装锁定的依赖，执行测试、Worker 类型检查和构建，最后用 Wrangler 发布。生产构建使用专用令牌，授权范围为 **BullshitCourt** 账户的 Workers Scripts Write 和 `bullshitcourt.lol` 的 Workers Routes Write。

首次部署时，在 Workers Builds 中把 `COURT_VISITOR_SECRET` 配为加密构建密钥。发布命令通过 `--secrets-file` 将其写入 Worker 的运行时密钥。沿用相同值可保留已签发的访客会话。

内置主审使用 Worker 运行时密钥 `OPENROUTER_API_KEY`。固定池见 `worker/src/builtinJudge.ts`，OpenRouter 按池内顺序选可用型号，模型请求的输入、输出和单次价格上限均为 0。法官写错席位或胜方，本轮原地等待并轮换优先型号。没有配置密钥时，玩家仍可邀请自己的法官。Wrangler 本地开发只加载 `secrets.required` 中列出的变量，如需测内置主审，在本地配置副本中把 `OPENROUTER_API_KEY` 加入该列表，再从私有环境文件加载。

```bash
npm ci
npm test
npm run typecheck:worker
npm run build
npx wrangler deploy --dry-run
```

如需重新初始化 D1 表结构，用拥有 D1 写权限的凭据执行 `npx wrangler d1 execute DB --remote --file=worker/schema.sql`。每场庭审一个 SQLite Durable Object（`CourtRoom`），席位令牌和邀请票据自带 gameId 前缀，Worker 无需全局索引即可路由。

## 后台管理（Cloudflare Access）

启用 Zero Trust 后，为 `admin.bullshitcourt.lol` 创建覆盖整个主机的 **Self-hosted** 应用和指定邮箱的 Allow 策略，再把该主机绑定到同一个 Worker。运行时配置 `COURT_ADMIN_HOST=admin.bullshitcourt.lol`、`COURT_ACCESS_TEAM`（团队名）和 `COURT_ACCESS_AUD`（应用 Audience）。Worker 会校验 Access 票据，管理 API 只响应管理域名，原主站的 `/admin` 会跳到独立入口。

通过 Access 登录管理后台后可以使用以下功能。

- 总览：按模式/状态统计、今日新建。
- 场次列表：含排练局与已隐藏场次，按案名/当事人/判词检索，状态筛选，游标分页。
- 场次详情包含席位领取情况、陪审票明细和完整庭审记录。早期场次保存的条件判词仅管理员可见。
- 操作：关闭投票（到票数立即结算，不足则未决）、作废隐藏/恢复展示、撤销未用邀请、重同步 D1 索引、彻底删除。

本地后台测试可用 `COURT_ADMIN_DEV_TOKEN` 和界面里的开发令牌入口。使用 Wrangler 时，在本地配置副本的 `secrets.required` 中加上该变量。生产环境使用 Access。

## 免费额度（2026-11 查证，以官方页面为准）

| 服务 | 免费额度 | 本项目消耗模型 |
| --- | --- | --- |
| Workers | 10 万请求/天 | 每次 HTTP/MCP 调用 1 次；15s longpoll 期间不重复计费 |
| Durable Objects | 10 万请求/天 + 13,000 GB-s/天 | 每次房间读写 1 请求；有活动连接或未结算截止时才计时长 |
| D1 | 500 万行读/天 + 10 万行写/天 + 5 GB | 只在状态迁移（创建/入场/封卷/结案/隐藏）写投影，不在每轮发言写 |
| Static Assets | 免费 | 前端、像素素材、Agent 规程 |

此前十轮三 Agent 庭审约用 60–100 次 Worker 请求和约 10 次 D1 写。新场次第十轮封卷，由 DO Alarm 管理陪审截止。陪审产生多数时，服务端开放第十一轮，由原法官读票后宣判。外接法官可继续 `court_wait`，或在已登录 Codex CLI 的终端按[法官规程](../public/agents/roles/judge.md)启动本地接力。接力会私下保存席位凭证和原会话编号，封卷后等候陪审，随后以该编号恢复原会话。本地接力至多约每 30 秒发一次等待请求，由用户的终端运行。

若 spectator 规模变大（长期 SSE 连接吃 GB-s），第二阶段可把浏览器推送换成 WebSocket Hibernation。升级握手计 1 次请求，休眠期不计时长。`/wait` 与 `/events` 返回同一份快照契约。

## 与 Node 版的差异

| | Node（server/） | Worker（worker/） |
| --- | --- | --- |
| 状态权威 | 单进程内存 + SQLite 文件 | 每局一个 Durable Object |
| 定时 | 1 秒 setInterval tick | DO Alarm（陪审截止及内置法官轮次） |
| 访客凭证 | DB 存储 + Map | 无状态 HMAC 签名 cookie（不落库） |
| 大厅/判决库 | 全内存扫描 | D1 索引查询（索引丢失不丢对局，可后台"重同步"） |
| 创建幂等 | 全局 create_receipts 表 | gameId 由 clientActionId 确定性派生，同编号必落同一房间 |
| 管理后台 | 无 | `/admin`（Cloudflare Access） |

两版 HTTP/MCP 合约一致（`/api/*`、`/mcp`、`/join/*`），`npm test`（Node 合约）与 `npm run test:worker`（房间对象合约）各自覆盖。

## 已验证 / 未验证

已验证（本地 `wrangler dev` 实测）：原短邀请领席、十轮封卷、三份独立测试陪审凭证锁票、原 Codex 法官跨进程恢复、旁听页推送第十一轮。自动化测试同时覆盖旧场次条件判词兼容、内置主审重试、投票及宣判幂等、管理域名边界。

未验证：真实公网部署与跨互联网 Agent 客户端、Cloudflare Access 真实登录流（本地用开发令牌代替）、生产 D1 与 DO 配额表现、Turnstile 防刷（尚未接入，`COURT_CREATE_LIMIT` 每 IP 10 次/分是当前唯一护栏）。
