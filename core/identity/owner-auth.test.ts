import {
  createHash
} from "node:crypto";

import {
  OwnerAuthenticator
} from "./owner-auth.ts";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `OWNER AUTH TEST FAILURE: ${message}`
    );
  }
}

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. OWNER AUTHENTICATION FOUNDATION TEST ==="
  );

  const ownerId =
    "test-owner";

  const token =
    "leo-test-owner-token";

  const tokenSha256 =
    createHash("sha256")
      .update(
        token,
        "utf8"
      )
      .digest("hex");

  const authenticator =
    new OwnerAuthenticator({
      ownerId,
      tokenSha256
    });

  console.log(
    "[1] Correct token..."
  );

  const valid =
    authenticator.authenticate(
      token
    );

  assert(
    valid.authenticated === true,
    "Correct token was rejected."
  );

  assert(
    valid.ownerId === ownerId,
    "Authenticated ownerId is incorrect."
  );

  assert(
    valid.method === "token",
    "Authentication method is incorrect."
  );

  console.log(
    "PASS: Correct token authenticated."
  );

  console.log(
    "[2] Wrong token..."
  );

  const wrong =
    authenticator.authenticate(
      "wrong-token"
    );

  assert(
    wrong.authenticated === false,
    "Wrong token was accepted."
  );

  assert(
    wrong.ownerId === undefined,
    "Wrong token exposed ownerId."
  );

  console.log(
    "PASS: Wrong token denied."
  );

  console.log(
    "[3] Missing token..."
  );

  const missing =
    authenticator.authenticate();

  assert(
    missing.authenticated === false,
    "Missing token was accepted."
  );

  console.log(
    "PASS: Missing token denied."
  );

  console.log(
    "[4] Invalid hash configuration..."
  );

  let rejected =
    false;

  try {
    new OwnerAuthenticator({
      ownerId,
      tokenSha256:
        "invalid"
    });
  } catch {
    rejected = true;
  }

  assert(
    rejected,
    "Invalid hash configuration was accepted."
  );

  console.log(
    "PASS: Invalid configuration denied."
  );

  console.log(
    "=== L.E.O. OWNER AUTHENTICATION FOUNDATION TEST PASSED ==="
  );
}

main().catch(
  error => {
    console.error(error);
    process.exit(1);
  }
);
