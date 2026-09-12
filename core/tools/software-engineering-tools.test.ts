import path from "node:path";
import {
  runTests,
  runBuild,
  analyzeFailure,
  type CommandRunner,
  type CommandResult
} from "./software-engineering-tools.ts";
import { LEO_ROOT } from "../config/leo-config.ts";

const JEST_FAILURE_OUTPUT = `
FAIL src/math.test.ts
  math
    ✕ adds two numbers (3 ms)

  ● math › adds two numbers

    expect(received).toBe(expected)

    Expected: 4
    Received: 5

Tests:       1 failed, 2 passed, 3 total
Test Suites: 1 failed, 1 total
Time:        0.4 s
`;

const PYTEST_FAILURE_OUTPUT = `
============================= FAILURES ==============================
___________________________ test_add ________________________________

    def test_add():
>       assert add(2, 2) == 5
E       assert 4 == 5

tests/test_math.py:5: AssertionError
=========================== short test summary info ============================
FAILED tests/test_math.py::test_add - assert 4 == 5
======================== 1 failed, 2 passed in 0.05s =========================
`;

function fakeRunner(script: (executable: string, args: string[]) => CommandResult): CommandRunner {
  return async (executable, args) => script(executable, args);
}

async function main() {
  console.log("=== L.E.O. SOFTWARE-ENGINEERING-TOOLS TEST ===");

  // 1. analyzeFailure correctly parses Jest output
  {
    const summary = analyzeFailure(JEST_FAILURE_OUTPUT, "");
    if (summary.framework !== "jest") throw new Error("Expected Jest to be detected.");
    if (summary.failed !== 1 || summary.passed !== 2 || summary.total !== 3) {
      throw new Error(`Unexpected Jest summary counts: ${JSON.stringify(summary)}`);
    }
    if (summary.failures.length !== 1 || !summary.failures[0].test.includes("adds two numbers")) {
      throw new Error(`Unexpected Jest failure list: ${JSON.stringify(summary.failures)}`);
    }
    console.log("PASS: analyzeFailure parses Jest failure output.");
  }

  // 2. analyzeFailure correctly parses pytest output
  {
    const summary = analyzeFailure(PYTEST_FAILURE_OUTPUT, "");
    if (summary.framework !== "pytest") throw new Error("Expected pytest to be detected.");
    if (summary.failed !== 1 || summary.passed !== 2) {
      throw new Error(`Unexpected pytest summary counts: ${JSON.stringify(summary)}`);
    }
    if (summary.failures.length !== 1 || !summary.failures[0].test.includes("test_math.py::test_add")) {
      throw new Error(`Unexpected pytest failure list: ${JSON.stringify(summary.failures)}`);
    }
    console.log("PASS: analyzeFailure parses pytest failure output.");
  }

  // 3. analyzeFailure returns "unknown" for unrecognized output
  {
    const summary = analyzeFailure("some random build log with no test summary", "");
    if (summary.framework !== "unknown") throw new Error("Expected unrecognized output to report framework 'unknown'.");
    console.log("PASS: analyzeFailure reports 'unknown' for unrecognized output instead of guessing.");
  }

  // 4. runTests: allow-listed executable is accepted, analysis is attached
  {
    const runner = fakeRunner((executable, args) => {
      if (executable !== "npx" || args[0] !== "jest") throw new Error("Unexpected command shape.");
      return { stdout: JEST_FAILURE_OUTPUT, stderr: "", exitCode: 1 };
    });
    const outcome = await runTests({ executable: "npx", args: ["jest"] }, runner);
    if (outcome.succeeded) throw new Error("Expected a non-zero exit code to be reported as not succeeded.");
    if (outcome.analysis.framework !== "jest") throw new Error("Expected the test run outcome to include Jest analysis.");
    console.log("PASS: runTests executes an allow-listed command and attaches failure analysis.");
  }

  // 5. runTests: non-allow-listed executable is rejected before any command runs
  {
    let threw = false;
    let runnerCalled = false;
    const runner = fakeRunner(() => {
      runnerCalled = true;
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    try {
      await runTests({ executable: "rm" }, runner);
    } catch {
      threw = true;
    }
    if (!threw || runnerCalled) throw new Error("Expected a non-allow-listed executable to be rejected without running anything.");
    console.log("PASS: runTests rejects a non-allow-listed executable without invoking the runner.");
  }

  // 6. runTests: rejects shell metacharacters in extra args
  {
    let threw = false;
    try {
      await runTests({ executable: "npm", args: ["&& rm -rf /"] }, fakeRunner(() => ({ stdout: "", stderr: "", exitCode: 0 })));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected shell metacharacters in extra args to be rejected.");
    console.log("PASS: runTests rejects shell metacharacters in extra arguments.");
  }

  // 7. runTests: cwd is confined to LEO_ROOT
  {
    let threw = false;
    try {
      await runTests({ executable: "npm", cwd: "/etc" }, fakeRunner(() => ({ stdout: "", stderr: "", exitCode: 0 })));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected a cwd outside LEO_ROOT to be rejected.");
    console.log("PASS: runTests confines the working directory to LEO_ROOT.");
  }

  // 8. runBuild: success path with an allow-listed build command
  {
    const runner = fakeRunner((executable, args) => {
      if (executable !== "npm" || args.join(" ") !== "run build") throw new Error("Unexpected build command.");
      return { stdout: "build complete", stderr: "", exitCode: 0 };
    });
    const outcome = await runBuild({ executable: "npm" }, runner);
    if (!outcome.succeeded) throw new Error("Expected the build to be reported as successful.");
    if (outcome.cwd !== path.resolve(LEO_ROOT)) throw new Error("Expected the default cwd to be LEO_ROOT.");
    console.log("PASS: runBuild executes an allow-listed build command in LEO_ROOT by default.");
  }

  console.log("\n=== SOFTWARE-ENGINEERING-TOOLS TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
