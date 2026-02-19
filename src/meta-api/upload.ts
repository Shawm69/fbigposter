import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { loadTokens } from "./client";

const GRAPH_API_BASE = "https://graph.facebook.com/v19.0";

/**
 * Detect MIME type from file extension.
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
  };
  return mimeMap[ext] || "application/octet-stream";
}

/**
 * Check if a media source is a local file path (vs a URL).
 */
export function isLocalPath(mediaSource: string): boolean {
  return !mediaSource.startsWith("http://") && !mediaSource.startsWith("https://");
}

/**
 * Create a resumable upload session with Meta's API.
 *
 * POST /{app_id}/uploads
 * Returns the upload session ID.
 */
export async function createUploadSession(
  appId: string,
  fileSize: number,
  mimeType: string
): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error("No Meta API tokens found. Run 'smi auth' first.");
  }

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      file_length: fileSize,
      file_type: mimeType,
      access_token: tokens.user_access_token,
    });

    const url = new URL(`${GRAPH_API_BASE}/${appId}/uploads`);

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Upload session error: ${parsed.error.message}`));
          } else if (parsed.id) {
            resolve(parsed.id);
          } else {
            reject(new Error(`Unexpected upload session response: ${data}`));
          }
        } catch {
          reject(new Error(`Failed to parse upload session response: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Upload file bytes to an existing upload session.
 *
 * POST /{session_id} with raw binary body.
 * Returns the file handle string (e.g., "h:abc123...").
 */
export async function uploadFileBytes(
  sessionId: string,
  filePath: string
): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error("No Meta API tokens found. Run 'smi auth' first.");
  }

  const fileBuffer = fs.readFileSync(filePath);
  const mimeType = getMimeType(filePath);

  return new Promise((resolve, reject) => {
    const url = new URL(`${GRAPH_API_BASE}/${sessionId}`);

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "POST",
      headers: {
        Authorization: `OAuth ${tokens.user_access_token}`,
        "Content-Type": mimeType,
        file_offset: "0",
        "Content-Length": fileBuffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Upload error: ${parsed.error.message}`));
          } else if (parsed.h) {
            resolve(parsed.h);
          } else {
            reject(new Error(`Unexpected upload response: ${data}`));
          }
        } catch {
          reject(new Error(`Failed to parse upload response: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(fileBuffer);
    req.end();
  });
}

/**
 * Upload a local file to Meta via Resumable Upload API.
 *
 * Convenience wrapper: detects MIME type + size, creates a session,
 * uploads the bytes, and returns the file handle.
 *
 * The returned handle (e.g., "h:abc123...") can be used in place of
 * image_url / video_url when creating media containers.
 */
export async function uploadLocalFile(
  appId: string,
  filePath: string
): Promise<string> {
  const stats = fs.statSync(filePath);
  const mimeType = getMimeType(filePath);

  const sessionId = await createUploadSession(appId, stats.size, mimeType);
  const fileHandle = await uploadFileBytes(sessionId, filePath);

  return fileHandle;
}
