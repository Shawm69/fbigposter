import { graphAPIPost } from "./client";
import { isLocalPath, uploadLocalFile } from "./upload";

export interface FacebookPostResult {
  post_id: string;
  url: string;
}

/**
 * Post a text/link post to a Facebook Page feed.
 */
export async function postToFeed(
  pageId: string,
  message: string,
  link?: string
): Promise<FacebookPostResult> {
  const data: Record<string, any> = { message };
  if (link) data.link = link;

  const response = await graphAPIPost(`/${pageId}/feed`, data, "page");
  return {
    post_id: response.id!,
    url: `https://www.facebook.com/${response.id}`,
  };
}

/**
 * Post a photo to a Facebook Page.
 */
export async function postPhoto(
  pageId: string,
  imageUrl: string,
  caption: string,
  appId?: string
): Promise<FacebookPostResult> {
  // If local path, upload via Meta Resumable Upload API
  const resolvedUrl = isLocalPath(imageUrl) && appId
    ? await uploadLocalFile(appId, imageUrl)
    : imageUrl;

  const response = await graphAPIPost(
    `/${pageId}/photos`,
    {
      url: resolvedUrl,
      caption,
    },
    "page"
  );

  return {
    post_id: response.id!,
    url: `https://www.facebook.com/${response.id}`,
  };
}

/**
 * Post a video (Reel) to a Facebook Page.
 */
export async function postVideo(
  pageId: string,
  videoUrl: string,
  description: string,
  appId?: string
): Promise<FacebookPostResult> {
  // If local path, upload via Meta Resumable Upload API
  const resolvedUrl = isLocalPath(videoUrl) && appId
    ? await uploadLocalFile(appId, videoUrl)
    : videoUrl;

  const response = await graphAPIPost(
    `/${pageId}/videos`,
    {
      file_url: resolvedUrl,
      description,
    },
    "page"
  );

  return {
    post_id: response.id!,
    url: `https://www.facebook.com/${response.id}`,
  };
}

/**
 * Post a story (photo) to a Facebook Page.
 * Note: Facebook Stories API has limited availability.
 */
export async function postStory(
  pageId: string,
  imageUrl: string,
  appId?: string
): Promise<FacebookPostResult> {
  // If local path, upload via Meta Resumable Upload API
  const resolvedUrl = isLocalPath(imageUrl) && appId
    ? await uploadLocalFile(appId, imageUrl)
    : imageUrl;

  // Facebook Page Stories use the /page_id/photo_stories endpoint
  const response = await graphAPIPost(
    `/${pageId}/photo_stories`,
    {
      photo_url: resolvedUrl,
    },
    "page"
  );

  return {
    post_id: response.id!,
    url: `https://www.facebook.com/stories/${pageId}`,
  };
}

/**
 * Unified Facebook posting function.
 */
export async function postToFacebook(
  pageId: string,
  postType: "feed" | "reel" | "story",
  mediaUrl: string,
  caption: string,
  isVideo: boolean,
  appId?: string
): Promise<FacebookPostResult> {
  switch (postType) {
    case "feed":
      if (isVideo) {
        return postVideo(pageId, mediaUrl, caption, appId);
      }
      return postPhoto(pageId, mediaUrl, caption, appId);

    case "reel":
      return postVideo(pageId, mediaUrl, caption, appId);

    case "story":
      return postStory(pageId, mediaUrl, appId);

    default:
      throw new Error(`Unknown post type: ${postType}`);
  }
}
