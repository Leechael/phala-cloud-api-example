# deploy-dstack-v051

This is an example of launching a new CVM or updating the CVM on the Dstack 0.5.1 testnet node. This is a backward-compatible workaround, as no Dstack 0.5.1 public nodes are available for public use.

To use the scripts in the repo, you need the following tools:
- [bun](https://bun.sh/)
- [cast](https://getfoundry.sh/)

## Update CVM

To update a CVM, you need three steps:
1. Provision the update.
2. Register the compose hash on-chain.
3. Deploy the update.

Let's say the VM UUID is `<UUID>`. Your updated docker-compose.yml can be found in `<DOCKER_COMPOSE>`, run this command first:

```shell
bun run update/step1-provision.ts --env <DOTENV> <UUID> <DOCKER_COMPOSE>
```

Note: `<DOTENV>` is optional if no environment variables are updated:

```shell
bun run update/step1-provision.ts <UUID> <DOCKER_COMPOSE>
```

You'll see a similar message once provisioning succeeds:

```shell
The update has been provisioned, you need to execute the following command to deploy the update:
Step 1: register the compose_hash on chain:
cast send --rpc-url $RPC_URL --private-key $PRIVATE_KEY <CONTRACT_ADDRESS> 'addComposeHash(bytes32)' <COMPOSE_HASH>
Step 2: deploy the update:
bun run update/step2-deploy.ts <UUID> <COMPOSE_HASH> --env <DOTENV>
```

The message guides the next steps. First, export `RPC_URL` and `PRIVATE_KEY` as environment variables; if you don't have an `RPC_URL`, since the testnet relies on Base, you can use `https://mainnet.base.org`.

## Deploy

TODO