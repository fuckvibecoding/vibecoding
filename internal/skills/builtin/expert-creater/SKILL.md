# 创建并安装主角团

当用户要求创建、新建、定制或安装主角团时，使用本 Skill。主角团是一个可复用的本地 `expert` 包；创建完成后，当前会话及同一项目的 TUI、WebUI、Desktop 和 ACP 都可以发现并绑定它。

## 工作方式

1. 从用户需求提取团队名称、领队职责、成员职责和协作方式。只有在缺少会改变团队结构的必要信息时才提问；名称未指定时，根据用途生成简短、稳定的 kebab-case ID。
2. 在当前工作目录创建项目级包：`.mothx/experts/<team-id>/`。这是安装位置，不要写入 MothX 内置目录、全局配置目录或其他项目。
3. 若目标目录已经存在，先读取并说明冲突；除非用户明确要求更新，绝不覆盖、删除或合并已有主角团。
4. 写入 `expert.json` 和 `agents/*.md`。清单必须使用 `schemaVersion: 1`、`expertType: "team"`，并让 `name` 与目录名相同；`agentName` 与 `teamInfo.leadAgent` 必须指向领队文件 ID。`teamInfo.memberAgents` 只能列出成员，不能包含领队。
5. 每个 `agents/<id>.md` 都必须有 YAML frontmatter。至少包含稳定的 `name`、简洁的 `description`、`role`（领队为 `lead`，成员为 `member`）和一个 emoji；正文写清角色边界、输入、交付物、与领队/成员的协作规则。成员不应被指示嵌套派发其他成员。
6. 在 `members` 中为领队和每个成员填入同一 ID、显示名称、职业与角色。避免把密钥、个人隐私、绝对机器路径或不安全命令写进人设或清单。
7. 创建后校验：检查 JSON、目录名和所有引用的成员文件；然后通过当前入口刷新/列出主角团。报告安装目录、团队 ID、成员名单和下一步绑定方式。若校验失败，修复新建文件后再报告，不要留下半成品。

## 最小团队模板

`expert.json` 的结构应与下面一致；按用户需求替换所有示例文字和 ID：

```json
{
  "schemaVersion": 1,
  "name": "release-squad",
  "expertType": "team",
  "agentName": "lead",
  "displayName": { "zh": "发布主角团", "en": "Release Squad" },
  "teamInfo": {
    "leadAgent": "lead",
    "memberAgents": ["engineer", "reviewer"]
  },
  "members": [
    { "id": "lead", "name": { "zh": "领队", "en": "Lead" }, "profession": { "zh": "协调负责人", "en": "Coordinator" }, "role": "lead" },
    { "id": "engineer", "name": { "zh": "工程师", "en": "Engineer" }, "profession": { "zh": "实现", "en": "Implementation" }, "role": "member" },
    { "id": "reviewer", "name": { "zh": "审查员", "en": "Reviewer" }, "profession": { "zh": "质量审查", "en": "Quality review" }, "role": "member" }
  ]
}
```

## 启用与使用

先通过 `/skill expert-creater`（或入口提供的同名 Skill 命令）启用本 Skill，再直接说明希望创建的团队，例如：“创建一个移动端发布主角团，包含领队、Android 工程师和测试审查员”。创建完成后使用现有 `expert` 选择器或 `/expert bind <team-id>` 绑定；如果当前会话已经绑定其他主角团，按既有分叉切换规则操作。
