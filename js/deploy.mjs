import { ofetch } from "ofetch";
import dotenv from 'dotenv';
import { encryptEnvVars } from '@phala/dstack-sdk/encrypt-env-vars';

dotenv.config();

const request = ofetch.create({
  baseURL: process.env.PHALA_CLOUD_API_ENDPOINT || 'https://cloud-api.phala.network/api/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.PHALA_CLOUD_API_KEY,
  },
});

export async function deploy({ teepodId, image }) {
  const docker_compose = `
services:
  demo:
    image: leechael/phala-cloud-bun-starter:0.2.1.patched-1
    container_name: demo
    ports:
      - "3000:3000"
    volumes:
      - /var/run/tappd.sock:/var/run/tappd.sock
    environment:
      - FOO=\${FOO}
`;

  // Optional.
  const pre_launch_script = `
#!/bin/bash
echo "--------------------------------"
echo "Hello, DSTACK!"
echo "--------------------------------"
echo "Just echo the environment variables:"
env
echo
echo "--------------------------------"
  `;

  const vm_config = {
    name: `test`,
    compose_manifest: {
      docker_compose_file: docker_compose,
      // pre_launch_script: pre_launch_script,
      name: `test-env3`,
    },
    vcpu: 1,
    memory: 1024,
    disk_size: 10,
    teepod_id: teepodId,
    image: image,
  }

  const encrypted_envs = [
    {
      key: 'FOO',
      value: 'BAR',
    },
  ]

  try {
    // Step 1: Get encryption public key
    const with_pubkey = await request(
      "/cvms/pubkey/from_cvm_configuration",
      {
        method: "POST",
        body: vm_config,
      },
    );

    // Step 2: Encrypt environment variables
    const encrypted_env = await encryptEnvVars(
      encrypted_envs,
      with_pubkey.app_env_encrypt_pubkey,
    );

    // Step 3: Create VM with encrypted environment variables
    const response = await request("/cvms/from_cvm_configuration", {
      method: "POST",
      body: {
        ...vm_config,
        encrypted_env,
        app_env_encrypt_pubkey: with_pubkey.app_env_encrypt_pubkey,
        app_id_salt: with_pubkey.app_id_salt,
      },
    });

    return response
  } catch (error) {
    if (error.response?.status === 422 || error.response?.status === 400) {
      console.error(`Failed to deploy CVM (${error.response?.status}):`, JSON.stringify(error.response._data, null, 2))
    } else {
      console.error('Failed to deploy CVM:', error)
    }
  }
}

export default async function main() {
  const resp = await request('/teepods/available')
  if (!resp.nodes?.length) {
    console.error('No available teepods');
    process.exit(1);
  }
  const node = resp.nodes[0];
  const image = node.images[0];

  try {
    const response = await deploy({ teepodId: node.teepod_id, image: image.name });
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