"""Grok Imagine workflow.

Tested against grok.com/imagine (2026-02-18):
- Input: [contenteditable="true"] (tiptap ProseMirror), typed via keyboard.type()
- Submit: button[aria-label="Submit"]
- After submit: page shows results with img[alt="Generated image"]
  containing base64 data URIs. Wait 10s for full-res to load, then decode.
"""

import asyncio
import base64
import time
from pathlib import Path

from browser import get_page, wait_for_element, close_page
from config import (
    GROK_URL,
    RETRY_ATTEMPTS,
    RETRY_DELAY_S,
    SCREENSHOT_POLL_INTERVAL_S,
    DEFAULT_TIMEOUT_MS,
)


async def generate_grok_image(
    prompt: str,
    output_path: str,
    aspect_ratio: str = "1:1",
) -> dict:
    """Generate an image via Grok Imagine.

    1. Navigate to grok.com/imagine
    2. Type prompt into the contenteditable editor
    3. Click Submit
    4. Wait 10s+ for images to fully render
    5. Decode the base64 data from the first result image's src
    6. Save to output_path

    Returns:
        { success: bool, path: str, generation_time_ms: int, error?: str }
    """
    last_error = ""

    for attempt in range(1, RETRY_ATTEMPTS + 1):
        page = None
        try:
            start_time = time.time()
            page = await get_page(GROK_URL)
            await asyncio.sleep(3)

            # Check for login redirect
            if "login" in page.url or "oauth" in page.url:
                last_error = "Redirected to login. Log in to X/Grok first (SMI_HEADLESS=false)"
                if attempt < RETRY_ATTEMPTS:
                    await close_page(page)
                    await asyncio.sleep(RETRY_DELAY_S)
                    continue
                break

            # Wait for the contenteditable prompt editor
            editor_sel = '[contenteditable="true"]'
            found = await wait_for_element(page, editor_sel, timeout_ms=15_000)
            if not found:
                last_error = "Could not find prompt editor on Grok Imagine page"
                if attempt < RETRY_ATTEMPTS:
                    await close_page(page)
                    await asyncio.sleep(RETRY_DELAY_S)
                    continue
                break

            # Type the prompt
            editor = await page.query_selector(editor_sel)
            await editor.click()
            await page.keyboard.press("Control+a")
            await page.keyboard.press("Backspace")
            await page.keyboard.type(prompt, delay=10)
            await asyncio.sleep(0.5)

            # Click submit
            submit = await page.query_selector('button[aria-label="Submit"]')
            if not submit:
                last_error = "Could not find Submit button"
                if attempt < RETRY_ATTEMPTS:
                    await close_page(page)
                    await asyncio.sleep(RETRY_DELAY_S)
                    continue
                break

            await submit.click()

            # Wait 20s for images to fully render, then poll for full-res base64
            await asyncio.sleep(20)

            image_data = await _poll_for_loaded_image(page, timeout_ms=DEFAULT_TIMEOUT_MS)
            if not image_data:
                last_error = "No full-res image found after generation"
                if attempt < RETRY_ATTEMPTS:
                    await close_page(page)
                    await asyncio.sleep(RETRY_DELAY_S)
                    continue
                break

            # Save the image
            out = Path(output_path)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(image_data)

            elapsed_ms = int((time.time() - start_time) * 1000)
            await close_page(page)

            return {
                "success": True,
                "path": output_path,
                "generation_time_ms": elapsed_ms,
            }

        except Exception as e:
            last_error = str(e)
            if page:
                await close_page(page)
            if attempt < RETRY_ATTEMPTS:
                await asyncio.sleep(RETRY_DELAY_S)

    return {
        "success": False,
        "path": "",
        "generation_time_ms": 0,
        "error": f"Failed after {RETRY_ATTEMPTS} attempts: {last_error}",
    }


async def _poll_for_loaded_image(page, timeout_ms: int) -> bytes | None:
    """Poll until a full-res img[alt='Generated image'] is available.

    Full-res base64 images are 200K-300K chars. We wait for one that's
    at least 150K to avoid grabbing a blurry placeholder.
    """
    deadline = time.time() + (timeout_ms / 1000)

    while time.time() < deadline:
        imgs = await page.query_selector_all('img[alt="Generated image"]')
        for img in imgs:
            src = await img.get_attribute("src") or ""
            if src.startswith("data:image/") and len(src) > 150_000:
                _, encoded = src.split(",", 1)
                return base64.b64decode(encoded)

        await asyncio.sleep(SCREENSHOT_POLL_INTERVAL_S)

    return None
