import {
  createHash,
  timingSafeEqual
} from "node:crypto";

export interface OwnerAuthContext {
  authenticated: boolean;
  ownerId?: string;
  method: "token" | "none";
}

export interface OwnerAuthConfig {
  ownerId: string;
  tokenSha256: string;
}

function validateConfig(
  config: OwnerAuthConfig
): void {
  if (
    typeof config.ownerId !== "string" ||
    config.ownerId.trim().length === 0
  ) {
    throw new Error(
      "Owner authentication ownerId is required."
    );
  }

  if (
    !/^[a-f0-9]{64}$/i.test(
      config.tokenSha256
    )
  ) {
    throw new Error(
      "Owner authentication tokenSha256 must be a 64-character SHA-256 hex digest."
    );
  }
}

export class OwnerAuthenticator {

  private readonly ownerId: string;
  private readonly expectedHash: Buffer;

  constructor(
    config: OwnerAuthConfig
  ) {
    validateConfig(config);

    this.ownerId =
      config.ownerId.trim();

    this.expectedHash =
      Buffer.from(
        config.tokenSha256.trim(),
        "hex"
      );
  }

  authenticate(
    token?: string
  ): OwnerAuthContext {

    if (
      typeof token !== "string" ||
      token.length === 0
    ) {
      return {
        authenticated:
          false,
        method:
          "none"
      };
    }

    const presentedHash =
      createHash("sha256")
        .update(
          token,
          "utf8"
        )
        .digest();

    const authenticated =
      timingSafeEqual(
        presentedHash,
        this.expectedHash
      );

    if (!authenticated) {
      return {
        authenticated:
          false,
        method:
          "none"
      };
    }

    return {
      authenticated:
        true,
      ownerId:
        this.ownerId,
      method:
        "token"
    };
  }
}
