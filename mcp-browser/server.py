"""SMI Browser MCP Server — exposes high-level media generation tools.

Each tool call handles the entire browser workflow internally.
The agent just calls generate_image(prompt) or generate_video(prompt)
and gets back a local file path.
"""

import os
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from grok import generate_grok_image
from sora import generate_sora_video
from facebook_metrics import scrape_facebook_content_library
from browser import check_auth, shutdown
from config import GROK_URL, SORA_STORYBOARD_URL

mcp = FastMCP("smi-browser", json_response=True)


@mcp.tool()
async def generate_image(
    prompt: str,
    output_dir: str,
    filename: str = "image.png",
    aspect_ratio: str = "1:1",
) -> dict:
    """Generate an image via Grok Imagine.

    Navigates to grok.com/imagine, enters the prompt, waits for generation
    (~10s typical), and downloads the result to a local file.

    Args:
        prompt: The image generation prompt (up to 1000 chars recommended).
        output_dir: Directory to save the generated image.
        filename: Output filename (default: image.png).
        aspect_ratio: Aspect ratio — "1:1", "16:9", "9:16" (default: 1:1).

    Returns:
        { success: bool, path: str, generation_time_ms: int, error?: str }
    """
    output_path = str(Path(output_dir) / filename)
    return await generate_grok_image(
        prompt=prompt,
        output_path=output_path,
        aspect_ratio=aspect_ratio,
    )


@mcp.tool()
async def generate_video(
    prompt: str,
    output_dir: str,
    filename: str = "video.mp4",
    duration: int = 10,
    aspect_ratio: str = "9:16",
) -> dict:
    """Generate a video via Sora.

    Submits prompt at sora.chatgpt.com/storyboard, then polls
    sora.chatgpt.com/drafts until generation completes (5-10 min),
    enlarges the tile, uses three-dot menu to download.
    Requires ChatGPT Plus/Pro.

    Args:
        prompt: The video generation prompt.
        output_dir: Directory to save the generated video.
        filename: Output filename (default: video.mp4).
        duration: Video duration in seconds (default: 10).
        aspect_ratio: Aspect ratio — "9:16", "16:9", "1:1" (default: 9:16).

    Returns:
        { success: bool, path: str, generation_time_ms: int, error?: str }
    """
    output_path = str(Path(output_dir) / filename)
    return await generate_sora_video(
        prompt=prompt,
        output_path=output_path,
        duration=duration,
        aspect_ratio=aspect_ratio,
    )


@mcp.tool()
async def scrape_facebook_metrics() -> dict:
    """Scrape post metrics from the Facebook Professional Dashboard Content Library.

    Navigates to the content library, scrolls to load all posts,
    and extracts per-post metrics from the table.

    Requires an active Facebook login session. If not logged in,
    run the server with SMI_HEADLESS=false and log in manually.

    Returns:
        {
            success: bool,
            posts: [{ caption, post_type, published_at, views, viewers,
                      engagement, net_follows, impressions, comments,
                      distribution, watch_time_ms }],
            post_count: int,
            scraped_at: str,
            elapsed_ms: int,
            error?: str
        }
    """
    return await scrape_facebook_content_library()


@mcp.tool()
async def check_browser_session() -> dict:
    """Check if browser sessions for Grok and Sora are authenticated.

    Returns auth status for each service. If not authenticated,
    run the server with SMI_HEADLESS=false and log in manually.

    Returns:
        { grok: { authenticated: bool, message: str },
          sora: { authenticated: bool, message: str } }
    """
    # Grok: authenticated users see the imagine prompt area
    grok_status = await check_auth(
        GROK_URL,
        'textarea, input[type="text"], [contenteditable="true"], [role="textbox"]',
    )

    # Sora: authenticated users see the storyboard prompt area
    sora_status = await check_auth(
        SORA_STORYBOARD_URL,
        'textarea, button:has-text("Create"), input[type="text"]',
    )

    return {
        "grok": grok_status,
        "sora": sora_status,
    }


def main():
    """Entry point for the MCP server."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
