import type { SpecProfileValidator, SpecRevisionFinding } from "./revision.js";

export const HEAVY_PRODUCTION_SPEC_PROFILE_ID = "gyeonggi-integrated-wallet-production-spec/v1";

const REQUIRED_TOP_LEVEL_KEYS = [
  "actors",
  "components",
  "demoStoryboard",
  "designTokens",
  "extendedDesign",
  "interactionModel",
  "meta",
  "mockData",
  "navModel",
  "screens",
  "stateModel"
] as const;

const REQUIRED_SCREEN_STRING_FIELDS = [
  "id",
  "route",
  "surface",
  "title",
  "purpose",
  "audience",
  "layout"
] as const;

const REQUIRED_SCREEN_ARRAY_FIELDS = [
  "actors",
  "components",
  "states",
  "copy",
  "dataNeeds"
] as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finding(code: string, message: string, pointer?: string): SpecRevisionFinding {
  return { code, message, ...(pointer === undefined ? {} : { pointer }) };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(nonEmptyString) : [];
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function identitySet(value: unknown, key: string): Set<string> {
  return new Set(
    records(value)
      .map((item) => item[key])
      .filter(nonEmptyString)
  );
}

function validateRequiredRoots(document: JsonRecord): SpecRevisionFinding[] {
  const findings: SpecRevisionFinding[] = [];
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!Object.hasOwn(document, key)) {
      findings.push(
        finding(
          "HEAVY_SPEC_REQUIRED_ROOT_MISSING",
          `required top-level section ${key} is missing`,
          `/${key}`
        )
      );
    }
  }
  for (const key of ["actors", "components", "interactionModel", "screens"] as const) {
    if (Object.hasOwn(document, key) && !Array.isArray(document[key])) {
      findings.push(finding("HEAVY_SPEC_ROOT_TYPE_INVALID", `${key} must be an array`, `/${key}`));
    }
  }
  return findings;
}

function validateScreens(document: JsonRecord): SpecRevisionFinding[] {
  const findings: SpecRevisionFinding[] = [];
  const screens = records(document.screens);
  const actors = identitySet(document.actors, "id");
  const components = identitySet(document.components, "name");
  const screenIds = screens.map((screen) => screen.id).filter(nonEmptyString);
  const screenIdSet = new Set(screenIds);

  for (const duplicate of findDuplicates(screenIds)) {
    findings.push(
      finding("HEAVY_SPEC_DUPLICATE_SCREEN_ID", `duplicate screen id ${duplicate}`, "/screens")
    );
  }
  for (const duplicate of findDuplicates(
    screens.map((screen) => screen.route).filter(nonEmptyString)
  )) {
    findings.push(
      finding(
        "HEAVY_SPEC_DUPLICATE_SCREEN_ROUTE",
        `duplicate screen route ${duplicate}`,
        "/screens"
      )
    );
  }

  screens.forEach((screen, index) => {
    for (const field of REQUIRED_SCREEN_STRING_FIELDS) {
      if (!nonEmptyString(screen[field])) {
        findings.push(
          finding(
            "HEAVY_SPEC_SCREEN_FIELD_INVALID",
            `screen ${index} field ${field} must be a non-empty string`,
            `/screens/${index}/${field}`
          )
        );
      }
    }
    for (const field of REQUIRED_SCREEN_ARRAY_FIELDS) {
      if (!Array.isArray(screen[field])) {
        findings.push(
          finding(
            "HEAVY_SPEC_SCREEN_FIELD_INVALID",
            `screen ${index} field ${field} must be an array`,
            `/screens/${index}/${field}`
          )
        );
      }
    }
    for (const component of stringArray(screen.components)) {
      if (!components.has(component)) {
        findings.push(
          finding(
            "HEAVY_SPEC_UNKNOWN_COMPONENT_REF",
            `screen ${String(screen.id)} references unknown component ${component}`,
            `/screens/${index}/components`
          )
        );
      }
    }
    for (const actor of stringArray(screen.actors)) {
      if (!actors.has(actor)) {
        findings.push(
          finding(
            "HEAVY_SPEC_UNKNOWN_ACTOR_REF",
            `screen ${String(screen.id)} references unknown actor ${actor}`,
            `/screens/${index}/actors`
          )
        );
      }
    }
  });

  records(document.actors).forEach((actor, index) => {
    for (const target of stringArray(actor.canOperate)) {
      if (!screenIdSet.has(target)) {
        findings.push(
          finding(
            "HEAVY_SPEC_UNKNOWN_ACTOR_SCREEN_REF",
            `actor ${String(actor.id)} canOperate references unknown screen ${target}`,
            `/actors/${index}/canOperate`
          )
        );
      }
    }
  });
  return findings;
}

