# 流程链路契约总览

## 结论

当前 Model-P 统一入口的核心流程链路由 84 个 canonical core chain 节点组成。运行时 ordered execution 先执行域节点和可选 custom invocation 节点，再进入 core chain 边界；core chain 边界之后只能执行 core chain 节点或 post-commit custom invocation 节点。

## SSOT

- 文档 SSOT：`D:\Tinder\Tinder-Compiler\docs\flowchat\chain-contract`。

- 运行时顺序 SSOT：`D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` 中的 `kCoreChainOrder`。

- C++ contract 入口：`D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h`。

## 节点分组

| 分组 | 文档 | 节点数 | 范围 |

|---|---:|---:|---|

| 平台基础 | `10-platform-chain.md` | 6 | 裁决影响、设备裁决、平台实体、状态、外观、环境维护 |

| 控制指令 | `45-control-chain.md` | 9 | 控制传入、控制维护、控制解析、开关解析、伸缩解析、发波解析、派出解析、放出解析、通知解析 |

| 设备链路 | `20-device-chain.md` | 3 | 设备状态、空间状态、性能联合提交 |

| 信号环境 | `30-signal-environment-chain.md` | 15 | 静态信号、信号事实、回波事实、数字化观测、软杀伤、信号环境传播、环境特征生成/维护/传播 |

| 感知链路 | `40-sense-chain.md` | 12 | signature receive、signal intake 到 awareness maintain |

| 导航链路 | `50-navigation-chain.md` | 5 | 导航链路 指令维护、解析、移动、修正、坐标提交 |

| 目标动作与协同 | `60-target-action-chain.md` | 14 | 协同链路、诱饵库存 到 炮弹监督、platform.homeport.update、通道监督 |

| 打击链路 | `65-strike-chain.md` | 9 | 打击解析、打击路由、通道准备、发射执行、三类产物分支、打击监督、裁决提交 |

| 维护与跟踪 | `70-maintenance-chain.md` | 5 | 跟踪链路 跟踪请求、目标 key、设备、事实、监督 |

| 统一通信链路 | `75-communication-chain.md` | 6 | 组网维护、接收传入、接收解析、请求汇集、发送解析、通信发送 |

| 运行时扩展节点 | `80-runtime-extension-nodes.md` | - | 域节点、custom invocation、通信发送 |

## 展示名规则

- 展示名用于 UI、汇报和人工阅读。

- 展示名必须简短，优先使用 4 个汉字以内的动宾或名词结构。

- 展示名不得替代 canonical node id；配置、代码、测试仍必须使用 canonical node id。

- 同一文档集中展示名必须唯一。

## 全局执行约束

- Ordered execution 配置必须与 `kCoreChainOrder` 完全一致。

- Core chain 边界之后不得出现 builtin domain node。

- Custom invocation node 可以插入 ordered plan，但必须引用 runtime config 中已声明的 custom node。

- Core chain 节点不得使用旧入口函数或双轨兼容入口。

## 验证

| 检查项 | 期望结果 |

|---|---|

| 按 UTF-8 解码全部 Markdown | 无解码错误，无替换字符 |

| 对比本文档顺序与 `kCoreChainOrder` | 84 个节点完全一致 |

| 统一通信链路 contract | `75-communication-chain.md` 已进入 `kCoreChainOrder`，接收前段和发送后段均为 core chain |

| `xmake build test-l3-unified-entry` | 构建通过 |
