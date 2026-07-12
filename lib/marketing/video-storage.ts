const PUBLIC_VIDEO_MARKER = "/storage/v1/object/public/marketing-videos/";

export function publicVideoStoragePath(url: string) {
  const path = new URL(url).pathname.split(PUBLIC_VIDEO_MARKER)[1];
  return path ? decodeURIComponent(path) : null;
}
