# 专家团

专家团让一个会话使用可复用的专家身份或协作团队。专家包定义 lead 人设、可选成员人设及其声明的能力。Runtime 会为会话统一解析一次；TUI、WebUI、Desktop/ACP 与渠道入口只投影这一份共享状态。

## 用专家启动

可以在启动时使用 `--expert`，也可以在 TUI 中管理绑定：

```bash
# 使用内置的软件公司团队启动新会话
mothx --expert software-company

# 在已有 TUI 会话中查看可用专家包
/expert list
/expert show software-company

# 绑定或移除专家身份
/expert bind software-company
/expert unbind
```

`/expert bind` 可为尚未绑定专家的会话建立绑定；`/expert unbind` 会移除当前会话的身份。两者都不会改写既有对话历史。

## 通过分叉切换专家

从一个非空专家切换到另一个专家时，会创建新的会话分支：

```text
/expert switch frontend-developer
```

源会话保留原来的专家、历史和身份提示词；新分支在当前对话边界绑定请求的专家。这样不会把两个专家身份混进同一段历史。

WebUI 专家面板和 Desktop 的 **Expert** 会话选项遵循相同规则：首次绑定和解绑更新当前空闲会话；替换已绑定专家会创建并打开分叉会话。

## 团队行为

团队型专家包会自动启用会话的多 Agent 能力，无需只为使用团队再额外添加 `--multi-agent`。lead 会获得团队名册，并可以按成员 ID 派发：

```text
subagent_spawn(member: "software-engineer", task: "实现这个聚焦修复，并运行相关测试。")
subagent_wait(timeout_ms: 30000)
```

成员仍是普通子 Agent：工具和模式限制来自专家包与会话策略；成员不能嵌套派发成员；高风险命令保护仍然生效。单人专家只改变 lead 身份，不会强制启用团队工具。

成员生命周期卡片来自 canonical child event 的投影。成员完成只更新自己的状态，并在活跃 lead 的 agent-loop 边界投递；它不会自行启动新的 lead run。

## 与 ESM 的关系

专家团与 Enable Supervisor Mode（ESM）组合使用时不会创建第二套任务调度器。只有用户能创建、编辑、恢复或清除 ESM 目标。只有会话确实空闲且目标仍可自动运行时，既有 ESM continuation 才会启动下一次 lead run；成员终态事件不是续跑触发器。

团队绑定的 ESM worker 会保留 lead 身份与名册。ESM 的 critic、audit 和 recovery 角色仍保持隔离，不会获得成员调度工具。

## 添加本地专家包

专家包会从内置目录、用户配置目录的 `experts/` 文件夹以及项目目录延迟发现：

```text
<config-dir>/experts/<bundle-name>/
<project>/.mothx/experts/<bundle-name>/
```

同名时，项目包覆盖全局包，全局包覆盖内置包。一个专家包包含 `expert.json` 与 `agents/` 下的一个或多个 persona 文件；无效包会显示为不可用，且不能被绑定。包格式和架构设计请参阅[专家团实施方案](../proposal/expert-team-mothx-proposal.md)。
