// lets us files from the computer
import fs from "node:fs";

// turns a relative path into a full absolute path
import path from "node:path";

// import the function that runs a dirt program
import { runProgram } from "../runtime/runProgram.js";

// get the command-line arguments after the script name
const args = process.argv.slice(2);

// if user did not provide a file, stop the program
if (args.length === 0) {
  console.error("Usage: npm run dirt -- <file.dirt>");
  process.exit(1);
}

// convert file name into a full path
const filePath = path.resolve(args[0]);

// read files contents as text
const source = fs.readFileSync(filePath, "utf-8");

// send the source code into the Dirt runtime
runProgram(source, { sourcePath: filePath });