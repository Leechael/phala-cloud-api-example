import os
import json
import base64
import secrets
from pathlib import Path
from typing import List, Dict, Any

import httpx
from dotenv import load_dotenv
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Initialize environment
load_dotenv()

# Read character data
character_path = Path(__file__).parent.parent / 'c3po.character.json'
character_data = character_path.read_text()
character_data_base64 = base64.b64encode(character_data.encode()).decode()

# API client setup
class PhalaCVMClient:
    def __init__(self, base_url: str = "https://cloud-api.phala.network/api/v1"):
        self.base_url = base_url
        self.client = httpx.Client(
            base_url=base_url,
            headers={
                'Content-Type': 'application/json',
                'x-api-key': os.getenv('PHALA_CLOUD_API_KEY'),
            }
        )

    def get_pubkey(self, vm_config: Dict[str, Any]) -> Dict[str, str]:
        response = self.client.post("/cvms/pubkey/from_cvm_configuration", json=vm_config)
        response.raise_for_status()
        return response.json()

    def create_vm(self, config: Dict[str, Any]) -> Dict[str, Any]:
        response = self.client.post("/cvms/from_cvm_configuration", json=config)
        response.raise_for_status()
        return response.json()

def encrypt_env_vars(envs: List[Dict[str, str]], public_key_hex: str) -> str:
    # Convert environment variables to JSON
    envs_json = json.dumps({"env": envs})

    # Generate private key and get public key
    private_key = x25519.X25519PrivateKey.generate()
    public_key = private_key.public_key()
    my_public_bytes = public_key.public_bytes_raw()

    # Convert remote public key from hex and create public key object
    remote_public_key_bytes = bytes.fromhex(public_key_hex.replace("0x", ""))
    remote_public_key = x25519.X25519PublicKey.from_public_bytes(remote_public_key_bytes)

    # Generate shared key
    shared_key = private_key.exchange(remote_public_key)

    # Generate random IV
    iv = secrets.token_bytes(12)

    # Encrypt data
    aesgcm = AESGCM(shared_key)
    encrypted_data = aesgcm.encrypt(iv, envs_json.encode(), None)

    # Combine all components
    result = my_public_bytes + iv + encrypted_data
    return result.hex()

async def deploy(teepod_id: int, image: str) -> Dict[str, Any]:
    docker_compose = """
services:
  eliza:
    image: phalanetwork/eliza:v0.1.7-alpha.2
    container_name: eliza
    command:
      - /bin/sh
      - -c
      - |
        cd /app
        echo $${CHARACTER_DATA} | base64 -d > characters/c3po.character.json
        pnpm run start --non-interactive --character=characters/c3po.character.json
    ports:
      - "3000:3000"
    volumes:
      - /var/run/tappd.sock:/var/run/tappd.sock
      - tee:/app/db.sqlite
    environment:
      - TEE_MODE=PRODUCTION
      - REDPILL_API_KEY=${REDPILL_API_KEY}
      - REDPILL_MODEL=gpt-4o-mini
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - CHARACTER_DATA=${CHARACTER_DATA}
    restart: always

volumes:
    tee:"""

    vm_config = {
        "name": "my-eliza",
        "compose_manifest": {
            "name": "my-eliza",
            "features": ["kms", "tproxy-net"],
            "docker_compose_file": docker_compose,
        },
        "vcpu": 2,
        "memory": 8192,
        "disk_size": 40,
        "teepod_id": teepod_id,
        "image": image,
        "advanced_features": {
            "tproxy": True,
            "kms": True,
            "public_sys_info": True,
            "public_logs": True,
            "docker_config": {
                "password": "",
                "registry": None,
                "username": "",
            },
            "listed": False,
        }
    }

    encrypted_envs = [
        {
            "key": "REDPILL_API_KEY",
            "value": os.getenv("REDPILL_API_KEY"),
        },
        {
            "key": "TELEGRAM_BOT_TOKEN",
            "value": os.getenv("TELEGRAM_BOT_TOKEN"),
        },
        {
            "key": "CHARACTER_DATA",
            "value": character_data_base64,
        },
    ]

    required_env_vars = ["REDPILL_API_KEY", "TELEGRAM_BOT_TOKEN"]
    missing_env_vars = [key for key in required_env_vars if not os.getenv(key)]
    
    if missing_env_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_env_vars)}")

    try:
        client = PhalaCVMClient()
        
        # Step 1: Get encryption public key
        with_pubkey = client.get_pubkey(vm_config)

        # Step 2: Encrypt environment variables
        encrypted_env = encrypt_env_vars(
            encrypted_envs,
            with_pubkey["app_env_encrypt_pubkey"],
        )

        # Step 3: Create VM with encrypted environment variables
        response = client.create_vm({
            **vm_config,
            "encrypted_env": encrypted_env,
            "app_env_encrypt_pubkey": with_pubkey["app_env_encrypt_pubkey"],
            "app_id_salt": with_pubkey["app_id_salt"],
        })

        return response
    except httpx.HTTPError as error:
        if error.response and error.response.status_code == 422:
            print('Failed to deploy CVM (422):', json.dumps(error.response.json(), indent=2))
        else:
            print('Failed to deploy CVM:', str(error))
        raise

async def main():
    default_config = {
        "teepod_id": 2,
        "image": "dstack-dev-0.3.4"
    }

    try:
        response = await deploy(**default_config)
        print('Deployment successful:', response)
        return response
    except Exception as error:
        print('Deployment failed:', str(error))
        raise

if __name__ == "__main__":
    import asyncio
    asyncio.run(main()) 