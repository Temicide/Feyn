import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";
import { createApp } from "../server/main.js";
import { openStore } from "../server/store.js";

let app: Express | undefined;
export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    app ??= createApp(openStore(process.env));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "The server configuration is incomplete.",
      }),
    );
    return;
  }
  app(req, res);
}
