import {
  checkSoftware,
  installSoftware,
  setEnvironmentVariable,
  PROTECTED_ENVIRONMENT_VARIABLES,
  type CommandRunner,
  type CommandResult
} from "./pc-setup-tools.ts";

function fakeRunner(script: (executable: string, args: string[]) => CommandResult): CommandRunner {
  return async (executable, args) => script(executable, args);
}

async function main() {
  console.log("=== L.E.O. PC-SETUP-TOOLS TEST ===");

  // 1. checkSoftware: found by exact id
  {
    const runner = fakeRunner((executable, args) => {
      if (executable === "winget" && args.includes("--id")) {
        return { stdout: "Git.Git  Git  2.44.0", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "not found", exitCode: 1 };
    });
    const result = await checkSoftware({ name: "Git.Git" }, runner);
    if (!result.installed) throw new Error("Expected Git.Git to be reported installed.");
    console.log("PASS: checkSoftware finds an installed package by id.");
  }

  // 2. checkSoftware: not found falls back to name search, still not found
  {
    const runner = fakeRunner(() => ({ stdout: "No installed package found matching input criteria.", stderr: "", exitCode: 1 }));
    const result = await checkSoftware({ name: "NoSuchPackage" }, runner);
    if (result.installed) throw new Error("Expected NoSuchPackage to be reported as not installed.");
    console.log("PASS: checkSoftware correctly reports an uninstalled package.");
  }

  // 3. checkSoftware: rejects unsafe characters
  {
    let threw = false;
    try {
      await checkSoftware({ name: "Git; rm -rf /" }, fakeRunner(() => ({ stdout: "", stderr: "", exitCode: 0 })));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected checkSoftware to reject an unsafe package identifier.");
    console.log("PASS: checkSoftware rejects unsafe package identifiers.");
  }

  // 4. installSoftware: success path
  {
    const runner = fakeRunner((executable, args) => {
      if (executable !== "winget" || args[0] !== "install") throw new Error("Unexpected command shape.");
      return { stdout: "Successfully installed", stderr: "", exitCode: 0 };
    });
    const result = await installSoftware({ id: "Python.Python.3.12" }, runner);
    if (!result.succeeded) throw new Error("Expected installSoftware to report success.");
    console.log("PASS: installSoftware reports success on exit code 0.");
  }

  // 5. installSoftware: failure path is surfaced, not thrown
  {
    const runner = fakeRunner(() => ({ stdout: "", stderr: "No package found matching input criteria.", exitCode: 1 }));
    const result = await installSoftware({ id: "Definitely.Not.Real" }, runner);
    if (result.succeeded) throw new Error("Expected installSoftware to report failure for a non-zero exit code.");
    console.log("PASS: installSoftware surfaces a failed install without throwing.");
  }

  // 6. setEnvironmentVariable: protected names are blocked
  for (const protectedName of ["PATH", "path", "SystemRoot", "LEO_BACKUP_KEY"]) {
    let threw = false;
    try {
      await setEnvironmentVariable({ name: protectedName, value: "x" }, fakeRunner(() => ({ stdout: "", stderr: "", exitCode: 0 })));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error(`Expected setting protected variable "${protectedName}" to be refused.`);
  }
  console.log(`PASS: all ${PROTECTED_ENVIRONMENT_VARIABLES.length} protected environment variable names are blocked (spot-checked).`);

  // 7. setEnvironmentVariable: a normal, non-protected variable succeeds
  {
    const runner = fakeRunner((executable, args) => {
      if (executable !== "setx") throw new Error("Expected setx to be used.");
      return { stdout: `SUCCESS: Specified value was saved.`, stderr: "", exitCode: 0 };
    });
    const result = await setEnvironmentVariable({ name: "LEO_CUSTOM_TOOL_PATH", value: "C:\\Tools" }, runner);
    if (!result.succeeded) throw new Error("Expected a non-protected environment variable to be set successfully.");
    console.log("PASS: setEnvironmentVariable sets a non-protected variable.");
  }

  // 8. setEnvironmentVariable: rejects malformed names
  {
    let threw = false;
    try {
      await setEnvironmentVariable({ name: "1BAD-NAME!", value: "x" }, fakeRunner(() => ({ stdout: "", stderr: "", exitCode: 0 })));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected a malformed environment variable name to be rejected.");
    console.log("PASS: setEnvironmentVariable rejects malformed variable names.");
  }

  console.log("\n=== PC-SETUP-TOOLS TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
