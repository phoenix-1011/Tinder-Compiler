# Ordered Execution



## 结论



统一入口的 core chain 顺序必须逐项匹配 `kCoreChainOrder`。配置中缺少、重排或多出 builtin core chain 都必须在 `Prepared()` 阶段失败。



## 调度项类型



| Kind | 位置 | 说明 |

|---|---|---|

| `builtin_domain_node` | core chain 前 | 执行 Environment、Platform、Signal 三个域运行时节点。 |

| `custom_invocation_node` | core chain 前或后 | 由 runtime config 显式声明和排序。 |

| `builtin_core_chain` | core chain 边界后 | 本文档列出的 49 个 canonical 节点。 |



## Canonical Core Chain Order



| # | 展示名 | Node | Group | Upstream | Downstream |
|---:|---|---|---|---|---|
| 1 | 实体维护 | `platform.entity.update` | platform | core chain 边界 | `platform.outlook.update` |
| 2 | 外观维护 | `platform.outlook.update` | platform | `platform.entity.update` | `platform.environment.update` |
| 3 | 环境维护 | `platform.environment.update` | platform | `platform.outlook.update` | `device.control.intake` |
| 4 | 控制传入 | `device.control.intake` | control | `platform.environment.update` | `device.control.maintain` |
| 5 | 控制维护 | `device.control.maintain` | control | `device.control.intake` | `device.control.resolve` |
| 6 | 控制解析 | `device.control.resolve` | control | `device.control.maintain` | `platform.navigation.command.maintain` |
| 7 | 指令维护 | `platform.navigation.command.maintain` | navigation | `device.control.resolve` | `platform.navigation.command.resolve` |
| 8 | 指令解析 | `platform.navigation.command.resolve` | navigation | `platform.navigation.command.maintain` | `device.mobile_navigation.execute` |
| 9 | 机动执行 | `device.mobile_navigation.execute` | navigation | `platform.navigation.command.resolve` | `navigation.perception_correction.update` |
| 10 | 导航修正 | `navigation.perception_correction.update` | navigation | `device.mobile_navigation.execute` | `platform.coordinate.commit` |
| 11 | 坐标提交 | `platform.coordinate.commit` | navigation | `navigation.perception_correction.update` | `platform.cooperation.message_sync` |
| 12 | 协同同步 | `platform.cooperation.message_sync` | cooperation | `platform.coordinate.commit` | `platform.cooperation.leader_update` |
| 13 | 长机更新 | `platform.cooperation.leader_update` | cooperation | `platform.cooperation.message_sync` | `platform.cooperation.member_update` |
| 14 | 成员更新 | `platform.cooperation.member_update` | cooperation | `platform.cooperation.leader_update` | `platform.cooperation.communication_record` |
| 15 | 协同通信 | `platform.cooperation.communication_record` | cooperation | `platform.cooperation.member_update` | `platform.decoy_inventory.update` |
| 16 | 诱饵库存 | `platform.decoy_inventory.update` | inventory | `platform.cooperation.communication_record` | `platform.bullet_inventory.update` |
| 17 | 炮弹库存 | `platform.bullet_inventory.update` | inventory | `platform.decoy_inventory.update` | `platform.missile_inventory.update` |
| 18 | 导弹库存 | `platform.missile_inventory.update` | inventory | `platform.bullet_inventory.update` | `platform.ammunitor_inventory.update` |
| 19 | 弹药库存 | `platform.ammunitor_inventory.update` | inventory | `platform.missile_inventory.update` | `platform.carriee_inventory.update` |
| 20 | 搭载库存 | `platform.carriee_inventory.update` | inventory | `platform.ammunitor_inventory.update` | `platform.supervise_carriee.update` |
| 21 | 搭载监督 | `platform.supervise_carriee.update` | supervision | `platform.carriee_inventory.update` | `platform.supervise_missile.update` |
| 22 | 导弹监督 | `platform.supervise_missile.update` | supervision | `platform.supervise_carriee.update` | `platform.supervise_canonball.update` |
| 23 | 炮弹监督 | `platform.supervise_canonball.update` | supervision | `platform.supervise_missile.update` | `platform.tracking_request.maintain` |
| 24 | 跟踪请求 | `platform.tracking_request.maintain` | tracking | `platform.supervise_canonball.update` | `platform.tracking_target_key.maintain` |
| 25 | 目标键维护 | `platform.tracking_target_key.maintain` | tracking | `platform.tracking_request.maintain` | `platform.tracking_device.resolve` |
| 26 | 跟踪设备 | `platform.tracking_device.resolve` | tracking | `platform.tracking_target_key.maintain` | `platform.tracking_fact.resolve` |
| 27 | 跟踪事实 | `platform.tracking_fact.resolve` | tracking | `platform.tracking_device.resolve` | `platform.supervise_tracking.update` |
| 28 | 跟踪监督 | `platform.supervise_tracking.update` | tracking | `platform.tracking_fact.resolve` | `platform.homeport.update` |
| 29 | 归港维护 | `platform.homeport.update` | supervision | `platform.supervise_tracking.update` | `platform.supervise_tunnel.update` |
| 30 | 通道监督 | `platform.supervise_tunnel.update` | supervision | `platform.homeport.update` | `platform.status.update` |
| 31 | 状态汇总 | `platform.status.update` | platform | `platform.supervise_tunnel.update` | `device.status.update` |
| 32 | 设备状态 | `device.status.update` | device | `platform.status.update` | `device.spatial_state.update` |
| 33 | 设备空间 | `device.spatial_state.update` | device | `device.status.update` | `device.performance.update` |
| 34 | 设备性能 | `device.performance.update` | device | `device.spatial_state.update` | `signal.static_generation.update` |
| 35 | 静态信号 | `signal.static_generation.update` | signal-environment | `device.performance.update` | `environment.signal.lifecycle.manage` |
| 36 | 信号生命周期 | `environment.signal.lifecycle.manage` | signal-environment | `signal.static_generation.update` | `environment.signal.generate` |
| 37 | 环境生成 | `environment.signal.generate` | signal-environment | `environment.signal.lifecycle.manage` | `environment.signal.echo_generate` |
| 38 | 回波生成 | `environment.signal.echo_generate` | signal-environment | `environment.signal.generate` | `environment.signal.transform` |
| 39 | 传播转换 | `environment.signal.transform` | signal-environment | `environment.signal.echo_generate` | `sense.signal.intake` |
| 40 | 信号传入 | `sense.signal.intake` | sense | `environment.signal.transform` | `sense.signal.preprocess` |
| 41 | 信号预处理 | `sense.signal.preprocess` | sense | `sense.signal.intake` | `sense.detection.from_signal` |
| 42 | 信号成检 | `sense.detection.from_signal` | sense | `sense.signal.preprocess` | `sense.detection.artifact.update` |
| 43 | 假警维护 | `sense.detection.artifact.update` | sense | `sense.detection.from_signal` | `sense.detection.update` |
| 44 | 探测更新 | `sense.detection.update` | sense | `sense.detection.artifact.update` | `sense.observation.from_detection` |
| 45 | 探测成观 | `sense.observation.from_detection` | sense | `sense.detection.update` | `sense.observation.update` |
| 46 | 观测更新 | `sense.observation.update` | sense | `sense.observation.from_detection` | `sense.track.update` |
| 47 | 航迹更新 | `sense.track.update` | sense | `sense.observation.update` | `sense.awareness.update` |
| 48 | 态势融合 | `sense.awareness.update` | sense | `sense.track.update` | `sense.awareness.maintain` |
| 49 | 态势维护 | `sense.awareness.maintain` | sense | `sense.awareness.update` | core chain 结束 |

## 运行时契约



- @pre: `Prepared()` 已成功，ordered plan 已完成 canonical 顺序校验。

- @post: 每个 builtin core chain 按表中顺序最多执行一次。

- @invariant: core chain 边界后不得出现 builtin domain node。

- @failure: 任一节点返回 false 或前序依赖未满足时，本 tick 失败并写入 `last_lifecycle_error_`。
