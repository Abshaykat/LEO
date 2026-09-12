import {
  checkUpdates,
  applyUpdate,
  parseWingetUpgradeList,
  type CommandRunner,
  type CommandResult,
  type BackupDependencies
} from "./system-update-tools.ts";

const SAMPLE_UPGRADE_OUTPUT = `
Name               Id               Version   Available Source
------------------------------------------------------------------
Git                Git.Git          2.44.0    2.45.1    winget
7-Zip              7zip.7zip        23.01     24.05     winget
2 upgrades available.
`;

function fakeRunner(script: (executable: string, args: string[]) => CommandResult): CommandRunner {
  return async (executable, args) => script(executable, args);
}

async function main() {
  console.log("=== L.E.O. SYSTEM-UPDATE-TOOLS TEST ===");

  // 1. parseWingetUpgradeList parses the standard table format
  {
    const updates = parseWingetUpgradeList(SAMPLE_UPGRADE_OUTPUT);
    if (updates.length !== 2) throw new Error(`Expected 2 updates, got ${updates.length}: ${JSON.stringify(updates)}`);
    if (updates[0].id !== "Git.Git" || updates[0].availableVersion !== "2.45.1") {
      throw new Error(`Unexpected parsed update: ${JSON.stringify(updates[0])}`);
    }
    console.log("PASS: parseWingetUpgradeList parses the winget upgrade table.");
  }

  // 2. parseWingetUpgradeList returns an empty list when there is nothing to parse
  {
    const updates = parseWingetUpgradeList("No applicable updates found.");
    if (updates.length !== 0) throw new Error("Expected no updates to be parsed from an empty report.");
    console.log("PASS: parseWingetUpgradeList returns an empty array when there is no update table.");
  }

  // 3. checkUpdates wires the runner and parser together
  {
    const runner = fakeRunner((executable, args) => {
      if (executable !== "winget" || args[0] !== "upgrade") throw new Error("Unexpected command shape.");
      return { stdout: SAMPLE_UPGRADE_OUTPUT, stderr: "", exitCode: 0 };
    });
    const result = await checkUpdates({}, runner);
    if (result.updates.length !== 2) throw new Error("Expected checkUpdates to return 2 parsed updates.");
    console.log("PASS: checkUpdates lists available updates.");
  }

  // 4. applyUpdate: backup created and verified BEFORE the update command runs
  {
    const callOrder: string[] = [];
    const backup: BackupDependencies = {
      create: async () => {
        callOrder.push("create");
        return { path: "/fake/backup.backup", manifest: {} as any };
      },
      verify: async () => {
        callOrder.push("verify");
        return {} as any;
      }
    };
    const runner = fakeRunner((executable, args) => {
      callOrder.push("update");
      if (executable !== "winget" || args[0] !== "upgrade") throw new Error("Unexpected update command.");
      return { stdout: "Successfully installed", stderr: "", exitCode: 0 };
    });

    const result = await applyUpdate({ id: "Git.Git" }, runner, backup);

    if (callOrder.join(",") !== "create,verify,update") {
      throw new Error(`Expected create -> verify -> update order, got: ${callOrder.join(",")}`);
    }
    if (!result.backupVerified || !result.updateApplied) {
      throw new Error(`Expected a successful, verified safe update: ${JSON.stringify(result)}`);
    }
    console.log("PASS: applyUpdate creates and verifies a backup before applying the update.");
  }

  // 5. applyUpdate: if backup verification fails, the update is NEVER attempted
  {
    let updateAttempted = false;
    const backup: BackupDependencies = {
      create: async () => ({ path: "/fake/backup.backup", manifest: {} as any }),
      verify: async () => {
        throw new Error("simulated corrupt backup");
      }
    };
    const runner = fakeRunner(() => {
      updateAttempted = true;
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    let threw = false;
    try {
      await applyUpdate({ id: "Git.Git" }, runner, backup);
    } catch (error) {
      threw = true;
      if (!(error instanceof Error) || !error.message.includes("aborted")) {
        throw new Error(`Expected an "aborted" error message, got: ${error}`);
      }
    }

    if (!threw) throw new Error("Expected applyUpdate to throw when backup verification fails.");
    if (updateAttempted) throw new Error("SAFETY FAILURE: the update ran even though the backup failed verification.");
    console.log("PASS: applyUpdate refuses to update when the pre-update backup fails verification.");
  }

  // 6. applyUpdate: rejects an invalid package id before touching backups at all
  {
    let backupCalled = false;
    const backup: BackupDependencies = {
      create: async () => {
        backupCalled = true;
        return { path: "x", manifest: {} as any };
      },
      verify: async () => ({} as any)
    };
    let threw = false;
    try {
      await applyUpdate({ id: "bad id; rm -rf /" }, fakeRunner(() => ({ stdout: "", stderr: "", exitCode: 0 })), backup);
    } catch {
      threw = true;
    }
    if (!threw || backupCalled) throw new Error("Expected an invalid package id to be rejected before any backup work.");
    console.log("PASS: applyUpdate validates the package id before doing any backup work.");
  }

  console.log("\n=== SYSTEM-UPDATE-TOOLS TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
