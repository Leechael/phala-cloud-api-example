import fs from 'fs';
import arg from "arg";
import { FetchError } from 'ofetch'
import { createClient, getCvmInfo, getCvmComposeFile, provisionCvmComposeFileUpdate, type ProvisionCvmComposeFileUpdateRequest } from "@phala/cloud";

const typed: Parameters<typeof arg>[0] = {
  "--env": String,
}

async function main(args: arg.Result<typeof typed>) {
  const cvm_id = args?._?.[0];
  const compose_file_path = args?._?.[1];
  if (!cvm_id || !compose_file_path) {
    console.error('Usage: bun run step1-provision.ts <cvm-id> <compose-file-path>');
    return;
  }

  if (!fs.existsSync(compose_file_path)) {
    console.error(`File not found: ${compose_file_path}`);
    return;
  }

  const compose_file = fs.readFileSync(compose_file_path, 'utf-8');

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
        env_keys.push(key);
      }
    }
  }

  const client = createClient();
  const [cvm_info, app_compose] = await Promise.all([
    getCvmInfo(client, { id: cvm_id }, { schema: false }) as Promise<{ app_id: string, contract_address: string }>,
    getCvmComposeFile(client, { id: cvm_id }),
  ]);

  app_compose.docker_compose_file = compose_file;
  app_compose.allowed_envs = env_keys;

  const resp = await provisionCvmComposeFileUpdate(client, {
    id: cvm_id,
    app_compose: app_compose as ProvisionCvmComposeFileUpdateRequest['app_compose'],
  })

  console.log('The update has been provisioned, you need to execute the following command to deploy the update:')
  console.log('Step 1: register the compose_hash on chain:\n')
  console.log(`cast send --rpc-url $RPC_URL --private-key $PRIVATE_KEY ${cvm_info.contract_address} 'addComposeHash(bytes32)' ${resp.compose_hash}`);
  console.log('Step 2: deploy the update:\n')
  console.log(`bun run update/step2-deploy.ts ${cvm_id} ${resp.compose_hash} --env ${args?.['--env']}`);
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