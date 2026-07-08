// Encrypt a value for a GitHub Actions secret.
//
// GitHub requires secrets to be encrypted with the repository's public key
// using libsodium's sealed box before upload. This isolates the libsodium
// import so the rest of the GitHub helpers stay dependency-light.

import sodium from "libsodium-wrappers";

/**
 * Seal `secretValue` for the given repository public key (base64), returning
 * the base64 ciphertext GitHub expects in the secret PUT body.
 */
export async function encryptRepoSecret(
  publicKeyBase64: string,
  secretValue: string,
): Promise<string> {
  await sodium.ready;

  const publicKey = sodium.from_base64(
    publicKeyBase64,
    sodium.base64_variants.ORIGINAL,
  );
  const message = sodium.from_string(secretValue);
  const sealed = sodium.crypto_box_seal(message, publicKey);

  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}
