// Birth metadata only: no selected files, content reads, conversion, or process
// termination. A DMTF timestamp has microsecond precision, unlike FILETIME's
// 100ns ticks; retain the entire ten-tick interval before excluding ownership.
namespace WithinDiagnostics {
  public sealed class ProcessBirthProof {
    public int pid, parentPid;
    public string earliestFileTime, latestFileTime, boundaryFileTime, source, reason;
    public long observations;
  }
  public static class ProcessBirthEvidence {
    public static long[] Query(uint pid) {
      if (pid == 0) throw new System.ArgumentException("Invalid birth query PID");
      var options = new System.Management.EnumerationOptions();
      options.Timeout = System.TimeSpan.FromSeconds(2);
      options.ReturnImmediately = false; options.Rewindable = false; options.BlockSize = 1;
      using (var searcher = new System.Management.ManagementObjectSearcher("root\\cimv2",
          "SELECT ProcessId, CreationDate FROM Win32_Process WHERE ProcessId = " + pid, options))
      using (var rows = searcher.Get()) {
        long[] result = null;
        foreach (System.Management.ManagementBaseObject row in rows) using (row) {
          if (result != null || System.Convert.ToUInt32(row["ProcessId"]) != pid)
            throw new System.InvalidOperationException("Ambiguous birth query");
          var stamp = row["CreationDate"] as string;
          if (stamp == null || !System.Text.RegularExpressions.Regex.IsMatch(stamp, @"^\d{14}\.\d{6}[+-]\d{3}$"))
            throw new System.InvalidOperationException("Unavailable birth precision");
          var earliest = System.Management.ManagementDateTimeConverter.ToDateTime(stamp).ToUniversalTime().ToFileTimeUtc();
          result = new long[] { earliest, checked(earliest + 9) };
        }
        if (result == null) throw new System.InvalidOperationException("Birth query process unavailable");
        return result;
      }
    }
    public static string ForeignReason(long earliest, long latest, long minimumCreated, long expectedCreated) {
      if (earliest <= 0 || latest < earliest || latest - earliest > 9 || minimumCreated < 0 || expectedCreated < 0)
        throw new System.ArgumentException("Invalid birth evidence");
      if (minimumCreated > 0 && latest < minimumCreated) return "predates-current-parent";
      if (expectedCreated > 0 && (expectedCreated < earliest || expectedCreated > latest)) return "previous-owned-pid-reused";
      return null; // Uncertainty is NOT permission to omit a process.
    }
  }
}
