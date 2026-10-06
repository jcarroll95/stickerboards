// apps/api/services/objectStore.js
const fs = require("fs");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function makeS3Client() {
  return new S3Client({
    region: "us-east-1",
    endpoint: requiredEnv("DO_SPACES_ENDPOINT"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requiredEnv("DO_SPACES_KEY"),
      secretAccessKey: requiredEnv("DO_SPACES_SECRET"),
    },
  });
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const s = fs.createReadStream(filePath);
    s.on("error", reject);
    s.on("data", (chunk) => h.update(chunk));
    s.on("end", () => resolve(h.digest("hex")));
  });
}

async function headObject({ s3, bucket, key }) {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    // Treat not-found as null; other errors bubble up
    const code = e?.$metadata?.httpStatusCode;
    if (code === 404 || e?.name === "NotFound") return null;
    throw e;
  }
}

/**
 * Upload a local file to Spaces/S3 at a deterministic objectKey.
 * - Stores sha256 in object metadata for idempotent "skip if same" behavior.
 *
 * Required env:
 *  DO_SPACES_ENDPOINT, DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET, MEDIA_BASE_URL
 */
async function uploadLocalFile({
                                 filePath,
                                 objectKey,
                                 contentType,
                                 cacheControl = "public, max-age=31536000, immutable",
                                 acl = "public-read",
                                 expectedSha256,   // optional: if provided, verified against local file
                                 skipIfSame = true
                               }) {
  const bucket = requiredEnv("DO_SPACES_BUCKET");
  const mediaBase = requiredEnv("MEDIA_BASE_URL");
  const s3 = makeS3Client();

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const localSha = await sha256File(filePath);
  if (expectedSha256 && expectedSha256 !== localSha) {
    throw new Error(`sha256 mismatch for ${filePath}: expected ${expectedSha256}, got ${localSha}`);
  }

  if (skipIfSame) {
    const head = await headObject({ s3, bucket, key: objectKey });
    const remoteSha = head?.Metadata?.sha256; // lowercased keys in AWS SDK
    if (remoteSha && remoteSha === localSha) {
      return {
        objectKey,
        publicUrl: `${mediaBase}/${objectKey}`,
        sha256: localSha,
        skipped: true
      };
    }
  }

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: fs.createReadStream(filePath),
    ContentType: contentType,
    CacheControl: cacheControl,
    ACL: acl,
    Metadata: { sha256: localSha }
  }));

  return {
    objectKey,
    publicUrl: `${mediaBase}/${objectKey}`,
    sha256: localSha,
    skipped: false
  };
}

module.exports = { uploadLocalFile, sha256File };
