import type { IndustryAcquisitionTask } from "./industry-acquisition-task";
import type { IndustryPlanSourceRole } from "./industry-planner";

export const industryAcquisitionRouteSchemaVersion =
  "industry_acquisition_route.v1" as const;

export type IndustryAcquisitionTargetKind =
  | "public_page"
  | "public_search"
  | "sitemap"
  | "rss"
  | "complex_public_page"
  | "authorized_import"
  | "manual_input";

export type IndustryAcquisitionAdapter =
  | "native_public_fetch"
  | "public_search_discovery"
  | "public_feed_discovery"
  | "complex_public_extractor"
  | "authorized_file_import"
  | "manual_input"
  | "blocked";

export type IndustryAcquisitionRouteInput = {
  task: IndustryAcquisitionTask;
  sourceRole: IndustryPlanSourceRole;
  targetKind: IndustryAcquisitionTargetKind;
  targetReference: string;
  access: {
    requiresLogin: boolean;
    requiresCookie: boolean;
    requiresCaptcha: boolean;
    isPaywalled: boolean;
    containsPrivateData: boolean;
  };
  userAuthorizationConfirmed?: boolean;
};

export type IndustryAcquisitionRoute = {
  schemaVersion: typeof industryAcquisitionRouteSchemaVersion;
  artifactType: "industry-acquisition-route";
  routeId: string;
  taskId: string;
  sourceRole: IndustryPlanSourceRole;
  targetKind: IndustryAcquisitionTargetKind;
  targetReference: string;
  adapter: IndustryAcquisitionAdapter;
  status: "planned" | "blocked";
  permissionRequirement: "live_budget" | "user_authorization" | null;
  evidenceDisposition:
    | "candidate_only"
    | "raw_document_pending_validation"
    | "user_input_pending_validation"
    | "blocked";
  guards: string[];
  blockingReasons: string[];
  assertions: {
    routePlanOnly: true;
    liveRequestExecuted: false;
    credentialRead: false;
    candidateIsNotEvidence: true;
    externalFactsProduced: false;
  };
};

const liveTargetKinds = new Set<IndustryAcquisitionTargetKind>([
  "public_page",
  "public_search",
  "sitemap",
  "rss",
  "complex_public_page",
]);

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [first = -1, second = -1] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function stableReferenceHash(value: string) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export function isSafeIndustryPublicUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password &&
      hostname !== "localhost" &&
      !hostname.endsWith(".local") &&
      !isPrivateIpv4(hostname) &&
      !isPrivateIpv6(hostname)
    );
  } catch {
    return false;
  }
}

function adapterFor(
  targetKind: IndustryAcquisitionTargetKind,
): IndustryAcquisitionAdapter {
  switch (targetKind) {
    case "public_page":
      return "native_public_fetch";
    case "public_search":
      return "public_search_discovery";
    case "sitemap":
    case "rss":
      return "public_feed_discovery";
    case "complex_public_page":
      return "complex_public_extractor";
    case "authorized_import":
      return "authorized_file_import";
    case "manual_input":
      return "manual_input";
  }
}

function evidenceDispositionFor(
  targetKind: IndustryAcquisitionTargetKind,
): IndustryAcquisitionRoute["evidenceDisposition"] {
  if (
    targetKind === "public_search" ||
    targetKind === "sitemap" ||
    targetKind === "rss"
  ) {
    return "candidate_only";
  }
  if (targetKind === "authorized_import" || targetKind === "manual_input") {
    return "user_input_pending_validation";
  }
  return "raw_document_pending_validation";
}

function permissionFor(
  targetKind: IndustryAcquisitionTargetKind,
): IndustryAcquisitionRoute["permissionRequirement"] {
  if (liveTargetKinds.has(targetKind)) return "live_budget";
  if (targetKind === "authorized_import") return "user_authorization";
  return null;
}