function validateNavigationAndInteractions(document: JsonRecord): SpecRevisionFinding[] {
  const findings: SpecRevisionFinding[] = [];
  const screenIds = identitySet(document.screens, "id");
  const navModel = isRecord(document.navModel) ? document.navModel : {};
  records(navModel.shells).forEach((shell, shellIndex) => {
    records(shell.items).forEach((item, itemIndex) => {
      if (!nonEmptyString(item.target) || !screenIds.has(item.target)) {
        findings.push(
          finding(
            "HEAVY_SPEC_UNKNOWN_NAV_TARGET",
            `navigation target ${String(item.target)} does not resolve to a screen`,
            `/navModel/shells/${shellIndex}/items/${itemIndex}/target`
          )
        );
      }
    });
  });

  const interactionScreenIds = records(document.interactionModel)
    .map((interaction) => interaction.screenId)
    .filter(nonEmptyString);
  for (const duplicate of findDuplicates(interactionScreenIds)) {
    findings.push(
      finding(
        "HEAVY_SPEC_DUPLICATE_INTERACTION_SCREEN",
        `multiple interaction entries target screen ${duplicate}`,
        "/interactionModel"
      )
    );
  }
  const interactionSet = new Set(interactionScreenIds);
  for (const screenId of screenIds) {
    if (!interactionSet.has(screenId)) {
      findings.push(
        finding(
          "HEAVY_SPEC_INTERACTION_MISSING",
          `screen ${screenId} has no interaction model entry`,
          "/interactionModel"
        )
      );
    }
  }
  for (const screenId of interactionSet) {
    if (!screenIds.has(screenId)) {
      findings.push(
        finding(
          "HEAVY_SPEC_UNKNOWN_INTERACTION_SCREEN",
          `interaction model references unknown screen ${screenId}`,
          "/interactionModel"
        )
      );
    }
  }
  return findings;
}

function validateAuthorityRoots(document: JsonRecord): SpecRevisionFinding[] {
  const findings: SpecRevisionFinding[] = [];
  const actors = records(document.actors);
  const admin = actors.find((actor) => actor.id === "act-superadmin");
  const issuer = actors.find((actor) => actor.id === "act-issuer-principal");
  if (admin === undefined) {
    findings.push(
      finding(
        "HEAVY_SPEC_ADMIN_AUTHORITY_ROOT_MISSING",
        "act-superadmin authority root is missing",
        "/actors"
      )
    );
  }
  if (issuer === undefined) {
    findings.push(
      finding(
        "HEAVY_SPEC_ISSUER_AUTHORITY_ROOT_MISSING",
        "act-issuer-principal authority root is missing",
        "/actors"
      )
    );
  }
  if (admin !== undefined && !stringArray(admin.separationFrom).includes("act-issuer-principal")) {
    findings.push(
      finding(
        "HEAVY_SPEC_AUTHORITY_ROOTS_NOT_SEPARATED",
        "act-superadmin must declare separation from act-issuer-principal",
        "/actors"
      )
    );
  }
  if (issuer !== undefined && !stringArray(issuer.separationFrom).includes("act-superadmin")) {
    findings.push(
      finding(
        "HEAVY_SPEC_AUTHORITY_ROOTS_NOT_SEPARATED",
        "act-issuer-principal must declare separation from act-superadmin",
        "/actors"
      )
    );
  }
  return findings;
}

function validateBaselinePreservation(
  baseline: JsonRecord,
  candidate: JsonRecord
): SpecRevisionFinding[] {
  const findings: SpecRevisionFinding[] = [];
  for (const key of Object.keys(baseline).sort()) {
    if (!Object.hasOwn(candidate, key)) {
      findings.push(
        finding(
          "HEAVY_SPEC_BASELINE_ROOT_REMOVED",
          `candidate removed baseline top-level section ${key}`,
          `/${key}`
        )
      );
    }
  }
  for (const [section, key] of [
    ["screens", "id"],
    ["actors", "id"],
    ["components", "name"]
  ] as const) {
    const candidateIds = identitySet(candidate[section], key);
    for (const id of identitySet(baseline[section], key)) {
      if (!candidateIds.has(id)) {
        findings.push(
          finding(
            "HEAVY_SPEC_BASELINE_ENTITY_REMOVED",
            `candidate removed baseline ${section} entry ${id}`,
            `/${section}`
          )
        );
      }
    }
  }
  return findings;
}

export function createHeavyProductionSpecValidator(
  baselineDocument?: unknown
): SpecProfileValidator {
  const baseline = isRecord(baselineDocument) ? baselineDocument : undefined;
  return (document: unknown): SpecRevisionFinding[] => {
    if (!isRecord(document)) {
      return [
        finding("HEAVY_SPEC_DOCUMENT_INVALID", "heavy production spec must be a JSON object", "/")
      ];
    }
    return [
      ...validateRequiredRoots(document),
      ...validateScreens(document),
      ...validateNavigationAndInteractions(document),
      ...validateAuthorityRoots(document),
      ...(baseline === undefined ? [] : validateBaselinePreservation(baseline, document))
    ];
  };
}
