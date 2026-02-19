"""Sora video generation workflow.

Tested against sora.chatgpt.com (2026-02-18):

Full workflow:
1. Open /storyboard
2. Click duration button ("10s") to open popover, select "25 seconds" (top option)
3. Type master prompt into textarea (placeholder "Describe your video...")
4. Press Enter to submit the master prompt
5. Wait for storyboard scene cards to generate (5+ minutes)
6. Click "Create" (ONCE ONLY — never retry after this point)
7. Navigate to /drafts, wait for new video tile to appear (~10 min)
8. Click tile to open detail view
9. Grab <video> src URL and download directly (no-watermark version)
"""

import asyncio
import time
from pathlib import Path

from browser import get_page, wait_for_element, close_page
from config import (
    SORA_STORYBOARD_URL,
    SORA_DRAFTS_URL,
    RETRY_ATTEMPTS,
    SORA_RETRY_DELAY_S,
    SORA_DRAFT_POLL_INTERVAL_S,
    SORA_TIMEOUT_MS,
)


async def generate_sora_video(
    prompt: str,
    output_path: str,
    duration: int = 25,
    aspect_ratio: str = "9:16",
) -> dict:
    """Generate a video via Sora.

    Returns:
        { success: bool, path: str, generation_time_ms: int, error?: str }
    """
    last_error = ""

    for attempt in range(1, RETRY_ATTEMPTS + 1):
        page = None
        try:
            start_time = time.time()

            # ── Step 1: Open storyboard page ──
            page = await get_page(SORA_STORYBOARD_URL)
            await asyncio.sleep(5)

            if "login" in page.url:
                last_error = (
                    "Redirected to login. Please log in to ChatGPT/Sora first "
                    "(requires ChatGPT Plus/Pro, run with SMI_HEADLESS=false)"
                )
                if attempt < RETRY_ATTEMPTS:
                    await close_page(page)
                    await asyncio.sleep(SORA_RETRY_DELAY_S)
                    continue
                break

            # ── Step 2: Set duration to 25s ──
            await _set_duration(page, duration)

            # ── Step 3: Type master prompt ──
            master_sel = 'textarea[placeholder*="Describe your video"]'
            found = await wait_for_element(page, master_sel, timeout_ms=15_000)
            if not found:
                last_error = "Could not find master prompt textarea ('Describe your video...')"
                if attempt < RETRY_ATTEMPTS:
                    await close_page(page)
                    await asyncio.sleep(SORA_RETRY_DELAY_S)
                    continue
                break

            textarea = await page.query_selector(master_sel)
            await textarea.click()
            await textarea.fill(prompt)
            await asyncio.sleep(1)

            # ── Step 4: Submit the master prompt by pressing Enter ──
            await page.keyboard.press("Enter")
            await asyncio.sleep(3)

            # ── Step 6: Wait for storyboard to generate scene cards (5+ min) ──
            # After submitting the master prompt, Sora generates a storyboard
            # with scene cards. This can take 5+ minutes.
            scene_cards_found = await _wait_for_scene_cards(page, timeout_s=600)

            # ── Step 6: Snapshot existing drafts so we can detect the new one ──
            # Open drafts in background to get existing list
            drafts_page = await get_page(SORA_DRAFTS_URL)
            await asyncio.sleep(3)
            existing_drafts = set(await _get_draft_hrefs(drafts_page))
            await close_page(drafts_page)

            # ── Step 7: Click Create (ONCE ONLY) ──
            create_clicked = False
            create_btn = await page.query_selector('button:has-text("Create")')
            if not create_btn:
                create_btn = await page.query_selector('button[aria-label="Create"]')
            if not create_btn:
                last_error = "Could not find Create button"
                if attempt < RETRY_ATTEMPTS:
                    await close_page(page)
                    await asyncio.sleep(SORA_RETRY_DELAY_S)
                    continue
                break

            if not create_clicked:
                await create_btn.click()
                create_clicked = True
                await asyncio.sleep(5)

            # ── Step 8: Navigate to /drafts and poll for the new video ──
            # IMPORTANT: Never go back to storyboard after clicking Create.
            # If drafts polling fails, do NOT retry the whole flow — just fail.
            await page.goto(SORA_DRAFTS_URL, wait_until="domcontentloaded")
            await asyncio.sleep(3)

            new_draft_href = await _poll_drafts_for_new(
                page, existing_drafts, timeout_ms=SORA_TIMEOUT_MS
            )

            if not new_draft_href:
                last_error = "Video generation timed out — no new draft appeared"
                # Do NOT retry after Create was clicked — video may still be generating
                break

            # ── Step 9: Open the detail view and download video directly ──
            tile_link = await page.query_selector(f'a[href="{new_draft_href}"]')
            if tile_link:
                await tile_link.click()
            else:
                full_url = f"https://sora.chatgpt.com{new_draft_href}"
                await page.goto(full_url, wait_until="domcontentloaded")
            await asyncio.sleep(5)

            # ── Step 10: Grab video src URL and download directly ──
            # The <video> element's src is a direct URL to the no-watermark video
            video_el = await page.query_selector("video")
            if not video_el:
                last_error = "No <video> element found on detail page"
                break

            video_src = await video_el.get_attribute("src") or ""
            if not video_src.startswith("http"):
                last_error = f"Video src is not a URL: {video_src[:80]}"
                break

            out = Path(output_path)
            out.parent.mkdir(parents=True, exist_ok=True)
            response = await page.request.get(video_src)
            content = await response.body()
            out.write_bytes(content)

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
                await asyncio.sleep(SORA_RETRY_DELAY_S)

    return {
        "success": False,
        "path": "",
        "generation_time_ms": 0,
        "error": f"Failed after {RETRY_ATTEMPTS} attempts: {last_error}",
    }


