# AgentHub 记忆分层设计

> 目标：在不破坏 AgentHub 现有会话压缩、群聊协作和本地优先原则的前提下，增加一套可共享、可迁移、可追加的长期记忆体系，让 AgentHub、Codex 以及后续其他框架共享同一份记忆底座。

## 0. 结论先行

这套方案采用三条硬原则：

- **分层记忆**：把记忆拆成 `core / project / session` 三层，`immediate context` 不入长期库，只存在于当前轮请求。
- **追加式写入**：任何修正都新增记录，不直接覆盖旧事实；如需表达替代关系，只写 `supersedesId`。
- **本地优先真源**：SQLite 是唯一真源，HTTP / MCP / 文件同步都只是外壳，不是记忆本体。

这不是用更大的 prompt 替代现有压缩，而是叠加在现有三层压缩之上：

1. 当前窗口的即时上下文
2. 会话摘要 / pinned / 最近消息
3. 长期记忆（core / project）

---

## 1. 问题定义

AgentHub 现在已经有：

- `pinned_message_ids`
- `conversation_context_summaries`
- 群聊 / 单聊的 `buildHistoryFor` 注入

这些能力能处理**单次会话上下文压缩**，但还解决不了：

- 同一项目跨天继续时，核心决策会被忘掉
- Codex 与 AgentHub 不能天然共享同一份长期记忆
- 聊天模式需要更完整，编码模式需要更轻，现有机制没有统一的模式化读取层
- 上下文窗口可能超限，且没有分层降级策略
- 用户希望记住的是“关键事实、偏好、决策、状态”，不是完整聊天流水

因此需要一个新的记忆层：**能记住，但不会把每次请求都塞满**。

---

## 2. 设计目标

### 2.1 必须满足

1. **保留现有压缩优势**
   - 不替换会话摘要和 pinned 机制
   - 不把所有历史硬塞回 prompt

2. **Codex 与 AgentHub 共享记忆**
   - 同一用户、同一项目、同一工作区下的关键记忆可以互通
   - 后续接入其他框架时不需要重做底座

3. **编码轻、聊天完整**
   - 编码时尽量只加载最少必要记忆
   - 聊天 / 日报 / 复盘时加载更完整的项目记忆和会话记忆

4. **核心记忆只增不删**
   - 重要身份、原则、长期偏好、稳定项目决策不自动删除
   - 如有冲突，只写新记录并标注替代关系

5. **本地优先，支持迁移**
   - AgentHub 仍然可以离线工作
   - 记忆可导出、备份、导入到别的实例或框架

6. **写入不能拖慢主对话**
   - 记忆入库异步后台完成
   - 任何记忆失败都不能阻塞消息发送或工具调用

### 2.2 期望达成

- 用户可以显式“记住这件事”
- 用户可以搜索最近记忆 / 项目记忆 / 核心记忆
- 任意 agent 都能通过同一契约读取记忆，而不是每个框架自己造一套
- 记忆层能解释“为什么这轮加载了这些上下文”

---

## 3. 非目标

- 不把 `conversation_context_summaries` 直接替换掉
- 不把完整聊天记录当作长期记忆强行回放
- 不要求所有 agent 每次都加载全部记忆
- 不把记忆做成一个巨大的永久 system prompt
- 不默认保存密钥、登录态、一次性验证码
- 不追求一次性“全自动完美记忆”

---

## 4. 方案比较

### 方案 A：只靠会话摘要 + pinned

**做法**：继续强化现有压缩和 pin，不新增长期记忆层。

**优点**：
- 改动最小
- 与现有结构兼容
- 实现最快

**缺点**：
- 只能记住当前会话附近内容
- Codex 与 AgentHub 仍然不能共享长期记忆
- 项目级知识会随对话轮次散掉

**结论**：不够。

### 方案 B：分层记忆服务 + 多客户端接入

**做法**：新增一个统一记忆服务 / 契约层，把记忆分成 `core / project / session` 三层，AgentHub 和 Codex 都走同一套读写入口。

