import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = text => createHash("sha256").update(text).digest("hex");
export const ORIGINAL_WINDOWS_OBSERVER_SHA256 = "4854ca5f6a5b50eedf1c2c8f37d4dc5c9494376a225bae224f577b4c18e00a82";

// Keep the historic observer and its source-bound reports byte-identical.
// A checked derivative changes ownership validation only; the native memory
// formula, sampling cadence/queue/limits and null-on-failure path stay intact.
export function makeBirthAwareMemoryObserver(source, helper) {
  assert.equal(sha(source), ORIGINAL_WINDOWS_OBSERVER_SHA256);
  assert.ok(helper.startsWith("// Birth metadata only:"));
  const edits = [
    ["    public double observerCpuMs;\n", "    public double observerCpuMs;\n    public long birthFallbackQueries;\n    public ProcessBirthProof[] ownershipProofs;\n"],
    ["    bool overflow;\n", "    bool overflow;\n    long birthFallbackQueries;\n    readonly Dictionary<string, ProcessBirthProof> birthProofs = new Dictionary<string, ProcessBirthProof>();\n"],
    ["    static ReadResult Read(uint pid, uint parent, string exe) {\n", "    ReadResult Read(uint pid, uint parent, string exe, long minimumCreated = 0, long expectedCreated = 0) {\n"],
    ["      if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), \"OpenProcess \" + pid);\n",
      "      if (handle == IntPtr.Zero) {\n" +
      "        var failure = new Win32Exception(Marshal.GetLastWin32Error(), \"OpenProcess \" + pid);\n" +
      "        if (minimumCreated > 0 || expectedCreated > 0) {\n" +
      "          lock (gate) { birthFallbackQueries++; }\n" +
      "          var interval = ProcessBirthEvidence.Query(pid);\n" +
      "          if (ExcludeByBirth(pid, parent, interval[0], interval[1], minimumCreated, expectedCreated, \"Win32_Process.CreationDate\")) return null;\n" +
      "        }\n" +
      "        throw failure; // Owned or unproven unreadable process: entire sample unavailable.\n" +
      "      }\n"],
    ["        var counters = new Counters(); counters.size = (uint)Marshal.SizeOf(typeof(Counters));\n",
      "        if (ExcludeByBirth(pid, parent, created, created, minimumCreated, expectedCreated, \"GetProcessTimes\")) return null;\n" +
      "        var counters = new Counters(); counters.size = (uint)Marshal.SizeOf(typeof(Counters));\n"],
    ["          var read = Read(entry.pid, entry.parentPid, entry.exe);\n",
      "          var read = Read(entry.pid, entry.parentPid, entry.exe, 0, identity.Value);\n          if (read == null) continue;\n"],
    ["            var read = Read(pair.Value.pid, pair.Value.parentPid, pair.Value.exe);\n",
      "            var read = Read(pair.Value.pid, pair.Value.parentPid, pair.Value.exe, selected[(int)pair.Value.parentPid].created);\n            if (read == null) continue;\n"],
    ["          samples=samples, overflow=overflow, observerCpuMs=process.TotalProcessorTime.TotalMilliseconds };\n",
      "          samples=samples, overflow=overflow, observerCpuMs=process.TotalProcessorTime.TotalMilliseconds,\n" +
      "          birthFallbackQueries=birthFallbackQueries, ownershipProofs=new List<ProcessBirthProof>(birthProofs.Values).ToArray() };\n"],
    ["    TreeSample Take() {\n",
      "    bool ExcludeByBirth(uint pid, uint parent, long earliest, long latest, long minimumCreated, long expectedCreated, string source) {\n" +
      "      var reason = ProcessBirthEvidence.ForeignReason(earliest, latest, minimumCreated, expectedCreated);\n" +
      "      if (reason == null) return false;\n" +
      "      var boundary = reason == \"predates-current-parent\" ? minimumCreated : expectedCreated;\n" +
      "      var key = pid + \":\" + parent + \":\" + earliest + \":\" + latest + \":\" + boundary + \":\" + source + \":\" + reason;\n" +
      "      lock (gate) {\n" +
      "        ProcessBirthProof previous; birthProofs.TryGetValue(key, out previous);\n" +
      "        if (previous == null && birthProofs.Count >= 32) throw new InvalidOperationException(\"Ownership proof cap\");\n" +
      "        birthProofs[key] = new ProcessBirthProof { pid=(int)pid, parentPid=(int)parent, earliestFileTime=earliest.ToString(),\n" +
      "          latestFileTime=latest.ToString(), boundaryFileTime=boundary.ToString(), source=source, reason=reason,\n" +
      "          observations=previous == null ? 1 : checked(previous.observations + 1) };\n" +
      "      }\n" +
      "      return true;\n" +
      "    }\n" +
      "    TreeSample Take() {\n"],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source);
  generated += "\n" + helper;
  return { generated, generatedSha256: sha(generated), baselineSha256: sha(source), helperSha256: sha(helper), edits,
    scope: "observer-ownership-only-not-conversion-or-public-acceptance", memoryFormulaChanged: false,
    unavailableRemainsNull: true, processNameOrSandboxExclusions: false, publicAcceptance: false };
}
