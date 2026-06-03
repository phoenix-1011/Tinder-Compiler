import type {
  ComputeResourceV2,
  ProfileComputeObjectBinding,
  ProfilePlatformModelTarget,
  ProfileResourceRef
} from "@tinder/nextstep";
import {
  branchKey,
  branchToComputeResourceV2,
  platformObjectKey,
  profileComputeBindingId,
  profileResourceBranchId
} from "@tinder/nextstep";
import {
  collectProfileV2Resources,
  type DiskState,
  type ProfileEntry
} from "./chainAssemblyStorage";
import { buildRuntimeConfig, type RuntimeConfigV2 } from "./runtimeReport";

export interface ProfilePlatformExportContext {
  profile: ProfileEntry;
  disk: DiskState | null;
}

export interface PlatformTargetValidationContext {
  activeBindingKeys: Set<string>;
  activeRefsByBindingKey: Map<string, ProfileResourceRef>;
  disk: DiskState | null;
}

export function bindingKeyForRef(ref: ProfileResourceRef): string {
  return profileComputeBindingId(
    ref.kind,
    ref.resource_instance_id,
    profileResourceBranchId(ref)
  );
}

export function bindingKeyForBinding(binding: ProfileComputeObjectBinding): string {
  return profileComputeBindingId(
    binding.resource_kind,
    binding.resource_instance_id,
    binding.selected_branch_id
  );
}

export function targetLabel(target: ProfilePlatformModelTarget): string {
  const key = platformObjectKey(target.platform_model_id, target.platform_version);
  const name = target.display_name?.trim();
  if (name && key) return `${name}（${key}）`;
  return key || name || target.target_id;
}

export function isSafeObjectSegment(value: string): boolean {
  const text = value.trim();
  return (
    text.length > 0 &&
    text !== "." &&
    text !== ".." &&
    /^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(text)
  );
}

export function validatePlatformTarget(
  target: ProfilePlatformModelTarget,
  context: PlatformTargetValidationContext
): string[] {
  const issues: string[] = [];
  if (!target.platform_model_id.trim()) {
    issues.push("缺少关联型号编号");
  } else if (!isSafeObjectSegment(target.platform_model_id)) {
    issues.push("关联型号编号只能包含字母、数字、点或短横线，且不能是路径片段");
  }
  if (!target.platform_version.trim()) {
    issues.push("缺少关联型号版本");
  } else if (!isSafeObjectSegment(target.platform_version)) {
    issues.push("关联型号版本只能包含字母、数字、点或短横线，且不能是路径片段");
  }

  const bindings = new Map(
    target.compute_object_bindings.map((binding) => [
      bindingKeyForBinding(binding),
      binding
    ])
  );
  for (const key of context.activeBindingKeys) {
    if (!bindings.has(key)) issues.push(`活跃资源缺少计算资源对象映射：${key}`);
  }
  for (const binding of target.compute_object_bindings) {
    const key = bindingKeyForBinding(binding);
    if (!context.activeBindingKeys.has(key)) {
      issues.push(`映射指向非活跃资源分支：${key}`);
    }
    if (!binding.compute_object_id.trim()) {
      issues.push(`${key} 缺少计算资源对象编号`);
    } else if (!isSafeObjectSegment(binding.compute_object_id)) {
      issues.push(`${key} 的计算资源对象编号包含非法字符或下划线`);
    }
    if (!binding.compute_object_version.trim()) {
      issues.push(`${key} 缺少计算资源对象版本`);
    } else if (!isSafeObjectSegment(binding.compute_object_version)) {
      issues.push(`${key} 的计算资源对象版本包含非法字符或下划线`);
    }

    const resource = resolveBindingResource(binding, context.disk, {
      activeRef: context.activeRefsByBindingKey.get(key)
    });
    if (!resource) {
      issues.push(`${key} 未找到计算资源分支`);
      continue;
    }
    const artifact = resource.implementation.runtime_artifact;
    if (artifact.required_for_export && !artifact.path.trim()) {
      issues.push(`${key} 缺少 runtime artifact`);
    }
    if (resource.resource_kind === "standard") {
      const count = Object.values(
        resource.model_variants[0]?.effective_candidates ?? {}
      ).filter((candidateId) => candidateId.trim()).length;
      if (count === 0) issues.push(`${key} 未选择有效标准候选`);
    } else {
      for (const node of resource.custom_nodes) {
        if (typeof node.action_index !== "number") {
          issues.push(`${key}/${node.node_id} 缺少 action_index`);
        }
      }
    }
  }
  return issues;
}

export function buildPlatformRuntimeConfig(
  target: ProfilePlatformModelTarget,
  context: ProfilePlatformExportContext
): RuntimeConfigV2 {
  return buildRuntimeConfig(
    context.profile.project,
    context.disk ? collectProfileV2Resources(context.disk, context.profile.project) : [],
    target
  );
}

function resolveBindingResource(
  binding: ProfileComputeObjectBinding,
  disk: DiskState | null,
  options: { activeRef?: ProfileResourceRef } = {}
): ComputeResourceV2 | null {
  const family = disk?.resourceIndex.familyByKey.get(
    `${binding.resource_kind}:${binding.resource_instance_id}`
  );
  const branch = disk?.resourceIndex.branchByKey.get(
    branchKey(
      binding.resource_kind,
      binding.resource_instance_id,
      binding.selected_branch_id
    )
  );
  if (!family || !branch) return null;
  return branchToComputeResourceV2(family.family, branch.branch, {
    effectiveCandidateOverrides:
      options.activeRef?.kind === "standard"
        ? options.activeRef.overrides?.effective_candidates
        : undefined
  });
}
