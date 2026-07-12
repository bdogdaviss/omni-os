import assert from "node:assert/strict";

import { publicVideoStoragePath } from "./video-storage.ts";

assert.equal(
  publicVideoStoragePath(
    "https://example.supabase.co/storage/v1/object/public/marketing-videos/user/job/video.mp4",
  ),
  "user/job/video.mp4",
);
assert.equal(publicVideoStoragePath("https://example.com/not-our-file.mp4"), null);
console.log("video-storage.check.ts: all checks passed");
