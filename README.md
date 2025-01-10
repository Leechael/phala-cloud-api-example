# Quick memo of Deploy Eliza in Phala Cloud

1. Parse the `docker-compose.yml` into the editor.
2. Choose `TEE Pro` since Eliza need at least 4 cores & 8Gb memory.
3. Setup end-to-end encrypted variables.

For the `CHARACTER_DATA`:

```shell
cat characters/c3po.character.json | base64 -w 0 && echo
```
