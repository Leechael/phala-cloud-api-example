import fs from 'fs';
import arg from "arg";
import { FetchError } from 'ofetch'
import { createClient, getKmsInfo, provisionCvm } from "@phala/cloud";

const typed: Parameters<typeof arg>[0] = {
  '--name': String,
  '--vcpu': Number,
  '--memory': Number,
  '--disk-size': Number,
}

async function main(args: arg.Result<typeof typed>) {
  const docker_compose_file_path = args?._?.[0];
  if (!docker_compose_file_path) {
    console.log('Usage: bun run step1-provision.ts <path-to-docker-compose.yml>');
    return;
  }
  if (!fs.existsSync(docker_compose_file_path)) {
    console.error(`File not found: ${docker_compose_file_path}`);
    return;
  }

  let default_name = process.cwd().split('/').pop()!;
  let name = args?.name ?? default_name;
  if (name.length > 20) {
    name = name.slice(0, 20);
  }

  const image = 'dstack-0.5.1'
  const node_id = 7;
  const kms = 'testnet-kms-1';

  const docker_compose_file = fs.readFileSync(docker_compose_file_path, 'utf-8');

  const client = createClient();
  const kms_info = await getKmsInfo(client, { kms_id: kms });
  const ressult = await provisionCvm(client, {
      name,
      image,
      vcpu: args?.vcpu ?? 1,
      memory: args?.memory ?? 1024,
      disk_size: args?.disk_size ?? 40,
      compose_file: { docker_compose_file },
      node_id,
      kms_id: kms,
  });
  console.log(`Provision succeed!`);
  console.log('fmspec: ', ressult.fmspec);
  console.log('device_id: ', ressult.device_id);
  console.log('os_image_hash: ', ressult.os_image_hash);
  console.log('compose_hash: ', ressult.compose_hash);
  console.log('\n', '--------------------------------');
  console.log('Next Step: register your app on KMS.');
  console.log('Please replace PRIVATE_KEY with your private key and RPC_URL with the testnet RPC URL');
  console.log(`cast send --rpc-url <RPC_URL> --private-key <PRIVATE_KEY> \\`);
  console.log(`  ${kms_info.kms_contract_address} \\`); // KMS contract address
  console.log(`  'deployAndRegisterApp(address,bool,bool,bytes32,bytes32)' \\`);
  console.log(`  $(cast wallet address <PRIVATE_KEY>) \\`); // initialOwner - derived from private key
  console.log(`  false \\`); // disabledUpgrade
  console.log(`  false \\`); // allowAnyDevice  
  console.log(`  ${ressult.device_id} \\`); // deviceId
  console.log(`  ${ressult.compose_hash}`); // composeHash
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