# ── Helper functions ──


async def _set_duration(page, duration: int) -> None:
    """Set duration by clicking the duration button to open popover,
    then selecting the exact option (e.g. '25 seconds')."""
    try:
        # Click whichever duration button is currently shown (e.g. "10s")
        dur_btn = None
        for label in ["10s", "5s", "15s", "20s", "25s"]:
            dur_btn = await page.query_selector(f'button:has-text("{label}")')
            if dur_btn:
                break

        if not dur_btn:
            return

        await dur_btn.click()
        await asyncio.sleep(1)

        # Click the exact text option in the popover (e.g. "25 seconds")
        option_text = f"{duration} seconds"
        loc = page.get_by_text(option_text, exact=True)
        if await loc.count() > 0:
            await loc.first.click()
            await asyncio.sleep(0.5)
    except Exception:
        pass


async def _wait_for_scene_cards(page, timeout_s: int = 600) -> bool:
    """Wait for storyboard scene cards to auto-populate after submitting the master prompt.
    This can take 5+ minutes. Returns True if scene cards were detected, False on timeout."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        # Scene cards typically contain "Scene" text in headers/labels
        scenes = await page.query_selector_all('[class*="scene"], [data-testid*="scene"]')
        if len(scenes) >= 1:
            return True
        # Also check for text containing "Scene 1"
        loc = page.get_by_text("Scene 1")
        if await loc.count() > 0:
            return True
        await asyncio.sleep(5)
    return False


async def _get_draft_hrefs(page) -> list[str]:
    """Get all draft tile href values from the /drafts page."""
    links = await page.query_selector_all('a[href^="/d/"]')
    hrefs = []
    for link in links:
        href = await link.get_attribute("href")
        if href:
            hrefs.append(href)
    return hrefs


async def _poll_drafts_for_new(
    page, existing_draft_set: set, timeout_ms: int
) -> str | None:
    """Poll /drafts until a new tile appears that wasn't in existing_draft_set.

    Returns the href of the new draft, or None on timeout.
    """
    deadline = time.time() + (timeout_ms / 1000)

    while time.time() < deadline:
        current_hrefs = await _get_draft_hrefs(page)
        new_hrefs = [h for h in current_hrefs if h not in existing_draft_set]

        if new_hrefs:
            return new_hrefs[0]

        # Refresh and wait
        await page.reload(wait_until="domcontentloaded")
        await asyncio.sleep(SORA_DRAFT_POLL_INTERVAL_S)

    return None


