import {
  type IndustryAcquisitionRoute,
  isSafeIndustryPublicUrl,
} from "./industry-acquisition-router";
import type { IndustryPlanSourceRole } from "./industry-planner";

export const industryRawDocumentStoreSchemaVersion =
  "industry_raw_document_store.v1" as const;
export const industryImmutableRawDocumentSchemaVersion =
  "industry_immutable_raw_document.v1" as const;

export type IndustryImmutableRawDocument = {
  schemaVersion: typeof industryImmutableRawDocumentSchemaVersion;
  artifactType: "industry-immutable-raw-document";
  documentId: string;
  taskId: string;
  routeId: string;
  sourceRole: IndustryPlanSourceRole;
  originalUrl: string;
  canonicalUrl: string;
  capturedAt: string;
  mediaType: string;
  httpStatus: number;
  originalContent: string;
  contentHash: `sha256:${string}`;
  byteLength: number;
  supersedesDocumentId: string | null;
  collectionMethod: "offline_fixture" | "live_public";
  assertions: {
    immutableSnapshot: true;
    rawDocumentIsNotEvidence: true;
    externalFactProduced: false;
    credentialsStored: false;
    privateDataStored: false;
  };
};

export type IndustryRawDocumentAuditEvent = {
  eventId: string;
  action: "stored_new_document" | "stored_new_version";
  documentId: string;
  taskId: string;
  routeId: string;
  canonicalUrl: string;
  contentHash: `sha256:${string}`;
  at: string;
  publicRequestsUsed: number;
  providerRequestsUsed: number;
  creditsUsed: number;
  costYuan: number;
};

export type IndustryRawDocumentStore = {
  schemaVersion: typeof industryRawDocumentStoreSchemaVersion;
  artifactType: "industry-raw-document-store";
  storeId: string;
  documents: IndustryImmutableRawDocument[];
  auditEvents: IndustryRawDocumentAuditEvent[];
  summary: {
    documentCount: number;
    canonicalUrlCount: number;
    versionedDocumentCount: number;
    publicRequestsUsed: number;
    providerRequestsUsed: number;
    creditsUsed: number;
    costYuan: number;
  };
  assertions: {
    documentsAreImmutable: true;
    deduplicationUsesCanonicalUrlAndContentHash: true;
    oldVersionsAreRetained: true;
    rawDocumentsAreNotEvidence: true;
  };
};

export type IndustryRawDocumentInput = {
  route: IndustryAcquisitionRoute;
  originalUrl: string;
  capturedAt: string;
  mediaType: string;
  httpStatus: number;
  originalContent: string;
  collectionMethod: IndustryImmutableRawDocument["collectionMethod"];
  usage: {
    publicRequestsUsed: number;
    providerRequestsUsed: number;
    creditsUsed: number;
    costYuan: number;
  };
};