**优点**：
- 同时满足速度和记忆深度
- 核心记忆可跨会话、跨客户端复用
- 本地优先，也能导出迁移
- 后续接入新框架成本低

**缺点**：
- 比方案 A 多一层服务和索引
- 需要定义清晰的“该记什么、不该记什么”
- 需要预算控制，避免反向拖慢上下文

**结论**：推荐主方案。

### 方案 C：外部记忆平台优先，AgentHub 只做适配

**做法**：把外部记忆服务作为唯一真源，AgentHub 只负责适配和展示。

**优点**：
- 多框架天然共享
- 迁移成本可能更低

**缺点**：
- 依赖网络和第三方
- 不符合 AgentHub 的 local-first 气质
- 离线能力弱

**结论**：可作为未来外接能力，不适合作为主架构。

---

## 5. 推荐架构

### 5.1 总体结构

建议把记忆系统拆成五个明确职责：

1. **Global Memory Hub**
   - 系统级总记忆真源
   - 负责记录、索引、版本链、冲突与状态
   - 保存全局事实、长期偏好、项目决策和跨会话关系图

2. **Memory Router**
   - 每轮请求前按模式和预算分配记忆
   - 负责决定读多少、读哪层、先读什么、后读什么

3. **Task Memory Slice**
   - 发给某个 agent 的任务记忆包
   - 只包含完成当前任务所需的局部视野
   - 子 agent 不看全局仓库，只看它那一小块

4. **Memory Writer**
   - 异步捕获候选记忆
   - 分类、去重、打分、追加写入、标注 supersedes

### 5.2 核心原则

- **记忆本体独立于 prompt**
- **写入永远追加，不静默覆盖**
- **读取按模式，不按“全量可见”**
- **高价值事实优先，低价值噪声丢弃**
- **session memory 仍然保留在现有三层压缩链里**

---

## 6. 记忆分层

### 6.1 Session Memory

单个会话内的可压缩记忆。

包含：

- `conversation_context_summaries`
- pinned messages
- 最近未被摘要覆盖的重要消息
- 当前会话里的临时决策、待办、阻塞点

特点：

- 只服务当前 conversation
- 会过期、会压缩、会被摘要替代
- 负责回答“这次聊了什么”

### 6.2 Project Memory

项目级长期记忆。

包含：

- 当前项目结构
- 已确认的技术路线
- 当前约束和禁忌
- 重要里程碑和未完成事项
- 设计偏好、团队习惯、UI 规则

特点：

- 按 `userId + workspaceId + projectKey` 隔离
- 同一项目下多个会话共享
- 适合“继续干活”“看项目进度”“接着改代码”

### 6.3 Core Memory

最小、最稳、最重要的长期记忆。

包含：

- 身份与关系
- 长期偏好
- 核心原则
- 稳定项目目标
- 重大决策和不可逆约束

特点：

- 只增不删
- 永远优先于临时摘要
- 体量必须很小，默认只保留高置信条目

### 6.4 Immediate Context

当前这轮真正发给模型的内容。

包含：

- 当前用户消息
- 当前工具结果
- 当前任务提示
- 当前轮的临时上下文

特点：

- 只活在这一轮
- 不进长期库
- 由模式和预算决定是否追加少量记忆内容

---

## 7. 记忆记录结构

### 7.1 统一记录模型

建议所有记忆都使用统一记录格式，而不是把“单条事实”做成唯一真相。

最少包含：

- `id`
- `scope`：`core | project | session`
- `kind`：`fact | preference | decision | task | warning | summary | relationship | note`
- `text`
- `payload`
- `source`
- `sourceRef`
- `importance`
- `confidence`
- `status`：`active | superseded | conflicted | archived`
- `projectKey`
- `conversationId`
- `createdAt`
- `updatedAt`
- `lastAccessedAt`
- `tags`
- `supersedesId`

### 7.2 字段含义

