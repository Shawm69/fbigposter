"""Scrape metrics from Facebook Professional Dashboard Content Library.

Navigates to the content library, waits for the table to load,
and extracts per-post metrics from all visible rows.
"""

import asyncio
import re
import time
from browser import get_page, close_page, wait_for_element

FB_CONTENT_LIBRARY = "https://www.facebook.com/professional_dashboard/content/content_library/"

# Timeout for initial page load
PAGE_LOAD_TIMEOUT_MS = 30_000


def parse_number(text: str) -> int:
    """Parse a metric number string like '999', '6,069,415', '--' into an int."""
    text = text.strip()
    if text in ("--", "", "-"):
        return 0
    # Remove commas
    text = text.replace(",", "")
    try:
        return int(text)
    except ValueError:
        return 0


def parse_distribution(text: str) -> float | None:
    """Parse distribution like '+0.3x', '-0.3x' into a float. Returns None for '--'."""
    text = text.strip()
    if text in ("--", "", "-"):
        return None
    # Remove the 'x' suffix
    text = text.replace("x", "")
    try:
        return float(text)
    except ValueError:
        return None


async def scrape_facebook_content_library() -> dict:
    """Scrape all post metrics from the FB Professional Dashboard Content Library.

    Returns:
        {
            success: bool,
            posts: [
                {
                    caption: str,
                    post_type: str,       # "reel", "story", "post"
                    published_at: str,    # raw date string like "Feb 17 at 6:45 PM"
                    views: int,
                    viewers: int,         # unique reach
                    engagement: int,      # aggregate engagement
                    net_follows: int,
                    impressions: int,
                    comments: int,
                    distribution: float | None,  # e.g. 0.3, -0.3
                    watch_time_ms: int,
                }
            ],
            scraped_at: str,  # ISO timestamp
            error?: str
        }
    """
    start = time.time()
    page = None

    try:
        page = await get_page(FB_CONTENT_LIBRARY)

        # Wait for the content library table to appear
        table_found = await wait_for_element(
            page,
            '[aria-label="Content Library"]',
            timeout_ms=PAGE_LOAD_TIMEOUT_MS,
        )
        if not table_found:
            # Check if we hit a login page
            if "login" in page.url.lower():
                await close_page(page)
                return {
                    "success": False,
                    "posts": [],
                    "scraped_at": _iso_now(),
                    "error": "Not logged in. Run with SMI_HEADLESS=false and log in manually.",
                }
            await close_page(page)
            return {
                "success": False,
                "posts": [],
                "scraped_at": _iso_now(),
                "error": "Content Library table not found on page.",
            }

        # Small delay for metrics to populate
        await asyncio.sleep(2)

        # Scroll to load all posts (FB may lazy-load)
        prev_count = 0
        for _ in range(10):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(1)
            curr_count = await page.evaluate("""() => {
                const table = document.querySelector('[aria-label="Content Library"]');
                return table ? table.querySelectorAll('tbody tr').length : 0;
            }""")
            if curr_count == prev_count:
                break
            prev_count = curr_count

        # Extract all row data
        raw_rows = await page.evaluate("""() => {
            // Normalize unicode spaces to regular spaces
            function norm(s) {
                return s.replace(/[\\u00a0\\u202f\\u2009\\u200a]/g, ' ').trim();
            }

            const table = document.querySelector('[aria-label="Content Library"]');
            if (!table) return [];

            const rows = Array.from(table.querySelectorAll('tbody tr'));
            return rows.map(row => {
                const cells = Array.from(row.querySelectorAll('td'));

                const previewCell = cells[1] || null;
                let caption = '';
                let publishedAt = '';
                let postType = 'post';

                if (previewCell) {
                    const rawText = previewCell.innerText || '';
                    const text = norm(rawText);

                    // Split on "Published" to separate caption from date
                    const pubMatch = text.match(/^(.*)Published\\s*[•·]\\s*(.+)$/s);
                    if (pubMatch) {
                        caption = pubMatch[1].trim();
                        publishedAt = pubMatch[2].trim();
                    } else {
                        caption = text;
                    }

                    // Detect post type
                    if (/^Video story/i.test(caption) || /Video story/i.test(text)) {
                        postType = 'story';
                        caption = caption.replace(/^Video story\\s*/i, '').trim();
                    } else if (/watch_time/i.test(text) || /Reel/i.test(text)) {
                        postType = 'reel';
                    }
                    // Videos on FB are now reels — detected later via watch_time > 0
                }

                // Metric cells (indices 3-10)
                const metricValues = [];
                for (let i = 3; i < cells.length; i++) {
                    metricValues.push(norm(cells[i]?.textContent || ''));
                }

                return { caption, publishedAt, postType, metrics: metricValues };
            });
        }""")

        # Parse into structured data
        posts = []
        for row in raw_rows:
            metrics = row.get("metrics", [])
            watch_time = parse_number(metrics[7] if len(metrics) > 7 else "0")
            post_type = row.get("postType", "post")

            # FB merged videos into reels — if it has watch time and isn't a story, it's a reel
            if post_type == "post" and watch_time > 0:
                post_type = "reel"

            post = {
                "caption": row.get("caption", ""),
                "post_type": post_type,
                "published_at": row.get("publishedAt", ""),
                "views": parse_number(metrics[0] if len(metrics) > 0 else "0"),
                "viewers": parse_number(metrics[1] if len(metrics) > 1 else "0"),
                "engagement": parse_number(metrics[2] if len(metrics) > 2 else "0"),
                "net_follows": parse_number(metrics[3] if len(metrics) > 3 else "0"),
                "impressions": parse_number(metrics[4] if len(metrics) > 4 else "0"),
                "comments": parse_number(metrics[5] if len(metrics) > 5 else "0"),
                "distribution": parse_distribution(metrics[6] if len(metrics) > 6 else "--"),
                "watch_time_ms": watch_time,
            }
            posts.append(post)

        await close_page(page)
        elapsed = round((time.time() - start) * 1000)

        return {
            "success": True,
            "posts": posts,
            "post_count": len(posts),
            "scraped_at": _iso_now(),
            "elapsed_ms": elapsed,
        }

    except Exception as e:
        if page:
            await close_page(page)
        return {
            "success": False,
            "posts": [],
            "scraped_at": _iso_now(),
            "error": str(e),
        }


def _iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