export type IndustryRawDocumentPutResult = {
  store: IndustryRawDocumentStore;
  outcome: "stored_new_document" | "stored_new_version" | "deduplicated";
  documentId: string;
};

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256IndustryContent(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${bytesToHex(new Uint8Array(digest))}` as const;
}

export function canonicalizeIndustryRawDocumentUrl(value: string) {
  try {
    if (!isSafeIndustryPublicUrl(value)) return null;
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function validIsoTimestamp(value: string) {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function usageValues(usage: IndustryRawDocumentInput["usage"]) {
  return [
    usage.publicRequestsUsed,
    usage.providerRequestsUsed,
    usage.creditsUsed,
    usage.costYuan,
  ];
}

function calculateSummary(
  documents: IndustryImmutableRawDocument[],
  auditEvents: IndustryRawDocumentAuditEvent[],
): IndustryRawDocumentStore["summary"] {
  return {
    documentCount: documents.length,
    canonicalUrlCount: new Set(
      documents.map((document) => document.canonicalUrl),
    ).size,
    versionedDocumentCount: documents.filter(
      (document) => document.supersedesDocumentId !== null,
    ).length,
    publicRequestsUsed: auditEvents.reduce(
      (total, event) => total + event.publicRequestsUsed,
      0,
    ),
    providerRequestsUsed: auditEvents.reduce(
      (total, event) => total + event.providerRequestsUsed,
      0,
    ),
    creditsUsed: auditEvents.reduce(
      (total, event) => total + event.creditsUsed,
      0,
    ),
    costYuan: auditEvents.reduce((total, event) => total + event.costYuan, 0),
  };
}

export function createIndustryRawDocumentStore(
  storeId: string,
): IndustryRawDocumentStore {
  if (!storeId.trim()) throw new Error("raw_document_store_id_required");
  return {
    schemaVersion: industryRawDocumentStoreSchemaVersion,
    artifactType: "industry-raw-document-store",
    storeId,
    documents: [],
    auditEvents: [],
    summary: {
      documentCount: 0,
      canonicalUrlCount: 0,
      versionedDocumentCount: 0,
      publicRequestsUsed: 0,
      providerRequestsUsed: 0,
      creditsUsed: 0,
      costYuan: 0,
    },
    assertions: {
      documentsAreImmutable: true,
      deduplicationUsesCanonicalUrlAndContentHash: true,
      oldVersionsAreRetained: true,
      rawDocumentsAreNotEvidence: true,
    },
  };
}

export async function assertIndustryRawDocumentStore(
  store: IndustryRawDocumentStore,
) {
  if (store.schemaVersion !== industryRawDocumentStoreSchemaVersion) {
    throw new Error("raw_document_store_schema_version_invalid");
  }
  if (store.artifactType !== "industry-raw-document-store") {
    throw new Error("raw_document_store_artifact_type_invalid");
  }
  if (!store.storeId.trim()) throw new Error("raw_document_store_id_required");
  if (
    !store.assertions.documentsAreImmutable ||
    !store.assertions.deduplicationUsesCanonicalUrlAndContentHash ||
    !store.assertions.oldVersionsAreRetained ||
    !store.assertions.rawDocumentsAreNotEvidence
  ) {
    throw new Error("raw_document_store_assertions_invalid");
  }

  const documentIds = new Set<string>();
  const deduplicationKeys = new Set<string>();
  for (const document of store.documents) {
    if (
      document.schemaVersion !== industryImmutableRawDocumentSchemaVersion ||
      document.artifactType !== "industry-immutable-raw-document"
    ) {
      throw new Error("immutable_raw_document_contract_invalid");
    }
    const canonicalUrl = canonicalizeIndustryRawDocumentUrl(
      document.originalUrl,
    );
    const contentHash = await sha256IndustryContent(document.originalContent);
    const expectedDocumentId = `raw-${(
      await sha256IndustryContent(`${document.canonicalUrl}\n${contentHash}`)
    ).slice(7, 31)}`;
    if (
      canonicalUrl !== document.canonicalUrl ||
      contentHash !== document.contentHash ||
      expectedDocumentId !== document.documentId ||
      new TextEncoder().encode(document.originalContent).byteLength !==
        document.byteLength
    ) {
      throw new Error(`immutable_raw_document_tampered:${document.documentId}`);
    }
    if (
      !validIsoTimestamp(document.capturedAt) ||
      document.httpStatus < 100 ||
      document.httpStatus > 599 ||
      !document.mediaType.trim()
    ) {
      throw new Error(
        `immutable_raw_document_metadata_invalid:${document.documentId}`,
      );
    }
    if (
      !document.assertions.immutableSnapshot ||
      !document.assertions.rawDocumentIsNotEvidence ||
      document.assertions.externalFactProduced ||
      document.assertions.credentialsStored ||
      document.assertions.privateDataStored
    ) {
      throw new Error(
        `immutable_raw_document_assertions_invalid:${document.documentId}`,
      );
    }
    if (documentIds.has(document.documentId)) {
      throw new Error(
        `immutable_raw_document_id_duplicate:${document.documentId}`,
      );
    }
    const deduplicationKey = `${document.canonicalUrl}\n${document.contentHash}`;
    if (deduplicationKeys.has(deduplicationKey)) {
      throw new Error(
        `immutable_raw_document_content_duplicate:${document.documentId}`,
      );
    }
    if (
      document.supersedesDocumentId &&
      !documentIds.has(document.supersedesDocumentId)
    ) {
      throw new Error(
        `immutable_raw_document_version_chain_invalid:${document.documentId}`,
      );
    }
    documentIds.add(document.documentId);
    deduplicationKeys.add(deduplicationKey);
  }

  if (store.auditEvents.length !== store.documents.length) {
    throw new Error("raw_document_store_audit_count_invalid");
  }
  for (const [index, event] of store.auditEvents.entries()) {
    const document = store.documents[index];
    if (
      !document ||
      event.documentId !== document.documentId ||
      event.taskId !== document.taskId ||
      event.routeId !== document.routeId ||
      event.canonicalUrl !== document.canonicalUrl ||
      event.contentHash !== document.contentHash ||
      event.at !== document.capturedAt ||
      event.action !==
        (document.supersedesDocumentId
          ? "stored_new_version"
          : "stored_new_document") ||
      usageValues(event).some((value) => value < 0)
    ) {
      throw new Error(`raw_document_store_audit_invalid:${event.eventId}`);
    }
  }
  if (
    JSON.stringify(store.summary) !==
    JSON.stringify(calculateSummary(store.documents, store.auditEvents))
  ) {
    throw new Error("raw_document_store_summary_invalid");
  }
  return store;
}

export async function putIndustryRawDocument(
  store: IndustryRawDocumentStore,
  input: IndustryRawDocumentInput,
): Promise<IndustryRawDocumentPutResult> {
  await assertIndustryRawDocumentStore(store);
  if (input.route.status !== "planned" || input.route.adapter === "blocked") {
    throw new Error("raw_document_route_not_eligible");
  }
  if (!input.originalContent || !validIsoTimestamp(input.capturedAt)) {
    throw new Error("raw_document_content_or_timestamp_invalid");
  }
  if (
    input.httpStatus < 100 ||
    input.httpStatus > 599 ||
    !input.mediaType.trim() ||
    usageValues(input.usage).some((value) => value < 0)
  ) {
    throw new Error("raw_document_metadata_or_usage_invalid");
  }
  if (
    input.collectionMethod === "offline_fixture" &&
    usageValues(input.usage).some((value) => value !== 0)
  ) {
    throw new Error("offline_raw_document_usage_forbidden");
  }
  const canonicalUrl = canonicalizeIndustryRawDocumentUrl(input.originalUrl);
  if (!canonicalUrl) throw new Error("raw_document_public_url_invalid");
  const contentHash = await sha256IndustryContent(input.originalContent);
  const deduplicated = store.documents.find(
    (document) =>
      document.canonicalUrl === canonicalUrl &&
      document.contentHash === contentHash,
  );
  if (deduplicated) {
    return {
      store,
      outcome: "deduplicated",
      documentId: deduplicated.documentId,
    };
  }

  const previousVersion = [...store.documents]
    .reverse()
    .find((document) => document.canonicalUrl === canonicalUrl);
  const documentId = `raw-${(
    await sha256IndustryContent(`${canonicalUrl}\n${contentHash}`)
  ).slice(7, 31)}`;
  const outcome = previousVersion
    ? "stored_new_version"
    : "stored_new_document";
  const document: IndustryImmutableRawDocument = {
    schemaVersion: industryImmutableRawDocumentSchemaVersion,
    artifactType: "industry-immutable-raw-document",
    documentId,
    taskId: input.route.taskId,
    routeId: input.route.routeId,
    sourceRole: input.route.sourceRole,
    originalUrl: input.originalUrl,
    canonicalUrl,
    capturedAt: input.capturedAt,
    mediaType: input.mediaType,
    httpStatus: input.httpStatus,
    originalContent: input.originalContent,
    contentHash,
    byteLength: new TextEncoder().encode(input.originalContent).byteLength,
    supersedesDocumentId: previousVersion?.documentId ?? null,
    collectionMethod: input.collectionMethod,
    assertions: {
      immutableSnapshot: true,
      rawDocumentIsNotEvidence: true,
      externalFactProduced: false,
      credentialsStored: false,
      privateDataStored: false,
    },
  };
  const event: IndustryRawDocumentAuditEvent = {
    eventId: `audit-${documentId}`,
    action: outcome,
    documentId,
    taskId: document.taskId,
    routeId: document.routeId,
    canonicalUrl,
    contentHash,
    at: document.capturedAt,
    ...input.usage,
  };
  const documents = [...store.documents, document];
  const auditEvents = [...store.auditEvents, event];
  const nextStore: IndustryRawDocumentStore = {
    ...store,
    documents,
    auditEvents,
    summary: calculateSummary(documents, auditEvents),
  };
  await assertIndustryRawDocumentStore(nextStore);
  return { store: nextStore, outcome, documentId };
}

export async function serializeIndustryRawDocumentStore(
  store: IndustryRawDocumentStore,
) {
  await assertIndustryRawDocumentStore(store);
  return `${JSON.stringify(store, null, 2)}\n`;
}
