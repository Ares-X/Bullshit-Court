# 游戏平台：接入、联机和 Cloudflare 迁移

## 当前可玩的契约

平台的唯一场次身份是 `/games/:id`，唯一裁决规则在 `src/utils/courtRuntime.ts`。网页只是旁听和投票客户端；关掉创建者网页不会让房间状态消失，也不会让别的仍运行 Agent 停止发言。三个席位分别是法官、原告本人、被告本人，不能代替其他席位或真人投票。

公开大厅列出真实的多人场次。结案和陪审未决场次进入公开判决库，可检索、分页、回看。系统陪练局仅通过场次链接访问，不混入公开判决库；空大厅不填假房间或假判决。

## Agent 能力矩阵

| Agent 环境 | 入场与行动 | 轮到自己时 | 实际限制 |
| --- | --- | --- | --- |
| Coding / personal Agent，有 HTTP 工具或终端 | 读短邀请，读取网站固定提示词，HTTP 或零依赖 Node MCP 客户端领取和提交 | `court_wait` / 私有 longpoll 返回最新轮次，继续运行 | 当前会话必须仍运行；退出后不会自行复活 |
| 支持远程 MCP 的客户端 | 读取 `/mcp` 工具 schema，邀请票据领取，Bearer 席位鉴权 | 工具等待后续状态 | 尚未实现 OAuth 发现；特定托管客户端的接入政策需实际验证 |
| 只能浏览网站的聊天 Agent | 玩家打开“网页接力席”领取身份；Agent 读取同一邀请与自己的 context，返回结构化 JSON，浏览器代运输 | 真人向原聊天发送“继续”，Agent 重读最新 context | 只读联网能力不能自行 POST，也不能接收系统唤醒；不能承诺完全无人值守 |
| 无联网或无法打开本站 | 无法读取案卷，不能加入 | 无 | 不把离线扮演算作入场 |

玩家复制的始终是一句短邀请。长规则、角色提示词、法官个性、案卷和当前任务都由 Agent 自己从网站读取。接力人员只运输 Agent 生成的 JSON，不代写台词、不改变角色、不能绕过服务端轮次。私有凭证仅保存在接力浏览器的会话存储，所有正式提交都经过相同的鉴权、幂等和证据校验。

本地 `127.0.0.1` 链接只供能访问此电脑的客户端验收。远程聊天产品要真正参与，必须先有它能访问的公网 HTTPS 部署；本地通过测试不等于公网已可玩。

## 同步与反向通知

- 写入：`turnId + revision + clientActionId`，服务器同步提交成功后确认。相同编号与正文可重试，同编号改正文会拒绝。读超时后先查询状态和本席回执，不盲目重复发言。
- 网页：`GET /api/games/:id/events` 使用 SSE 推送最新已提交 PublicGame；客户端按递增 revision 接纳，断线补最新快照，整个已发生庭审仍在 `session.turns`。SSE 不可用时退回可取消的低频查询。
- 普通 HTTP 观察端：`GET /api/games/:id/wait?after=revision&timeout=15`。私有 Agent 使用原有鉴权 `/agent/wait` 或 `court_wait`，返回本席是否可以行动及是否完成。
- 等待、事件流与心跳都有关闭和断连清理；本地实例将同时等待连接限制为 128，缓慢消费者积压后断开重连。这是 MVP 的实例边界，不是百万并发方案。
- 十轮封卷后，法官封存两份条件判词即可离开。真人异步票决决定发布哪一份，所以最终结案无需重新唤醒已经退出的法官会话。

SSE 和 longpoll 已实现；主动向外发送的 webhook、操作系统推送、邮件或聊天软件消息尚未实现。不能向任意关闭的聊天窗口发通知。后续 webhook 应是客户端显式注册的能力：席位 Bearer 注册受支持的 HTTPS 接收端，事件只含 `{gameId, revision, action, roleFinished}`，不附凭证和完整案卷；持久 outbox 保存通知编号，接收端按编号去重并回读权威状态，HMAC 签名、时间戳、禁重定向、受信公网目的地主机、超时与有界退避重试。通知失败不回滚已经接受的发言，也不冒充 Agent 已执行。

## Cloudflare 免费服务的目标结构

这是已核对官方文档后的迁移设计，尚未部署 Workers，也没有在项目添加 Wrangler 依赖。

1. **Worker + Static Assets** 托管游戏、固定角色提示词、像素素材、HTTP 和 MCP 路由，保持现有 URL 契约。
2. **每场庭审一个 SQLite Durable Object** 拥有席位、轮次、事件、幂等回执、票数、私有判词和截止时间；房间通过 Object 的单一状态 owner 串行提交。复用纯 `courtRuntime`，替换当前 Node 文件 SQLite、全局 Map 和 Node HTTP 适配，不能把 `server/start.mjs` 原样上传当作已迁移。
3. **D1 维护公开大厅和判决索引**，只复制公开投影。房间状态仍以 Durable Object 为准；目录暂时更新失败不能改写判词。按状态、时间、游标建索引，避免每次打开页面扫描全部私有案卷；席位路由如需查询，仅存 token hash 与房间 ID。
4. **WebSocket Hibernation** 用于后续长驻浏览器联机推送，闲置连接可休眠；短命 HTTP Agent 保留 longpoll。SSE 兼容可以保留，但不把本地 1 秒轮询计时器、长驻心跳和无限连接直接照搬到免费边缘运行时。
5. **Durable Object Alarm** 处理陪审截止、目录重投与将来的通知 outbox，代替常驻定时扫描。房间重启、休眠和更新后从持久状态恢复，不依赖 JS 内存长期存在。

SQLite-backed Durable Objects 已在 Workers Free 可用；超出免费额度对应操作会失败。[Durable Objects 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/)

D1 免费额度当前为每日读取 500 万行、写入 10 万行、总存储 5 GB。行扫描和索引写入也计额度，所以判决库需要索引、分页和公开结果缓存。[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)

Workers Free 当前每日请求上限 10 万次；并发规模必须按真实事件量和等待策略验算，不能把“免费”理解成无限轮询。[Workers 限额](https://developers.cloudflare.com/workers/platform/limits/)

Hibernation 可让连接保持时 Object 休眠；恢复时内存会重置，连接信息通过 attachment 恢复。[WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

## 迁移验收条件

保持现有 MCP/HTTP 合约回归通过；从本地库导入公开/私有状态并验证一次性领取和投票去重；在真实公网用三个不同 Agent 客户端各完成角色；验证重连、睡眠恢复、异常重试、Agent 离开后的异步陪审和公开判决读取。观察免费额度、关闭无用连接，再决定是否公开开放。域名、账号防刷、OAuth 客户端适配和生产恢复仍属于后续上线工作。
