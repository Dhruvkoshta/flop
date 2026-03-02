import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

/** Build an S3Client pointed at AWS S3 */
function buildClient(cfg: S3Config): S3Client {
  return new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

/**
 * Generate a presigned PUT URL for uploading an encrypted file to S3.
 * The client uploads directly — the Worker never touches the bytes.
 *
 * @param cfg       S3 credentials/config from Worker env
 * @param fileId    Unique object key (nanoid)
 * @param size      Expected Content-Length in bytes
 * @param mimeType  Content-Type (always application/octet-stream for encrypted blobs)
 * @param expiresIn Seconds until URL expires (default 1 hour)
 */
export async function getPresignedPutUrl(
  cfg: S3Config,
  fileId: string,
  size: number,
  mimeType: string,
  expiresIn = 3600,
): Promise<string> {
  const client = buildClient(cfg);
  const command = new PutObjectCommand({
    Bucket: cfg.bucketName,
    Key: fileId,
    ContentLength: size,
    ContentType: mimeType,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Generate a presigned GET URL for downloading an encrypted file from S3.
 * Client downloads the blob and decrypts locally — Worker never sees plaintext.
 *
 * @param cfg       S3 credentials/config from Worker env
 * @param fileId    S3 object key
 * @param expiresIn Seconds until URL expires (default 1 hour)
 */
export async function getPresignedGetUrl(
  cfg: S3Config,
  fileId: string,
  expiresIn = 3600,
): Promise<string> {
  const client = buildClient(cfg);
  const command = new GetObjectCommand({
    Bucket: cfg.bucketName,
    Key: fileId,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Delete a file from S3. Called by RoomDO alarm after 24h expiry.
 */
export async function deleteS3Object(cfg: S3Config, fileId: string): Promise<void> {
  const client = buildClient(cfg);
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucketName, Key: fileId }));
}

/** Extract S3Config from Worker Env bindings */
export function s3ConfigFromEnv(env: {
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  S3_BUCKET_NAME: string;
}): S3Config {
  return {
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    bucketName: env.S3_BUCKET_NAME,
  };
}
