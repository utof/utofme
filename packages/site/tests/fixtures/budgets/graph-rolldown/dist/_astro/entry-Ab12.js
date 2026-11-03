import { t as __vitePreload } from "./preload-helper-Zz00.js";
import { a, b } from "./shared-Cd34.js";

export * from "./reexp-Ef56.js";

const lazy = () => __vitePreload(() => import("./lazy-Gh78.js"), []);
const deep = () => import("./deep-Ij90.js");
console.log(a, b, lazy, deep);
