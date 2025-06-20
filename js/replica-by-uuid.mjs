import { ofetch, FetchError } from "ofetch";
import dotenv from 'dotenv';
import arg from 'arg';
import { encryptEnvVars } from '@phala/dstack-sdk/encrypt-env-vars';

dotenv.config();

const request = ofetch.create({
  baseURL: process.env.PHALA_CLOUD_API_ENDPOINT || 'https://cloud-api.phala.network/api/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.PHALA_CLOUD_API_KEY,
  },
});

export default async function main(vm_uuid, teepod_id, with_env) {
  if (!vm_uuid) {
    console.error('vm_uuid is required')
    process.exit(1)
  }
  vm_uuid = vm_uuid.replace(/-/g, '')

  const body = {}
  if (teepod_id) {
    body.teepod_id = teepod_id
  }

  if (with_env) {
    const vm_config = await request(`/cvms/${vm_uuid}/compose`)
    const encrypted_envs = [
      {
        key: 'FOO',
        value: `${new Date().toISOString()}`,
      },
    ]
    const encrypted_env = await encryptEnvVars(
      encrypted_envs,
      vm_config.env_pubkey,
    );
    body.encrypted_env = encrypted_env
  }

  console.log("Final body:", body)

  const response = await request(`/cvms/${vm_uuid}/replicas`, {
    method: "POST",
    body,
  });
  console.log(response)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = arg(
    {
      '--vm-uuid': String,
      '--teepod-id': Number,
      '--with-env': Boolean,
    }
  );

  main(args['--vm-uuid'], args['--teepod-id'], args['--with-env']).catch(err => {
    console.error(err)
    if (err instanceof FetchError) {
      console.error(err.response?._data)
    }
    process.exit(1)
  });
}