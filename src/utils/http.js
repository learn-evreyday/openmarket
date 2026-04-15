const fs = require("fs");
const path = require("path");
const { SESSION_COOKIE, SESSION_TTL_SECONDS } = require("../config");

function mimeTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function safeStaticPath(staticDir, relativePath) {
  const resolved = path.resolve(staticDir, relativePath);
  if (!resolved.startsWith(path.resolve(staticDir))) {
    return null;
  }
  return resolved;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(res, 404, { error: "File not found." });
        return;
      }
      sendJson(res, 500, { error: "Internal server error." });
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeTypeFor(filePath),
      "Content-Length": String(content.length),
    });
    res.end(content);
  });
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload), "utf-8");
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
    ...headers,
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024 * 2) {
        reject(new Error("Request body too large."));
      }
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", (error) => reject(error));
  });
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index === -1) {
        return acc;
      }
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

module.exports = {
  safeStaticPath,
  serveFile,
  sendJson,
  parseJsonBody,
  parseCookies,
  sessionCookie,
  clearSessionCookie,
};
