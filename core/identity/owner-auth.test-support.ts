import {
  createHash
} from "node:crypto";

import {
  OwnerAuthenticator
} from "./owner-auth.ts";

export const TEST_OWNER_AUTH_TOKEN =
  "leo-test-owner-auth-token";

export function createTestOwnerAuthenticator(
  ownerId = "test-owner"
): OwnerAuthenticator {

  return new OwnerAuthenticator({
    ownerId,

    tokenSha256:
      createHash("sha256")
        .update(
          TEST_OWNER_AUTH_TOKEN,
          "utf8"
        )
        .digest("hex")
  });
}
