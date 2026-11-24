import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const startApp = require("./app.cjs");

if (typeof startApp === "function") {
  startApp();
}

export default startApp;
