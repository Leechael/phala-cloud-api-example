import fs from 'fs';
import arg from "arg";
import { FetchError } from 'ofetch'
import { createClient, commitCvmProvision, encryptEnvVars, getAppEnvEncryptPubKey } from "@phala/cloud";


const typed: Parameters<typeof arg>[0] = {
  '--app-id': String,
  '--compose-hash': String,
  '--contract-address': String,
  '--env': String,
}

async function main(args: arg.Result<typeof typed>) {
  if (!args?.['--app-id'] || !args?.['--compose-hash'] || !args?.['--contract-address']) {
    console.error('Usage: bun run step2-deploy.ts --app-id <app-id> --compose-hash <compose-hash> --contract-address <contract-address>');
    return;
  }
  let app_id: string = args['--app-id']!;
  let compose_hash: string = args['--compose-hash']!;
  let contract_address: string = args['--contract-address']!;

  if (app_id.startsWith('0x')) {
    app_id = app_id.slice(2);
  }

  const kms = 'testnet-kms-1';

  const client = createClient();
  const key_info = await getAppEnvEncryptPubKey(client, { app_id, kms });

  let envs: {key: string, value: string}[] = [];
  let env_keys = [];
  if (args?.['--env']) {
    if (!fs.existsSync(args?.['--env'])) {
      console.error(`DotEnv file not found: ${args?.['--env']}`);
      return;
    }
    const env_file = fs.readFileSync(args?.['--env'], 'utf-8');
    const env_lines = env_file.split('\n');
    for (const line of env_lines) {
      const [key, value] = line.split('=');
      if (key && value) {
        envs.push({ key, value: value ? `${value.trim()}` : "" })
        env_keys.push(key);
      }
    }
  }
  const encrypted_env_vars = await encryptEnvVars(envs, key_info.public_key);

  const cvm_info = await commitCvmProvision(client, {
      app_id,
      encrypted_env: encrypted_env_vars,
      compose_hash,
      env_keys,
      contract_address,
  });
  console.log('Deploy request sent. Your CVM info:')
  console.log('CVM UUID: ', cvm_info.vm_uuid);
  console.log('CVM APP ID: ', cvm_info.app_id);
  console.log(`You can check the CVM deploying status in the WebUI https://cloud.phala.network/admin/cvms/${cvm_info.vm_uuid}#tab=basic`);
}

main(arg(typed)).then(() => {
  process.exit(0);
}).catch((error) => {
  if (error instanceof FetchError) {
    console.error(error.response?._data);
  } else {
    console.trace(error);
  }
  process.exit(1);
});