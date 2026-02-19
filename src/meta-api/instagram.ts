import { graphAPIPost, pollMediaStatus } from "./client";
import { isLocalPath, uploadLocalFile } from "./upload";

export interface InstagramPostResult {
  post_id: string;
  url: string;
}

/**
 * Post an image to Instagram feed.
 */
export async function postImage(
  igUserId: string,
  imageUrl: string,
  caption: string,
  appId?: string
): Promise<InstagramPostResult> {
  // If local path, upload via Meta Resumable Upload API
  const resolvedUrl = isLocalPath(imageUrl) && appId
    ? await uploadLocalFile(appId, imageUrl)
    : imageUrl;

  // Step 1: Create media container
  const container = await graphAPIPost(`/${igUserId}/media`, {
    image_url: resolvedUrl,
    caption,
  });

  const containerId = container.id!;

  // Step 2: Wait for processing
  await pollMediaStatus(containerId);

  // Step 3: Publish
  const published = await graphAPIPost(`/${igUserId}/media_publish`, {
    creation_id: containerId,
  });

  return {
    post_id: published.id!,
    url: `https://www.instagram.com/p/${published.id}`,
  };
}

/**
 * Post a Reel (video) to Instagram.
 */
export async function postReel(
  igUserId: string,
  videoUrl: string,
  caption: string,
  appId?: string
): Promise<InstagramPostResult> {
  // If local path, upload via Meta Resumable Upload API
  const resolvedUrl = isLocalPath(videoUrl) && appId
    ? await uploadLocalFile(appId, videoUrl)
    : videoUrl;

  // Step 1: Create media container with video
  const container = await graphAPIPost(`/${igUserId}/media`, {
    media_type: "REELS",
    video_url: resolvedUrl,
    caption,
  });

  const containerId = container.id!;

  // Step 2: Wait for video processing (can take longer)
  await pollMediaStatus(containerId, 60, 5000);

  // Step 3: Publish
  const published = await graphAPIPost(`/${igUserId}/media_publish`, {
    creation_id: containerId,
  });

  return {
    post_id: published.id!,
    url: `https://www.instagram.com/reel/${published.id}`,
  };
}

/**
 * Post a Story to Instagram.
 */
export async function postStory(
  igUserId: string,
  mediaUrl: string,
  isVideo: boolean = false,
  appId?: string
): Promise<InstagramPostResult> {
  // If local path, upload via Meta Resumable Upload API
  const resolvedUrl = isLocalPath(mediaUrl) && appId
    ? await uploadLocalFile(appId, mediaUrl)
    : mediaUrl;

  const containerData: Record<string, any> = {
    media_type: "STORIES",
  };

  if (isVideo) {
    containerData.video_url = resolvedUrl;
  } else {
    containerData.image_url = resolvedUrl;
  }

  // Step 1: Create media container
  const container = await graphAPIPost(`/${igUserId}/media`, containerData);
  const containerId = container.id!;

  // Step 2: Wait for processing
  await pollMediaStatus(containerId, isVideo ? 60 : 30, isVideo ? 5000 : 2000);

  // Step 3: Publish
  const published = await graphAPIPost(`/${igUserId}/media_publish`, {
    creation_id: containerId,
  });

  return {
    post_id: published.id!,
    url: `https://www.instagram.com/stories/${igUserId}`,
  };
}

/**
 * Post a carousel (multiple images) to Instagram.
 */
export async function postCarousel(
  igUserId: string,
  imageUrls: string[],
  caption: string
): Promise<InstagramPostResult> {
  // Step 1: Create individual media containers for each image
  const childIds: string[] = [];
  for (const imgUrl of imageUrls) {
    const child = await graphAPIPost(`/${igUserId}/media`, {
      image_url: imgUrl,
      is_carousel_item: true,
    });
    childIds.push(child.id!);
  }

  // Step 2: Create carousel container
  const container = await graphAPIPost(`/${igUserId}/media`, {
    media_type: "CAROUSEL",
    caption,
    children: childIds.join(","),
  });

  const containerId = container.id!;

  // Step 3: Wait for processing
  await pollMediaStatus(containerId);

  // Step 4: Publish
  const published = await graphAPIPost(`/${igUserId}/media_publish`, {
    creation_id: containerId,
  });

  return {
    post_id: published.id!,
    url: `https://www.instagram.com/p/${published.id}`,
  };
}

/**
 * Unified Instagram posting function.
 */
export async function postToInstagram(
  igUserId: string,
  postType: "feed" | "reel" | "story",
  mediaUrl: string,
  caption: string,
  isVideo: boolean,
  appId?: string
): Promise<InstagramPostResult> {
  switch (postType) {
    case "feed":
      if (isVideo) {
        return postReel(igUserId, mediaUrl, caption, appId);
      }
      return postImage(igUserId, mediaUrl, caption, appId);

    case "reel":
      return postReel(igUserId, mediaUrl, caption, appId);

    case "story":
      return postStory(igUserId, mediaUrl, isVideo, appId);

    default:
      throw new Error(`Unknown post type: ${postType}`);
  }
}
