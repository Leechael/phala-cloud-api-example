import { ofetch } from "ofetch";
import dotenv from 'dotenv';
import { encryptEnvVars } from '@phala/dstack-sdk/encrypt-env-vars';
import fs from 'fs';

dotenv.config();

const request = ofetch.create({
  baseURL: process.env.PHALA_CLOUD_API_ENDPOINT || 'https://cloud-api.phala.network/api/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.PHALA_CLOUD_API_KEY,
  },
});

// interface ProvisionPayload {
//   name: string;
//   image?: string;
//   characterfile: string;
//   env_keys: string[];
// }

// interface ProvisionResponse {
//   app_id: string;
//   app_env_encrypt_pubkey: string;
//   app_id_salt?: string;
// }

// interface CreateVMResponse {
//   app_id: string;
//   encrypted_env: string;
// }

export async function deploy() {
  const encrypted_envs = [
    {
      key: 'FOO',
      value: 'BAR',
    },
  ]

  //
  // Step 1: Provision for Eliza
  //
  // Image could be one of the following:
  // - phalanetwork/eliza:v0.1.8-alpha.1
  // - phalanetwork/eliza:v0.1.7-alpha.2
  // - phalanetwork/eliza:v0.1.6-alpha.4
  const image = "phalanetwork/eliza:v0.1.8-alpha.1"
  const characterfile = JSON.parse(fs.readFileSync('./c3po.character.json', 'utf8'))
  // @type {ProvisionPayload}
  const provision_payload = {
    name: "my-awesome-eliza",
    image,
    characterfile: JSON.stringify(characterfile),
    // Phala Cloud only keeps the key list, and no environment variable values will
    // be stored on the server. This approach allows the server to remember which
    // keys a user has set, so the UI can remind users to set them when updating.
    env_keys: encrypted_envs.map((i) => i.key),
  }
  const provision_data = await request("/cvms/provision/eliza", {
    method: "POST",
    body: provision_payload,
  });

  //
  // Step 2: Encrypted environment variables
  //
  encrypted_envs.push({
    key: "CHARACTER_DATA",
    value: Buffer.from(JSON.stringify(characterfile)).toString("base64"),
  });
  const encrypted_env = await encryptEnvVars(
    encrypted_envs,
    provision_data.app_env_encrypt_pubkey,
  );

  //
  // Step 3: Create VM with encrypted environment variables
  //
  const created_data = await request("/cvms", {
    method: "POST",
    body: {
      app_id: provision_data.app_id,
      encrypted_env,
    },
  });

  return created_data;
}

export default async function main() {
  try {
    const response = await deploy();
    console.log('Deployment successful:', response);
    return response;
  } catch (error) {
    console.error('Deployment failed:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(process.exit);
}