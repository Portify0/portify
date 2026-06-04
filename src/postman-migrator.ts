import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import * as logger from "./logger.js";
import { writeWithBackup } from "./utils/file-system.js";

interface Endpoint {
  name: string;
  method: string;
  path: string;
  url: string;
  node: any;
}

interface PostmanMigrateOptions {
  collectionPath: string;
  target: "hoppscotch" | "bruno";
  outputDir?: string;
  scanCodebase?: boolean;
  codebasePath?: string;
  dryRun?: boolean;
  backup?: boolean;
  authWarningAsError?: boolean;
}

interface MigrationReport {
  orphanedRequests: string[];
  variableCount: number;
  scriptConversions: number;
  outputPaths: string[];
  filesCreated: number;
  filesModified: number;
  backupsCreated: string[];
  warnings: string[];
}

function checkAuthAndWarn(auth: any, contextName: string): string[] {
  const warnings: string[] = [];
  if (!auth) return warnings;

  const type = auth.type;
  if (!type || type === "noauth" || type === "bearer" || type === "basic" || type === "apikey") {
    return warnings;
  }

  let details = `Type: ${type}`;
  if (type === "oauth2" && Array.isArray(auth.oauth2)) {
    const oauthParams = auth.oauth2.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    details += ` (Grant Type: ${oauthParams.grant_type || "N/A"}, Access Token URL: ${oauthParams.accessTokenUrl || "N/A"}, Client ID: ${oauthParams.clientId || "N/A"})`;
  } else if (type === "awssig" && Array.isArray(auth.awssig)) {
    const sigParams = auth.awssig.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    details += ` (Region: ${sigParams.region || "N/A"}, Service: ${sigParams.service || "N/A"})`;
  }

  warnings.push(`Complex auth "${type}" detected in "${contextName}". Manual configuration is required. Details: ${details}`);
  return warnings;
}

