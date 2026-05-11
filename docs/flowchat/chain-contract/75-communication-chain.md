# 统一通信链路

## 结论

通信链路分为接收前段和发送后段，两段都属于 core chain 目标 contract。`ReceiveMessage` MUST 在流程靠前位置被通信设备/通信计算节点解析成业务可消费输入；`ControlInform` MUST 作为发送请求在流程靠后位置统一发送。没有通信设备或通信计算资源时，接收和发送都 no-op，不伪造成功、不直接绕过通信链路。

本文档已同步到代码。当前 core chain 包含 6 个通信节点，并新增 `device.control.inform.resolve` 作为 `ControlInform` 的发送请求投影节点。

## Core Chain 位置

接收前段位置：`platform.environment.update` 之后、`device.control.intake` 之前。

发送后段位置：`sense.awareness.maintain` 之后、core chain 结束之前。

| 段 | 展示名 | Canonical node id | 输入 | 输出 |
|---|---|---|---|---|
| 接收前段 | 组网维护 | `communication.network.update` | 平台坐标、设备状态、通信配置、旧版连通性规则 | `shared.communication.network_state` |
| 接收前段 | 接收传入 | `communication.receive.intake` | `ReceiveMessage` 原始输入 | `transient.communication.receive.raw.*`、内存 receive bucket |
| 接收前段 | 接收解析 | `communication.receive.resolve` | receive bucket、通信设备状态、`shared.communication.network_state` | `transient.communication.received.*` |
| 发送后段 | 通信汇集 | `communication.request.collect` | `transient.communication.request.*`、outbox 候选 | `shared.communication.request_set`、内存 request set |
| 发送后段 | 发送解析 | `communication.send.resolve` | request set、通信设备状态、`shared.communication.network_state` | `shared.communication.send_resolution`、内存 send set |
| 发送后段 | 通信发送 | `communication.dispatch.update` | send set、`ICommunicationDispatchExecutor` | `shared.communication.dispatch.*` |

## 统一原则

- 来源节点 MUST 只产出通信输入或请求，不直接发送消息。
- `ReceiveMessage` MUST 进入 `communication.receive.intake`，再由 `communication.receive.resolve` 解析成业务候选。
- `ControlInform` MUST 输出 `transient.communication.request.inform.*`，不得直接发布 `event.receive_message_variant`。
- 协同链路、awareness 跨平台同步、平台/设备业务消息 MUST 使用同一套 request 字段。
- 组网信息由统一入口维护，owner 是 `communication.network.update`。
- 无通信设备或通信计算资源时，接收前段和发送后段均 no-op。

## 接收输出

`communication.receive.resolve` 不直接写最终业务 shared row，而是输出业务输入候选：

| Contract | Consumer |
|---|---|
| `transient.communication.received.awareness.*` | `sense.awareness.update` / `sense.awareness.maintain` |
| `transient.communication.received.cooperation.*` | `platform.cooperation.message_sync` |
| `transient.communication.received.homeport.*` | `platform.homeport.update` |
| `transient.communication.received.tracking.*` | `platform.tracking_request.maintain` / tracking 链路 |

接收前段在 core chain 靠前执行，因此这些候选可以被同 tick 后续业务节点消费。

## 发送来源

| 来源 | Producer | 统一 contract | 说明 |
|---|---|---|---|
| `ControlInform` | `device.control.inform.resolve` | `transient.communication.request.inform.*` | 本平台向其他平台发送消息 |
| 协同同步 | `platform.cooperation.communication_record` | `transient.communication.request.cooperation.*` | 协同消息发送请求 |
| awareness 跨平台同步 | `sense.awareness.maintain` | `transient.communication.request.awareness.*` | 态势同步发送请求 |
| homeport / tracking / 其他业务消息 | 对应业务 owner | `transient.communication.request.<source>.*` | 后续扩展必须复用统一格式 |

## Request Contract

每条 `transient.communication.request.*` 和 `shared.communication.request_set` entry MUST 包含以下字段：

| 字段 | 是否必需 | 说明 |
|---|---|---|
| `request_id` | 是 | 当前 tick 内唯一请求 id |
| `source_chain` | 是 | 产生通信需求的 canonical node id |
| `source_platform_id` | 是 | 发送平台 id |
| `source_device_id` | 否 | 指定发送设备；为空时由 `communication.send.resolve` 选择 |
| `target_force_ids` | 否 | 目标 force 集合，CSV 或结构化数组 |
| `target_platform_ids` | 否 | 目标平台集合，CSV 或结构化数组 |
| `message_kind` | 是 | `inform`、`cooperation_sync`、`awareness_sync`、`business_event` 等 |
| `message_id` | 是 | 消息幂等和追踪 id |
| `payload` | 是 | 消息载荷摘要或序列化内容 |
| `priority` | 否 | 默认普通优先级 |
| `preferred_transport` | 否 | `network_model`、`sdk_post_message`、`custom_l4`、`deferred` |
| `ttl_tick` | 否 | 请求在通信链路中的有效 tick 数 |
| `created_step_id` | 是 | 请求创建 tick |

## Receive Contract

每条 `transient.communication.receive.raw.*` MUST 表示一个接收侧原始消息：

| 字段 | 是否必需 | 说明 |
|---|---|---|
| `receive_id` | 是 | 当前 tick 内唯一接收 id |
| `source_platform_id` | 否 | 来源平台，未知时为空 |
| `source_device_id` | 否 | 来源通信设备，未知时为空 |
| `target_platform_id` | 否 | 接收平台 |
| `target_device_id` | 否 | 接收通信设备 |
| `message_kind` | 是 | 与 request contract 对齐 |
| `message_id` | 是 | 消息幂等和追踪 id |
| `payload` | 是 | 原始消息载荷 |
| `received_step_id` | 是 | 接收 tick |
| `transport` | 否 | 实际接收通道 |

## Network State

`communication.network.update` 由统一入口维护 `shared.communication.network_state`。

- 每 tick 更新一次。
- 输入包括平台坐标、设备状态、通信设备性能、外部网络配置和旧版连通性规则。
- 没有网络计算资源时输出 `status=unknown` 或空 network，不阻断 tick。
- `communication.receive.resolve` 和 `communication.send.resolve` 如果看到 unknown network 且没有通信计算能力，必须 no-op。

## Fallback

| 节点 | fallback |
|---|---|
| `communication.network.update` | fixed fallback：统一入口维护空或 unknown network state |
| `communication.receive.intake` | no-op：无通信设备或计算资源时不处理 ReceiveMessage |
| `communication.receive.resolve` | no-op：无通信设备或计算资源时不产出业务候选 |
| `communication.request.collect` | fixed fallback：只汇集格式正确的发送请求；格式错误请求丢弃并审计 |
| `communication.send.resolve` | no-op：无通信设备或计算资源时不产出 send set |
| `communication.dispatch.update` | no-op：无通信设备或计算资源时不发送、不写成功 receipt |

## 输出 Owner

| Row | Owner |
|---|---|
| `shared.communication.network_state` | `communication.network.update` |
| `shared.communication.request_set` | `communication.request.collect` |
| `shared.communication.send_resolution` | `communication.send.resolve` |
| `shared.communication.dispatch.*` | `communication.dispatch.update` |

## 验证

| 检查项 | 期望结果 |
|---|---|
| `ReceiveMessage` 文档路由 | 先进入接收前段，再输出业务候选 |
| `ControlInform` 文档路由 | 作为发送请求进入后段通信链路 |
| 无通信设备 / 计算资源 | 接收和发送均 no-op |
| 组网 owner | `communication.network.update` |