export function assertIndustryAcquisitionRoute(
  route: IndustryAcquisitionRoute,
) {
  if (route.schemaVersion !== industryAcquisitionRouteSchemaVersion) {
    throw new Error("acquisition_route_schema_version_invalid");
  }
  if (route.artifactType !== "industry-acquisition-route") {
    throw new Error("acquisition_route_artifact_type_invalid");
  }
  if (
    !route.routeId ||
    !route.taskId ||
    !route.sourceRole ||
    !route.targetReference.trim()
  ) {
    throw new Error("acquisition_route_identity_required");
  }
  if (route.status === "blocked") {
    if (
      route.adapter !== "blocked" ||
      route.evidenceDisposition !== "blocked" ||
      route.blockingReasons.length === 0
    ) {
      throw new Error("blocked_acquisition_route_invalid");
    }
  } else if (
    route.adapter === "blocked" ||
    route.evidenceDisposition === "blocked" ||
    route.blockingReasons.length > 0
  ) {
    throw new Error("planned_acquisition_route_invalid");
  }
  if (
    route.status === "planned" &&
    liveTargetKinds.has(route.targetKind) &&
    route.permissionRequirement !== "live_budget"
  ) {
    throw new Error("live_acquisition_route_permission_invalid");
  }
  if (
    route.status === "planned" &&
    route.targetKind === "authorized_import" &&
    route.permissionRequirement !== "user_authorization"
  ) {
    throw new Error("authorized_import_route_permission_invalid");
  }
  if (
    !route.assertions.routePlanOnly ||
    route.assertions.liveRequestExecuted ||
    route.assertions.credentialRead ||
    !route.assertions.candidateIsNotEvidence ||
    route.assertions.externalFactsProduced
  ) {
    throw new Error("acquisition_route_assertions_invalid");
  }
  return route;
}

export function createIndustryAcquisitionRoute(
  input: IndustryAcquisitionRouteInput,
): IndustryAcquisitionRoute {
  const blockingReasons: string[] = [];
  const { access, targetKind, targetReference, task } = input;

  if (!targetReference.trim()) blockingReasons.push("target_reference_missing");
  if (access.requiresLogin) blockingReasons.push("login_required");
  if (access.requiresCookie) blockingReasons.push("cookie_required");
  if (access.requiresCaptcha) blockingReasons.push("captcha_required");
  if (access.isPaywalled) blockingReasons.push("paywall_detected");
  if (access.containsPrivateData) blockingReasons.push("private_data_detected");
  if (
    targetKind !== "public_search" &&
    targetKind !== "authorized_import" &&
    targetKind !== "manual_input" &&
    !isSafeIndustryPublicUrl(targetReference)
  ) {
    blockingReasons.push("unsafe_or_non_public_url");
  }
  if (targetKind === "authorized_import" && !input.userAuthorizationConfirmed) {
    blockingReasons.push("user_authorization_missing");
  }
  if (
    !task.compliance.noLogin ||
    !task.compliance.noCookieImport ||
    !task.compliance.noPaywallBypass ||
    !task.compliance.noCaptchaBypass ||
    !task.compliance.noPrivateData
  ) {
    blockingReasons.push("task_compliance_boundary_invalid");
  }
  if (!task.allowedSourceRoles.includes(input.sourceRole)) {
    blockingReasons.push("source_role_not_allowed_for_task");
  }

  const blocked = blockingReasons.length > 0;
  const route: IndustryAcquisitionRoute = {
    schemaVersion: industryAcquisitionRouteSchemaVersion,
    artifactType: "industry-acquisition-route",
    routeId: `route:${task.taskId}:${targetKind}:${stableReferenceHash(targetReference)}`,
    taskId: task.taskId,
    sourceRole: input.sourceRole,
    targetKind,
    targetReference,
    adapter: blocked ? "blocked" : adapterFor(targetKind),
    status: blocked ? "blocked" : "planned",
    permissionRequirement: permissionFor(targetKind),
    evidenceDisposition: blocked
      ? "blocked"
      : evidenceDispositionFor(targetKind),
    guards: [
      "robots_and_terms_respected",
      "no_login_cookie_captcha_or_paywall_bypass",
      "no_private_data",
      "source_and_claim_role_validation_required",
      "candidate_is_not_evidence",
    ],
    blockingReasons: [...new Set(blockingReasons)],
    assertions: {
      routePlanOnly: true,
      liveRequestExecuted: false,
      credentialRead: false,
      candidateIsNotEvidence: true,
      externalFactsProduced: false,
    },
  };
  return assertIndustryAcquisitionRoute(route);
}

export function serializeIndustryAcquisitionRoute(
  route: IndustryAcquisitionRoute,
) {
  assertIndustryAcquisitionRoute(route);
  return `${JSON.stringify(route, null, 2)}\n`;
}
