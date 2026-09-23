// Railway runs `node start.js`: the public HTTP server on all interfaces.
process.argv.push("--http", "--host", "0.0.0.0");
await import("./dist/index.js");
