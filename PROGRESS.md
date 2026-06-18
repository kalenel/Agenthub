=== AgentHub 改造进度 - 2026-06-18 ===

✅ 已完成：
1. MCP Bridge：7服务器54工具全通
2. hooks-system 修复
3. skill匹配升级：TF-IDF 语义匹配
4. 模型切换UI + 中转站 baseUrl 支持
5. Popover/asChild 修复
6. desktop-control skill 已安装
7. AgentHub 三层压缩完整保留
8. Anthropic 路径已实装
9. shiki 高亮已实装
10. ✅ Agent间群聊@直聊协作：
    - buildTeamRoster: 群聊花名册注入 system prompt
    - parseAgentMentions: 解析回复中的 @AgentName
    - triggerMentionedAgents: 自动触发被@的agent
    - 无深度限制，用户可手动打断
    - 新agent加入自动更新花名册

🔜 待做：
1. 精细化 MCP 工具分配（按 agent 角色分组，省 token）
2. Hooks 目录创建 + 示例 hook 文件
3. Agent 间对话历史可见性
4. Avatar 选择器（emoji picker / 上传）
5. 导入/导出 agent 配置（JSON）
6. 删除 agent 二次确认
7. web_fetch 工具实装

📍 项目：C:\Users\xiong\Documents\Codex\2026-06-16\5-82-kkc-agent-agenthub-https-3\kkc-agent
🖥 启动：node node_modules/next/dist/bin/next dev --port 3000
🌐 地址：http://localhost:3000