import fs from "node:fs";
import path from "node:path";
import { runProgram } from "../runtime/runProgram.js";
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Usage: npm run dirt -- <file.dirt>");
    process.exit(1);
}
const filePath = path.resolve(args[0]);
const source = fs.readFileSync(filePath, "utf-8");
runProgram(source, { sourcePath: filePath });
