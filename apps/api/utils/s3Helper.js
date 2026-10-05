import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

/**
 * Uploads a thumbnail buffer directly to DigitalOcean Spaces
 * @param {string} stickerboardId - The ID of the stickerboard
 * @param {Buffer} buffer - The image buffer to upload
 * @returns {Promise<{publicUrl: string, key: string, version: number, contentType: string, bytes: number}>}
 */
export async function uploadThumbnailToS3(stickerboardId, buffer) {
    const s3 = new S3Client({
        region: "us-east-1",
        endpoint: process.env.DO_SPACES_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        credentials: {
            accessKeyId: process.env.DO_SPACES_KEY,
            secretAccessKey: process.env.DO_SPACES_SECRET,
        },
    });

    // Define versioned key
    const version = Date.now();
    const key = `thumbnails/${stickerboardId}/${version}.webp`;
    const bucket = process.env.DO_SPACES_BUCKET;
    const contentType = "image/webp";

    // Upload directly to S3
    const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        ACL: "public-read",
    });

    await s3.send(cmd);

    const publicUrl = `${process.env.MEDIA_BASE_URL}/${key}`;

    return { publicUrl, key, version, contentType, bytes: buffer.length };
}

/**
 * Cleans up old thumbnail versions for a stickerboard, keeping only the latest N versions
 * @param {string} stickerboardId - The ID of the stickerboard
 * @param {number} keepCount - Number of recent versions to keep (default: 3)
 * @returns {Promise<number>} Number of thumbnails deleted
 */
export async function cleanupOldThumbnails(stickerboardId, keepCount = 3) {
    const s3 = new S3Client({
        region: "us-east-1",
        endpoint: process.env.DO_SPACES_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        credentials: {
            accessKeyId: process.env.DO_SPACES_KEY,
            secretAccessKey: process.env.DO_SPACES_SECRET,
        },
    });

    const bucket = process.env.DO_SPACES_BUCKET;
    const prefix = `thumbnails/${stickerboardId}/`;

    // List all thumbnails for this board
    const listCmd = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
    });

    const listResponse = await s3.send(listCmd);
    const objects = listResponse.Contents || [];

    if (objects.length <= keepCount) {
        return 0; // Nothing to delete
    }

    // Sort by last modified date (newest first)
    objects.sort((a, b) => b.LastModified - a.LastModified);

    // Get objects to delete (keep the newest N)
    const toDelete = objects.slice(keepCount);

    if (toDelete.length === 0) {
        return 0;
    }

    // Delete old versions
    const deleteCmd = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
            Objects: toDelete.map(obj => ({ Key: obj.Key })),
            Quiet: true,
        },
    });

    await s3.send(deleteCmd);

    return toDelete.length;
}