- `text`：给模型直接读的简短自然语言
- `payload`：结构化信息，供 UI、搜索、导出使用
- `source`：来源类型，如 user / assistant / tool / system / import
- `sourceRef`：来源定位，如 messageId / tool callId / file path
- `importance`：重要性分值，决定是否进 core
- `confidence`：置信度分值，决定是否保留和复用
- `status`：当前状态，不同于是否“还存在”
- `supersedesId`：指向旧版本，表示新记录替代旧记录

### 7.3 版本与冲突

- 新事实不覆盖旧事实，只新增记录
- 如果新记录是旧事实的修正，写 `supersedesId`
- 如果同一事实存在冲突，旧记录保持历史，新记录标 `conflicted` 或 `superseded`
- 读取时按模式、置信度、重要性和最近访问时间选择版本

---

## 8. 命名空间与隔离

### 8.1 命名空间

- `core`：默认按 `userId` 隔离，必要时可加 `workspaceId`
- `project`：按 `userId + workspaceId + projectKey` 隔离
- `session`：按 `conversationId` 隔离

### 8.2 隔离规则

- 不同用户不会混到一张记忆图里
- 不同 workspace 的项目记忆互相隔离
- session 记忆只服务当前会话，不会自动升级成 core
- 读取时必须携带命名空间键

---

## 9. MemoryPack 读取配方

### 9.1 基本顺序

建议固定顺序：

`session -> project -> core -> retrieval hits`

先装最贴近当前对话的，再装更稳的长期内容，最后补检索结果。

### 9.2 模式化配方

#### coding

目标：最轻。

优先加载：

- 当前会话摘要
- 当前任务直接相关的 project 记忆
- 极少量 core

默认不带大范围搜索结果。

#### chat / report

目标：完整。

优先加载：

- session 摘要
- project 里的当前状态、决策、阻塞
- 相关 core 事实
- 必要时补少量检索结果

#### recovery

目标：断点续接。

优先加载：

- session summary
- project memory 里的未完成任务和阻塞
- core 里的关键原则和身份信息
- 必要的最近原文片段

#### sub_agent

目标：隔离且够用。

优先加载：

- 任务说明
- 相关 project 事实
- 极少量 core
- 不注入完整群聊历史

### 9.3 预算策略

预算不够时，优先级如下：

1. 减少 retrieval hits
2. 缩减 project memory 范围
3. 只保留 session summary
4. core 只保留最关键条目
5. 仍超预算时，返回可解释的降级结果，而不是硬塞内容

### 9.4 why_loaded

每条被装进 `MemoryPack` 的内容都应该能解释原因，例如：

- 与当前任务直接相关
- 最近访问过
- 用户显式要求记住
- 用于恢复断点
- 与当前 project 的关键决策相关

这能让记忆层可调、可审、可控，也方便用户理解“为什么这轮看起来记得更全”。

---

## 10. 记忆写入管线

### 10.1 候选来源

先只从三类里抓候选：

- 用户明确要求记住的内容
- 项目决策、状态变化、阻塞项
- 高置信、长期稳定的事实

### 10.2 写入流程

建议顺序：

1. 候选捕获
2. 轻量分类
3. 去重
4. 置信度 / 重要性打分
5. 决定 scope（core / project / session / discard）
6. 追加写入
7. 必要时写 `supersedesId`
8. 异步落库

### 10.3 写入原则

- 写入不阻塞主回复
- `core` 只接收高置信且稳定的内容
- `project` 可接收项目相关但仍可能变化的内容
- `session` 可更活跃，但会压缩或过期
- 噪声内容宁可不记，也不要污染长期记忆

### 10.4 冲突处理

- 修正旧事实时，写新记录，不静默覆盖
- 旧记录保留历史
- 读取时依据模式、来源、置信度和重要性选取

### 10.5 失败处理

- 记忆写失败不影响当前消息发送
- 后台可重试
- 落库失败时只降级记忆能力，不降级主对话

