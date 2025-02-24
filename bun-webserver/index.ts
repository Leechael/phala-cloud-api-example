import { serve } from "bun";
import { TappdClient } from "@phala/dstack-sdk";

serve({
  port: process.env.PORT || 3000,

  routes: {
    "/api/status": new Response("OK"),

    "/api/tdx_quote": async (req) => {
      const client = new TappdClient();
      const result = await client.tdxQuote('hello', 'raw');
      return new Response(JSON.stringify(result));
    },

    "/api/derive_key": async (req) => {
      const client = new TappdClient();
      const result = await client.deriveKey('example');
      return new Response(JSON.stringify(result));
    },

    "/api/info": async (req) => {
      const client = new TappdClient();
      const result = await client.info();
      return new Response(JSON.stringify(result));
    },
  },
});
