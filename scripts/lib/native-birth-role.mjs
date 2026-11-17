// Reconcile independent diagnostic witnesses, never alter native measurements.
const identityKeys = ["pid", "parentPid", "createdAt", "creationFileTime"];
const sameBirth = (a, b) => identityKeys.every(key => a[key] === b[key]);
const safeLabel = value => value === null || typeof value === "string" && /^[a-zA-Z0-9_.-]{1,256}$/.test(value);
const microIdentity = p => `${p.pid}:${p.parentPid}:${p.createdAt?.replace(/(\.\d{6})\d?Z$/, "$1Z")}`;
const validBirth = p => Number.isSafeInteger(p?.pid) && p.pid > 0 && Number.isSafeInteger(p.parentPid) && p.parentPid >= 0 &&
  typeof p.creationFileTime === "string" && /^\d{15,20}$/.test(p.creationFileTime) &&
  typeof p.createdAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{7}Z$/.test(p.createdAt) && Number.isFinite(Date.parse(p.createdAt));

export function reconcileNativeBirthRole(nativeBirth, capture) {
  const unavailable = reason => ({ status: "unavailable", reason, type: null, utilitySubtype: null, sandboxType: null });
  if (!validBirth(nativeBirth)) return unavailable("invalid-native-birth");
  if (!capture || capture.globalError !== null || capture.classificationPrecisionNanoseconds !== 1000 ||
    capture.acceptanceMetric !== false || capture.memoryFormulaChanged !== false ||
    capture.processesExcluded !== false || capture.primarySamplesMutated !== false ||
    !Array.isArray(capture.records) || capture.records.length > 512 || !capture.records.every(validBirth)) return unavailable("capture-unavailable-or-invalid");
  // A native FILETIME match alone is insufficient: parent, full birth timestamp,
  // and uniqueness at the classifier's coarser CIM precision must also agree.
  const matches = capture.records.filter(p => sameBirth(p, nativeBirth));
  if (matches.length !== 1) return unavailable("no-unique-exact-birth-witness");
  if (capture.records.filter(p => microIdentity(p) === microIdentity(nativeBirth)).length !== 1)
    return unavailable("ambiguous-at-classifier-precision");
  const p = matches[0];
  if (p.status !== "classified" || p.attempts !== 1 || p.error !== null ||
    !["browser", "renderer", "gpu-process", "utility", "zygote"].includes(p.type) ||
    !safeLabel(p.utilitySubtype) || !safeLabel(p.sandboxType)) return unavailable("witness-not-classified");
  return { status: "classified-from-retained-same-birth-observer", reason: null,
    type: p.type, utilitySubtype: p.utilitySubtype, sandboxType: p.sandboxType };
}