function translateScripts(execLines: string[], target: "bruno" | "hoppscotch"): { convertedLines: string[], conversions: number } {
  let conversions = 0;
  const convertedLines = execLines.map(line => {
    let newLine = line;

    if (target === "bruno") {
      if (newLine.includes("pm.environment.get")) {
        newLine = newLine.replace(/pm\.environment\.get\(([^)]+)\)/g, "bru.getEnvVar($1)");
        conversions++;
      }
      if (newLine.includes("pm.environment.set")) {
        newLine = newLine.replace(/pm\.environment\.set\(([^,]+),\s*([^)]+)\)/g, "bru.setEnvVar($1, $2)");
        conversions++;
      }
      if (newLine.includes("pm.variables.get")) {
        newLine = newLine.replace(/pm\.variables\.get\(([^)]+)\)/g, "bru.getVar($1)");
        conversions++;
      }
      if (newLine.includes("pm.variables.set")) {
        newLine = newLine.replace(/pm\.variables\.set\(([^,]+),\s*([^)]+)\)/g, "bru.setVar($1, $2)");
        conversions++;
      }
      if (newLine.includes("pm.globals.get")) {
        newLine = newLine.replace(/pm\.globals\.get\(([^)]+)\)/g, "bru.getVar($1)");
        conversions++;
      }
      if (newLine.includes("pm.globals.set")) {
        newLine = newLine.replace(/pm\.globals\.set\(([^,]+),\s*([^)]+)\)/g, "bru.setVar($1, $2)");
        conversions++;
      }
      if (newLine.includes("pm.collectionVariables.get")) {
        newLine = newLine.replace(/pm\.collectionVariables\.get\(([^)]+)\)/g, "bru.getVar($1)");
        conversions++;
      }
      if (newLine.includes("pm.collectionVariables.set")) {
        newLine = newLine.replace(/pm\.collectionVariables\.set\(([^,]+),\s*([^)]+)\)/g, "bru.setVar($1, $2)");
        conversions++;
      }
      if (newLine.includes("pm.test")) {
        newLine = newLine.replace(/pm\.test/g, "test");
        conversions++;
      }
      if (newLine.includes("pm.response.json()")) {
        newLine = newLine.replace(/pm\.response\.json\(\)/g, "res.body");
        conversions++;
      }
      if (newLine.includes("pm.response.to.have.status")) {
        newLine = newLine.replace(/pm\.response\.to\.have\.status\(([^)]+)\)/g, "expect(res.status).to.equal($1)");
        conversions++;
      }
      if (newLine.includes("pm.expect")) {
        newLine = newLine.replace(/pm\.expect/g, "expect");
        conversions++;
      }
    } else {
      if (newLine.includes("pm.environment.get")) {
        newLine = newLine.replace(/pm\.environment\.get\(([^)]+)\)/g, "pw.env.get($1)");
        conversions++;
      }
      if (newLine.includes("pm.environment.set")) {
        newLine = newLine.replace(/pm\.environment\.set\(([^,]+),\s*([^)]+)\)/g, "pw.env.set($1, $2)");
        conversions++;
      }
      if (newLine.includes("pm.variables.get")) {
        newLine = newLine.replace(/pm\.variables\.get\(([^)]+)\)/g, "pw.env.get($1)");
        conversions++;
      }
      if (newLine.includes("pm.variables.set")) {
        newLine = newLine.replace(/pm\.variables\.set\(([^,]+),\s*([^)]+)\)/g, "pw.env.set($1, $2)");
        conversions++;
      }
      if (newLine.includes("pm.globals.get")) {
        newLine = newLine.replace(/pm\.globals\.get\(([^)]+)\)/g, "pw.env.get($1)");
        conversions++;
      }
      if (newLine.includes("pm.globals.set")) {
        newLine = newLine.replace(/pm\.globals\.set\(([^,]+),\s*([^)]+)\)/g, "pw.env.set($1, $2)");
        conversions++;
      }
      if (newLine.includes("pm.collectionVariables.get")) {
        newLine = newLine.replace(/pm\.collectionVariables\.get\(([^)]+)\)/g, "pw.env.get($1)");
        conversions++;
      }
      if (newLine.includes("pm.collectionVariables.set")) {
        newLine = newLine.replace(/pm\.collectionVariables\.set\(([^,]+),\s*([^)]+)\)/g, "pw.env.set($1, $2)");
        conversions++;
      }
      if (newLine.includes("pm.test")) {
        newLine = newLine.replace(/pm\.test/g, "pw.test");
        conversions++;
      }
      if (newLine.includes("pm.response.json()")) {
        newLine = newLine.replace(/pm\.response\.json\(\)/g, "pw.response.body");
        conversions++;
      }
      if (newLine.includes("pm.response.to.have.status")) {
        newLine = newLine.replace(/pm\.response\.to\.have\.status\(([^)]+)\)/g, "pw.expect(pw.response.status).toBe($1)");
        conversions++;
      }
      if (newLine.includes("pm.expect")) {
        newLine = newLine.replace(/pm\.expect/g, "pw.expect");
        conversions++;
      }
    }

    return newLine;
  });

  return { convertedLines, conversions };
}

