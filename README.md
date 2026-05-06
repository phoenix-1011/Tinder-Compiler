# Tinder Compiler

Tinder Compiler 是一个面向 Windows 内部使用的项目定制化编辑桌面应用。目标是提供接近 VS Code 的编辑体验，并围绕代码、配置文件、编译运行和 AI 辅助做项目级定制。

## 技术栈选择

当前项目建议采用以下技术栈：

- 桌面壳：Electron
- 构建工具：Electron Vite
- 语言：TypeScript
- UI：React
- 编辑器：Monaco Editor，后续可接入 VS Code 兼容 API 能力
- 项目与文件系统：Node.js fs/path + Electron preload 安全桥接
- 编译运行：Node.js child_process 调用 xmake、Python、Go、C++ 工具链
- AI 接入：Provider 抽象层，优先支持本地或内网 OpenAI-compatible endpoint，满足离线/内网部署要求
- 包管理：pnpm workspace

选择这个组合的原因：

- Electron 与 VS Code 的桌面技术路线一致，适合做独立 Windows 工具。
- Monaco 是 VS Code 编辑器核心，适合逐步实现语法高亮、格式化、诊断和多语言编辑。
- React 适合实现项目面板、图形化配置面板、运行面板和 AI 交互界面。
- pnpm workspace 便于把桌面应用、编辑器能力、编译桥接和 AI 接入拆成清晰模块。

## 初始目录

```text
.
├─ apps/
│  └─ desktop/              # Electron 桌面应用
├─ packages/
│  ├─ ai/                   # AI provider 抽象与适配
│  ├─ compiler-bridge/      # xmake/Python/Go/C++ 编译运行桥接
│  ├─ editor/               # Monaco/VS Code 编辑器能力封装
│  └─ project/              # 项目模型、文件树、配置管理
├─ docs/                    # 架构与设计文档
├─ package.json
└─ pnpm-workspace.yaml
```

## 后续里程碑

1. 搭建 Electron Vite + React + TypeScript 最小可运行应用。
2. 接入 Monaco Editor，支持打开文件和基础编辑。
3. 实现文件树和项目工作区模型。
4. 增加格式化入口，先接已有工具链，例如 clang-format、black、gofmt。
5. 增加编译/运行面板，封装 xmake、Python 脚本、Go 命令。
6. 增加图形化配置面板，沉淀项目级 schema。
7. 增加 AI provider 抽象，支持本地/内网模型服务。

## 开发命令

在 Codex 的“运行”启动项中，Windows 下建议填写：

```cmd
scripts\dev.cmd
```

该脚本会在缺少 `node_modules` 时先执行依赖安装，已有依赖时直接启动桌面应用。

也可以手动执行：

```powershell
pnpm install
pnpm dev
pnpm build
pnpm typecheck
```

## 平台目标

- 第一目标平台：Windows
- 发布方式：内部离线分发
- 外部网络：运行时不依赖公网；AI 与工具链优先走本地或内网服务
