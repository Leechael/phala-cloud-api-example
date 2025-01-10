import { readFileSync } from "fs";
import { join, dirname } from "path";
import { ofetch } from "ofetch";
import { x25519 } from "@noble/curves/ed25519";
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { webcrypto } from 'crypto';

const crypto = webcrypto;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const characterPath = join(__dirname, '..', 'c3po.character.json');
const characterData = readFileSync(characterPath, 'utf-8');
const characterDataBase64 = Buffer.from(characterData).toString('base64');


const request = ofetch.create({
  baseURL: 'https://cloud-api.phala.network/api/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.PHALA_CLOUD_API_KEY,
  },
});

export async function deploy({ teepodId, image }) {
  const docker_compose = `
services:
  eliza:
    image: phalanetwork/eliza:v0.1.7-alpha.2
    container_name: eliza
    command:
      - /bin/sh
      - -c
      - |
        cd /app
        echo \$\${CHARACTER_DATA} | base64 -d > characters/c3po.character.json
        pnpm run start --non-interactive --character=characters/c3po.character.json
    ports:
      - "3000:3000"
    volumes:
      - /var/run/tappd.sock:/var/run/tappd.sock
      - tee:/app/db.sqlite
    environment:
      - TEE_MODE=PRODUCTION
      - REDPILL_API_KEY=\${REDPILL_API_KEY}
      - REDPILL_MODEL=gpt-4o-mini
      - TELEGRAM_BOT_TOKEN=\${TELEGRAM_BOT_TOKEN}
      - CHARACTER_DATA=\${CHARACTER_DATA}
    restart: always

volumes:
    tee:`;

  const vm_config = {
    name: `my-eliza`,
    compose_manifest: {
      name: `my-eliza`,
      features: ['kms', 'tproxy-net'],
      docker_compose_file: docker_compose,
    },
    vcpu: 2,
    memory: 8192,
    disk_size: 40,
    teepod_id: teepodId,
    image: image,
    advanced_features: {
      tproxy: true,
      kms: true,
      public_sys_info: true,
      public_logs: true,
      docker_config: {
        password: '',
        registry: null,
        username: '',
      },
      listed: false,
    }
  }

  const encrypted_envs = [
    {
      key: 'REDPILL_API_KEY',
      value: process.env.REDPILL_API_KEY,
    },
    {
      key: 'TELEGRAM_BOT_TOKEN',
      value: process.env.TELEGRAM_BOT_TOKEN,
    },
    {
      key: 'CHARACTER_DATA',
      value: characterDataBase64,
    },
  ]

  const requiredEnvVars = ['REDPILL_API_KEY', 'TELEGRAM_BOT_TOKEN'];
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

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
    if (error.response?.status === 422) {
      console.error('Failed to deploy CVM (422):', JSON.stringify(error.response._data, null, 2))
    } else {
      console.error('Failed to deploy CVM:', error)
    }
  }
}

// Convert hex string to Uint8Array
function hexToUint8Array(hex) {
  hex = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array(
    hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)),
  );
}

function uint8ArrayToHex(buffer) {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Encrypt environment variables
async function encryptEnvVars(envs, publicKeyHex) {
  // Prepare environment data
  const envsJson = JSON.stringify({ env: envs });

  // Generate private key and derive public key
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);

  // Generate shared key
  const remotePubkey = hexToUint8Array(publicKeyHex);
  const shared = x25519.getSharedSecret(privateKey, remotePubkey);

  // Import shared key for AES-GCM
  const importedShared = await crypto.subtle.importKey(
    "raw",
    shared,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );

  // Encrypt the data
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    importedShared,
    new TextEncoder().encode(envsJson),
  );

  // Combine all components
  const result = new Uint8Array(
    publicKey.length + iv.length + encrypted.byteLength,
  );

  result.set(publicKey);
  result.set(iv, publicKey.length);
  result.set(new Uint8Array(encrypted), publicKey.length + iv.length);

  return uint8ArrayToHex(result);
}

export default async function main() {
  const defaultConfig = {
    teepodId: 2,
    image: 'dstack-dev-0.3.4'
  };

  try {
    const response = await deploy(defaultConfig);
    console.log('Deployment successful:', response);
    return response;
  } catch (error) {
    console.error('Deployment failed:', error);
    throw error;
  }
}

// 如果直接运行此文件，则执行 main
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(process.exit);
}