---

## 11. AgentHub 与 Codex 的共享方式

### 11.1 共享原则

AgentHub 和 Codex **不共享进程内状态**，只共享同一套记忆底座。

也就是说：

- 不是“两个窗口直接看同一个内存变量”
- 而是“读同一个记忆库，按同一个契约写入”

对于 Claude Code / Codex 这类 SDK 型 adapter，原生 session resume 仍然保留为首选路径；记忆层负责补充 session 之外的 `core / project / recovery` 内容，而不是把所有历史都硬塞回一个新 prompt。

### 11.2 共享接口形态

推荐优先级：

1. 本地 SQLite / 文件记忆库
2. 本地 HTTP API
3. MCP 工具包装层

### 11.3 关键约束

- MCP 不是记忆本体
- System prompt 不是记忆本体
- 记忆本体必须是独立存储 + 明确契约
- 所有框架只能通过契约读写，不应直接改底层结构

---

## 12. UI 与操作体验

记忆层不只是后台结构，也需要可见。

建议至少支持：

- 最近记忆查看
- 核心记忆查看
- 项目记忆查看
- 记忆搜索
- 手动 pin / unpin
- 手动标记“记住这件事”
- 导出 / 导入记忆包
- 查看本轮加载了哪些记忆，以及为什么加载

UI 的目标不是让用户管理数据库，而是让用户知道：

**“我现在为什么记得这些。”**

---

## 13. 导入 / 导出包

为了让记忆能像插头一样插到别的框架里，建议提供 `MemoryPack`：

- `manifest.json`
- `core-memory.jsonl`
- `project-memory.jsonl`
- `session-memory.jsonl`
- `attachments/`

特点：

- 可整包导出
- 可按项目导出
- 可按时间范围导出
- 可重新导入到新实例
- 不依赖某一个单一客户端

---

## 14. 与现有三层压缩的关系

现有 AgentHub 的压缩能力要保留，而且要继续作为 Session Memory 的核心实现。

### 保留的东西

- `pinned_message_ids`
- `conversation_context_summaries`
- `buildHistoryFor`
- 群聊 / 单聊历史视角差异
- 现有 token budget 估算与截断逻辑

### 新增的东西

- Core / Project 记忆层
- 候选捕获与分类
- 模式化读取
- 导入 / 导出
- 跨框架共享契约

### 不应该发生的事

- 不把摘要表当成长期记忆全部真相
- 不把核心记忆写进超长 system prompt
- 不让记忆层反向拖慢会话压缩
- 不让 core memory 被自动删除来“省空间”

---

## 15. 推荐落地顺序

1. **先定义记忆契约**
   - 统一记忆记录格式、scope、kind、来源字段

2. **再接入现有会话压缩**
   - 把 session memory 明确为现有摘要机制的延伸

3. **然后实现 MemoryPack 读取**
   - 先 coding / chat / recovery 三种模式

4. **再实现写入管线**
   - 只抓显式记住、决策、稳定事实三类

5. **最后做导入 / 导出、共享桥和 UI**
   - 让 Codex、AgentHub、后续框架共用同一底座

---

## 16. 验收标准

这套设计落地后，至少应该满足：

- AgentHub 重开窗口后，仍能恢复项目的核心状态
- Codex 和 AgentHub 能读到同一份核心记忆和项目记忆
- 长聊不会把系统提示越塞越大
- 编码模式明显比聊天模式更轻
- 记忆写入失败不会阻塞主对话
- 核心记忆不会被自动删除，只会被追加或补充说明
- 导出的记忆包能导回另一实例并保持语义一致

---

## 17. 最终判断

如果目标是：

- 平时写代码要快
- 聊天 / 日报要记得多
- 核心记忆不能丢
- 未来还要给别的框架接入

那么最稳的方案不是更大的 prompt，而是：

**分层记忆 + 追加式存储 + 模式化读取 + 清晰导入导出契约**。

这会比单纯做摘要更完整，也比把所有能力塞进一个窗口更可靠。

