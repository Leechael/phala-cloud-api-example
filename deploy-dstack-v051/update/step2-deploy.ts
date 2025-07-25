import fs from 'fs';
import arg from "arg";
import { FetchError } from 'ofetch'
import { createClient, getCvmInfo, getCvmComposeFile, commitCvmComposeFileUpdate, encryptEnvVars, type CommitCvmComposeFileUpdateRequest, getAppEnvEncryptPubKey } from "@phala/cloud";

const typed: Parameters<typeof arg>[0] = {
  '--env': String,
}

async function main(args: arg.Result<typeof typed>) {
  if (!args?._?.[0] || !args?._?.[1]) {
    console.error('Usage: bun run step2-deploy.ts <cvm-id> <compose-hash>');
    return;
  }

  const cvm_id = args?._?.[0];
  const compose_hash = args?._?.[1];

  const client = createClient();
  const cvm_info = await getCvmInfo(client, { id: cvm_id }, { schema: false }) as { app_id: string };
  const key_info = await getAppEnvEncryptPubKey(client, { app_id: cvm_info.app_id, kms: 'testnet-kms-1' });

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

  await commitCvmComposeFileUpdate(client, {
    // @ts-ignore
    id: cvm_id,
    // app_id: cvm_info.app_id,
    compose_hash,
    encrypted_env: encrypted_env_vars,
    env_keys,
  })

  console.log('The update has been deployed, you can view it via dashboard: ')
  console.log(`https://cloud.phala.network/dashboard/cvms/${cvm_id}`);
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