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


export default async function main() {
  // TODO: Replace with your app id, the following is an example and show you how it looks like
  const app_id = 'app_31032d970dacb0f34357b8830876e30c880a7442'

  // Step 1: Get current compose manifest
  const resp = await request(`/cvms/${app_id}/compose`)
  console.log(resp)

  // Step 2: Adjust the compose file
  const compose_file = resp.compose_file
  compose_file.pre_launch_script = `
#!/bin/bash
echo "--------------------------------"
echo "Hello again, DSTACK!"
echo "--------------------------------"
echo
env
echo "--------------------------------"
  `

  // Step 3(optional): Encrypt environment variables (only if you need to update env vars)
  const encrypted_envs = [
    {
      key: 'FOO',
      value: 'BAR',
    },
  ]
  const encrypted_env = await encryptEnvVars(
    encrypted_envs,
    resp.env_pubkey,
  );

  // Step 4: Update the compose file
  const response = await request(`/cvms/${app_id}/compose`, {
    method: "PUT",
    body: {
      compose_manifest: compose_file,
      encrypted_env,
    },
  });
  console.log(response)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(process.exit);
}