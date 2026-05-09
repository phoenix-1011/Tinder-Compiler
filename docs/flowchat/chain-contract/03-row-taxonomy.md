# Row Taxonomy



## 结论



流程链路使用四类 contract：`shared.*` 权威行、`runtime.*` 当前步运行时行、`transient.*` 当前步输入行、以及 in-memory contract。文档和代码必须显式区分四类 contract 的可见性和生命周期。



## Contract 类型



| 类型 | 生命周期 | 可见性 | 用途 |

|---|---|---|---|

| `shared.*` | 跨 tick 保留 | 提交后可被下游和下一 tick 读取 | 权威状态、可同步状态、最终业务结果 |

| `runtime.*` | 当前 tick | 当前步下游可读，默认不跨 tick 保留 | 同一步链路传递、调试观测、流程监管 |

| `transient.*` | 当前 tick | 仅统一入口当前处理周期可读 | L2/L4/domain node 输入、控制指令、外部事件 staging |

| in-memory contract | 当前函数链 | 只在 producer 到 immediate consumer 之间传递 | 中间集合、工作集、候选集、修正结果 |



## 主要 `shared.*` owner



| Row | Owner node | Notes |

|---|---|---|

| `shared.platform.entity` | `platform.entity.update` | 平台实体基础资料 |

| `shared.platform.status` | `platform.status.update` | 平台状态汇总 |

| `shared.platform.outlook` | `platform.outlook.update` | 平台外观或朝向 |

| `shared.platform.environment` | `platform.environment.update` | 平台环境上下文 |

| `shared.platform.navigation_command` | `platform.navigation.command.maintain` | 导航链路 命令生命周期 |

| `shared.navigation.error` | `navigation.perception_correction.update` | 导航误差或修正状态 |

| `shared.platform.coordinate` | `platform.coordinate.commit` | 平台真值和可见坐标 |

| `shared.platform.cooperation` | `platform.cooperation.member_update` | 协同成员状态 |

| `shared.communication.outbox.p06` | `platform.cooperation.communication_record` | 协同通信待发送消息 |

| `shared.platform.decoy` | `platform.decoy_inventory.update` | 诱饵库存 |

| `shared.platform.bullet` | `platform.bullet_inventory.update` | 炮弹库存 |

| `shared.platform.missile` | `platform.missile_inventory.update` | 导弹库存 |

| `shared.platform.ammunitor` | `platform.ammunitor_inventory.update` | 弹药补给库存 |

| `shared.platform.carriee` | `platform.carriee_inventory.update` | 搭载对象库存 |

| `shared.platform.superviseCarriee` | `platform.supervise_carriee.update` | 搭载监督状态 |

| `shared.platform.superviseMissile` | `platform.supervise_missile.update` | 导弹监督状态 |

| `shared.platform.superviseCanonball` | `platform.supervise_canonball.update` | 炮弹监督状态 |

| `shared.platform.superviseTunnel` | `platform.supervise_tunnel.update` | 通道监督状态 |

| `shared.platform.homeport` | `platform.homeport.update` | 归港或母港状态 |

| `shared.platform.tracking_request_scope` | `platform.tracking_request.maintain` | 跟踪请求范围 |

| `shared.platform.tracking_target_key_set` | `platform.tracking_target_key.maintain` | 跟踪目标 key 集 |

| `shared.platform.superviseTracking` | `platform.supervise_tracking.update` | 平台跟踪监督状态 |

| `shared.device.status` | `device.performance.update` | 与性能在 device commit barrier 联合提交 |

| `shared.device.performance` | `device.performance.update` | 设备性能权威状态 |

| `shared.signal.records` | `signal.static_generation.update` | 静态信号权威池 |

| `shared.sense.signal` | `sense.signal.preprocess` | 接收侧信号结果 |

| `shared.sense.signal_interest` | `sense.signal.preprocess` | 兴趣或附属信号结果 |

| `shared.sense.detection` | `sense.detection.update` | 设备级 detection |

| `shared.sense.observation` | `sense.observation.update` | 对象级 observation |

| `shared.sense.track` | `sense.track.update` | 航迹状态 |

| `shared.sense.awareness` | `sense.awareness.maintain` | 最终态势 |



## Runtime 和 in-memory contract



| Contract | Producer | Consumer | Lifetime |

|---|---|---|---|

| `runtime.environment.signal.propagated_local_candidates` | `environment.signal.transform` | `sense.signal.intake`、post-commit custom nodes | 当前 tick |

| `device_received_signal_bucket` | `sense.signal.intake` | `sense.signal.preprocess` | 当前函数链 |

| `preprocessed_signal_observation_set` | `sense.signal.preprocess` | `sense.detection.from_signal` | 当前函数链 |

| `signal_detection_set` | `sense.detection.from_signal` | `sense.detection.artifact.update`、`sense.detection.update` | 当前函数链 |

| `artifact_detection_set` | `sense.detection.artifact.update` | `sense.detection.update` | 当前函数链 |

| `postprocessed_detection_set` | `sense.detection.update` | `sense.observation.from_detection` | 当前函数链 |

| `observation_candidate_set` | `sense.observation.from_detection` | `sense.observation.update`、`sense.track.update`、`sense.awareness.update` | 当前函数链 |

| `awareness_working_set` | `sense.awareness.update` | `sense.awareness.maintain` | 当前函数链 |

## 控制指令 transient contract

| Contract | Producer | Consumer | Lifetime |
|---|---|---|---|
| `transient.device.control.intake.*` | `DeviceControl` 统一入口 | `device.control.intake` | 当前 tick |
| `transient.device.control.maintain.*` | `DeviceControl` 统一入口 | `device.control.maintain` | 当前 tick |
| `transient.device.control.resolved.*` | `DeviceControl` 统一入口 | `device.control.resolve` 与下游业务节点 | 当前 tick |
| 业务投影 transient rows | `device.control.resolve` 兼容投影 | 导航、设备、信号、库存、监督、通信链路 | 当前 tick |

控制指令统一链路的 transient rows MUST 记录 `family`、`action`、`target_chain` 和投影状态。当前代码保留业务投影 rows 作为下游消费入口，避免一次性迁移导致行为漂移。
