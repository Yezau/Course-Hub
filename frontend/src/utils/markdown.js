const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg)(?:$|[?#])/i;
const PROTECTED_MEDIA_PATH_PATTERN = /^\/(?:api\/)?posts\/media\/\d+\/file$/i;

const getAuthToken = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem("token") || "";
};

const appendTokenToProtectedUrl = (value = "") => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  try {
    const parsed = new URL(rawValue, "https://course.local");
    const pathName = parsed.pathname || "";
    const isAbsoluteHttpUrl = /^https?:\/\//i.test(rawValue);

    if (
      isAbsoluteHttpUrl &&
      typeof window !== "undefined" &&
      parsed.origin !== window.location.origin
    ) {
      return rawValue;
    }

    if (!PROTECTED_MEDIA_PATH_PATTERN.test(pathName)) {
      return rawValue;
    }

    if (parsed.searchParams.has("token")) {
      return rawValue;
    }

    const token = getAuthToken();
    if (!token) {
      return rawValue;
    }

    parsed.searchParams.set("token", token);

    if (parsed.origin === "https://course.local") {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch (error) {
    return rawValue;
  }
};

const isInlineImageUrl = (value = "") => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return false;

  try {
    const parsed = new URL(rawValue, "https://course.local");
    const pathName = parsed.pathname || "";

    return (
      IMAGE_EXTENSION_PATTERN.test(`${pathName}${parsed.search}`) ||
      PROTECTED_MEDIA_PATH_PATTERN.test(pathName)
    );
  } catch (error) {
    return false;
  }
};

const buildInlineImageTag = (alt, url) => {
  const safeAlt = String(alt || "").trim() || "评论图片";
  const safeUrl = sanitizeUrl(url);

  if (safeUrl === "#") {
    return `<span>${escapeHtml(safeAlt)}</span>`;
  }

  return `<img src="${safeUrl}" alt="${safeAlt}" loading="lazy" />`;
};

const sanitizeUrl = (value = "") => {
  const trimmed = appendTokenToProtectedUrl(value);

  try {
    const parsed = new URL(trimmed, "https://course.local");
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) {
      return escapeHtml(trimmed);
    }
  } catch (error) {
    return "#";
  }

  return "#";
};

const renderInlineMarkdown = (value = "") => {
  const escaped = escapeHtml(value);

  const withPlainImageLinks = escaped.replace(
    /(^|\s)((?:https?:\/\/|\/)[^\s<]+)/g,
    (match, prefix, url) => {
      if (!isInlineImageUrl(url)) {
        return match;
      }

      return `${prefix}${buildInlineImageTag("评论图片", url)}`;
    },
  );

  const withAngleWrappedImageLinks = withPlainImageLinks.replace(
    /&lt;((?:https?:\/\/|\/)[^&<]+?)&gt;/g,
    (match, url) => {
      if (!isInlineImageUrl(url)) {
        return match;
      }

      return buildInlineImageTag("评论图片", url);
    },
  );

  return withAngleWrappedImageLinks
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      return buildInlineImageTag(alt, url);
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      if (isInlineImageUrl(url)) {
        return buildInlineImageTag(text, url);
      }

      const safeUrl = sanitizeUrl(url);
      return `<a href="${safeUrl}" target="_blank" rel="noreferrer">${text}</a>`;
    })
    .replace(
      /<a href="([^"]+)" target="_blank" rel="noreferrer">([^<]*)<\/a>/g,
      (match, href, text) => {
        if (!isInlineImageUrl(href)) {
          return match;
        }

        return buildInlineImageTag(text, href);
      },
    )
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
};

const flushParagraph = (buffer, html) => {
  if (!buffer.length) return;
  html.push(`<p>${buffer.join("<br />")}</p>`);
  buffer.length = 0;
};

const flushList = (items, type, html) => {
  if (!items.length || !type) return;
  const tag = type === "ordered" ? "ol" : "ul";
  html.push(
    `<${tag}>${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`,
  );
  items.length = 0;
};

const flushQuote = (buffer, html) => {
  if (!buffer.length) return;
  html.push(
    `<blockquote>${buffer.map((line) => `<p>${line}</p>`).join("")}</blockquote>`,
  );
  buffer.length = 0;
};

const flushCode = (buffer, html) => {
  if (!buffer.length) return;
  html.push(`<pre><code>${escapeHtml(buffer.join("\n"))}</code></pre>`);
  buffer.length = 0;
};

export const stripMarkdown = (value = "") =>
  String(value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const renderMarkdown = (value = "") => {
  const normalized = String(value).replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const html = [];
  const paragraphBuffer = [];
  const quoteBuffer = [];
  const listBuffer = [];
  const codeBuffer = [];

  let listType = "";
  let inCodeBlock = false;

  const closeOpenBlocks = () => {
    flushParagraph(paragraphBuffer, html);
    flushQuote(quoteBuffer, html);
    flushList(listBuffer, listType, html);
    listType = "";
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      closeOpenBlocks();

      if (inCodeBlock) {
        flushCode(codeBuffer, html);
      }

      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (!line.trim()) {
      closeOpenBlocks();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      closeOpenBlocks();
      const level = headingMatch[1].length;
      html.push(
        `<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`,
      );
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph(paragraphBuffer, html);
      flushList(listBuffer, listType, html);
      listType = "";
      quoteBuffer.push(renderInlineMarkdown(quoteMatch[1]));
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph(paragraphBuffer, html);
      flushQuote(quoteBuffer, html);
      if (listType && listType !== "ordered") {
        flushList(listBuffer, listType, html);
      }
      listType = "ordered";
      listBuffer.push(renderInlineMarkdown(orderedMatch[1]));
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph(paragraphBuffer, html);
      flushQuote(quoteBuffer, html);
      if (listType && listType !== "unordered") {
        flushList(listBuffer, listType, html);
      }
      listType = "unordered";
      listBuffer.push(renderInlineMarkdown(unorderedMatch[1]));
      continue;
    }

    flushQuote(quoteBuffer, html);
    flushList(listBuffer, listType, html);
    listType = "";
    paragraphBuffer.push(renderInlineMarkdown(line));
  }

  if (inCodeBlock) {
    flushCode(codeBuffer, html);
  }

  closeOpenBlocks();

  return html.join("");
};
