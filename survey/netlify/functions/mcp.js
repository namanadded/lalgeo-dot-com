import path from "node:path";
import { pathToFileURL } from "node:url";

let handlerPromise;

function loadHandler() {
  if (!handlerPromise) {
    const taskRoot = process.env.LAMBDA_TASK_ROOT || path.resolve(__dirname, "../../..");
    const handlerUrl = pathToFileURL(path.join(taskRoot, "lalgeo-mcp/dist/netlify.js")).href;
    handlerPromise = import(handlerUrl).then((module) => module.handler);
  }
  return handlerPromise;
}

export async function handler(event) {
  return (await loadHandler())(event);
}