export async function migratePostmanCollection(options: PostmanMigrateOptions): Promise<MigrationReport> {
  const { collectionPath, target, outputDir = ".", scanCodebase = true, codebasePath = ".", dryRun = false, backup = false, authWarningAsError = false } = options;

  if (!fs.existsSync(collectionPath)) {
    throw new Error(`Collection file not found: ${collectionPath}`);
  }

  const collectionRaw = fs.readFileSync(collectionPath, "utf-8");
  const collection = JSON.parse(collectionRaw);

  const report: MigrationReport = {
    orphanedRequests: [],
    variableCount: 0,
    scriptConversions: 0,
    outputPaths: [],
    filesCreated: 0,
    filesModified: 0,
    backupsCreated: [],
    warnings: []
  };

  // 1. Gather all request endpoints, methods, and names
  const requests: Endpoint[] = [];
  
  function traverseItems(items: any[]) {
    if (!items || !Array.isArray(items)) return;
    for (const item of items) {
      if (item.auth) {
        const folderWarnings = checkAuthAndWarn(item.auth, item.name || "Folder");
        report.warnings.push(...folderWarnings);
      }

      if (item.request) {
        if (item.request.auth) {
          const reqWarnings = checkAuthAndWarn(item.request.auth, item.name || "Request");
          report.warnings.push(...reqWarnings);
        }

        let rawUrl = "";
        let pathParts: string[] = [];
        if (typeof item.request.url === "string") {
          rawUrl = item.request.url;
        } else if (item.request.url) {
          if (typeof item.request.url.raw === "string") rawUrl = item.request.url.raw;
          if (Array.isArray(item.request.url.path)) pathParts = item.request.url.path;
        }

        // Clean path for robust matching
        let cleanPath = "";
        if (pathParts.length > 0) {
          cleanPath = "/" + pathParts.join("/");
        } else {
          cleanPath = rawUrl.replace(/^[a-zA-Z]+:\/\/[^/]+/, "").split("?")[0] || "";
        }
        
        // Convert {{var}} or :var to a regex wildcard [^/]+
        cleanPath = cleanPath.replace(/\{\{[^}]+\}\}/g, "[^/]+").replace(/:\w+/g, "[^/]+");

        requests.push({
          name: item.name || "Unnamed Request",
          url: rawUrl,
          path: cleanPath,
          method: (item.request.method || "GET").toUpperCase(),
          node: item
        });
      }
      if (item.item) {
        traverseItems(item.item);
      }
    }
  }

  if (collection.auth) {
    const colWarnings = checkAuthAndWarn(collection.auth, collection.info?.name || "Collection Root");
    report.warnings.push(...colWarnings);
  }

  traverseItems(collection.item);

  // 2. Scan codebase for orphaned requests (if requested)
  if (scanCodebase && requests.length > 0) {
    const codeFiles = getSourceFiles(path.resolve(codebasePath));
    const codeContents: string[] = [];
    for (const file of codeFiles) {
      try {
        codeContents.push(fs.readFileSync(file, "utf-8"));
      } catch (err: any) {
        logger.debug(`Skipping unreadable file ${file}: ${err.message}`);
      }
    }

    for (const req of requests) {
      let referenced = false;
      
      if (req.path && req.path.length > 1 && req.path !== "/") {
        // Build regex to find strings matching the path
        const urlPattern = new RegExp(`['"\`]([^'"\`]*${req.path})['"\`]`);
        const methodMatch = new RegExp(`${req.method}\\s*\\(`, 'i');

        for (const content of codeContents) {
          // Check if file even mentions the method (like GET, POST, or axios.get)
          // or if the URL pattern is directly found.
          if (urlPattern.test(content) || content.includes(req.name)) {
            referenced = true;
            break;
          }
        }
      } else {
        // Fallback to searching name
        for (const content of codeContents) {
          if (content.includes(req.name)) {
            referenced = true;
            break;
          }
        }
      }

      if (!referenced) {
        report.orphanedRequests.push(`${req.method} ${req.name} (${req.url || "no URL"})`);
      }
    }
  }

  // 3. Process Variables and Convert Scripts
  const targetDir = path.resolve(outputDir);
  if (!dryRun && !fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (target === "hoppscotch") {
    const convertedCollection = JSON.parse(JSON.stringify(collection));

    const varMatches = collectionRaw.match(/\{\{([^}]+)\}\}/g) || [];
    report.variableCount = new Set(varMatches).size;

    function convertNodeScripts(node: any) {
      if (node.event && Array.isArray(node.event)) {
        for (const ev of node.event) {
          if (ev.script && ev.script.exec) {
            const lines: string[] = Array.isArray(ev.script.exec)
              ? ev.script.exec
              : [ev.script.exec];

            const { convertedLines, conversions } = translateScripts(lines, "hoppscotch");
            report.scriptConversions += conversions;
            ev.script.exec = convertedLines;
          }
        }
      }

      if (node.request) {
        if (typeof node.request.url === "string") {
          node.request.url = node.request.url.replace(/\{\{([^}]+)\}\}/g, "<<$1>>");
        } else if (node.request.url && typeof node.request.url.raw === "string") {
          node.request.url.raw = node.request.url.raw.replace(/\{\{([^}]+)\}\}/g, "<<$1>>");
          if (Array.isArray(node.request.url.host)) {
            node.request.url.host = node.request.url.host.map((h: string) => h.replace(/\{\{([^}]+)\}\}/g, "<<$1>>"));
          }
        }
        if (Array.isArray(node.request.header)) {
          for (const header of node.request.header) {
            if (header.value) {
              header.value = header.value.replace(/\{\{([^}]+)\}\}/g, "<<$1>>");
            }
          }
        }
      }

      if (node.item && Array.isArray(node.item)) {
        for (const item of node.item) {
          convertNodeScripts(item);
        }
      }
    }

    convertNodeScripts(convertedCollection);

    const outputPath = path.join(targetDir, "hoppscotch-import.json");
    const writeRes = writeWithBackup(outputPath, JSON.stringify(convertedCollection, null, 2), backup, dryRun);
    if (writeRes.fileCreated) report.filesCreated++;
    if (writeRes.fileModified) report.filesModified++;
    if (writeRes.backupCreated) report.backupsCreated.push(writeRes.backupCreated);
    report.outputPaths.push(outputPath);

    // Export collection-level variables for Hoppscotch
    if (collection.variable && Array.isArray(collection.variable) && collection.variable.length > 0) {
      const vars = collection.variable.map((v: any) => ({ key: v.key, value: v.value || "" }));
      const hoppEnv = {
        name: "Collection Variables",
        version: "1.0.0",
        variables: vars.map((v: { key: string; value: string }) => ({ key: v.key, value: v.value.replace(/\{\{([^}]+)\}\}/g, "<<$1>>") }))
      };

      const envPath = path.join(targetDir, "hoppscotch-collection-vars.json");
      const writeResEnv = writeWithBackup(envPath, JSON.stringify(hoppEnv, null, 2), backup, dryRun);
      if (writeResEnv.fileCreated) report.filesCreated++;
      if (writeResEnv.fileModified) report.filesModified++;
      if (writeResEnv.backupCreated) report.backupsCreated.push(writeResEnv.backupCreated);
      report.outputPaths.push(envPath);
      report.variableCount += vars.length;
    }

  } else if (target === "bruno") {
    const brunoDirName = (collection.info?.name || "bruno-collection")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");
    const brunoColPath = path.join(targetDir, brunoDirName);

    if (!dryRun && !fs.existsSync(brunoColPath)) {
      fs.mkdirSync(brunoColPath, { recursive: true });
    }

    const brunoJson = {
      name: collection.info?.name || "Bruno Collection",
      version: "1",
      type: "collection",
      ignore: ["node_modules", ".git"]
    };
    const brunoJsonPath = path.join(brunoColPath, "bruno.json");
    const writeRes = writeWithBackup(brunoJsonPath, JSON.stringify(brunoJson, null, 2), backup, dryRun);
    if (writeRes.fileCreated) report.filesCreated++;
    if (writeRes.fileModified) report.filesModified++;
    if (writeRes.backupCreated) report.backupsCreated.push(writeRes.backupCreated);
    report.outputPaths.push(brunoJsonPath);

    // Export collection-level variables for Bruno
    if (collection.variable && Array.isArray(collection.variable) && collection.variable.length > 0) {
      const envDir = path.join(brunoColPath, "environments");
      if (!dryRun && !fs.existsSync(envDir)) {
        fs.mkdirSync(envDir, { recursive: true });
      }

      const vars = collection.variable.map((v: any) => ({ key: v.key, value: v.value || "" }));
      let bruEnvContent = "vars {\n";
      for (const v of vars) {
        bruEnvContent += `  ${v.key}: ${v.value}\n`;
      }
      bruEnvContent += "}\n";

      const envPath = path.join(envDir, "collection-variables.bru");
      const writeResEnv = writeWithBackup(envPath, bruEnvContent, backup, dryRun);
      if (writeResEnv.fileCreated) report.filesCreated++;
      if (writeResEnv.fileModified) report.filesModified++;
      if (writeResEnv.backupCreated) report.backupsCreated.push(writeResEnv.backupCreated);
      report.outputPaths.push(envPath);
      report.variableCount += vars.length;
    }

    function generateBruFile(name: string, request: any, events: any[]): string {
      const method = (request.method || "GET").toLowerCase();
      let rawUrl = "";
      if (typeof request.url === "string") {
        rawUrl = request.url;
      } else if (request.url && typeof request.url.raw === "string") {
        rawUrl = request.url.raw;
      }

      rawUrl = rawUrl.replace(/\{\{([^}]+)\}\}/g, "{{$1}}");

      let headersStr = "";
      if (Array.isArray(request.header)) {
        const activeHeaders = request.header.filter((h: any) => !h.disabled);
        if (activeHeaders.length > 0) {
          headersStr = "\nheaders {\n";
          for (const h of activeHeaders) {
            headersStr += `  ${h.key}: ${h.value}\n`;
          }
          headersStr += "}\n";
        }
      }

      let authMode = "none";
      let authStr = "";
      const auth = request.auth;
      if (auth) {
        const type = auth.type;
        if (type === "bearer") {
          authMode = "bearer";
          const tokenObj = auth.bearer?.find((b: any) => b.key === "token");
          const token = tokenObj ? tokenObj.value : "";
          authStr = `\nauth:bearer {\n  token: ${token}\n}\n`;
        } else if (type === "basic") {
          authMode = "basic";
          const userObj = auth.basic?.find((b: any) => b.key === "username");
          const passObj = auth.basic?.find((b: any) => b.key === "password");
          const username = userObj ? userObj.value : "";
          const password = passObj ? passObj.value : "";
          authStr = `\nauth:basic {\n  username: ${username}\n  password: ${password}\n}\n`;
        } else if (type === "apikey") {
          authMode = "apikey";
          const keyObj = auth.apikey?.find((b: any) => b.key === "key");
          const valObj = auth.apikey?.find((b: any) => b.key === "value");
          const inObj = auth.apikey?.find((b: any) => b.key === "in");
          const key = keyObj ? keyObj.value : "";
          const value = valObj ? valObj.value : "";
          const placement = inObj ? inObj.value : "header";
          authStr = `\nauth:apikey {\n  key: ${key}\n  value: ${value}\n  placement: ${placement}\n}\n`;
        }
      }

      let bodyType = "none";
      let bodyStr = "";
      if (request.body) {
        const mode = request.body.mode;
        if (mode === "raw") {
          const lang = request.body.options?.raw?.language || "json";
          bodyType = lang === "json" ? "json" : (lang === "xml" ? "xml" : "text");
          if (request.body.raw) {
            bodyStr = `\nbody:${bodyType} {\n${request.body.raw.split("\n").map((l: string) => `  ${l}`).join("\n")}\n}\n`;
          }
        } else if (mode === "urlencoded") {
          bodyType = "form-urlencoded";
          const params = request.body.urlencoded || [];
          const activeParams = params.filter((p: any) => !p.disabled);
          if (activeParams.length > 0) {
            bodyStr = `\nbody:form-urlencoded {\n`;
            for (const p of activeParams) {
              bodyStr += `  ${p.key}: ${p.value || ""}\n`;
            }
            bodyStr += `}\n`;
          }
        } else if (mode === "formdata") {
          bodyType = "multipart-form";
          const params = request.body.formdata || [];
          const activeParams = params.filter((p: any) => !p.disabled);
          if (activeParams.length > 0) {
            bodyStr = `\nbody:multipart-form {\n`;
            for (const p of activeParams) {
              if (p.type === "file") {
                bodyStr += `  ${p.key}: @file(${p.src || ""})\n`;
              } else {
                bodyStr += `  ${p.key}: ${p.value || ""}\n`;
              }
            }
            bodyStr += `}\n`;
          }
        } else if (mode === "graphql") {
          bodyType = "graphql";
          const query = request.body.graphql?.query || "";
          const variables = request.body.graphql?.variables || "";
          bodyStr = `\nbody:graphql {\n  query: ${query.split("\n").join("\n  ")}\n`;
          if (variables) {
            bodyStr += `  variables: ${variables.split("\n").join("\n  ")}\n`;
          }
          bodyStr += `}\n`;
        }
      }

      let scriptPre = "";
      let scriptPost = "";

      for (const ev of events) {
        if (ev.script && ev.script.exec) {
          const lines = Array.isArray(ev.script.exec) ? ev.script.exec : [ev.script.exec];
          const { convertedLines, conversions } = translateScripts(lines, "bruno");
          report.scriptConversions += conversions;
          const converted = convertedLines.join("\n");

          if (ev.listen === "prerequest") {
            scriptPre = `\nscript:pre-request {\n${converted}\n}\n`;
          } else if (ev.listen === "test") {
            scriptPost = `\nscript:post-response {\n${converted}\n}\n`;
          }
        }
      }

      return `meta {
  name: "${name}"
  type: "http"
  seq: 1
}

${method} {
  url: ${rawUrl}
  body: ${bodyType}
  auth: ${authMode}
}
${authStr}${headersStr}${bodyStr}${scriptPre}${scriptPost}`;
    }

    function generateFolderBru(name: string, auth: any, events: any[]): string {
      let authMode = "none";
      let authStr = "";
      if (auth) {
        const type = auth.type;
        if (type === "bearer") {
          authMode = "bearer";
          const tokenObj = auth.bearer?.find((b: any) => b.key === "token");
          const token = tokenObj ? tokenObj.value : "";
          authStr = `\nauth:bearer {\n  token: ${token}\n}\n`;
        } else if (type === "basic") {
          authMode = "basic";
          const userObj = auth.basic?.find((b: any) => b.key === "username");
          const passObj = auth.basic?.find((b: any) => b.key === "password");
          const username = userObj ? userObj.value : "";
          const password = passObj ? passObj.value : "";
          authStr = `\nauth:basic {\n  username: ${username}\n  password: ${password}\n}\n`;
        } else if (type === "apikey") {
          authMode = "apikey";
          const keyObj = auth.apikey?.find((b: any) => b.key === "key");
          const valObj = auth.apikey?.find((b: any) => b.key === "value");
          const inObj = auth.apikey?.find((b: any) => b.key === "in");
          const key = keyObj ? keyObj.value : "";
          const value = valObj ? valObj.value : "";
          const placement = inObj ? inObj.value : "header";
          authStr = `\nauth:apikey {\n  key: ${key}\n  value: ${value}\n  placement: ${placement}\n}\n`;
        }
      }

      let scriptPre = "";
      let scriptPost = "";

      for (const ev of events) {
        if (ev.script && ev.script.exec) {
          const lines = Array.isArray(ev.script.exec) ? ev.script.exec : [ev.script.exec];
          const { convertedLines, conversions } = translateScripts(lines, "bruno");
          report.scriptConversions += conversions;
          const converted = convertedLines.join("\n");

          if (ev.listen === "prerequest") {
            scriptPre = `\nscript:pre-request {\n${converted}\n}\n`;
          } else if (ev.listen === "test") {
            scriptPost = `\nscript:post-response {\n${converted}\n}\n`;
          }
        }
      }

      return `meta {
  name: "${name}"
}
${authMode !== "none" ? `\nauth {\n  mode: ${authMode}\n}\n${authStr}` : ""}${scriptPre}${scriptPost}`;
    }

    function buildBrunoCollection(items: any[], currentDir: string) {
      if (!items || !Array.isArray(items)) return;
      for (const item of items) {
        const cleanName = (item.name || "request")
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-");

        if (item.item) {
          const folderPath = path.join(currentDir, cleanName);
          if (!dryRun && !fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
          }

          const folderBruContent = generateFolderBru(item.name || "Folder", item.auth, item.event || []);
          const folderBruPath = path.join(folderPath, "folder.bru");
          const writeRes = writeWithBackup(folderBruPath, folderBruContent, backup, dryRun);
          if (writeRes.fileCreated) report.filesCreated++;
          if (writeRes.fileModified) report.filesModified++;
          if (writeRes.backupCreated) report.backupsCreated.push(writeRes.backupCreated);
          report.outputPaths.push(folderBruPath);

          buildBrunoCollection(item.item, folderPath);
        } else if (item.request) {
          const bruContent = generateBruFile(item.name || "Request", item.request, item.event || []);
          const filePath = path.join(currentDir, `${cleanName}.bru`);
          const writeRes = writeWithBackup(filePath, bruContent, backup, dryRun);
          if (writeRes.fileCreated) report.filesCreated++;
          if (writeRes.fileModified) report.filesModified++;
          if (writeRes.backupCreated) report.backupsCreated.push(writeRes.backupCreated);
          report.outputPaths.push(filePath);
        }
      }
    }

    buildBrunoCollection(collection.item, brunoColPath);
  }

  if (authWarningAsError && report.warnings.length > 0) {
    throw new Error(`Authentication warnings detected in CI strict mode:\n${report.warnings.map(w => ` - ${w}`).join("\n")}`);
  }

  return report;
}

function getSourceFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (file === "node_modules" || file === ".git" || file === "dist") continue;
      const fullPath = path.join(dir, file);
      try {
        if (!fs.existsSync(fullPath)) continue;
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results.push(...getSourceFiles(fullPath));
        } else {
          const ext = path.extname(file);
          if ([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".rb"].includes(ext)) {
            results.push(fullPath);
          }
        }
      } catch (err) {
        // Skip files that disappeared during concurrent scans
      }
    }
  } catch (err) {
    // Skip unreadable directories
  }
  return results;
}
