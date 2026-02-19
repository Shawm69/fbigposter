"""Test: three dots -> Download -> Video (no watermark) -> save file."""

import asyncio
from pathlib import Path
from playwright.async_api import async_playwright


async def test():
    pw = await async_playwright().start()
    user_data = Path.home() / ".smi-browser"

    ctx = await pw.chromium.launch_persistent_context(
        user_data_dir=str(user_data),
        headless=False,
        viewport={"width": 1280, "height": 900},
        accept_downloads=True,
        args=["--disable-blink-features=AutomationControlled"],
    )

    page = await ctx.new_page()
    await page.goto("https://sora.chatgpt.com/d/gen_01khs6rs71fg598q3gvvfpjpjd", wait_until="domcontentloaded")
    await asyncio.sleep(5)

    # Find three-dot button
    svg_buttons = await page.query_selector_all("button:has(svg)")
    three_dot = None
    for btn in svg_buttons:
        inner = await btn.evaluate("e => e.querySelector('svg') ? e.querySelector('svg').innerHTML : ''")
        if "M3 12a2" in inner and "m7 0a2" in inner:
            three_dot = btn
            break

    if not three_dot:
        print("Three-dot not found!")
        await asyncio.sleep(30)
        await ctx.close()
        await pw.stop()
        return

    # Click three-dot
    print("1. Clicking three-dot menu...")
    await three_dot.click()
    await asyncio.sleep(2)

    # Click "Download" menuitem
    print("2. Clicking Download...")
    download_item = await page.query_selector('[role="menuitem"]:has-text("Download")')
    if not download_item:
        download_item = page.get_by_text("Download", exact=True)
        await download_item.first.click()
    else:
        await download_item.click()
    await asyncio.sleep(2)

    # Now click "Video" menuitem (NO watermark) — it's the one with role="menuitem"
    print("3. Clicking Video (no watermark)...")

    # Get all menuitems with text "Video"
    video_items = await page.query_selector_all('[role="menuitem"]')
    video_btn = None
    for item in video_items:
        text = (await item.evaluate("e => e.innerText.trim()")) or ""
        if text == "Video":
            video_btn = item
            print(f"   Found menuitem: '{text}'")
            break

    if not video_btn:
        print("   Video menuitem not found, trying get_by_text...")
        # There are two "Video" texts - one is a label, one is the menuitem
        # The menuitem one is what we want
        all_video = page.get_by_text("Video", exact=True)
        count = await all_video.count()
        print(f"   Found {count} 'Video' elements")
        for i in range(count):
            role = await all_video.nth(i).get_attribute("role")
            text = await all_video.nth(i).inner_text()
            print(f"   [{i}] role={role} text='{text}'")
            if role == "menuitem":
                video_btn = await all_video.nth(i).element_handle()
                break

    if video_btn:
        # Listen for download event
        download_event = asyncio.Future()

        def on_download(dl):
            if not download_event.done():
                download_event.set_result(dl)

        page.on("download", on_download)

        await video_btn.click()
        print("   Clicked! Waiting for download...")

        try:
            dl = await asyncio.wait_for(download_event, timeout=60)
            print(f"   Download started: {dl.suggested_filename}")
            out_path = str(Path(__file__).parent / "test_output" / "panda_video.mp4")
            Path(out_path).parent.mkdir(parents=True, exist_ok=True)
            await dl.save_as(out_path)
            size = Path(out_path).stat().st_size
            print(f"   Saved to: {out_path}")
            print(f"   File size: {size:,} bytes")
        except asyncio.TimeoutError:
            print("   No download event after 60s")
            # Maybe it opened in a new tab?
            pages = ctx.pages
            print(f"   Open pages: {len(pages)}")
            for p in pages:
                print(f"     {p.url[:80]}")
    else:
        print("   Could not find Video button!")
        await page.screenshot(path="sora_download_no_video_btn.png")

    print("\nBrowser stays open 30s...")
    await asyncio.sleep(30)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())
