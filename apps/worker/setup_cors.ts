import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";

// Read from .dev.vars
const devVars = fs.readFileSync(".dev.vars", "utf-8");
const env: Record<string, string> = {};
devVars.split("\n").forEach(line => {
  const [key, ...val] = line.split("=");
  if (key && val.length) {
    env[key.trim()] = val.join("=").trim();
  }
});

const client = new S3Client({
  region: "eu-north-1",
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

async function run() {
  try {
    await client.send(new PutBucketCorsCommand({
      Bucket: "flop-files",
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ["*"],
            AllowedMethods: ["PUT", "GET"],
            AllowedHeaders: ["*"],
            MaxAgeSeconds: 3600
          }
        ]
      }
    }));
    console.log("Successfully updated CORS for flop-files");
  } catch (err) {
    console.error("Failed to update CORS", err);
  }
}

run();
