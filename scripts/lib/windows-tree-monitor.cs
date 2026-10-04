// Read-only test instrumentation. Never used to perform a conversion.
// PrivateUsage is commit/private bytes; WorkingSetSize is secondary RSS.
// See Microsoft GetProcessMemoryInfo, GetProcessTimes and Toolhelp32 docs.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace WithinDiagnostics {
  public sealed class ProcessRow {
    public int pid, parentPid;
    public string createdAt, creationFileTime, executableName;
    public double privateBytes, rssBytes;
  }
  public sealed class TreeSample {
    public long sequence;
    public string timestamp, completedAt, sampleError;
    public double nativeElapsedMs;
    public double? privateBytes, rssBytes;
    public ProcessRow[] processes;
  }
  public sealed class DrainResult {
    public TreeSample[] samples;
    public bool overflow;
    public double observerCpuMs;
  }
  public sealed class WindowsTreeMonitor : IDisposable {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct Entry {
      public uint size, usage, pid;
      public UIntPtr defaultHeap;
      public uint module, threads, parentPid;
      public int basePriority;
      public uint flags;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string exe;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct Counters {
      public uint size, pageFaults;
      public UIntPtr peakWorking, working, peakPaged, paged, peakNonPaged, nonPaged;
      public UIntPtr pagefile, peakPagefile, privateUsage;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32FirstW(IntPtr snapshot, ref Entry entry);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32NextW(IntPtr snapshot, ref Entry entry);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process, out long created, out long exited, out long kernel, out long user);
    [DllImport("psapi.dll", SetLastError=true)] static extern bool GetProcessMemoryInfo(IntPtr process, ref Counters counters, uint size);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    readonly int rootPid, intervalMs;
    readonly long rootCreated;
    readonly Dictionary<int, long> owned = new Dictionary<int, long>();
    readonly Queue<TreeSample> queue = new Queue<TreeSample>();
    readonly object gate = new object();
    readonly Thread thread;
    readonly ManualResetEvent stop = new ManualResetEvent(false);
    bool overflow;
    long sequence;
    public WindowsTreeMonitor(int rootPid, int intervalMs) {
      if (rootPid <= 0 || intervalMs < 100 || intervalMs > 1000) throw new ArgumentException("Invalid PID/interval");
      this.rootPid = rootPid; this.intervalMs = intervalMs;
      rootCreated = Read((uint)rootPid, 0, "root").created;
      owned.Add(rootPid, rootCreated);
      thread = new Thread(Loop); thread.IsBackground = true; thread.Start();
    }
    sealed class ReadResult { public ProcessRow row; public long created; }
    static ReadResult Read(uint pid, uint parent, string exe) {
      IntPtr handle = OpenProcess(0x1000, false, pid); // QUERY_LIMITED_INFORMATION, no content reads
      if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenProcess " + pid);
      try {
        long created, exited, kernel, user;
        if (!GetProcessTimes(handle, out created, out exited, out kernel, out user)) throw new Win32Exception(Marshal.GetLastWin32Error(), "GetProcessTimes " + pid);
        var counters = new Counters(); counters.size = (uint)Marshal.SizeOf(typeof(Counters));
        if (!GetProcessMemoryInfo(handle, ref counters, counters.size)) throw new Win32Exception(Marshal.GetLastWin32Error(), "GetProcessMemoryInfo " + pid);
        if (counters.privateUsage.ToUInt64() == 0) throw new InvalidOperationException("Unavailable private bytes " + pid);
        return new ReadResult { created=created, row=new ProcessRow { pid=(int)pid, parentPid=(int)parent,
          createdAt=DateTime.FromFileTimeUtc(created).ToString("o"), creationFileTime=created.ToString(), executableName=exe,
          privateBytes=counters.privateUsage.ToUInt64(), rssBytes=counters.working.ToUInt64() } };
      } finally { CloseHandle(handle); }
    }
    TreeSample Take() {
      var watch = Stopwatch.StartNew();
      var result = new TreeSample { sequence=++sequence, timestamp=DateTime.UtcNow.ToString("o") };
      try {
        var entries = new Dictionary<int, Entry>();
        IntPtr snapshot = CreateToolhelp32Snapshot(2, 0); // process IDs/parents only; no heaps/modules
        if (snapshot == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Toolhelp snapshot");
        try {
          var entry = new Entry(); entry.size = (uint)Marshal.SizeOf(typeof(Entry));
          if (!Process32FirstW(snapshot, ref entry)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Process32First");
          do {
            if (entries.Count >= 65536) throw new InvalidOperationException("System process cap");
            entries.Add((int)entry.pid, entry);
          } while (Process32NextW(snapshot, ref entry));
          if (Marshal.GetLastWin32Error() != 18) throw new Win32Exception(Marshal.GetLastWin32Error(), "Process32Next");
        } finally { CloseHandle(snapshot); }
        if (!entries.ContainsKey(rootPid)) throw new InvalidOperationException("Owned root exited");
        var selected = new Dictionary<int, ReadResult>();
        // Retain already-observed descendants after a parent exits; never accept a reused PID.
        foreach (var identity in owned) {
          Entry entry;
          if (!entries.TryGetValue(identity.Key, out entry)) continue;
          var read = Read(entry.pid, entry.parentPid, entry.exe);
          if (read.created != identity.Value) {
            if (identity.Key == rootPid) throw new InvalidOperationException("Owned root PID reused");
            continue;
          }
          selected.Add(identity.Key, read);
        }
        if (!selected.ContainsKey(rootPid) || selected[rootPid].created != rootCreated) throw new InvalidOperationException("Owned root identity unavailable");
        bool changed;
        do {
          changed = false;
          foreach (var pair in entries) {
            if (selected.ContainsKey(pair.Key) || !selected.ContainsKey((int)pair.Value.parentPid)) continue;
            var read = Read(pair.Value.pid, pair.Value.parentPid, pair.Value.exe);
            if (read.created < selected[(int)pair.Value.parentPid].created) continue; // stale parent PID
            if (selected.Count >= 128) throw new InvalidOperationException("Owned process cap");
            selected.Add(pair.Key, read); changed = true;
          }
        } while (changed);
        var rows = new List<ProcessRow>(); double privateTotal=0, rssTotal=0;
        owned.Clear();
        foreach (var pair in selected) {
          owned.Add(pair.Key, pair.Value.created); rows.Add(pair.Value.row);
          privateTotal += pair.Value.row.privateBytes; rssTotal += pair.Value.row.rssBytes;
        }
        rows.Sort((a,b) => a.pid.CompareTo(b.pid));
        result.processes = rows.ToArray(); result.privateBytes=privateTotal; result.rssBytes=rssTotal;
      } catch (Exception e) { result.sampleError=e.Message; result.processes=null; result.privateBytes=null; result.rssBytes=null; }
      result.completedAt=DateTime.UtcNow.ToString("o"); result.nativeElapsedMs=watch.Elapsed.TotalMilliseconds;
      return result;
    }
    void Loop() {
      while (!stop.WaitOne(0)) {
        var watch=Stopwatch.StartNew(); var sample=Take();
        lock (gate) {
          if (queue.Count >= 256) { overflow=true; return; } // explicit fatal, no silent overwrite
          queue.Enqueue(sample);
        }
        stop.WaitOne(Math.Max(0, intervalMs-(int)watch.ElapsedMilliseconds));
      }
    }
    public DrainResult Drain() {
      lock (gate) {
        TreeSample[] samples=queue.ToArray(); queue.Clear();
        using (var process=Process.GetCurrentProcess()) return new DrainResult {
          samples=samples, overflow=overflow, observerCpuMs=process.TotalProcessorTime.TotalMilliseconds };
      }
    }
    public void Dispose() { stop.Set(); thread.Join(3000); stop.Dispose(); }
  }
}
