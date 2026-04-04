import { stripMarkdown } from "./markdown";

const PROTECTED_MEDIA_PATH_PATTERN =
  /^\/(?:api\/)?(?:posts\/media\/[^/]+\/file|materials\/[^/]+\/download|assignments\/[^/]+\/attachments\/[^/]+\/download|assignments\/submissions\/[^/]+\/attachments\/[^/]+\/download)$/i;

export const resolveProtectedMediaUrl = (url = "") => {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) return "";

  if (/[?&]token=/.test(normalizedUrl)) {
    return normalizedUrl;
  }

  try {
    const parsed = new URL(normalizedUrl, "https://course.local");
    const pathName = parsed.pathname || "";
    const isAbsoluteHttpUrl = /^https?:\/\//i.test(normalizedUrl);

    if (
      isAbsoluteHttpUrl &&
      typeof window !== "undefined" &&
      parsed.origin !== window.location.origin
    ) {
      return normalizedUrl;
    }

    if (!PROTECTED_MEDIA_PATH_PATTERN.test(pathName)) {
      return normalizedUrl;
    }

    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("token") || ""
        : "";

    if (!token) {
      return normalizedUrl;
    }

    parsed.searchParams.set("token", token);

    if (parsed.origin === "https://course.local") {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch (error) {
    return normalizedUrl;
  }
};

export const getPostMediaKind = (media) => {
  const contentType = `${media?.file_type || media?.type || ""}`.toLowerCase();

  if (contentType.startsWith("image/")) {
    return "image";
  }

  if (contentType.startsWith("video/")) {
    return "video";
  }

  return "unknown";
};

export const isVideoMedia = (media) => getPostMediaKind(media) === "video";

export const buildPostRequestBody = (submission) => {
  const files = Array.isArray(submission?.files) ? submission.files : [];
  const payload = submission?.payload || {};

  if (!files.length) {
    return payload;
  }

  const formData = new FormData();
  formData.append("payload", JSON.stringify(payload));

  for (const file of files) {
    formData.append("media", file);
  }

  return formData;
};

export const sortPostMedia = (media = []) => {
  return [...media].sort((left, right) => {
    if (left.usage === "cover" && right.usage !== "cover") return -1;
    if (left.usage !== "cover" && right.usage === "cover") return 1;

    const leftSort = Number(left.sort_order || 0);
    const rightSort = Number(right.sort_order || 0);

    if (leftSort !== rightSort) return leftSort - rightSort;
    return Number(left.id || 0) - Number(right.id || 0);
  });
};

export const getPostMediaList = (post, limit = 9) => {
  return sortPostMedia(post?.media || []).slice(0, limit);
};

export const getAuthorInitial = (authorName = "") => {
  const normalized = String(authorName || "").trim();
  if (!normalized) return "匿";
  return normalized.charAt(0).toUpperCase();
};

export const getPostCoverMedia = (post) => {
  const media = sortPostMedia(post?.media || []);
  return media.find((item) => item.usage === "cover") || media[0] || null;
};

export const getPostGalleryMedia = (post) => {
  const media = sortPostMedia(post?.media || []);
  const coverMedia = getPostCoverMedia(post);

  if (!coverMedia) {
    return media;
  }

  return media.filter((item) => item.id !== coverMedia.id);
};

export const hasPostTitle = (post) => {
  return Boolean(String(post?.title || "").trim());
};

export const getPostPreviewText = (post, limit = 160) => {
  const sourceText =
    post?.post_type === "article"
      ? post?.summary || post?.content
      : post?.content;

  const plainText = stripMarkdown(sourceText || "");
  if (!plainText) return "暂无内容";

  return plainText.length > limit
    ? `${plainText.slice(0, limit)}...`
    : plainText;
};