### 9.5 Progress Memory

进度记忆用于回答“这件事现在做到哪了”，而不是“这件事第一次是什么”。

每个事项都应该有独立的进度链，至少包含：
- `itemId`：稳定事项标识
- `episodeId`：本次连续推进的分段标识
- `latestCheckpoint`：当前最新进度点
- `previousCheckpointId`：上一个 checkpoint
- `status`：`active | blocked | waiting | done | abandoned`
- `updatedAt`：最后更新时刻
- `summary`：一句话概括当前进度
- `evidenceRef`：对应的证据来源

规则：
- 同一事项多次出现时，先续接最新 `episodeId`，不要回跳到最早记录
- 用户问“进度如何”时，默认返回最新 checkpoint 和最近阻塞，而不是历史首条
- 新推进会生成新的 checkpoint，但保留旧 checkpoint 链接，避免进度断层
- 长时间中断后恢复，优先读取 `latestCheckpoint` + `blockedReason` + `nextAction`
- 如果事项被重新启动，标记为新 episode，不覆盖旧 episode

### 9.6 Transition Ledger

Transition ledger 记录一切导致上下文变化的事件，不限于窗口切换。

典型事件包括：
- 故障与恢复
- 工具异常与重试
- 环境变化
- 任务切换与优先级变化
- 权限变化
- 用户中断与人工接管
- 入口/窗口/设备切换
- 依赖缺失或外部服务不可用

每条 transition 至少要有：
- `transitionId`
- `fromState`
- `toState`
- `reason`
- `trigger`
- `scopeImpact`
- `recoveryTarget`
- `timestamp`

读取时优先恢复最近一次 transition 链，再恢复对应的进度链；不要只看当前窗口本身。

### 9.7 Evidence Pack

模型负责推理，记忆层负责主动提供现实依据。

每次组装给模型的 memory pack 时，应该尽量包含：
- 当前任务的最新 checkpoint
- 最近的关键 transition
- 相关事实与约束
- 阻塞原因与下一步
- 可能冲突的旧版本摘要
- 为何加载这些内容的简短解释

目标不是把历史全塞进去，而是把模型判断所需的证据递齐。
当预算紧张时，宁可减少检索结果，也不要漏掉最新 checkpoint、阻塞点和关键 transition。
---
- `session` 可更活跃，但会压缩或过期
- `memory pack` 必须优先包含能支撑判断的证据，而不是尽可能多的文本
- 关键的进度、事件和迁移信息要能被单独检索和解释
- 任何新的事实修正都必须保留旧版本，供模型比对历史
- Progress memory / Transition ledger / Evidence pack
- latest checkpoint / blocked reason / next action
- 迁移原因与上下文变化总账

### 9.8 Distribution Layer

记忆分发负责把同一份底座记忆，按不同接收者和不同任务拆成合适的 evidence pack，而不是所有地方都读同样一份内容。

分发目标：
- 给当前模型的只是一份够用的证据包，不是全量历史
- 给子 agent 的只是一份任务局部切片，不是全局记忆镜像
- 给事件处理链的只是一份最近 transition 和相关 checkpoint，不是整张记忆图
- 给 UI / 搜索 / 导出的是结构化视图，不是 prompt 视图

分发策略：
- 先按 recipient 分发，再按 mode 裁剪
- 先按 relevance 和 freshness 分发，再按 budget 收缩
- 先发最新 checkpoint、关键 transition、阻塞点、硬约束，再补背景事实
- 同一条记忆如果已经在 session 层出现过，不要重复塞进 project 或 core 的输出
- 若任务推进迅速，优先提高分发频率而不是增加单次上下文长度

分发应该能解释：
- 为什么这份记忆发给了这个 agent
- 为什么这条 transition 需要被提前发出
- 为什么某些背景被省略了
- 为什么这轮是轻包还是重包

分发不是“再读一遍”，而是“按接收者重组一遍”。
---
