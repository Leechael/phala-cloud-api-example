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

export default async function main(app_id) {
  const data = await request(`/apps/${app_id}/cvms`);
  for (const cvm of data) {
    console.log(cvm.hosted.id, cvm.node.name, cvm.node.region_identifier, cvm.name)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = arg({});

  if (args['_'].length !== 1) {
    console.error('Usage: node list-replicas.mjs <app_id>')
    process.exit(1)
  }

  main(args['_'][0]).catch(err => {
    console.error(err)
    if (err instanceof FetchError) {
      console.error(err.response?._data)
    }
    process.exit(1)
  });
}