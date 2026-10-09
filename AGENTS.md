# Project execution constraints

The user requires unattended work to run headlessly, without opening command
windows or browser windows. This overrides older requests for headed validation.

- Use `windowsHide: true` for Windows Node subprocesses, including nested helpers,
  servers, monitors, validators, and build commands.
- Use `Start-Process -WindowStyle Hidden` for PowerShell background launches.
- Run automated browsers headless; inspect screenshots, traces, and logs instead.
- Do not use `start`, persistent `cmd /k` windows, or visible terminal launchers.
- Do not close or kill unrelated applications or console windows. Identify any
  owned process by its launch record and birth identity before cleanup.
- Report headed/manual coverage as unverified when it has not been performed;
  headless evidence must not be relabelled as headed evidence.

Keep generated conversion outputs, browser profiles, and scratch data inside this
repository's approved directories, and remove disposable owned data in `finally`.
Do not use Docker. Preserve `test.mkv` exactly.
